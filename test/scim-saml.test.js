import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../worker.js";

const ISSUER = "http://localhost";
const SCIM_TOKEN = "scim-test-bearer-token-with-more-than-32-bytes";
const SCIM_USER_ID = 9820;
const SAML_SP = "https://example.test/sp";
const SAML_ACS = "https://example.test/saml/acs";

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return base64(digest).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function siteSession(payload) {
  const body = base64(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + 60_000 }))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.TOKEN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${base64(signature).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

async function request(path, options = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${ISSUER}${path}`, options), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

beforeAll(async () => {
  env.TOKEN_SECRET = "scim-saml-test-session-secret";
  env.SCIM_BEARER_TOKEN = SCIM_TOKEN;
  env.OIDC_ISSUER = ISSUER;
  env.OIDC_CLIENTS = JSON.stringify([{ client_id: "scim-saml-client", redirect_uris: ["http://localhost:3000/callback"] }]);
  const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  env.OIDC_SIGNING_JWKS = JSON.stringify({ keys: [{ ...(await exportJWK(privateKey)), alg: "RS256", kid: "saml-oidc-key" }] });
  env.SAML_ENTITY_ID = `${ISSUER}/saml`;
  env.SAML_BASE_URL = ISSUER;
  env.SAML_SIGNING_JWK = JSON.stringify({ ...(await exportJWK(privateKey)), alg: "RS256", kid: "saml-signing-key" });
  env.SAML_SIGNING_CERT = "A".repeat(256);
  env.SAML_ALLOW_UNSIGNED_REQUESTS = "true";
  env.SAML_SERVICE_PROVIDERS = JSON.stringify([{ entity_id: SAML_SP, acs_urls: [SAML_ACS], slo_urls: ["https://example.test/saml/slo"], want_authn_requests_signed: false }]);
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").bind(SCIM_USER_ID, "scim-user", "scim-user@example.com", "unused").run();
});

describe("SCIM 2.0 provisioning", () => {
  it("lists, provisions, updates, and soft-deletes users with ETags", async () => {
    const created = await request("/scim/v2/Users", { method: "POST", headers: { Authorization: `Bearer ${SCIM_TOKEN}`, "Content-Type": "application/scim+json" }, body: JSON.stringify({ externalId: "external-scim-user", userName: "provisioned-user", active: true, emails: [{ value: "provisioned@example.com" }] }) });
    expect(created.status).toBe(201);
    const resource = await created.json();
    expect(resource.userName).toBe("provisioned-user");
    expect(created.headers.get("ETag")).toBe('W/"1"');

    const listed = await request("/scim/v2/Users?filter=userName%20eq%20%22provisioned-user%22", { headers: { Authorization: `Bearer ${SCIM_TOKEN}` } });
    expect(listed.status).toBe(200);
    expect((await listed.json()).totalResults).toBe(1);

    const patched = await request(`/scim/v2/Users/${resource.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${SCIM_TOKEN}`, "Content-Type": "application/scim+json", "If-Match": 'W/"1"' }, body: JSON.stringify({ Operations: [{ op: "replace", path: "active", value: false }] }) });
    expect(patched.status).toBe(200);
    expect((await patched.json()).active).toBe(false);
    expect(patched.headers.get("ETag")).toBe('W/"2"');

    const conflict = await request(`/scim/v2/Users/${resource.id}`, { method: "PUT", headers: { Authorization: `Bearer ${SCIM_TOKEN}`, "Content-Type": "application/scim+json", "If-Match": 'W/"1"' }, body: JSON.stringify({ userName: "stale-user", emails: [{ value: "stale@example.com" }] }) });
    expect(conflict.status).toBe(412);

    const deleted = await request(`/scim/v2/Users/${resource.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${SCIM_TOKEN}`, "If-Match": 'W/"2"' } });
    expect(deleted.status).toBe(204);
    const inactive = await env.DB.prepare("SELECT active FROM scim_user_state WHERE user_id = ?").bind(Number(resource.id)).first();
    expect(inactive.active).toBe(0);
  });

  it("provisions groups and enforces bearer authorization", async () => {
    const denied = await request("/scim/v2/Groups", { headers: { Authorization: "Bearer wrong-token" } });
    expect(denied.status).toBe(401);
    const group = await request("/scim/v2/Groups", { method: "POST", headers: { Authorization: `Bearer ${SCIM_TOKEN}`, "Content-Type": "application/scim+json" }, body: JSON.stringify({ displayName: "Provisioned group", members: [{ value: String(SCIM_USER_ID) }] }) });
    expect(group.status).toBe(201);
    const resource = await group.json();
    expect(resource.members[0].value).toBe(String(SCIM_USER_ID));
    const fetched = await request(`/scim/v2/Groups/${resource.id}`, { headers: { Authorization: `Bearer ${SCIM_TOKEN}` } });
    expect(fetched.headers.get("ETag")).toBe('W/"1"');
  });
});

describe("SAML 2.0 identity provider", () => {
  it("publishes metadata and returns a signed assertion through HTTP-POST", async () => {
    const metadata = await request("/saml/metadata");
    expect(metadata.status).toBe(200);
    expect(metadata.headers.get("Content-Type")).toContain("application/samlmetadata+xml");
    expect(await metadata.text()).toContain(`${ISSUER}/saml/sso`);

    const issueInstant = new Date().toISOString();
    const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_saml-request-12345678" Version="2.0" IssueInstant="${issueInstant}" Destination="${ISSUER}/saml/sso" AssertionConsumerServiceURL="${SAML_ACS}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${SAML_SP}</saml:Issuer></samlp:AuthnRequest>`;
    const sso = await request("/saml/sso", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${await siteSession({ sub: SCIM_USER_ID, username: "scim-user", role: "user" })}` }, body: new URLSearchParams({ SAMLRequest: base64(new TextEncoder().encode(xml)), RelayState: "relay-value" }) });
    expect(sso.status).toBe(200);
    const html = await sso.text();
    const encoded = html.match(/name="SAMLResponse" value="([^"]+)"/)?.[1];
    expect(encoded).toBeTruthy();
    const responseXml = new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
    expect(responseXml).toContain("<ds:Signature");
    expect(responseXml).toContain(`InResponseTo="_saml-request-12345678"`);
    expect(html).toContain("relay-value");
    expect(sso.headers.get("Content-Security-Policy")).toContain("form-action https://example.test");
  });

  it("handles redirect-bound SSO and signed SLO responses", async () => {
    const issueInstant = new Date().toISOString();
    const authn = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_redirect-request-123" Version="2.0" IssueInstant="${issueInstant}" Destination="${ISSUER}/saml/sso" AssertionConsumerServiceURL="${SAML_ACS}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"><saml:Issuer>${SAML_SP}</saml:Issuer></samlp:AuthnRequest>`;
    const sso = await request(`/saml/sso?SAMLRequest=${encodeURIComponent(base64(new TextEncoder().encode(authn)))}`, { headers: { Authorization: `Bearer ${await siteSession({ sub: SCIM_USER_ID, username: "scim-user", role: "user" })}` } });
    expect(sso.status).toBe(302);
    expect(new URL(sso.headers.get("Location")).searchParams.get("SAMLResponse")).toBeTruthy();

    const logout = `<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_logout-request-123" Version="2.0" IssueInstant="${issueInstant}" Destination="${ISSUER}/saml/slo"><saml:Issuer>${SAML_SP}</saml:Issuer></samlp:LogoutRequest>`;
    const slo = await request(`/saml/slo?SAMLRequest=${encodeURIComponent(base64(new TextEncoder().encode(logout)))}&RelayState=slo-relay`);
    expect(slo.status).toBe(302);
    const sloLocation = new URL(slo.headers.get("Location"));
    expect(sloLocation.origin).toBe("https://example.test");
    expect(sloLocation.searchParams.get("SAMLResponse")).toBeTruthy();
    expect(sloLocation.searchParams.get("RelayState")).toBe("slo-relay");
    expect(slo.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
