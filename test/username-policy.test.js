import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../worker.js";
import { isValidDisplayName, isValidUsername, normalizeDisplayName, normalizeUsername } from "../src/shared/username.js";

async function request(path, options = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

beforeAll(() => {
  env.TOKEN_SECRET = "username-policy-test-secret";
});

afterEach(() => vi.restoreAllMocks());

describe("shared username policy", () => {
  it("matches the forum handle character set after normalization", () => {
    expect(normalizeUsername("  Fan_User-2  ")).toBe("fan_user-2");
    expect(isValidUsername("fan_user-2")).toBe(true);
    expect(isValidUsername("fan.name")).toBe(false);
    expect(isValidUsername("星尘")).toBe(false);
    expect(isValidUsername("a")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(normalizeDisplayName("  星尘·同好  ")).toBe("星尘·同好");
    expect(isValidDisplayName("星尘·同好")).toBe(true);
    expect(isValidDisplayName("bad\nname")).toBe(false);
  });

  it("rejects a special-character login name before Turnstile verification", async () => {
    const response = await request("/api/register", {
      method: "POST",
      body: JSON.stringify({ username: "fan.name", email: "fan@example.test", password: "password123", "cf-turnstile-response": "test" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("用户名需为");
  });

  it("registers a lowercase handle and Chinese display name, then signs in by email", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: true }));
    const registration = await request("/api/register", {
      method: "POST",
      body: JSON.stringify({
        username: "Policy_User",
        display_name: "星尘·同好",
        email: "policy-user@example.test",
        password: "password123",
        "cf-turnstile-response": "test",
      }),
    });
    expect(registration.status).toBe(201);

    const login = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "policy-user@example.test", password: "password123" }),
    });
    expect(login.status).toBe(200);
    const session = await login.json();
    expect(session.user).toMatchObject({ username: "policy_user", display_name: "星尘·同好" });

    const profile = await request("/api/user/profile", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toMatchObject({ username: "policy_user", display_name: "星尘·同好" });

    await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind("旧名_Ron", session.user.id).run();
    const legacyLogin = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "旧名_ron", password: "password123" }),
    });
    expect(legacyLogin.status).toBe(200);

    const migratedHandle = `user_${session.user.id}`;
    await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(migratedHandle, session.user.id).run();
    const migratedLogin = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "policy-user@example.test", password: "password123" }),
    });
    expect(migratedLogin.status).toBe(200);
    expect((await migratedLogin.json()).user).toMatchObject({ username: migratedHandle, display_name: "星尘·同好" });
  });
});
