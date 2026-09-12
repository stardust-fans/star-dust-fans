import {
  SignJWT,
  calculateJwkThumbprint,
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
} from "jose";

const encoder = new TextEncoder();
const AUTHORIZATION_CODE_TTL_SECONDS = 300;
const ACCESS_TOKEN_TTL_SECONDS = 300;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEVICE_CODE_TTL_SECONDS = 15 * 60;
const CIBA_REQUEST_TTL_SECONDS = 5 * 60;
const PAR_REQUEST_TTL_SECONDS = 90;
const REGISTRATION_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;
const CLIENT_SECRET_TTL_SECONDS = 365 * 24 * 60 * 60;
const DPOP_CLOCK_SKEW_SECONDS = 300;
const ID_TOKEN_SIGNING_ALGORITHM = "RS256";
const REQUEST_OBJECT_ALGORITHMS = ["RS256", "PS256", "ES256", "EdDSA"];
const OIDC_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/.well-known/jwks.json",
  "/oauth/authorize",
  "/oauth/token",
  "/oauth/userinfo",
  "/oauth/revoke",
  "/oauth/introspect",
  "/oauth/par",
  "/oauth/device_authorization",
  "/oauth/device",
  "/oauth/bc-authorize",
  "/oauth/ciba",
  "/oauth/logout",
  "/oauth/register",
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
  const isRegistrationManagement = url.pathname.startsWith("/oauth/register/");
  if (!OIDC_PATHS.has(url.pathname) && !isRegistrationManagement) return null;

  try {
    const config = readProviderConfiguration(env);
    if (url.origin !== config.issuer) throw new OidcError("invalid_request", "Request origin does not match the configured issuer");
    if (url.pathname === "/.well-known/openid-configuration" || url.pathname === "/.well-known/oauth-authorization-server") return metadataResponse(config);
    if (url.pathname === "/.well-known/jwks.json") return jwksResponse(config);
    if (url.pathname === "/oauth/authorize") return await authorize(request, env, ctx, config, authenticateUser);
    if (url.pathname === "/oauth/token") return await token(request, env, ctx, config);
    if (url.pathname === "/oauth/userinfo") return await userInfo(request, env, config);
    if (url.pathname === "/oauth/revoke") return await revoke(request, env, config);
    if (url.pathname === "/oauth/introspect") return await introspect(request, env, config);
    if (url.pathname === "/oauth/par") return await pushedAuthorizationRequest(request, env, config);
    if (url.pathname === "/oauth/device_authorization") return await deviceAuthorization(request, env, config);
    if (url.pathname === "/oauth/device") return await deviceVerification(request, env, config, authenticateUser);
    if (url.pathname === "/oauth/bc-authorize") return await backchannelAuthorization(request, env, config);
    if (url.pathname === "/oauth/ciba") return await cibaVerification(request, env, config, authenticateUser);
    if (url.pathname === "/oauth/logout") return await logout(request, env, config);
    if (url.pathname === "/oauth/register") return await registerClient(request, env, config);
    if (isRegistrationManagement) return await manageClient(request, env, config, url.pathname.slice("/oauth/register/".length));
    return null;
  } catch (error) {
    if (error instanceof OidcError) return oauthErrorResponse(error);
    return oauthErrorResponse(new OidcError("server_error", "Identity service is not configured", 503));
  }
}

function metadataResponse(config) {
  const metadata = {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`,
    userinfo_endpoint: `${config.issuer}/oauth/userinfo`,
    revocation_endpoint: `${config.issuer}/oauth/revoke`,
    introspection_endpoint: `${config.issuer}/oauth/introspect`,
    pushed_authorization_request_endpoint: `${config.issuer}/oauth/par`,
    device_authorization_endpoint: `${config.issuer}/oauth/device_authorization`,
    backchannel_authentication_endpoint: `${config.issuer}/oauth/bc-authorize`,
    end_session_endpoint: `${config.issuer}/oauth/logout`,
    jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    response_modes_supported: ["query", "jwt"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "urn:ietf:params:oauth:grant-type:device_code",
      "urn:openid:params:grant-type:ciba",
    ],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [ID_TOKEN_SIGNING_ALGORITHM],
    request_object_signing_alg_values_supported: REQUEST_OBJECT_ALGORITHMS,
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none", "private_key_jwt"],
    introspection_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "private_key_jwt"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "private_key_jwt", "none"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    claims_supported: ["iss", "sub", "aud", "exp", "iat", "auth_time", "nonce", "at_hash", "name", "preferred_username", "email", "email_verified"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
    request_parameter_supported: true,
    request_uri_parameter_supported: true,
    require_pushed_authorization_requests: false,
    dpop_signing_alg_values_supported: REQUEST_OBJECT_ALGORITHMS,
    backchannel_token_delivery_modes_supported: ["poll"],
    registration_endpoint: config.registrationEnabled ? `${config.issuer}/oauth/register` : undefined,
    registration_endpoint_auth_methods_supported: ["Bearer"],
  };
  return oidcJson(removeUndefined(metadata));
}

function jwksResponse(config) {
  return new Response(JSON.stringify({ keys: config.signingKeys.map((key) => key.publicJwk) }), {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/json; charset=UTF-8" },
  });
}

async function authorize(request, env, ctx, config, authenticateUser) {
  if (request.method !== "GET") throw new OidcError("invalid_request", "Authorization endpoint requires GET", 405);
  const context = await authorizationContext(request, env, config);
  const { client, params, redirectUri, requestUriHash } = context;
  try {
    if (requiredAuthorizationParameter(params, "response_type", 64) !== "code") throw new OidcError("unsupported_response_type", "Only authorization code is supported");
    if (!client.grantTypes.includes("authorization_code") || !client.responseTypes.includes("code")) throw new OidcError("unauthorized_client", "The client is not allowed to use authorization code");
    const state = requiredAuthorizationParameter(params, "state", 512);
    const nonce = requiredAuthorizationParameter(params, "nonce", 512);
    const codeChallenge = requiredAuthorizationParameter(params, "code_challenge", 128);
    if (requiredAuthorizationParameter(params, "code_challenge_method", 16) !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw new OidcError("invalid_request", "PKCE S256 is required");
    const scopes = normalizeScopes(requiredAuthorizationParameter(params, "scope", 512));
    validateScopes(scopes, config.scopes);
    validateClientScopes(scopes, client.scope);
    const responseMode = params.get("response_mode") || "query";
    if (!["query", "jwt", "query.jwt"].includes(responseMode)) throw new OidcError("invalid_request", "Unsupported response mode");
    if (client.requireSignedRequestObject && !params.get("request")) throw new OidcError("invalid_request", "A signed request object is required");
    const prompt = params.get("prompt") || "";
    const session = prompt === "login" ? null : await authenticateUser();
    if (!session) {
      if (prompt === "none") return authorizationResponse(config, client, redirectUri, responseMode, { error: "login_required", error_description: "Authentication is required", state });
      const loginUrl = new URL("/login", config.issuer);
      const returnUrl = new URL(request.url);
      loginUrl.searchParams.set("return_to", `${returnUrl.pathname}${returnUrl.search}`);
      return Response.redirect(loginUrl.toString(), 302);
    }
    const user = await loadUser(env, session.sub);
    if (!user) return authorizationResponse(config, client, redirectUri, responseMode, { error: "access_denied", error_description: "User account is unavailable", state });

    const dpopJkt = optionalParameter(params, "dpop_jkt", 128);
    if (dpopJkt && !/^[A-Za-z0-9_-]{43,128}$/.test(dpopJkt)) throw new OidcError("invalid_request", "Invalid DPoP key thumbprint");
    const code = randomToken();
    const nowValue = now();
    await env.DB.prepare(`
      INSERT INTO oidc_authorization_codes
        (code_hash, client_id, redirect_uri, user_id, nonce, scope, code_challenge, expires_at, response_mode, dpop_jkt, request_uri_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(await sha256Base64Url(code), client.clientId, redirectUri, user.id, nonce, scopes.join(" "), codeChallenge, nowValue + AUTHORIZATION_CODE_TTL_SECONDS, responseMode, dpopJkt, requestUriHash).run();
    if (requestUriHash) {
      const consumed = await env.DB.prepare("UPDATE oidc_par_requests SET used_at = ? WHERE request_uri_hash = ? AND used_at IS NULL AND expires_at > ?").bind(nowValue, requestUriHash, nowValue).run();
      if (consumed.meta?.changes !== 1) throw new OidcError("invalid_request", "The pushed authorization request has already been used");
    }
    ctx.waitUntil(cleanupExpiredState(env.DB, nowValue));
    return authorizationResponse(config, client, redirectUri, responseMode, { code, state });
  } catch (error) {
    if (error instanceof OidcError) {
      const state = safeParameter(params.get("state"), 512);
      const responseMode = ["jwt", "query.jwt"].includes(params.get("response_mode")) ? params.get("response_mode") : "query";
      return authorizationResponse(config, client, redirectUri, responseMode, { error: error.code, error_description: error.message, state });
    }
    throw error;
  }
}

async function authorizationContext(request, env, config) {
  const url = new URL(request.url);
  let params = new URLSearchParams(url.search);
  let requestUriHash = null;
  const requestUri = singleOptionalParameter(params, "request_uri", 2048);
  if (requestUri) {
    const row = await env.DB.prepare("SELECT client_id, parameters, expires_at, used_at FROM oidc_par_requests WHERE request_uri_hash = ?").bind(await sha256Base64Url(requestUri)).first();
    if (!row || row.used_at || row.expires_at <= now()) throw new OidcError("invalid_request_uri", "The pushed authorization request is invalid or expired");
    const queryClientId = singleOptionalParameter(params, "client_id", 200);
    if (queryClientId && queryClientId !== row.client_id) throw new OidcError("invalid_request", "The client_id does not match the request URI");
    params = new URLSearchParams(row.parameters);
    params.set("request_uri", requestUri);
    requestUriHash = await sha256Base64Url(requestUri);
  }
  let clientId = singleOptionalParameter(params, "client_id", 200);
  const requestObject = singleOptionalParameter(params, "request", 32_000);
  if (requestObject && !clientId) {
    try { clientId = decodeJwt(requestObject).iss; } catch { throw new OidcError("invalid_request", "The request object is invalid"); }
  }
  if (!clientId) throw new OidcError("invalid_request", "client_id is required");
  const client = await getClient(env, config, clientId);
  if (!client) throw new OidcError("unauthorized_client", "Unknown client");
  if (requestObject) {
    const claims = await verifyRequestObject(requestObject, client, config);
    for (const name of ["client_id", "redirect_uri", "response_type", "response_mode", "scope", "state", "nonce", "code_challenge", "code_challenge_method", "prompt", "dpop_jkt"]) {
      if (claims[name] !== undefined) params.set(name, Array.isArray(claims[name]) ? claims[name].join(" ") : String(claims[name]));
    }
  }
  if (params.get("client_id") !== client.clientId) throw new OidcError("invalid_request", "The client_id is invalid");
  const redirectUri = singleOptionalParameter(params, "redirect_uri", 2048);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) throw new OidcError("invalid_request", "Unregistered redirect URI");
  return { client, params, redirectUri, requestUriHash };
}

async function verifyRequestObject(value, client, config) {
  let header;
  try { header = decodeProtectedHeader(value); } catch { throw new OidcError("invalid_request", "The request object is invalid"); }
  if (!REQUEST_OBJECT_ALGORITHMS.includes(header.alg) || !client.jwks?.keys?.length) throw new OidcError("invalid_request", "The signed request object is not supported");
  for (const jwk of client.jwks.keys) {
    try {
      const key = await importJWK(jwk, header.alg);
      const verified = await jwtVerify(value, key, { issuer: client.clientId, audience: config.issuer, algorithms: [header.alg], clockTolerance: 5 });
      if (!verified.payload.exp || !verified.payload.iat) throw new Error();
      return verified.payload;
    } catch { continue; }
  }
  throw new OidcError("invalid_request", "The signed request object is invalid");
}

async function authorizationResponse(config, client, redirectUri, responseMode, values) {
  const destination = new URL(redirectUri);
  if (responseMode === "jwt" || responseMode === "query.jwt") {
    const signingKey = config.signingKeys[0];
    const response = await new SignJWT(removeUndefined({ ...values, iss: config.issuer, aud: client.clientId }))
      .setProtectedHeader({ alg: ID_TOKEN_SIGNING_ALGORITHM, kid: signingKey.publicJwk.kid, typ: "oauth-authz-res+jwt" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(await importJWK(signingKey.privateJwk, ID_TOKEN_SIGNING_ALGORITHM));
    destination.searchParams.set("response", response);
  } else {
    for (const [key, value] of Object.entries(removeUndefined({ ...values, iss: config.issuer }))) destination.searchParams.set(key, String(value));
  }
  return Response.redirect(destination.toString(), 302);
}

async function token(request, env, ctx, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "Token endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config, `${config.issuer}/oauth/token`, env);
  const grantType = requiredFormValue(form, "grant_type", 200);
  if (!client.grantTypes.includes(grantType)) throw new OidcError("unauthorized_client", "The client is not allowed to use this grant type");
  const dpopJkt = await optionalDpopProof(request, "POST", `${config.issuer}/oauth/token`, null, env);
  if (grantType === "authorization_code") return await authorizationCodeGrant(form, client, dpopJkt, env, ctx, config);
  if (grantType === "refresh_token") return await refreshTokenGrant(form, client, dpopJkt, env, ctx, config);
  if (grantType === "urn:ietf:params:oauth:grant-type:device_code") return await deviceTokenGrant(form, client, dpopJkt, env, ctx, config);
  if (grantType === "urn:openid:params:grant-type:ciba") return await cibaTokenGrant(form, client, dpopJkt, env, ctx, config);
  throw new OidcError("unsupported_grant_type", "The grant type is not supported");
}

async function authorizationCodeGrant(form, client, dpopJkt, env, ctx, config) {
  const code = requiredFormValue(form, "code", 2048);
  const redirectUri = requiredFormValue(form, "redirect_uri", 2048);
  const verifier = requiredFormValue(form, "code_verifier", 128);
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new OidcError("invalid_grant", "Invalid authorization code");
  const nowValue = now();
  const codeHash = await sha256Base64Url(code);
  const grant = await env.DB.prepare(`SELECT client_id, redirect_uri, user_id, nonce, scope, code_challenge, dpop_jkt FROM oidc_authorization_codes WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?`).bind(codeHash, nowValue).first();
  if (!grant || grant.client_id !== client.clientId || grant.redirect_uri !== redirectUri) throw new OidcError("invalid_grant", "Invalid authorization code");
  if (!(await timingSafeTextEqual(await sha256Base64Url(verifier), grant.code_challenge))) throw new OidcError("invalid_grant", "Invalid authorization code");
  if (grant.dpop_jkt && grant.dpop_jkt !== dpopJkt) throw new OidcError("invalid_grant", "The DPoP key does not match the authorization request");
  const consumed = await env.DB.prepare("UPDATE oidc_authorization_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?").bind(nowValue, codeHash, nowValue).run();
  if (consumed.meta?.changes !== 1) throw new OidcError("invalid_grant", "Invalid authorization code");
  const user = await loadUser(env, grant.user_id);
  if (!user) throw new OidcError("invalid_grant", "Invalid authorization code");
  const tokenSet = await issueTokenSet(env, config, client, user, grant.scope, { nonce: grant.nonce, dpopJkt: grant.dpop_jkt || dpopJkt, issueRefresh: normalizeScopes(grant.scope).includes("offline_access"), authTime: nowValue });
  ctx.waitUntil(cleanupExpiredState(env.DB, nowValue));
  return oidcJson(tokenSet);
}

async function refreshTokenGrant(form, client, dpopJkt, env, ctx, config) {
  const rawRefreshToken = requiredFormValue(form, "refresh_token", 2048);
  const refreshHash = await sha256Base64Url(rawRefreshToken);
  const row = await env.DB.prepare(`SELECT token_hash, family_id, client_id, user_id, scope, token_type, dpop_jkt, expires_at, used_at, revoked_at FROM oidc_refresh_tokens WHERE token_hash = ? AND client_id = ?`).bind(refreshHash, client.clientId).first();
  if (!row || row.expires_at <= now()) throw new OidcError("invalid_grant", "Invalid refresh token");
  if (row.used_at || row.revoked_at) {
    await env.DB.prepare("UPDATE oidc_refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?").bind(now(), row.family_id).run();
    throw new OidcError("invalid_grant", "The refresh token has already been used");
  }
  if (row.dpop_jkt && row.dpop_jkt !== dpopJkt) throw new OidcError("invalid_grant", "The DPoP key does not match the refresh token");
  const requestedScope = form.get("scope");
  const scope = requestedScope ? normalizeScopes(requestedScope).join(" ") : row.scope;
  const available = new Set(normalizeScopes(row.scope));
  if (normalizeScopes(scope).some((value) => !available.has(value))) throw new OidcError("invalid_scope", "The requested scope exceeds the refresh token scope");
  const user = await loadUser(env, row.user_id);
  if (!user) throw new OidcError("invalid_grant", "Invalid refresh token");
  const newRefreshToken = randomToken();
  const newRefreshHash = await sha256Base64Url(newRefreshToken);
  const nowValue = now();
  const accessToken = randomToken();
  const accessHash = await sha256Base64Url(accessToken);
  const keyJkt = row.dpop_jkt || dpopJkt;
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE oidc_refresh_tokens SET used_at = ?, replaced_by_hash = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?").bind(nowValue, newRefreshHash, refreshHash, nowValue),
    env.DB.prepare("INSERT INTO oidc_access_tokens (token_hash, client_id, user_id, scope, expires_at, token_type, dpop_jkt, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(accessHash, client.clientId, user.id, scope, nowValue + ACCESS_TOKEN_TTL_SECONDS, keyJkt ? "DPoP" : "Bearer", keyJkt, nowValue),
    env.DB.prepare("INSERT INTO oidc_refresh_tokens (token_hash, family_id, client_id, user_id, scope, token_type, dpop_jkt, expires_at, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(newRefreshHash, row.family_id, client.clientId, user.id, scope, keyJkt ? "DPoP" : "Bearer", keyJkt, nowValue + REFRESH_TOKEN_TTL_SECONDS, nowValue),
  ]);
  if (results[0]?.meta?.changes !== 1) throw new OidcError("invalid_grant", "The refresh token has already been used");
  const idToken = normalizeScopes(scope).includes("openid") ? await createIdToken(config, client, user, scope, null, nowValue, accessToken) : undefined;
  ctx.waitUntil(cleanupExpiredState(env.DB, nowValue));
  return oidcJson(removeUndefined({ access_token: accessToken, token_type: keyJkt ? "DPoP" : "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: newRefreshToken, id_token: idToken, scope, cnf: keyJkt ? { jkt: keyJkt } : undefined }));
}

async function deviceTokenGrant(form, client, dpopJkt, env, ctx, config) {
  const deviceCode = requiredFormValue(form, "device_code", 2048);
  const hash = await sha256Base64Url(deviceCode);
  const row = await env.DB.prepare("SELECT * FROM oidc_device_authorizations WHERE device_code_hash = ? AND client_id = ?").bind(hash, client.clientId).first();
  if (!row || row.expires_at <= now()) throw new OidcError("expired_token", "The device code has expired");
  if (row.last_polled_at && now() - row.last_polled_at < row.interval_seconds) {
    await env.DB.prepare("UPDATE oidc_device_authorizations SET interval_seconds = interval_seconds + 5, last_polled_at = ? WHERE device_code_hash = ?").bind(now(), hash).run();
    throw new OidcError("slow_down", "Poll interval is too short");
  }
  await env.DB.prepare("UPDATE oidc_device_authorizations SET last_polled_at = ? WHERE device_code_hash = ?").bind(now(), hash).run();
  if (row.status === "pending") throw new OidcError("authorization_pending", "The device has not been approved");
  if (row.status === "denied") throw new OidcError("access_denied", "The device authorization was denied");
  if (row.status !== "approved" || row.consumed_at) throw new OidcError("invalid_grant", "The device authorization is invalid");
  if (row.code_challenge) {
    const verifier = requiredFormValue(form, "code_verifier", 128);
    if (!(await timingSafeTextEqual(await sha256Base64Url(verifier), row.code_challenge))) throw new OidcError("invalid_grant", "Invalid device code verifier");
  }
  const consumed = await env.DB.prepare("UPDATE oidc_device_authorizations SET consumed_at = ?, status = 'consumed' WHERE device_code_hash = ? AND status = 'approved' AND consumed_at IS NULL").bind(now(), hash).run();
  if (consumed.meta?.changes !== 1) throw new OidcError("invalid_grant", "The device authorization has already been used");
  const user = await loadUser(env, row.user_id);
  if (!user) throw new OidcError("invalid_grant", "The device authorization is invalid");
  const tokenSet = await issueTokenSet(env, config, client, user, row.scope, { nonce: row.nonce, dpopJkt, issueRefresh: normalizeScopes(row.scope).includes("offline_access"), authTime: row.approved_at || now() });
  ctx.waitUntil(cleanupExpiredState(env.DB, now()));
  return oidcJson(tokenSet);
}

async function cibaTokenGrant(form, client, dpopJkt, env, ctx, config) {
  const authReqId = requiredFormValue(form, "auth_req_id", 2048);
  const hash = await sha256Base64Url(authReqId);
  const row = await env.DB.prepare("SELECT * FROM oidc_ciba_requests WHERE auth_req_id_hash = ? AND client_id = ?").bind(hash, client.clientId).first();
  if (!row || row.expires_at <= now()) throw new OidcError("expired_token", "The CIBA request has expired");
  if (row.last_polled_at && now() - row.last_polled_at < row.interval_seconds) {
    await env.DB.prepare("UPDATE oidc_ciba_requests SET interval_seconds = interval_seconds + 5, last_polled_at = ? WHERE auth_req_id_hash = ?").bind(now(), hash).run();
    throw new OidcError("slow_down", "Poll interval is too short");
  }
  await env.DB.prepare("UPDATE oidc_ciba_requests SET last_polled_at = ? WHERE auth_req_id_hash = ?").bind(now(), hash).run();
  if (row.status === "pending") throw new OidcError("authorization_pending", "The CIBA request has not been approved");
  if (row.status === "denied") throw new OidcError("access_denied", "The CIBA request was denied");
  if (row.status !== "approved" || row.consumed_at) throw new OidcError("invalid_grant", "The CIBA request is invalid");
  const consumed = await env.DB.prepare("UPDATE oidc_ciba_requests SET consumed_at = ?, status = 'consumed' WHERE auth_req_id_hash = ? AND status = 'approved' AND consumed_at IS NULL").bind(now(), hash).run();
  if (consumed.meta?.changes !== 1) throw new OidcError("invalid_grant", "The CIBA request has already been used");
  const user = await loadUser(env, row.user_id);
  if (!user) throw new OidcError("invalid_grant", "The CIBA request is invalid");
  const tokenSet = await issueTokenSet(env, config, client, user, row.scope, { nonce: row.nonce, dpopJkt, issueRefresh: normalizeScopes(row.scope).includes("offline_access"), authTime: row.approved_at || now() });
  ctx.waitUntil(cleanupExpiredState(env.DB, now()));
  return oidcJson(tokenSet);
}

async function issueTokenSet(env, config, client, user, scope, options = {}) {
  const nowValue = now();
  const accessToken = randomToken();
  const accessHash = await sha256Base64Url(accessToken);
  const dpopJkt = options.dpopJkt || null;
  const tokenType = dpopJkt ? "DPoP" : "Bearer";
  const statements = [env.DB.prepare("INSERT INTO oidc_access_tokens (token_hash, client_id, user_id, scope, expires_at, token_type, dpop_jkt, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(accessHash, client.clientId, user.id, scope, nowValue + ACCESS_TOKEN_TTL_SECONDS, tokenType, dpopJkt, nowValue)];
  let refreshToken;
  if (options.issueRefresh) {
    refreshToken = randomToken();
    const refreshHash = await sha256Base64Url(refreshToken);
    statements.push(env.DB.prepare("INSERT INTO oidc_refresh_tokens (token_hash, family_id, client_id, user_id, scope, token_type, dpop_jkt, expires_at, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(refreshHash, randomToken(), client.clientId, user.id, scope, tokenType, dpopJkt, nowValue + REFRESH_TOKEN_TTL_SECONDS, nowValue));
  }
  await env.DB.batch(statements);
  const idToken = normalizeScopes(scope).includes("openid") ? await createIdToken(config, client, user, scope, options.nonce, options.authTime || nowValue, accessToken) : undefined;
  return removeUndefined({ access_token: accessToken, token_type: tokenType, expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken, id_token: idToken, scope, cnf: dpopJkt ? { jkt: dpopJkt } : undefined });
}

async function createIdToken(config, client, user, scope, nonce, authTime, accessToken) {
  const signingKey = config.signingKeys[0];
  const claims = removeUndefined({ ...profileClaims(user, scope, nonce), auth_time: authTime, at_hash: accessToken ? await halfHash(accessToken) : undefined });
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ID_TOKEN_SIGNING_ALGORITHM, kid: signingKey.publicJwk.kid, typ: "JWT" })
    .setIssuer(config.issuer)
    .setSubject(String(user.id))
    .setAudience(client.clientId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(await importJWK(signingKey.privateJwk, ID_TOKEN_SIGNING_ALGORITHM));
}

async function userInfo(request, env, config) {
  if (request.method !== "GET" && request.method !== "POST") throw new OidcError("invalid_request", "UserInfo endpoint requires GET or POST", 405);
  const credential = tokenCredential(request);
  if (!credential) throw new OidcError("invalid_token", "An access token is required", 401);
  const dpopJkt = credential.scheme === "DPoP" ? await optionalDpopProof(request, request.method, `${config.issuer}/oauth/userinfo`, null, env) : null;
  const row = await env.DB.prepare(`SELECT t.scope, t.token_type, t.dpop_jkt, u.id, u.username, u.email FROM oidc_access_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ? AND t.revoked_at IS NULL`).bind(await sha256Base64Url(credential.token), now()).first();
  if (!row || row.token_type !== (credential.scheme === "DPoP" ? "DPoP" : "Bearer") || (row.dpop_jkt && row.dpop_jkt !== dpopJkt)) throw new OidcError("invalid_token", "Access token is invalid", 401);
  return oidcJson({ sub: String(row.id), ...profileClaims(row, row.scope) });
}

async function revoke(request, env, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "Revocation endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config, `${config.issuer}/oauth/revoke`, env);
  const rawToken = requiredFormValue(form, "token", 2048);
  const hash = await sha256Base64Url(rawToken);
  const revokedAt = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE oidc_access_tokens SET revoked_at = ? WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL").bind(revokedAt, hash, client.clientId),
    env.DB.prepare("UPDATE oidc_refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL").bind(revokedAt, hash, client.clientId),
  ]);
  return new Response(null, { status: 200, headers: noStoreHeaders() });
}

async function introspect(request, env, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "Introspection endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config, `${config.issuer}/oauth/introspect`, env);
  const rawToken = requiredFormValue(form, "token", 2048);
  const hash = await sha256Base64Url(rawToken);
  const access = await env.DB.prepare(`SELECT t.client_id, t.user_id, t.scope, t.expires_at, t.issued_at, t.revoked_at, t.token_type, t.dpop_jkt, u.username FROM oidc_access_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`).bind(hash).first();
  const refresh = access ? null : await env.DB.prepare("SELECT client_id, user_id, scope, expires_at, issued_at, revoked_at, token_type, dpop_jkt FROM oidc_refresh_tokens WHERE token_hash = ?").bind(hash).first();
  const row = access || refresh;
  if (!row || row.client_id !== client.clientId || row.revoked_at || row.expires_at <= now()) return oidcJson({ active: false });
  return oidcJson(removeUndefined({ active: true, client_id: row.client_id, username: row.username, sub: row.user_id ? String(row.user_id) : undefined, scope: row.scope, token_type: row.token_type, exp: row.expires_at, iat: row.issued_at, cnf: row.dpop_jkt ? { jkt: row.dpop_jkt } : undefined }));
}

async function pushedAuthorizationRequest(request, env, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "PAR endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config, `${config.issuer}/oauth/par`, env);
  const clientId = requiredFormValue(form, "client_id", 200);
  if (clientId !== client.clientId) throw new OidcError("invalid_request", "The client_id is invalid");
  const params = new URLSearchParams();
  for (const [key, value] of form) if (!["client_secret", "client_assertion", "client_assertion_type"].includes(key)) params.append(key, value);
  const requestObject = params.get("request");
  if (requestObject) {
    const claims = await verifyRequestObject(requestObject, client, config);
    for (const name of ["client_id", "redirect_uri", "response_type", "response_mode", "scope", "state", "nonce", "code_challenge", "code_challenge_method", "prompt", "dpop_jkt"]) {
      if (claims[name] !== undefined) params.set(name, Array.isArray(claims[name]) ? claims[name].join(" ") : String(claims[name]));
    }
  }
  if (params.get("client_id") !== client.clientId) throw new OidcError("invalid_request", "The client_id is invalid");
  const redirectUri = requiredParameter(params, "redirect_uri", 2048);
  if (!client.redirectUris.includes(redirectUri)) throw new OidcError("invalid_request", "Unregistered redirect URI");
  if (requiredParameter(params, "response_type", 64) !== "code") throw new OidcError("unsupported_response_type", "Only authorization code is supported");
  const scopes = normalizeScopes(requiredParameter(params, "scope", 512));
  validateScopes(scopes, config.scopes);
  validateClientScopes(scopes, client.scope);
  if (requiredParameter(params, "code_challenge_method", 16) !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(requiredParameter(params, "code_challenge", 128))) throw new OidcError("invalid_request", "PKCE S256 is required");
  const requestUri = `urn:ietf:params:oauth:request-uri:${randomToken()}`;
  await env.DB.prepare("INSERT INTO oidc_par_requests (request_uri_hash, client_id, parameters, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256Base64Url(requestUri), client.clientId, params.toString(), now() + PAR_REQUEST_TTL_SECONDS).run();
  return oidcJson({ request_uri: requestUri, expires_in: PAR_REQUEST_TTL_SECONDS }, 201);
}

async function deviceAuthorization(request, env, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "Device authorization endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config, `${config.issuer}/oauth/device_authorization`, env);
  const clientId = requiredFormValue(form, "client_id", 200);
  if (clientId !== client.clientId) throw new OidcError("invalid_request", "The client_id is invalid");
  const scopes = normalizeScopes(requiredFormValue(form, "scope", 512));
  validateScopes(scopes, config.scopes);
  validateClientScopes(scopes, client.scope);
  const codeChallenge = form.get("code_challenge") || null;
  const codeChallengeMethod = form.get("code_challenge_method") || null;
  if (codeChallenge && (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))) throw new OidcError("invalid_request", "PKCE S256 is required");
  const deviceCode = randomToken();
  const userCode = await uniqueUserCode(env);
  const approvalNonce = randomToken();
  await env.DB.prepare(`INSERT INTO oidc_device_authorizations (device_code_hash, client_id, user_code, scope, nonce, code_challenge, code_challenge_method, approval_nonce_hash, expires_at, interval_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(await sha256Base64Url(deviceCode), client.clientId, userCode, scopes.join(" "), randomToken(), codeChallenge, codeChallengeMethod, await sha256Base64Url(approvalNonce), now() + DEVICE_CODE_TTL_SECONDS, 5).run();
  return oidcJson({ device_code: deviceCode, user_code: userCode, verification_uri: `${config.issuer}/oauth/device`, verification_uri_complete: `${config.issuer}/oauth/device?user_code=${encodeURIComponent(userCode)}`, expires_in: DEVICE_CODE_TTL_SECONDS, interval: 5 });
}

async function deviceVerification(request, env, config, authenticateUser) {
  if (request.method !== "GET" && request.method !== "POST") throw new OidcError("invalid_request", "Device verification requires GET or POST", 405);
  const url = new URL(request.url);
  let userCode;
  let approvalNonce;
  let decision = "";
  if (request.method === "GET") userCode = safeUserCode(url.searchParams.get("user_code"));
  else {
    const form = await readForm(request);
    userCode = safeUserCode(form.get("user_code"));
    approvalNonce = requiredFormValue(form, "approval_nonce", 2048);
    decision = form.get("decision") || "deny";
  }
  if (!userCode) return htmlResponse(deviceForm(config, ""));
  const row = await env.DB.prepare("SELECT * FROM oidc_device_authorizations WHERE user_code = ? AND expires_at > ? AND consumed_at IS NULL").bind(userCode, now()).first();
  if (!row) return htmlResponse(deviceForm(config, "This device code is invalid or expired"), 400);
  const session = await authenticateUser();
  if (!session) {
    const loginUrl = new URL("/login", config.issuer);
    loginUrl.searchParams.set("return_to", `/oauth/device?user_code=${encodeURIComponent(userCode)}`);
    return Response.redirect(loginUrl.toString(), 302);
  }
  if (request.method === "GET") {
    const formNonce = randomToken();
    await env.DB.prepare("UPDATE oidc_device_authorizations SET approval_nonce_hash = ? WHERE user_code = ? AND status = 'pending' AND expires_at > ?").bind(await sha256Base64Url(formNonce), userCode, now()).run();
    return htmlResponse(deviceApprovalForm(config, row, formNonce));
  }
  if (!(await timingSafeTextEqual(await sha256Base64Url(approvalNonce), row.approval_nonce_hash))) return htmlResponse(deviceForm(config, "The approval form is invalid"), 400);
  if (!["approve", "deny"].includes(decision)) throw new OidcError("invalid_request", "Invalid device decision");
  const status = decision === "approve" ? "approved" : "denied";
  const result = await env.DB.prepare("UPDATE oidc_device_authorizations SET status = ?, user_id = ?, approved_at = ? WHERE user_code = ? AND status = 'pending' AND expires_at > ?").bind(status, session.sub, decision === "approve" ? now() : null, userCode, now()).run();
  if (result.meta?.changes !== 1) return htmlResponse(deviceForm(config, "This device request has already been handled"), 409);
  return htmlResponse(`<h1>${status === "approved" ? "Device approved" : "Device denied"}</h1><p>You can return to the device.</p>`);
}

async function backchannelAuthorization(request, env, config) {
  if (request.method !== "POST") throw new OidcError("invalid_request", "CIBA endpoint requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(request, form, config, `${config.issuer}/oauth/bc-authorize`, env);
  const scope = normalizeScopes(requiredFormValue(form, "scope", 512));
  validateScopes(scope, config.scopes);
  validateClientScopes(scope, client.scope);
  const loginHint = requiredFormValue(form, "login_hint", 512);
  const user = await env.DB.prepare("SELECT id FROM users WHERE CAST(id AS TEXT) = ? OR username = ? OR email = ?").bind(loginHint, loginHint, loginHint).first();
  if (!user) throw new OidcError("invalid_request", "The login_hint is not recognized");
  const bindingMessage = form.get("binding_message") || null;
  if (bindingMessage && bindingMessage.length > 64) throw new OidcError("invalid_request", "The binding_message is too long");
  const authReqId = randomToken();
  const approvalNonce = randomToken();
  await env.DB.prepare(`INSERT INTO oidc_ciba_requests (auth_req_id_hash, client_id, scope, nonce, user_id, binding_message, approval_nonce_hash, expires_at, interval_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(await sha256Base64Url(authReqId), client.clientId, scope.join(" "), form.get("nonce") || null, user.id, bindingMessage, await sha256Base64Url(approvalNonce), now() + CIBA_REQUEST_TTL_SECONDS, 5).run();
  return oidcJson({ auth_req_id: authReqId, expires_in: CIBA_REQUEST_TTL_SECONDS, interval: 5, verification_uri: `${config.issuer}/oauth/ciba?auth_req_id=${encodeURIComponent(authReqId)}` });
}

async function cibaVerification(request, env, config, authenticateUser) {
  if (request.method !== "GET" && request.method !== "POST") throw new OidcError("invalid_request", "CIBA verification requires GET or POST", 405);
  const url = new URL(request.url);
  let authReqId;
  let approvalNonce;
  let decision = "";
  if (request.method === "GET") authReqId = url.searchParams.get("auth_req_id") || "";
  else {
    const form = await readForm(request);
    authReqId = requiredFormValue(form, "auth_req_id", 2048);
    approvalNonce = requiredFormValue(form, "approval_nonce", 2048);
    decision = form.get("decision") || "deny";
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(authReqId)) return htmlResponse(cibaForm(config, "The CIBA request is invalid"), 400);
  const hash = await sha256Base64Url(authReqId);
  const row = await env.DB.prepare("SELECT * FROM oidc_ciba_requests WHERE auth_req_id_hash = ? AND expires_at > ? AND consumed_at IS NULL").bind(hash, now()).first();
  if (!row) return htmlResponse(cibaForm(config, "The CIBA request is invalid or expired"), 400);
  const session = await authenticateUser();
  if (!session) {
    const loginUrl = new URL("/login", config.issuer);
    loginUrl.searchParams.set("return_to", `/oauth/ciba?auth_req_id=${encodeURIComponent(authReqId)}`);
    return Response.redirect(loginUrl.toString(), 302);
  }
  if (String(session.sub) !== String(row.user_id)) return htmlResponse(cibaForm(config, "The signed-in account does not match the requested account"), 403);
  if (request.method === "GET") {
    const formNonce = randomToken();
    await env.DB.prepare("UPDATE oidc_ciba_requests SET approval_nonce_hash = ? WHERE auth_req_id_hash = ? AND status = 'pending' AND expires_at > ?").bind(await sha256Base64Url(formNonce), hash, now()).run();
    return htmlResponse(cibaApprovalForm(config, row, authReqId, formNonce));
  }
  if (!(await timingSafeTextEqual(await sha256Base64Url(approvalNonce), row.approval_nonce_hash))) return htmlResponse(cibaForm(config, "The approval form is invalid"), 400);
  if (!["approve", "deny"].includes(decision)) throw new OidcError("invalid_request", "Invalid CIBA decision");
  const status = decision === "approve" ? "approved" : "denied";
  const result = await env.DB.prepare("UPDATE oidc_ciba_requests SET status = ?, approved_at = ? WHERE auth_req_id_hash = ? AND status = 'pending' AND expires_at > ?").bind(status, decision === "approve" ? now() : null, hash, now()).run();
  if (result.meta?.changes !== 1) return htmlResponse(cibaForm(config, "The CIBA request has already been handled"), 409);
  return htmlResponse(`<h1>${status === "approved" ? "CIBA approved" : "CIBA denied"}</h1><p>The client can continue polling.</p>`);
}

async function logout(request, env, config) {
  if (request.method !== "GET") throw new OidcError("invalid_request", "Logout endpoint requires GET", 405);
  const url = new URL(request.url);
  const idTokenHint = url.searchParams.get("id_token_hint");
  const clientId = url.searchParams.get("client_id");
  let client = clientId ? await getClient(env, config, clientId) : null;
  let subject = null;
  if (idTokenHint) {
    try {
      const decoded = decodeJwt(idTokenHint);
      if (!client && typeof decoded.aud === "string") client = await getClient(env, config, decoded.aud);
      const keyId = decodeProtectedHeader(idTokenHint).kid;
      const signingKey = config.signingKeys.find((key) => key.publicJwk.kid === keyId) || config.signingKeys[0];
      subject = (await jwtVerify(idTokenHint, await importJWK(signingKey.publicJwk, ID_TOKEN_SIGNING_ALGORITHM), { issuer: config.issuer, audience: client?.clientId, algorithms: [ID_TOKEN_SIGNING_ALGORITHM] })).payload.sub;
    } catch {
      throw new OidcError("invalid_request", "The id_token_hint is invalid");
    }
  }
  const postLogoutRedirectUri = url.searchParams.get("post_logout_redirect_uri");
  if (postLogoutRedirectUri && (!client || !client.postLogoutRedirectUris.includes(postLogoutRedirectUri))) throw new OidcError("invalid_request", "Unregistered post logout redirect URI");
  if (subject && client) await env.DB.batch([
    env.DB.prepare("UPDATE oidc_access_tokens SET revoked_at = ? WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL").bind(now(), subject, client.clientId),
    env.DB.prepare("UPDATE oidc_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL").bind(now(), subject, client.clientId),
  ]);
  const headers = noStoreHeaders();
  headers.set("Set-Cookie", clearAuthCookie(url));
  if (postLogoutRedirectUri) {
    const destination = new URL(postLogoutRedirectUri);
    const state = safeParameter(url.searchParams.get("state"), 512);
    if (state) destination.searchParams.set("state", state);
    headers.set("Location", destination.toString());
    return new Response(null, { status: 302, headers });
  }
  return new Response("Signed out", { status: 200, headers });
}

async function registerClient(request, env, config) {
  if (!config.registrationEnabled) throw new OidcError("temporarily_unavailable", "Dynamic client registration is not enabled", 503);
  if (request.method !== "POST") throw new OidcError("invalid_request", "Registration endpoint requires POST", 405);
  await authenticateRegistrationToken(request, env);
  const body = await readJsonBody(request);
  const registration = validateRegistration(body, config);
  const nowValue = now();
  const clientId = `client-${randomToken()}`;
  const clientSecret = registration.tokenEndpointAuthMethod === "none" || registration.tokenEndpointAuthMethod === "private_key_jwt" ? null : randomToken();
  const registrationAccessToken = randomToken();
  await env.DB.prepare(`INSERT INTO oidc_dynamic_clients (client_id, client_secret_hash, client_name, redirect_uris, post_logout_redirect_uris, token_endpoint_auth_method, jwks, grant_types, response_types, scope, require_signed_request_object, registration_access_token_hash, registration_access_token_expires_at, client_secret_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(clientId, clientSecret ? await sha256Base64Url(clientSecret) : null, registration.clientName, JSON.stringify(registration.redirectUris), JSON.stringify(registration.postLogoutRedirectUris), registration.tokenEndpointAuthMethod, registration.jwks ? JSON.stringify(registration.jwks) : null, JSON.stringify(registration.grantTypes), JSON.stringify(registration.responseTypes), registration.scope.join(" "), registration.requireSignedRequestObject ? 1 : 0, await sha256Base64Url(registrationAccessToken), nowValue + REGISTRATION_TOKEN_TTL_SECONDS, clientSecret ? nowValue + CLIENT_SECRET_TTL_SECONDS : null, nowValue, nowValue).run();
  return oidcJson(registrationResponse(config, { ...registration, clientId }, clientSecret, registrationAccessToken, nowValue), 201, new Headers({ Location: `${config.issuer}/oauth/register/${encodeURIComponent(clientId)}` }));
}

async function manageClient(request, env, config, rawClientId) {
  const clientId = decodeClientId(rawClientId);
  const dynamic = await loadDynamicClient(env, clientId);
  if (!dynamic) throw new OidcError("invalid_client_metadata", "Dynamic client was not found", 404);
  const registrationToken = bearerToken(request);
  if (!registrationToken || !(await timingSafeTextEqual(await sha256Base64Url(registrationToken), dynamic.registrationAccessTokenHash)) || dynamic.registrationAccessTokenExpiresAt <= now()) throw new OidcError("invalid_token", "Registration access token is invalid", 401);
  if (request.method === "GET") return oidcJson(publicClientMetadata(dynamic, config));
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM oidc_dynamic_clients WHERE client_id = ?").bind(clientId).run();
    return new Response(null, { status: 204, headers: noStoreHeaders() });
  }
  if (request.method !== "PUT") throw new OidcError("invalid_request", "Registration management requires GET, PUT, or DELETE", 405);
  const body = await readJsonBody(request);
  const requestedAuthMethod = body.token_endpoint_auth_method || dynamic.tokenEndpointAuthMethod;
  if (requestedAuthMethod !== dynamic.tokenEndpointAuthMethod) throw new OidcError("invalid_client_metadata", "The token endpoint authentication method cannot be changed");
  const merged = validateRegistration({ ...body, client_id: clientId }, config, dynamic);
  const newRegistrationToken = randomToken();
  const nowValue = now();
  await env.DB.prepare(`UPDATE oidc_dynamic_clients SET client_name = ?, redirect_uris = ?, post_logout_redirect_uris = ?, token_endpoint_auth_method = ?, jwks = ?, grant_types = ?, response_types = ?, scope = ?, require_signed_request_object = ?, registration_access_token_hash = ?, registration_access_token_expires_at = ?, updated_at = ? WHERE client_id = ?`).bind(merged.clientName, JSON.stringify(merged.redirectUris), JSON.stringify(merged.postLogoutRedirectUris), merged.tokenEndpointAuthMethod, merged.jwks ? JSON.stringify(merged.jwks) : null, JSON.stringify(merged.grantTypes), JSON.stringify(merged.responseTypes), merged.scope.join(" "), merged.requireSignedRequestObject ? 1 : 0, await sha256Base64Url(newRegistrationToken), nowValue + REGISTRATION_TOKEN_TTL_SECONDS, nowValue, clientId).run();
  const fresh = await loadDynamicClient(env, clientId);
  return oidcJson({ ...publicClientMetadata(fresh, config), registration_access_token: newRegistrationToken });
}

async function authenticateRegistrationToken(request, env) {
  const expected = env.OIDC_INITIAL_ACCESS_TOKEN;
  const received = bearerToken(request);
  if (typeof expected !== "string" || expected.length < 32 || !received || !(await timingSafeTextEqual(received, expected))) throw new OidcError("invalid_token", "A valid registration token is required", 401);
}

function validateRegistration(body, config, existing = null) {
  const clientName = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 200) : existing?.clientName || "Registered client";
  const redirectUris = body.redirect_uris === undefined && existing ? existing.redirectUris : Array.isArray(body.redirect_uris) ? body.redirect_uris.map(validateRedirectUri) : [];
  if (!redirectUris.length) throw new OidcError("invalid_client_metadata", "redirect_uris are required");
  const postLogoutRedirectUris = body.post_logout_redirect_uris === undefined && existing ? existing.postLogoutRedirectUris : Array.isArray(body.post_logout_redirect_uris || []) ? body.post_logout_redirect_uris.map(validateRedirectUri) : [];
  const tokenEndpointAuthMethod = body.token_endpoint_auth_method || existing?.tokenEndpointAuthMethod || "none";
  if (!["client_secret_basic", "client_secret_post", "none", "private_key_jwt"].includes(tokenEndpointAuthMethod)) throw new OidcError("invalid_client_metadata", "Unsupported token endpoint authentication method");
  const jwks = body.jwks === undefined && existing ? existing.jwks : body.jwks || null;
  if (jwks && (!Array.isArray(jwks.keys) || !jwks.keys.length || jwks.keys.some((key) => !key || key.d || !key.kty))) throw new OidcError("invalid_client_metadata", "jwks must contain public keys");
  if (tokenEndpointAuthMethod === "private_key_jwt" && !jwks?.keys?.length) throw new OidcError("invalid_client_metadata", "private_key_jwt requires jwks");
  const grantTypes = body.grant_types === undefined && existing ? existing.grantTypes : Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code", "refresh_token"];
  const responseTypes = body.response_types === undefined && existing ? existing.responseTypes : Array.isArray(body.response_types) ? body.response_types : ["code"];
  if (!grantTypes.every((grant) => ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code", "urn:openid:params:grant-type:ciba"].includes(grant)) || !responseTypes.every((type) => type === "code")) throw new OidcError("invalid_client_metadata", "Unsupported grant or response type");
  const scope = body.scope === undefined && existing ? existing.scope : normalizeScopes(typeof body.scope === "string" ? body.scope : "openid profile email offline_access");
  validateScopes(scope, config.scopes);
  return { clientId: existing?.clientId, clientName, redirectUris, postLogoutRedirectUris, tokenEndpointAuthMethod, jwks, grantTypes, responseTypes, scope, requireSignedRequestObject: Boolean(body.require_signed_request_object ?? existing?.requireSignedRequestObject) };
}

function registrationResponse(config, registration, clientSecret, registrationAccessToken, issuedAt) {
  return removeUndefined({ client_id: registration.clientId, client_name: registration.clientName, client_secret: clientSecret, client_secret_expires_at: clientSecret ? issuedAt + CLIENT_SECRET_TTL_SECONDS : 0, client_id_issued_at: issuedAt, redirect_uris: registration.redirectUris, post_logout_redirect_uris: registration.postLogoutRedirectUris, token_endpoint_auth_method: registration.tokenEndpointAuthMethod, jwks: registration.jwks, grant_types: registration.grantTypes, response_types: registration.responseTypes, scope: registration.scope.join(" "), require_signed_request_object: registration.requireSignedRequestObject, registration_client_uri: `${config.issuer}/oauth/register/${encodeURIComponent(registration.clientId)}`, registration_access_token: registrationAccessToken });
}

function publicClientMetadata(client, config) {
  return removeUndefined({ client_id: client.clientId, client_name: client.clientName, redirect_uris: client.redirectUris, post_logout_redirect_uris: client.postLogoutRedirectUris, token_endpoint_auth_method: client.tokenEndpointAuthMethod, jwks: client.jwks, grant_types: client.grantTypes, response_types: client.responseTypes, scope: client.scope.join(" "), require_signed_request_object: client.requireSignedRequestObject, client_id_issued_at: client.createdAt, client_secret_expires_at: client.clientSecretExpiresAt || 0, registration_client_uri: `${config.issuer}/oauth/register/${encodeURIComponent(client.clientId)}` });
}

async function authenticateClient(request, form, config, audience, env) {
  if (form.getAll("client_id").length > 1 || form.getAll("client_secret").length > 1 || form.getAll("client_assertion").length > 1) throw new OidcError("invalid_client", "Invalid client authentication", 401);
  let clientId = form.get("client_id");
  let clientSecret = form.get("client_secret");
  const authorization = request.headers.get("Authorization") || "";
  const basic = authorization.match(/^Basic\s+(.+)$/i);
  if (basic) {
    if (clientSecret) throw new OidcError("invalid_client", "Conflicting client authentication", 401);
    let decoded;
    try { decoded = atob(basic[1]); } catch { throw new OidcError("invalid_client", "Invalid client authentication", 401); }
    const separator = decoded.indexOf(":");
    if (separator < 0) throw new OidcError("invalid_client", "Invalid client authentication", 401);
    try { clientId = decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, " ")); clientSecret = decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, " ")); } catch { throw new OidcError("invalid_client", "Invalid client authentication", 401); }
  }
  if (typeof clientId !== "string" || !clientId) throw new OidcError("invalid_client", "Client authentication is required", 401);
  const client = await getClient(env, config, clientId);
  if (!client) throw new OidcError("invalid_client", "Invalid client authentication", 401);
  if (client.tokenEndpointAuthMethod === "none") {
    if (basic || clientSecret) throw new OidcError("invalid_client", "Invalid client authentication", 401);
    return client;
  }
  if (client.tokenEndpointAuthMethod === "private_key_jwt") {
    if (basic || clientSecret || form.get("client_assertion_type") !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer") throw new OidcError("invalid_client", "Invalid client authentication", 401);
    await verifyClientAssertion(form.get("client_assertion"), client, audience, env);
    return client;
  }
  const secretMatches = client.clientSecretHash
    ? await timingSafeTextEqual(await sha256Base64Url(clientSecret || ""), client.clientSecretHash)
    : await timingSafeTextEqual(clientSecret || "", client.clientSecret);
  if (typeof clientSecret !== "string" || !secretMatches || (client.clientSecretExpiresAt && client.clientSecretExpiresAt <= now())) throw new OidcError("invalid_client", "Invalid client authentication", 401);
  if (client.tokenEndpointAuthMethod === "client_secret_basic" && !basic) throw new OidcError("invalid_client", "Client must use HTTP Basic authentication", 401);
  if (client.tokenEndpointAuthMethod === "client_secret_post" && basic) throw new OidcError("invalid_client", "Client must use form authentication", 401);
  return client;
}

async function verifyClientAssertion(assertion, client, audience, env) {
  if (typeof assertion !== "string" || assertion.length > 16_384 || !client.jwks?.keys?.length) throw new OidcError("invalid_client", "Client assertion is invalid", 401);
  let header;
  try { header = decodeProtectedHeader(assertion); } catch { throw new OidcError("invalid_client", "Client assertion is invalid", 401); }
  if (!REQUEST_OBJECT_ALGORITHMS.includes(header.alg)) throw new OidcError("invalid_client", "Client assertion algorithm is not supported", 401);
  let payload;
  for (const jwk of client.jwks.keys) {
    try { payload = (await jwtVerify(assertion, await importJWK(jwk, header.alg), { issuer: client.clientId, audience, algorithms: [header.alg], clockTolerance: 5 })).payload; break; } catch { continue; }
  }
  if (!payload?.jti || !payload.exp || !payload.iat) throw new OidcError("invalid_client", "Client assertion is invalid", 401);
  const result = await env.DB.prepare("INSERT INTO oidc_client_assertions (jti_hash, client_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Base64Url(payload.jti), client.clientId, payload.exp).run().catch(() => null);
  if (!result || result.meta?.changes !== 1) throw new OidcError("invalid_client", "Client assertion has been replayed", 401);
}

async function getClient(env, config, clientId) {
  const staticClient = config.clients.get(clientId);
  if (staticClient) return staticClient;
  const dynamic = await loadDynamicClient(env, clientId);
  if (!dynamic) return null;
  dynamic.issuer = config.issuer;
  return dynamic;
}

async function loadDynamicClient(env, clientId) {
  if (typeof clientId !== "string" || !clientId || clientId.length > 200) return null;
  const row = await env.DB.prepare("SELECT * FROM oidc_dynamic_clients WHERE client_id = ?").bind(clientId).first();
  if (!row) return null;
  return { clientId: row.client_id, clientName: row.client_name, clientSecret: null, clientSecretHash: row.client_secret_hash, redirectUris: parseArray(row.redirect_uris), postLogoutRedirectUris: parseArray(row.post_logout_redirect_uris), tokenEndpointAuthMethod: row.token_endpoint_auth_method, jwks: row.jwks ? parseJson(row.jwks) : null, grantTypes: parseArray(row.grant_types), responseTypes: parseArray(row.response_types), scope: normalizeScopes(row.scope), requireSignedRequestObject: Boolean(row.require_signed_request_object), registrationAccessTokenHash: row.registration_access_token_hash, registrationAccessTokenExpiresAt: row.registration_access_token_expires_at, clientSecretExpiresAt: row.client_secret_expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function readProviderConfiguration(env) {
  const issuer = normalizeIssuer(env.OIDC_ISSUER);
  const rawClients = parseJsonSecret(env.OIDC_CLIENTS, "OIDC clients");
  if (!Array.isArray(rawClients) || rawClients.length === 0) throw new OidcError("server_error", "OIDC clients are not configured", 503);
  const clients = new Map();
  for (const raw of rawClients) {
    const clientId = typeof raw?.client_id === "string" ? raw.client_id.trim() : "";
    if (!clientId || clients.has(clientId)) throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    if (!Array.isArray(raw.redirect_uris) || raw.redirect_uris.length === 0) throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    const redirectUris = raw.redirect_uris.map(validateRedirectUri);
    const postLogoutRedirectUris = Array.isArray(raw.post_logout_redirect_uris) ? raw.post_logout_redirect_uris.map(validateRedirectUri) : [];
    const method = raw.token_endpoint_auth_method || (raw.client_secret ? "client_secret_basic" : "none");
    if (!["client_secret_basic", "client_secret_post", "none", "private_key_jwt"].includes(method)) throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    if (["client_secret_basic", "client_secret_post"].includes(method) && (typeof raw.client_secret !== "string" || raw.client_secret.length < 32)) throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    const jwks = raw.jwks && Array.isArray(raw.jwks.keys) ? raw.jwks : null;
    if (method === "private_key_jwt" && !jwks?.keys?.length) throw new OidcError("server_error", "OIDC client configuration is invalid", 503);
    clients.set(clientId, { clientId, clientName: typeof raw.client_name === "string" && raw.client_name.trim() ? raw.client_name.trim() : clientId, redirectUris, postLogoutRedirectUris, tokenEndpointAuthMethod: method, clientSecret: ["none", "private_key_jwt"].includes(method) ? null : raw.client_secret, jwks, grantTypes: Array.isArray(raw.grant_types) ? raw.grant_types : ["authorization_code", "refresh_token"], responseTypes: Array.isArray(raw.response_types) ? raw.response_types : ["code"], scope: normalizeScopes(typeof raw.scope === "string" ? raw.scope : "openid profile email offline_access"), requireSignedRequestObject: Boolean(raw.require_signed_request_object) });
  }
  const rawJwks = parseJsonSecret(env.OIDC_SIGNING_JWKS, "OIDC signing keys");
  if (!rawJwks || !Array.isArray(rawJwks.keys) || rawJwks.keys.length === 0) throw new OidcError("server_error", "OIDC signing keys are not configured", 503);
  const signingKeys = rawJwks.keys.map((key) => {
    if (key?.kty !== "RSA" || key.alg !== ID_TOKEN_SIGNING_ALGORITHM || typeof key.kid !== "string" || !key.kid || typeof key.d !== "string") throw new OidcError("server_error", "OIDC signing key configuration is invalid", 503);
    const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, oth: _oth, key_ops: _keyOps, ...publicJwk } = key;
    return { privateJwk: key, publicJwk: { ...publicJwk, use: "sig" } };
  });
  return { issuer, clients, signingKeys, scopes: new Set(["openid", "profile", "email", "offline_access"]), registrationEnabled: typeof env.OIDC_INITIAL_ACCESS_TOKEN === "string" && env.OIDC_INITIAL_ACCESS_TOKEN.length >= 32 };
}

async function optionalDpopProof(request, method, htu, expectedJkt, env) {
  const proof = request.headers.get("DPoP");
  if (!proof) {
    if (expectedJkt) throw new OidcError("invalid_token", "A DPoP proof is required", 401);
    return null;
  }
  let header;
  try { header = decodeProtectedHeader(proof); } catch { throw new OidcError("invalid_token", "DPoP proof is invalid", 401); }
  if (!REQUEST_OBJECT_ALGORITHMS.includes(header.alg) || !header.jwk || header.jwk.d || header.jwk.p || header.jwk.q) throw new OidcError("invalid_token", "DPoP proof is invalid", 401);
  let verified;
  try { verified = await compactVerify(proof, await importJWK(header.jwk, header.alg), { algorithms: [header.alg] }); } catch { throw new OidcError("invalid_token", "DPoP proof is invalid", 401); }
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(verified.payload)); } catch { throw new OidcError("invalid_token", "DPoP proof is invalid", 401); }
  const issuedAt = Number(payload.iat);
  if (payload.htm !== method || payload.htu !== htu || !payload.jti || payload.jti.length > 200 || !Number.isFinite(issuedAt) || Math.abs(now() - issuedAt) > DPOP_CLOCK_SKEW_SECONDS) throw new OidcError("invalid_token", "DPoP proof claims are invalid", 401);
  const jkt = await calculateJwkThumbprint(header.jwk, "sha256");
  if (expectedJkt && expectedJkt !== jkt) throw new OidcError("invalid_token", "DPoP key thumbprint does not match", 401);
  const replay = await env.DB.prepare("INSERT INTO oidc_dpop_proofs (jti_hash, jkt, expires_at) VALUES (?, ?, ?)").bind(await sha256Base64Url(payload.jti), jkt, issuedAt + DPOP_CLOCK_SKEW_SECONDS).run().catch(() => null);
  if (!replay || replay.meta?.changes !== 1) throw new OidcError("invalid_token", "DPoP proof has been replayed", 401);
  return jkt;
}

function tokenCredential(request) {
  const match = (request.headers.get("Authorization") || "").match(/^(Bearer|DPoP)\s+(.+)$/i);
  return match ? { scheme: match[1] === "DPoP" ? "DPoP" : "Bearer", token: match[2].trim() } : null;
}

function profileClaims(user, scope, nonce) {
  const scopes = new Set(String(scope).split(/\s+/));
  const claims = {};
  if (nonce) claims.nonce = nonce;
  if (scopes.has("profile")) { claims.name = user.username; claims.preferred_username = user.username; }
  if (scopes.has("email")) { claims.email = user.email; claims.email_verified = false; }
  return claims;
}

async function loadUser(env, id) { return env.DB.prepare("SELECT id, username, email FROM users WHERE id = ?").bind(id).first(); }

async function uniqueUserCode(env) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomToken().replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
    const row = await env.DB.prepare("SELECT user_code FROM oidc_device_authorizations WHERE user_code = ?").bind(candidate).first();
    if (!row) return candidate;
  }
  throw new OidcError("server_error", "Could not allocate a device code", 503);
}

function deviceForm(config, message) { return `<h1>Device authorization</h1>${message ? `<p>${htmlEscape(message)}</p>` : ""}<form method="get" action="${htmlEscape(`${config.issuer}/oauth/device`)}"><label>Code <input name="user_code" maxlength="8" required></label><button>Continue</button></form>`; }

function deviceApprovalForm(config, row, formNonce) {
  return `<h1>Approve device</h1><p>Code: ${htmlEscape(row.user_code)}</p><form method="post" action="${htmlEscape(`${config.issuer}/oauth/device`)}"><input type="hidden" name="user_code" value="${htmlEscape(row.user_code)}"><input type="hidden" name="approval_nonce" value="${htmlEscape(formNonce)}"><button name="decision" value="approve">Approve</button><button name="decision" value="deny">Deny</button></form>`;
}

function cibaForm(config, message) { return `<h1>CIBA verification</h1>${message ? `<p>${htmlEscape(message)}</p>` : ""}<p>Use the verification link supplied by the client.</p>`; }

function cibaApprovalForm(config, row, authReqId, formNonce) {
  return `<h1>Approve sign-in</h1>${row.binding_message ? `<p>${htmlEscape(row.binding_message)}</p>` : ""}<form method="post" action="${htmlEscape(`${config.issuer}/oauth/ciba`)}"><input type="hidden" name="auth_req_id" value="${htmlEscape(authReqId)}"><input type="hidden" name="approval_nonce" value="${htmlEscape(formNonce)}"><button name="decision" value="approve">Approve</button><button name="decision" value="deny">Deny</button></form>`;
}

function htmlResponse(body, status = 200) { return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${body}`, { status, headers: new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; form-action 'self'" }) }); }

function safeUserCode(value) { return typeof value === "string" && /^[A-Z0-9]{8}$/.test(value.toUpperCase()) ? value.toUpperCase() : ""; }

function normalizeIssuer(value) {
  if (typeof value !== "string" || !value.trim()) throw new OidcError("server_error", "OIDC issuer is not configured", 503);
  let url;
  try { url = new URL(value); } catch { throw new OidcError("server_error", "OIDC issuer is invalid", 503); }
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) throw new OidcError("server_error", "OIDC issuer is invalid", 503);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new OidcError("server_error", "OIDC issuer must not include a path", 503);
  return url.origin;
}

function validateRedirectUri(value) {
  if (typeof value !== "string") throw new OidcError("invalid_client_metadata", "Redirect URI is invalid", 400);
  let url;
  try { url = new URL(value); } catch { throw new OidcError("invalid_client_metadata", "Redirect URI is invalid", 400); }
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) throw new OidcError("invalid_client_metadata", "Redirect URI is invalid", 400);
  if (url.username || url.password || url.hash) throw new OidcError("invalid_client_metadata", "Redirect URI is invalid", 400);
  return url.toString();
}

function parseJsonSecret(value, label) {
  if (typeof value !== "string" || !value) throw new OidcError("server_error", `${label} are not configured`, 503);
  try { return JSON.parse(value); } catch { throw new OidcError("server_error", `${label} are invalid`, 503); }
}

function parseJson(value) { try { return JSON.parse(value); } catch { return null; } }

function parseArray(value) { const parsed = parseJson(value); return Array.isArray(parsed) ? parsed : []; }

async function readJsonBody(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) throw new OidcError("invalid_request", "JSON encoding is required");
  const text = await request.text();
  if (encoder.encode(text).byteLength > 64 * 1024) throw new OidcError("invalid_request", "Request body is too large", 413);
  try { const value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; } catch { throw new OidcError("invalid_request", "JSON body is invalid"); }
}

async function readForm(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) throw new OidcError("invalid_request", "Form encoding is required");
  const data = await request.formData();
  const form = new URLSearchParams();
  let size = 0;
  for (const [name, value] of data) {
    if (typeof value !== "string") throw new OidcError("invalid_request", "File fields are not allowed");
    size += name.length + value.length;
    if (size > 32_768) throw new OidcError("invalid_request", "Request body is too large", 413);
    form.append(name, value);
  }
  return form;
}

function requiredFormValue(form, name, maxLength) {
  const values = form.getAll(name);
  const value = values[0];
  if (values.length !== 1 || typeof value !== "string" || !value || value.length > maxLength) throw new OidcError("invalid_request", `Invalid ${name}`);
  return value;
}

function requiredParameter(params, name, maxLength) {
  const value = singleOptionalParameter(params, name, maxLength);
  if (!value) throw new OidcError("invalid_request", `Invalid ${name}`);
  return value;
}

function requiredAuthorizationParameter(params, name, maxLength) { return requiredParameter(params, name, maxLength); }

function optionalParameter(params, name, maxLength) { return singleOptionalParameter(params, name, maxLength) || null; }

function singleOptionalParameter(params, name, maxLength) {
  const values = params.getAll(name);
  if (values.length > 1 || (values[0] && values[0].length > maxLength)) throw new OidcError("invalid_request", `Invalid ${name}`);
  return values[0] || "";
}

function normalizeScopes(value) { return [...new Set(String(value || "").split(/\s+/).filter(Boolean))]; }

function validateScopes(scopes, allowed) {
  if (!scopes.includes("openid")) throw new OidcError("invalid_scope", "The openid scope is required");
  if (scopes.some((scope) => !allowed.has(scope))) throw new OidcError("invalid_scope", "Unsupported scope");
}

function validateClientScopes(scopes, allowed) {
  if (scopes.some((scope) => !allowed.includes(scope))) throw new OidcError("invalid_scope", "The client is not allowed to request this scope");
}

function safeParameter(value, maxLength) { return typeof value === "string" && value && value.length <= maxLength ? value : null; }

function bearerToken(request) { return request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ""; }

function decodeClientId(value) {
  try { const decoded = decodeURIComponent(value); if (!decoded || decoded.length > 200 || /[\u0000-\u001f/]/.test(decoded)) throw new Error(); return decoded; } catch { throw new OidcError("invalid_request", "Client id is invalid"); }
}

async function halfHash(value) { const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))); return base64UrlEncode(digest.slice(0, digest.length / 2)); }

async function sha256Base64Url(value) { return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }

async function timingSafeTextEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const [leftDigest, rightDigest] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(left)), crypto.subtle.digest("SHA-256", encoder.encode(right))]);
  return crypto.subtle.timingSafeEqual(leftDigest, rightDigest);
}

function randomToken() { return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32))); }

function base64UrlEncode(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

function removeUndefined(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }

function htmlEscape(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

function oidcJson(value, status = 200, extraHeaders) {
  const headers = noStoreHeaders();
  if (extraHeaders) for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function noStoreHeaders() { return new Headers({ "Cache-Control": "no-store", Pragma: "no-cache" }); }

function oauthErrorResponse(error) {
  const headers = noStoreHeaders();
  if (error.code === "invalid_client" || error.code === "invalid_token") headers.set("WWW-Authenticate", error.code === "invalid_client" ? 'Basic realm="token"' : 'Bearer error="invalid_token"');
  return oidcJson({ error: error.code, error_description: error.message }, error.status, headers);
}

function now() { return Math.floor(Date.now() / 1000); }

function clearAuthCookie(url) { return `authToken=; Max-Age=0; Path=/; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`; }

async function cleanupExpiredState(db, nowValue) {
  await db.batch([
    db.prepare("DELETE FROM oidc_authorization_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(nowValue),
    db.prepare("DELETE FROM oidc_access_tokens WHERE expires_at <= ? OR revoked_at IS NOT NULL").bind(nowValue),
    db.prepare("DELETE FROM oidc_refresh_tokens WHERE expires_at <= ? OR revoked_at IS NOT NULL").bind(nowValue),
    db.prepare("DELETE FROM oidc_par_requests WHERE expires_at <= ? OR used_at IS NOT NULL").bind(nowValue),
    db.prepare("DELETE FROM oidc_device_authorizations WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(nowValue),
    db.prepare("DELETE FROM oidc_ciba_requests WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(nowValue),
    db.prepare("DELETE FROM oidc_dpop_proofs WHERE expires_at <= ?").bind(nowValue),
    db.prepare("DELETE FROM oidc_client_assertions WHERE expires_at <= ?").bind(nowValue),
    db.prepare("DELETE FROM saml_pending_requests WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(nowValue),
  ]);
}
