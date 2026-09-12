import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { CompactSign, SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../worker.js";

const ISSUER = "http://localhost";
const CLIENT_ID = "full-protocol-client";
const CLIENT_SECRET = "full-protocol-client-secret-with-more-than-32-bytes";
const REDIRECT_URI = "http://localhost:3000/full/callback";
const POST_LOGOUT_URI = "http://localhost:3000/full/logout";
const VERIFIER = "v".repeat(43);
const USER_ID = 9810;
let providerPublicJwk;
let clientPrivateKey;
let clientPublicJwk;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function siteSession(payload) {
  const body = base64Url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + 60_000 })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.TOKEN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${base64Url(signature)}`;
}

async function request(path, options = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${ISSUER}${path}`, options), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function authRequest(overrides = {}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email offline_access",
    state: "full-state",
    nonce: "full-nonce",
    code_challenge: await sha256(VERIFIER),
    code_challenge_method: "S256",
    ...overrides,
  });
  return request(`/oauth/authorize?${params}`, { headers: { Authorization: `Bearer ${await siteSession({ sub: USER_ID, username: "full-user", role: "user" })}` } });
}

async function exchange(code, extra = {}) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: VERIFIER, ...extra });
  return request("/oauth/token", { method: "POST", headers: { Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
}

function clientHeaders() {
  return { Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" };
}

async function signedDpopProof(privateKey, publicJwk, method, htu, jti = crypto.randomUUID()) {
  return new CompactSign(new TextEncoder().encode(JSON.stringify({ htm: method, htu, iat: Math.floor(Date.now() / 1000), jti })))
    .setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: publicJwk })
    .sign(privateKey);
}

beforeAll(async () => {
  env.TOKEN_SECRET = "full-protocols-test-session-secret";
  env.OIDC_ISSUER = ISSUER;
  env.OIDC_INITIAL_ACCESS_TOKEN = "initial-registration-token-with-more-than-32-bytes";
  const { privateKey: providerPrivateKey, publicKey: providerPublicKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  const privateJwk = { ...(await exportJWK(providerPrivateKey)), alg: "RS256", use: "sig", kid: "full-provider-key" };
  providerPublicJwk = { ...(await exportJWK(providerPublicKey)), alg: "RS256", use: "sig", kid: "full-provider-key" };
  env.OIDC_SIGNING_JWKS = JSON.stringify({ keys: [privateJwk] });
  const clientKeys = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  clientPrivateKey = clientKeys.privateKey;
  clientPublicJwk = { ...(await exportJWK(clientKeys.publicKey)), alg: "RS256", use: "sig", kid: "full-client-key" };
  env.OIDC_CLIENTS = JSON.stringify([{
    client_id: CLIENT_ID,
    client_name: "Full protocol client",
    client_secret: CLIENT_SECRET,
    token_endpoint_auth_method: "client_secret_basic",
    redirect_uris: [REDIRECT_URI],
    post_logout_redirect_uris: [POST_LOGOUT_URI],
    jwks: { keys: [clientPublicJwk] },
    grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code", "urn:openid:params:grant-type:ciba"],
    response_types: ["code"],
  }]);
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").bind(USER_ID, "full-user", "full-user@example.com", "unused").run();
});

describe("advanced OpenID Connect and OAuth protocols", () => {
  it("publishes advanced endpoint and grant metadata", async () => {
    const response = await request("/.well-known/openid-configuration");
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      pushed_authorization_request_endpoint: `${ISSUER}/oauth/par`,
      device_authorization_endpoint: `${ISSUER}/oauth/device_authorization`,
      backchannel_authentication_endpoint: `${ISSUER}/oauth/bc-authorize`,
      end_session_endpoint: `${ISSUER}/oauth/logout`,
      response_modes_supported: ["query", "jwt"],
    });
    expect(metadata.grant_types_supported).toContain("refresh_token");
    expect(metadata.token_endpoint_auth_methods_supported).toContain("private_key_jwt");
  });

  it("rotates refresh tokens and revokes a reused family", async () => {
    const authorization = await authRequest({ state: "refresh-state", nonce: "refresh-nonce" });
    const code = new URL(authorization.headers.get("Location")).searchParams.get("code");
    const initial = await (await exchange(code)).json();
    expect(initial.refresh_token).toBeTruthy();
    const refreshed = await request("/oauth/token", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: initial.refresh_token }) });
    expect(refreshed.status).toBe(200);
    const next = await refreshed.json();
    expect(next.refresh_token).toBeTruthy();
    const replay = await request("/oauth/token", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: initial.refresh_token }) });
    expect(replay.status).toBe(400);
    const familyReuse = await request("/oauth/token", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: next.refresh_token }) });
    expect(familyReuse.status).toBe(400);
  });

  it("accepts PAR with a signed request object and returns a signed JARM response", async () => {
    const requestObject = await new SignJWT({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: "openid profile", state: "jarm-state", nonce: "jarm-nonce", code_challenge: await sha256(VERIFIER), code_challenge_method: "S256", response_mode: "jwt" })
      .setProtectedHeader({ alg: "RS256", kid: "full-client-key", typ: "oauth-authz-req+jwt" })
      .setIssuer(CLIENT_ID)
      .setAudience(ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(clientPrivateKey);
    const par = await request("/oauth/par", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ client_id: CLIENT_ID, request: requestObject }) });
    expect(par.status).toBe(201);
    const { request_uri: requestUri } = await par.json();
    const authorization = await request(`/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&request_uri=${encodeURIComponent(requestUri)}`, { headers: { Authorization: `Bearer ${await siteSession({ sub: USER_ID, username: "full-user", role: "user" })}` } });
    const response = new URL(authorization.headers.get("Location")).searchParams.get("response");
    const verified = await jwtVerify(response, await importJWK(providerPublicJwk, "RS256"), { issuer: ISSUER, audience: CLIENT_ID });
    expect(verified.payload).toMatchObject({ state: "jarm-state", iss: ISSUER, aud: CLIENT_ID });
    expect(verified.payload.code).toBeTruthy();
  });

  it("binds access and UserInfo tokens to a DPoP key", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = { ...(await exportJWK(publicKey)), alg: "ES256" };
    const jkt = await calculateJwkThumbprint(publicJwk, "sha256");
    const authorization = await authRequest({ state: "dpop-state", nonce: "dpop-nonce", dpop_jkt: jkt, scope: "openid profile" });
    const code = new URL(authorization.headers.get("Location")).searchParams.get("code");
    const token = await request("/oauth/token", { method: "POST", headers: { ...clientHeaders(), DPoP: await signedDpopProof(privateKey, publicJwk, "POST", `${ISSUER}/oauth/token`) }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: VERIFIER }) });
    expect(token.status).toBe(200);
    const tokens = await token.json();
    expect(tokens.token_type).toBe("DPoP");
    const info = await request("/oauth/userinfo", { headers: { Authorization: `DPoP ${tokens.access_token}`, DPoP: await signedDpopProof(privateKey, publicJwk, "GET", `${ISSUER}/oauth/userinfo`) } });
    expect(info.status).toBe(200);
    expect((await info.json()).sub).toBe(String(USER_ID));
  });

  it("completes device authorization and CIBA approval flows", async () => {
    const device = await request("/oauth/device_authorization", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ client_id: CLIENT_ID, scope: "openid profile" }) });
    expect(device.status).toBe(200);
    const deviceData = await device.json();
    const devicePage = await request(`/oauth/device?user_code=${deviceData.user_code}`, { headers: { Authorization: `Bearer ${await siteSession({ sub: USER_ID, username: "full-user", role: "user" })}` } });
    const deviceNonce = devicePage.text ? (await devicePage.text()).match(/name="approval_nonce" value="([^"]+)"/)?.[1] : null;
    expect(deviceNonce).toBeTruthy();
    const approved = await request("/oauth/device", { method: "POST", headers: { Authorization: `Bearer ${await siteSession({ sub: USER_ID, username: "full-user", role: "user" })}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ user_code: deviceData.user_code, approval_nonce: deviceNonce, decision: "approve" }) });
    expect(approved.status).toBe(200);
    const deviceTokens = await request("/oauth/token", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceData.device_code }) });
    expect(deviceTokens.status).toBe(200);

    const ciba = await request("/oauth/bc-authorize", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ scope: "openid profile", login_hint: String(USER_ID), nonce: "ciba-nonce" }) });
    expect(ciba.status).toBe(200);
    const cibaData = await ciba.json();
    const cibaPage = await request(`/oauth/ciba?auth_req_id=${encodeURIComponent(cibaData.auth_req_id)}`, { headers: { Authorization: `Bearer ${await siteSession({ sub: USER_ID, username: "full-user", role: "user" })}` } });
    const cibaNonce = (await cibaPage.text()).match(/name="approval_nonce" value="([^"]+)"/)?.[1];
    const cibaApproved = await request("/oauth/ciba", { method: "POST", headers: { Authorization: `Bearer ${await siteSession({ sub: USER_ID, username: "full-user", role: "user" })}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ auth_req_id: cibaData.auth_req_id, approval_nonce: cibaNonce, decision: "approve" }) });
    expect(cibaApproved.status).toBe(200);
    const cibaTokens = await request("/oauth/token", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ grant_type: "urn:openid:params:grant-type:ciba", auth_req_id: cibaData.auth_req_id }) });
    expect(cibaTokens.status).toBe(200);
  });

  it("supports dynamic registration, introspection, revocation, and logout", async () => {
    const registration = await request("/oauth/register", { method: "POST", headers: { Authorization: "Bearer initial-registration-token-with-more-than-32-bytes", "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Dynamic full client", redirect_uris: [REDIRECT_URI], post_logout_redirect_uris: [POST_LOGOUT_URI], token_endpoint_auth_method: "client_secret_basic" }) });
    expect(registration.status).toBe(201);
    const registered = await registration.json();
    expect(registered.client_secret).toBeTruthy();
    const management = await request(new URL(registered.registration_client_uri).pathname, { headers: { Authorization: `Bearer ${registered.registration_access_token}` } });
    expect(management.status).toBe(200);
    expect((await management.json()).client_id).toBe(registered.client_id);

    const authorization = await authRequest({ state: "logout-state", nonce: "logout-nonce" });
    const code = new URL(authorization.headers.get("Location")).searchParams.get("code");
    const tokens = await (await exchange(code)).json();
    const introspection = await request("/oauth/introspect", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ token: tokens.access_token }) });
    expect((await introspection.json()).active).toBe(true);
    const revoked = await request("/oauth/revoke", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ token: tokens.access_token }) });
    expect(revoked.status).toBe(200);
    expect((await (await request("/oauth/introspect", { method: "POST", headers: clientHeaders(), body: new URLSearchParams({ token: tokens.access_token }) })).json()).active).toBe(false);
    const logout = await request(`/oauth/logout?id_token_hint=${encodeURIComponent(tokens.id_token)}&post_logout_redirect_uri=${encodeURIComponent(POST_LOGOUT_URI)}&state=logout-state`);
    expect(logout.status).toBe(302);
    expect(logout.headers.get("Location")).toContain(POST_LOGOUT_URI);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
