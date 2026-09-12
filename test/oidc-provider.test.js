import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../worker.js";

const ISSUER = "http://localhost";
const CLIENT_ID = "omew-test";
const CLIENT_SECRET = "test-client-secret-with-at-least-32-bytes";
const REDIRECT_URI = "http://localhost:3000/api/auth/sso/callback";
const VERIFIER = "a".repeat(43);
let publicJwk;

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function siteSession(payload) {
  const body = base64Url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + 60_000 })));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${base64Url(signature)}`;
}

async function request(path, options = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${ISSUER}${path}`, options), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function authorize(overrides = {}, authenticated = true) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    state: "state-value",
    nonce: "nonce-value",
    code_challenge: await sha256(VERIFIER),
    code_challenge_method: "S256",
    ...overrides,
  });
  const headers = authenticated
    ? { Authorization: `Bearer ${await siteSession({ sub: 9801, username: "oidc-user", role: "user" })}` }
    : undefined;
  return request(`/oauth/authorize?${params}`, { headers });
}

async function exchange(code, overrides = {}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: VERIFIER,
    ...overrides,
  });
  return request("/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

beforeAll(async () => {
  env.TOKEN_SECRET = "oidc-provider-test-session-secret";
  env.OIDC_ISSUER = ISSUER;
  env.OIDC_CLIENTS = JSON.stringify([{
    client_id: CLIENT_ID,
    client_name: "OMEW Test",
    client_secret: CLIENT_SECRET,
    token_endpoint_auth_method: "client_secret_basic",
    redirect_uris: [REDIRECT_URI],
  }]);

  const { privateKey, publicKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  const privateJwk = { ...(await exportJWK(privateKey)), alg: "RS256", use: "sig", kid: "test-key" };
  publicJwk = { ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "test-key" };
  env.OIDC_SIGNING_JWKS = JSON.stringify({ keys: [privateJwk] });
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
  ).bind(9801, "oidc-user", "oidc-user@example.com", "unused").run();
});

describe("OpenID Provider", () => {
  it("publishes discovery metadata and public signing keys", async () => {
    const discovery = await request("/.well-known/openid-configuration");
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    });

    const jwks = await request("/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    expect(jwks.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(jwks.headers.get("Pragma")).toBeNull();
    const body = await jwks.json();
    expect(body.keys).toEqual([publicJwk]);
    expect(JSON.stringify(body)).not.toContain('"d"');
  });

  it("redirects an unauthenticated authorization request to the site login", async () => {
    const response = await authorize({}, false);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location"));
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("return_to")).toContain("/oauth/authorize?");
  });

  it("returns login_required to the registered callback for prompt=none", async () => {
    const response = await authorize({ prompt: "none" }, false);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location"));
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("login_required");
    expect(location.searchParams.get("state")).toBe("state-value");
  });

  it("returns login_required to a registered client for prompt=none", async () => {
    const response = await authorize({ prompt: "none" }, false);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location"));
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("login_required");
    expect(location.searchParams.get("state")).toBe("state-value");
  });

  it("issues a one-use code, ID token, and UserInfo access token", async () => {
    const authorization = await authorize();
    expect(authorization.status).toBe(302);
    const callback = new URL(authorization.headers.get("Location"));
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
    expect(callback.searchParams.get("state")).toBe("state-value");
    expect(callback.searchParams.get("iss")).toBe(ISSUER);
    const code = callback.searchParams.get("code");
    expect(code).toBeTruthy();

    const response = await exchange(code);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const tokens = await response.json();
    const key = await importJWK(publicJwk, "RS256");
    const verified = await jwtVerify(tokens.id_token, key, { issuer: ISSUER, audience: CLIENT_ID });
    expect(verified.payload).toMatchObject({
      sub: "9801",
      nonce: "nonce-value",
      preferred_username: "oidc-user",
      email: "oidc-user@example.com",
      email_verified: false,
    });

    const info = await request("/oauth/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ sub: "9801", preferred_username: "oidc-user" });

    const replay = await exchange(code);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("never redirects an unregistered redirect URI", async () => {
    const response = await authorize({ redirect_uri: "https://attacker.example/callback" });
    expect(response.status).toBe(400);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("does not consume a code when an invalid PKCE verifier is presented", async () => {
    const authorization = await authorize({ state: "pkce-state", nonce: "pkce-nonce" });
    const code = new URL(authorization.headers.get("Location")).searchParams.get("code");
    const rejected = await exchange(code, { code_verifier: "b".repeat(43) });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: "invalid_grant" });
    expect((await exchange(code)).status).toBe(200);
  });

  it("does not consume a valid code when an incorrect PKCE verifier is presented", async () => {
    const authorization = await authorize({ state: "pkce-state", nonce: "pkce-nonce" });
    const code = new URL(authorization.headers.get("Location")).searchParams.get("code");
    const rejected = await exchange(code, { code_verifier: "b".repeat(43) });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: "invalid_grant" });
    expect((await exchange(code)).status).toBe(200);
  });

  it("requires nonce, state, and PKCE S256", async () => {
    for (const overrides of [
      { nonce: "" },
      { state: "" },
      { code_challenge_method: "plain" },
    ]) {
      const response = await authorize(overrides);
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("Location"));
      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(location.searchParams.get("error")).toBe("invalid_request");
    }
  });

  it("revokes an access token for the authenticated client", async () => {
    const authorization = await authorize({ state: "revoke-state", nonce: "revoke-nonce" });
    const code = new URL(authorization.headers.get("Location")).searchParams.get("code");
    const tokens = await (await exchange(code)).json();
    const body = new URLSearchParams({ token: tokens.access_token });
    const revoked = await request("/oauth/revoke", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    expect(revoked.status).toBe(200);
    expect((await request("/oauth/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })).status).toBe(401);
  });
});
