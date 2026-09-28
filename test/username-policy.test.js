import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../worker.js";
import { isValidDisplayName, isValidUsername, normalizeDisplayName, normalizeUsername, usernameCandidate } from "../src/shared/username.js";

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
    expect(usernameCandidate("  Fan.Name@Site  ", 7)).toBe("fannamesite");
    expect(usernameCandidate("纯中文", 7)).toBe("user_7");
    expect(usernameCandidate("A", 7)).toBe("user_7");
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
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ success: true }));
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
    const legacySession = await legacyLogin.json();
    expect(legacySession.username_change_required).toBe(true);
    const legacyProfile = await request("/api/user/profile", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(await legacyProfile.json()).toMatchObject({ username: "旧名_Ron", suggested_username: "_ron", username_change_required: true });

    const invalidUpdate = await request("/api/user/username", {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username: "bad.name" }),
    });
    expect(invalidUpdate.status).toBe(400);

    const rename = await request("/api/user/username", {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username: "_Ron" }),
    });
    expect(rename.status).toBe(200);
    expect(await rename.json()).toMatchObject({ username: "_ron", display_name: "星尘·同好" });
    const renamedProfile = await request("/api/user/profile", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(await renamedProfile.json()).toMatchObject({ username: "_ron", username_change_required: false });

    const renamedLogin = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "_ron", password: "password123" }),
    });
    expect(renamedLogin.status).toBe(200);
    expect((await renamedLogin.json()).username_change_required).toBe(false);
    expect((await request("/api/login", { method: "POST", body: JSON.stringify({ username: "旧名_Ron", password: "password123" }) })).status).toBe(401);
  });

  it("suggests a free fallback when stripping characters collides with another handle", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ success: true }));
    for (const [username, email] of [["takenone", "taken@example.test"], ["legacyone", "legacy@example.test"]]) {
      expect((await request("/api/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password: "password123", "cf-turnstile-response": "test" }),
      })).status).toBe(201);
    }
    const login = await request("/api/login", { method: "POST", body: JSON.stringify({ username: "legacyone", password: "password123" }) });
    const session = await login.json();
    await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind("taken.one", session.user.id).run();
    const profile = await request("/api/user/profile", { headers: { Authorization: `Bearer ${session.token}` } });
    expect((await profile.json()).suggested_username).toBe(`user_${session.user.id}`);
    const conflict = await request("/api/user/username", {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username: "takenone" }),
    });
    expect(conflict.status).toBe(409);
    const rename = await request("/api/user/username", {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username: `user_${session.user.id}` }),
    });
    expect(rename.status).toBe(200);
    expect((await rename.json()).display_name).toBe("taken.one");
  });

  it("accepts an email-shaped legacy username and does not publish it after rename", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ success: true }));
    const registration = await request("/api/register", {
      method: "POST",
      body: JSON.stringify({ username: "legacy_mail", email: "registered@example.test", password: "password123", "cf-turnstile-response": "test" }),
    });
    expect(registration.status).toBe(201);
    const original = await request("/api/login", { method: "POST", body: JSON.stringify({ username: "legacy_mail", password: "password123" }) });
    const session = await original.json();
    await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind("Alias.Name@site.test", session.user.id).run();
    const legacyLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ username: "Alias.Name@site.test", password: "password123" }) });
    expect((await legacyLogin.json()).username_change_required).toBe(true);
    const profile = await request("/api/user/profile", { headers: { Authorization: `Bearer ${session.token}` } });
    expect((await profile.json()).suggested_username).toBe("aliasnamesitetest");
    const rename = await request("/api/user/username", {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username: "aliasnamesitetest" }),
    });
    expect(await rename.json()).toMatchObject({ username: "aliasnamesitetest", display_name: "aliasnamesitetest" });
  });
});
