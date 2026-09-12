import { SignJWT, importJWK } from "jose";

const encoder = new TextEncoder();
const AUTHORIZATION_CODE_TTL_SECONDS = 300;
const ACCESS_TOKEN_TTL_SECONDS = 300;
const ID_TOKEN_SIGNING_ALGORITHM = "RS256";
const OIDC_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/.well-known/jwks.json",
  "/oauth/authorize",
  "/oauth/token",
  "/oauth/userinfo",
  "/oauth/revoke",
]);

class OidcError extends Error {
  constructor(code, description, status = 400) {
    super(description);
    this.name = "OidcError";
    this.code = code;
    this.status = status;
  }
}

export async function handleOidcRequest(request, env, ctx, authenticateUser) {
  const url = new URL(request.url);
  if (!OIDC_PATHS.has(url.pathname)) return null;

  try {
    const config = readProviderConfiguration(env);
    if (url.origin !== config.issuer) {
      throw new OidcError("invalid_request", "Request origin does not match the configured issuer");
    }

    if (url.pathname === "/.well-known/openid-configuration" || url.pathname === "/.well-known/oauth-authorization-server") {
      return metadataResponse(config);
    }
    if (url.pathname === "/.well-known/jwks.json") return jwksResponse(config);
    if (url.pathname === "/oauth/authorize") {
      return await authorize(request, env, ctx, config, authenticateUser);
    }
    if (url.pathname === "/oauth/token") return await token(request, env, ctx, config);
    if (url.pathname === "/oauth/userinfo") return await userInfo(request, env, config);
    if (url.pathname === "/oauth/revoke") return await revoke(request, env, config);
    return null;
  } catch (error) {
    if (error instanceof OidcError) return oauthErrorResponse(error);
    return oauthErrorResponse(new OidcError("server_error", "Identity service is not configured", 503));
  }
}

function metadataResponse(config) {
  return oidcJson({
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`,
    userinfo_endpoint: `${config.issuer}/oauth/userinfo`,
    revocation_endpoint: `${config.issuer}/oauth/revoke`,
    jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [ID_TOKEN_SIGNING_ALGORITHM],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    scopes_supported: ["openid", "profile", "email"],
    claims_supported: ["iss", "sub", "aud", "exp", "iat", "nonce", "name", "preferred_username", "email", "email_verified"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  });
}

function jwksResponse(config) {
  return new Response(JSON.stringify({ keys: config.signingKeys.map((key) => key.publicJwk) }), {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
}

async function authorize(request, env, ctx, config, authenticateUser) {
  if (request.method !== "GET") throw new OidcError("invalid_request", "Authorization endpoint requires GET", 405);
  const url = new URL(request.url);
  const clientId = boundedParameter(url.searchParams, "client_id", 200);
  const client = config.clients.get(clientId);
  if (!client) throw new OidcError("unauthorized_client", "Unknown client");

  const redirectUri = boundedParameter(url.searchParams, "redirect_uri", 2048);
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OidcError("invalid_request", "Unregistered redirect URI");
  }

  try {
    const responseType = boundedParameter(url.searchParams, "response_type", 64);
    if (responseType !== "code") throw new OidcError("unsupported_response_type", "Only authorization code is supported");
    const state = boundedParameter(url.searchParams, "state", 512);
    const nonce = boundedParameter(url.searchParams, "nonce", 512);
    const codeChallenge = boundedParameter(url.searchParams, "code_challenge", 128);
    const codeChallengeMethod = boundedParameter(url.searchParams, "code_challenge_method", 16);
    if (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      throw new OidcError("invalid_request", "PKCE S256 is required");
    }
    const scopes = normalizeScopes(boundedParameter(url.searchParams, "scope", 512));
    if (!scopes.includes("openid")) throw new OidcError("invalid_scope", "The openid scope is required");
    if (scopes.some((scope) => !config.scopes.has(scope))) throw new OidcError("invalid_scope", "Unsupported scope");

    const session = await authenticateUser();
    if (!session) {
      if (url.searchParams.get("prompt") === "none") {
        return redirectError(redirectUri, "login_required", "Authentication is required", state, config.issuer);
      }
      const loginUrl = new URL("/login", config.issuer);
      loginUrl.searchParams.set("return_to", `${url.pathname}${url.search}`);
      return Response.redirect(loginUrl.toString(), 302);
    }

    const user = await env.DB.prepare("SELECT id, username, email FROM users WHERE id = ?").bind(session.sub).first();
    if (!user) return redirectError(redirectUri, "access_denied", "User account is unavailable", state, config.issuer);

    const code = randomToken();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO oidc_authorization_codes
        (code_hash, client_id, redirect_uri, user_id, nonce, scope, code_challenge, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      await sha256Base64Url(code),
      client.clientId,
      redirectUri,
      user.id,
      nonce,
      scopes.join(" "),
      codeChallenge,
      now + AUTHORIZATION_CODE_TTL_SECONDS,
    ).run();
    ctx.waitUntil(cleanupExpiredState(env.DB, now));

    const destination = new URL(redirectUri);
    destination.searchParams.set("code", code);
    destination.searchParams.set("state", state);
    destination.searchParams.set("iss", config.issuer);
    return Response.redirect(destination.toString(), 302);
  } catch (error) {
    if (error instanceof OidcError) {
      const rawState = url.searchParams.get("state");
      const safeState = rawState && rawState.length <= 512 ? rawState : null;
      return redirectError(redirectUri, error.code, error.message, safeState, config.issuer);
    }
    throw error;
  }
}

async function token(request, env, ctx, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "Token endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config);
  if (form.get("grant_type") !== "authorization_code") {
    throw new OidcError("unsupported_grant_type", "Only authorization_code is supported");
  }

  const code = requiredFormValue(form, "code", 1024);
  const redirectUri = requiredFormValue(form, "redirect_uri", 2048);
  const verifier = requiredFormValue(form, "code_verifier", 128);
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new OidcError("invalid_grant", "Invalid authorization code");

  const now = Math.floor(Date.now() / 1000);
  const codeHash = await sha256Base64Url(code);
  const grant = await env.DB.prepare(`
    SELECT client_id, redirect_uri, user_id, nonce, scope, code_challenge
    FROM oidc_authorization_codes
    WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(codeHash, now).first();

  if (!grant || grant.client_id !== client.clientId || grant.redirect_uri !== redirectUri) {
    throw new OidcError("invalid_grant", "Invalid authorization code");
  }
  const verifierChallenge = await sha256Base64Url(verifier);
  if (!(await timingSafeTextEqual(verifierChallenge, grant.code_challenge))) {
    throw new OidcError("invalid_grant", "Invalid authorization code");
  }

  const consumed = await env.DB.prepare(`
    UPDATE oidc_authorization_codes SET consumed_at = ?
    WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(now, codeHash, now).run();
  if (consumed.meta?.changes !== 1) throw new OidcError("invalid_grant", "Invalid authorization code");

  const user = await env.DB.prepare("SELECT id, username, email FROM users WHERE id = ?").bind(grant.user_id).first();
  if (!user) throw new OidcError("invalid_grant", "Invalid authorization code");

  const accessToken = randomToken();
  await env.DB.prepare(`
    INSERT INTO oidc_access_tokens (token_hash, client_id, user_id, scope, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(await sha256Base64Url(accessToken), client.clientId, user.id, grant.scope, now + ACCESS_TOKEN_TTL_SECONDS).run();
  ctx.waitUntil(cleanupExpiredState(env.DB, now));

  const signingKey = config.signingKeys[0];
  const privateKey = await importJWK(signingKey.privateJwk, ID_TOKEN_SIGNING_ALGORITHM);
  const idToken = await new SignJWT(profileClaims(user, grant.scope, grant.nonce))
    .setProtectedHeader({ alg: ID_TOKEN_SIGNING_ALGORITHM, kid: signingKey.publicJwk.kid, typ: "JWT" })
    .setIssuer(config.issuer)
    .setSubject(String(user.id))
    .setAudience(client.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(privateKey);

  return oidcJson({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    id_token: idToken,
    scope: grant.scope,
  });
}

async function userInfo(request, env, config) {
  if (request.method !== "GET" && request.method !== "POST") {
    throw new OidcError("invalid_request", "UserInfo endpoint requires GET or POST", 405);
  }
  const bearer = bearerToken(request);
  if (!bearer) throw new OidcError("invalid_token", "Bearer token is required", 401);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`
    SELECT t.scope, u.id, u.username, u.email
    FROM oidc_access_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.expires_at > ? AND t.revoked_at IS NULL
  `).bind(await sha256Base64Url(bearer), now).first();
  if (!row) throw new OidcError("invalid_token", "Bearer token is invalid", 401);
  return oidcJson({ sub: String(row.id), ...profileClaims(row, row.scope) });
}

async function revoke(request, env, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "Revocation endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config);
  const rawToken = requiredFormValue(form, "token", 2048);
  await env.DB.prepare(`
    UPDATE oidc_access_tokens SET revoked_at = ?
    WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL
  `).bind(Math.floor(Date.now() / 1000), await sha256Base64Url(rawToken), client.clientId).run();
  return new Response(null, { status: 200, headers: noStoreHeaders() });
}

function profileClaims(user, scope, nonce) {
  const scopes = new Set(String(scope).split(/\s+/));
  const claims = {};
  if (nonce) claims.nonce = nonce;
  if (scopes.has("profile")) {
    claims.name = user.username;
    claims.preferred_username = user.username;
  }
  if (scopes.has("email")) {
    claims.email = user.email;
    claims.email_verified = false;
  }
  return claims;
}

function readProviderConfiguration(env) {
  const issuer = normalizeIssuer(env.OIDC_ISSUER);
  const rawClients = parseJsonSecret(env.OIDC_CLIENTS, "OIDC clients");
  if (!Array.isArray(rawClients) || rawClients.length === 0) throw new OidcError("server_error", "OIDC clients are not configured", 503);
  const clients = new Map();
  for (const raw of rawClients) {
    const clientId = typeof raw?.client_id === "string" ? raw.client_id.trim() : "";
    if (!clientId || clients.has(clientId)) throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    if (!Array.isArray(raw.redirect_uris) || raw.redirect_uris.length === 0) {
      throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    }
    const redirectUris = raw.redirect_uris.map(validateRedirectUri);
    const method = raw.token_endpoint_auth_method || (raw.client_secret ? "client_secret_basic" : "none");
    if (!["client_secret_basic", "client_secret_post", "none"].includes(method)) {
      throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    }
    if (method !== "none" && (typeof raw.client_secret !== "string" || raw.client_secret.length < 32)) {
      throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    }
    clients.set(clientId, {
      clientId,
      clientName: typeof raw.client_name === "string" && raw.client_name.trim() ? raw.client_name.trim() : clientId,
      redirectUris,
      tokenEndpointAuthMethod: method,
      clientSecret: method === "none" ? null : raw.client_secret,
    });
  }

  const rawJwks = parseJsonSecret(env.OIDC_SIGNING_JWKS, "OIDC signing keys");
  if (!rawJwks || !Array.isArray(rawJwks.keys) || rawJwks.keys.length === 0) {
    throw new OidcError("server_error", "OIDC signing keys are not configured", 503);
  }
  const signingKeys = rawJwks.keys.map((key) => {
    if (key?.kty !== "RSA" || key.alg !== ID_TOKEN_SIGNING_ALGORITHM || typeof key.kid !== "string" || !key.kid || typeof key.d !== "string") {
      throw new OidcError("server_error", "OIDC signing key configuration is invalid", 503);
    }
    const {
      d: _d,
      p: _p,
      q: _q,
      dp: _dp,
      dq: _dq,
      qi: _qi,
      oth: _oth,
      key_ops: _keyOps,
      ...publicJwk
    } = key;
    return { privateJwk: key, publicJwk: { ...publicJwk, use: "sig" } };
  });
  return { issuer, clients, signingKeys, scopes: new Set(["openid", "profile", "email"]) };
}

function normalizeIssuer(value) {
  if (typeof value !== "string" || !value.trim()) throw new OidcError("server_error", "OIDC issuer is not configured", 503);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new OidcError("server_error", "OIDC issuer is invalid", 503);
  }
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) {
    throw new OidcError("server_error", "OIDC issuer is invalid", 503);
  }
  if (url.username || url.password || url.search || url.hash) throw new OidcError("server_error", "OIDC issuer is invalid", 503);
  if (url.pathname !== "/") throw new OidcError("server_error", "OIDC issuer must not include a path", 503);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function validateRedirectUri(value) {
  if (typeof value !== "string") throw new OidcError("server_error", "OIDC redirect URI is invalid", 503);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new OidcError("server_error", "OIDC redirect URI is invalid", 503);
  }
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) {
    throw new OidcError("server_error", "OIDC redirect URI is invalid", 503);
  }
  if (url.username || url.password || url.hash) throw new OidcError("server_error", "OIDC redirect URI is invalid", 503);
  return url.toString();
}

async function authenticateClient(request, form, config) {
  if (form.getAll("client_id").length > 1 || form.getAll("client_secret").length > 1) {
    throw new OidcError("invalid_client", "Invalid client authentication", 401);
  }
  let clientId = form.get("client_id");
  let clientSecret = form.get("client_secret");
  const authorization = request.headers.get("Authorization") || "";
  const basic = authorization.match(/^Basic\s+(.+)$/i);
  if (basic) {
    if (clientSecret) throw new OidcError("invalid_client", "Conflicting client authentication", 401);
    let decoded;
    try {
      decoded = atob(basic[1]);
    } catch {
      throw new OidcError("invalid_client", "Invalid client authentication", 401);
    }
    const separator = decoded.indexOf(":");
    if (separator < 0) throw new OidcError("invalid_client", "Invalid client authentication", 401);
    try {
      clientId = decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, " "));
      clientSecret = decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, " "));
    } catch {
      throw new OidcError("invalid_client", "Invalid client authentication", 401);
    }
  }
  if (typeof clientId !== "string") throw new OidcError("invalid_client", "Client authentication is required", 401);
  const client = config.clients.get(clientId);
  if (!client) throw new OidcError("invalid_client", "Invalid client authentication", 401);
  if (client.tokenEndpointAuthMethod === "none") {
    if (clientSecret) throw new OidcError("invalid_client", "Invalid client authentication", 401);
    return client;
  }
  if (typeof clientSecret !== "string" || !(await timingSafeTextEqual(clientSecret, client.clientSecret))) {
    throw new OidcError("invalid_client", "Invalid client authentication", 401);
  }
  if (client.tokenEndpointAuthMethod === "client_secret_basic" && !basic) {
    throw new OidcError("invalid_client", "Client must use HTTP Basic authentication", 401);
  }
  if (client.tokenEndpointAuthMethod === "client_secret_post" && basic) {
    throw new OidcError("invalid_client", "Client must use form authentication", 401);
  }
  return client;
}

function parseJsonSecret(value, label) {
  if (typeof value !== "string" || !value) throw new OidcError("server_error", `${label} are not configured`, 503);
  try {
    return JSON.parse(value);
  } catch {
    throw new OidcError("server_error", `${label} are invalid`, 503);
  }
}

function boundedParameter(params, name, maxLength) {
  const values = params.getAll(name);
  const value = values[0];
  if (values.length !== 1) throw new OidcError("invalid_request", `Invalid ${name}`);
  if (!value || value.length > maxLength) throw new OidcError("invalid_request", `Invalid ${name}`);
  return value;
}

function requiredFormValue(form, name, maxLength) {
  const values = form.getAll(name);
  const value = values[0];
  if (values.length !== 1) throw new OidcError("invalid_request", `Invalid ${name}`);
  if (typeof value !== "string" || !value || value.length > maxLength) throw new OidcError("invalid_request", `Invalid ${name}`);
  return value;
}

async function readForm(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new OidcError("invalid_request", "Form encoding is required");
  }
  const data = await request.formData();
  const form = new URLSearchParams();
  let size = 0;
  for (const [name, value] of data) {
    if (typeof value !== "string") throw new OidcError("invalid_request", "File fields are not allowed");
    size += name.length + value.length;
    if (size > 16_384) throw new OidcError("invalid_request", "Request body is too large", 413);
    form.append(name, value);
  }
  return form;
}

function normalizeScopes(value) {
  return [...new Set(value.split(/\s+/).filter(Boolean))];
}

function bearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function randomToken() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Base64Url(value) {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function timingSafeTextEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftDigest = await crypto.subtle.digest("SHA-256", encoder.encode(left));
  const rightDigest = await crypto.subtle.digest("SHA-256", encoder.encode(right));
  return crypto.subtle.timingSafeEqual(leftDigest, rightDigest);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redirectError(redirectUri, code, description, state, issuer) {
  const destination = new URL(redirectUri);
  destination.searchParams.set("error", code);
  destination.searchParams.set("error_description", description);
  if (state) destination.searchParams.set("state", state);
  destination.searchParams.set("iss", issuer);
  return Response.redirect(destination.toString(), 302);
}

function oauthErrorResponse(error) {
  const headers = noStoreHeaders();
  if (error.code === "invalid_client") headers.set("WWW-Authenticate", 'Basic realm="token"');
  if (error.code === "invalid_token") headers.set("WWW-Authenticate", `Bearer error="${error.code}"`);
  return oidcJson({ error: error.code, error_description: error.message }, error.status, headers);
}

function oidcJson(value, status = 200, extraHeaders) {
  const headers = noStoreHeaders();
  if (extraHeaders) {
    for (const [name, headerValue] of new Headers(extraHeaders)) headers.set(name, headerValue);
  }
  headers.set("Content-Type", "application/json; charset=UTF-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function noStoreHeaders() {
  return new Headers({ "Cache-Control": "no-store", Pragma: "no-cache" });
}

async function cleanupExpiredState(db, now) {
  await db.batch([
    db.prepare("DELETE FROM oidc_authorization_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(now),
    db.prepare("DELETE FROM oidc_access_tokens WHERE expires_at <= ? OR revoked_at IS NOT NULL").bind(now),
  ]);
}
