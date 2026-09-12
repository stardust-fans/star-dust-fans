import { importJWK } from "jose";

const encoder = new TextEncoder();
const SAML_PROTOCOL = "urn:oasis:names:tc:SAML:2.0:protocol";
const SAML_ASSERTION = "urn:oasis:names:tc:SAML:2.0:assertion";
const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const XML_EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const REDIRECT_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const POST_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";
const SAML_PATHS = new Set(["/saml/metadata", "/saml/sso", "/saml/slo"]);
const REQUEST_TTL_SECONDS = 300;

class SamlError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SamlError";
    this.status = status;
  }
}

export async function handleSamlRequest(request, env, ctx, authenticateUser) {
  const url = new URL(request.url);
  if (!SAML_PATHS.has(url.pathname)) return null;
  try {
    const config = readSamlConfiguration(env);
    if (url.pathname === "/saml/metadata") return metadataResponse(config);
    if (url.pathname === "/saml/sso") return await singleSignOn(request, env, ctx, config, authenticateUser);
    return await singleLogout(request, config);
  } catch (error) {
    if (error instanceof SamlError) return samlError(error);
    return samlError(new SamlError("SAML identity service is not available", 503));
  }
}

function readSamlConfiguration(env) {
  const entityId = typeof env.SAML_ENTITY_ID === "string" && env.SAML_ENTITY_ID.trim()
    ? env.SAML_ENTITY_ID.trim()
    : `${normalizeIssuer(env.OIDC_ISSUER)}/saml`;
  const baseUrl = normalizeIssuer(env.SAML_BASE_URL || env.OIDC_ISSUER);
  const signingJwk = parseJson(env.SAML_SIGNING_JWK, "SAML signing key");
  if (signingJwk.kty !== "RSA" || signingJwk.alg !== "RS256" || typeof signingJwk.d !== "string" || typeof signingJwk.kid !== "string") {
    throw new SamlError("SAML signing key is invalid", 503);
  }
  const certificate = normalizeCertificate(env.SAML_SIGNING_CERT);
  if (!certificate) throw new SamlError("SAML signing certificate is not configured", 503);
  const rawProviders = parseJson(env.SAML_SERVICE_PROVIDERS, "SAML service providers");
  if (!Array.isArray(rawProviders) || rawProviders.length === 0) throw new SamlError("SAML service providers are not configured", 503);
  const providers = new Map();
  for (const raw of rawProviders) {
    const providerEntityId = typeof raw?.entity_id === "string" ? raw.entity_id.trim() : "";
    const acsUrls = Array.isArray(raw?.acs_urls) ? raw.acs_urls.map(validateHttpsUrl) : [];
    const sloUrls = Array.isArray(raw?.slo_urls) ? raw.slo_urls.map(validateHttpsUrl) : acsUrls;
    if (!providerEntityId || !acsUrls.length || providers.has(providerEntityId)) throw new SamlError("SAML service provider configuration is invalid", 503);
    const signingJwks = raw.signing_jwks && Array.isArray(raw.signing_jwks.keys) ? raw.signing_jwks.keys : [];
    if (raw.want_authn_requests_signed !== false && signingJwks.length === 0) {
      throw new SamlError("Signed SAML requests require a service-provider signing JWK", 503);
    }
    providers.set(providerEntityId, {
      entityId: providerEntityId,
      acsUrls,
      sloUrls,
      signingJwks,
      wantAuthnRequestsSigned: raw.want_authn_requests_signed !== false,
      nameIdFormat: typeof raw.name_id_format === "string" && raw.name_id_format.trim()
        ? raw.name_id_format.trim()
        : "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
    });
  }
  return { entityId, baseUrl, signingJwk, certificate, providers, allowUnsignedRequests: env.SAML_ALLOW_UNSIGNED_REQUESTS === "true" };
}

function metadataResponse(config) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="${XMLDSIG}" entityID="${xmlEscape(config.entityId)}">` +
    `<md:IDPSSODescriptor protocolSupportEnumeration="${SAML_PROTOCOL}">` +
    `<md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${config.certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>` +
    `<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>` +
    `<md:SingleSignOnService Binding="${REDIRECT_BINDING}" Location="${xmlEscape(`${config.baseUrl}/saml/sso`)}"/>` +
    `<md:SingleSignOnService Binding="${POST_BINDING}" Location="${xmlEscape(`${config.baseUrl}/saml/sso`)}"/>` +
    `<md:SingleLogoutService Binding="${REDIRECT_BINDING}" Location="${xmlEscape(`${config.baseUrl}/saml/slo`)}"/>` +
    `<md:SingleLogoutService Binding="${POST_BINDING}" Location="${xmlEscape(`${config.baseUrl}/saml/slo`)}"/>` +
    `</md:IDPSSODescriptor></md:EntityDescriptor>`;
  return new Response(xml, { status: 200, headers: new Headers({ "Content-Type": "application/samlmetadata+xml; charset=UTF-8", "Cache-Control": "public, max-age=300" }) });
}

async function singleSignOn(request, env, ctx, config, authenticateUser) {
  const parsed = await readSamlRequest(request, env, config);
  const provider = config.providers.get(parsed.entityId);
  if (!provider) throw new SamlError("Unknown SAML service provider");
  if (!provider.acsUrls.includes(parsed.acsUrl)) throw new SamlError("Unregistered assertion consumer service");
  if (parsed.destination && parsed.destination !== parsed.endpoint) throw new SamlError("SAML request destination is invalid");

  const session = await authenticateUser();
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = new URL(request.url);
    if (parsed.pendingReference) {
      returnTo.search = `?request_ref=${encodeURIComponent(parsed.pendingReference)}`;
      returnTo.hash = "";
    }
    loginUrl.searchParams.set("return_to", `${returnTo.pathname}${returnTo.search}`);
    return Response.redirect(loginUrl.toString(), 302);
  }
  const user = await env.DB.prepare("SELECT id, username, email FROM users WHERE id = ?").bind(session.sub).first();
  if (!user) throw new SamlError("User account is unavailable", 403);
  const responseXml = await createSamlResponse(config, provider, parsed, user);
  return await samlResponseToAcs(parsed, responseXml);
}

async function readSamlRequest(request, env, config) {
  const url = new URL(request.url);
  let xml;
  let relayState = "";
  let binding = REDIRECT_BINDING;
  let signed = false;
  let signedInput = null;
  let signature = null;
  let sigAlg = null;
  let requestRef = url.searchParams.get("request_ref") || "";

  if (requestRef) {
    if (!/^[A-Za-z0-9_-]{32,96}$/.test(requestRef)) throw new SamlError("SAML request reference is invalid");
    const row = await env.DB.prepare("SELECT request_xml, relay_state FROM saml_pending_requests WHERE request_hash = ? AND consumed_at IS NULL AND expires_at > ?").bind(await sha256Base64Url(requestRef), now()).first();
    if (!row) throw new SamlError("SAML request has expired");
    xml = row.request_xml;
    relayState = row.relay_state || "";
    binding = POST_BINDING;
    const consumed = await env.DB.prepare("UPDATE saml_pending_requests SET consumed_at = ? WHERE request_hash = ? AND consumed_at IS NULL AND expires_at > ?").bind(now(), await sha256Base64Url(requestRef), now()).run();
    if (consumed.meta?.changes !== 1) throw new SamlError("SAML request has already been consumed");
  } else if (request.method === "GET") {
    const rawSamlRequest = rawQueryParam(url, "SAMLRequest");
    if (!rawSamlRequest) throw new SamlError("SAMLRequest is required");
    relayState = url.searchParams.get("RelayState") || "";
    sigAlg = url.searchParams.get("SigAlg") || "";
    signature = url.searchParams.get("Signature") || "";
    if (signature) {
      signedInput = `SAMLRequest=${rawSamlRequest}${rawQueryParam(url, "RelayState") !== null ? `&RelayState=${rawQueryParam(url, "RelayState")}` : ""}&SigAlg=${rawQueryParam(url, "SigAlg")}`;
      signed = true;
    }
    xml = await decodeSamlRequest(decodeQueryValue(rawSamlRequest), true);
  } else if (request.method === "POST") {
    const form = await readForm(request);
    const rawSamlRequest = form.get("SAMLRequest");
    if (!rawSamlRequest) throw new SamlError("SAMLRequest is required");
    relayState = form.get("RelayState") || "";
    xml = await decodeSamlRequest(rawSamlRequest, false);
    binding = POST_BINDING;
  } else {
    throw new SamlError("SAML endpoint requires GET or POST", 405);
  }

  const parsed = parseAuthnRequest(xml, binding, `${config.baseUrl}/saml/sso`, relayState);
  const provider = config.providers.get(parsed.entityId);
  if (!provider) throw new SamlError("Unknown SAML service provider");
  if (provider.wantAuthnRequestsSigned && !signed && !config.allowUnsignedRequests) {
    throw new SamlError("A signed SAML AuthnRequest is required");
  }
  if (signed) {
    await verifyRedirectSignature(provider, signedInput, signature, sigAlg);
  }
  if (request.method === "POST" && provider.wantAuthnRequestsSigned && !config.allowUnsignedRequests) {
    throw new SamlError("HTTP-POST AuthnRequest signatures require a registered redirect binding");
  }
  if (request.method === "POST" && !requestRef) {
    const reference = randomToken();
    await env.DB.prepare("INSERT INTO saml_pending_requests (request_hash, request_xml, relay_state, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256Base64Url(reference), xml, relayState || null, now() + REQUEST_TTL_SECONDS).run();
    parsed.pendingReference = reference;
  }
  return parsed;
}

function parseAuthnRequest(xml, binding, endpoint, relayState) {
  if (xml.length > 100_000 || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml)) throw new SamlError("SAML request contains unsupported XML");
  const root = xml.match(/<(?:[A-Za-z_][\w.-]*:)?AuthnRequest\b([^>]*)>/i)?.[1] || "";
  const id = xmlAttribute(root, "ID");
  const version = xmlAttribute(root, "Version");
  const issueInstant = xmlAttribute(root, "IssueInstant");
  const destination = xmlAttribute(root, "Destination");
  const acsUrl = xmlAttribute(root, "AssertionConsumerServiceURL");
  const protocolBinding = xmlAttribute(root, "ProtocolBinding") || binding;
  const entityId = xmlText(xml.match(/<(?:[A-Za-z_][\w.-]*:)?Issuer\b[^>]*>([^<]+)<\/(?:[A-Za-z_][\w.-]*:)?Issuer>/i)?.[1] || "");
  if (!/^_[A-Za-z0-9.-]{8,200}$/.test(id) || version !== "2.0" || !entityId || !acsUrl) throw new SamlError("SAML AuthnRequest is invalid");
  const issuedAt = Date.parse(issueInstant || "");
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000) throw new SamlError("SAML AuthnRequest is outside the allowed time window");
  if (![REDIRECT_BINDING, POST_BINDING].includes(protocolBinding)) throw new SamlError("Unsupported SAML response binding");
  return { id, entityId, acsUrl, destination, protocolBinding, relayState, endpoint, requestIssueInstant: issueInstant };
}

async function createSamlResponse(config, provider, request, user) {
  const issuedAt = new Date().toISOString();
  const notBefore = new Date(Date.now() - 30_000).toISOString();
  const notOnOrAfter = new Date(Date.now() + 5 * 60_000).toISOString();
  const responseId = `_${randomToken()}`;
  const assertionId = `_${randomToken()}`;
  const sessionIndex = `_${randomToken()}`;
  const nameId = user.email || user.username;
  const assertionCore = `<saml:Assertion xmlns:saml="${SAML_ASSERTION}" ID="${assertionId}" Version="2.0" IssueInstant="${issuedAt}">` +
    `<saml:Issuer>${xmlEscape(config.entityId)}</saml:Issuer>` +
    `<saml:Subject><saml:NameID Format="${xmlEscape(provider.nameIdFormat)}">${xmlEscape(nameId)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${xmlEscape(request.id)}" Recipient="${xmlEscape(request.acsUrl)}" NotOnOrAfter="${notOnOrAfter}"/></saml:SubjectConfirmation></saml:Subject>` +
    `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${xmlEscape(provider.entityId)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${issuedAt}" SessionIndex="${sessionIndex}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
    `<saml:AttributeStatement><saml:Attribute Name="username"><saml:AttributeValue xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">${xmlEscape(user.username)}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="email"><saml:AttributeValue xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">${xmlEscape(user.email || "")}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>` +
    `</saml:Assertion>`;
  const signedAssertion = await signAssertion(assertionCore, assertionId, config);
  const responseCore = `<samlp:Response xmlns:samlp="${SAML_PROTOCOL}" xmlns:saml="${SAML_ASSERTION}" ID="${responseId}" Version="2.0" IssueInstant="${issuedAt}" Destination="${xmlEscape(request.acsUrl)}" InResponseTo="${xmlEscape(request.id)}">` +
    `<saml:Issuer>${xmlEscape(config.entityId)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${signedAssertion}</samlp:Response>`;
  return responseCore;
}

async function signAssertion(assertionCore, assertionId, config) {
  const digestValue = await sha256Base64(assertionCore);
  const signedInfo = `<ds:SignedInfo xmlns:ds="${XMLDSIG}"><ds:CanonicalizationMethod Algorithm="${XML_EXC_C14N}"/><ds:SignatureMethod Algorithm="${RSA_SHA256}"/><ds:Reference URI="#${assertionId}"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><ds:Transform Algorithm="${XML_EXC_C14N}"/></ds:Transforms><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${digestValue}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
  const privateKey = await importJWK(config.signingJwk, "RS256");
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(signedInfo));
  const signatureXml = `<ds:Signature xmlns:ds="${XMLDSIG}">${signedInfo}<ds:SignatureValue>${base64(new Uint8Array(signature))}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${config.certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature>`;
  return assertionCore.replace(/(<saml:Issuer>[^<]*<\/saml:Issuer>)/, `$1${signatureXml}`);
}

async function samlResponseToAcs(request, responseXml) {
  const encoded = request.protocolBinding === REDIRECT_BINDING
    ? await deflateBase64(responseXml)
    : base64(encoder.encode(responseXml));
  if (request.protocolBinding === REDIRECT_BINDING) {
    const target = new URL(request.acsUrl);
    target.searchParams.set("SAMLResponse", encoded);
    if (request.relayState) target.searchParams.set("RelayState", request.relayState);
    return Response.redirect(target.toString(), 302);
  }
  const relay = request.relayState ? `<input type="hidden" name="RelayState" value="${htmlEscape(request.relayState)}">` : "";
  const acsOrigin = new URL(request.acsUrl).origin;
  return new Response(`<!doctype html><meta charset="utf-8"><form id="saml-post" method="post" action="${htmlEscape(request.acsUrl)}"><input type="hidden" name="SAMLResponse" value="${htmlEscape(encoded)}">${relay}</form><script>document.getElementById('saml-post').submit()</script>`, {
    status: 200,
    headers: new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store", "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; form-action ${acsOrigin}` }),
  });
}

async function singleLogout(request, config) {
  const url = new URL(request.url);
  const headers = new Headers({ "Cache-Control": "no-store", "Set-Cookie": clearAuthCookie(url) });
  if (!['GET', 'POST'].includes(request.method)) throw new SamlError("SAML logout requires GET or POST", 405);
  let rawRequest = "";
  let relayState = "";
  let xml = "";
  let binding = request.method === "GET" ? REDIRECT_BINDING : POST_BINDING;
  let signedInput = null;
  let signature = "";
  let sigAlg = "";
  if (request.method === "GET") {
    rawRequest = rawQueryParam(url, "SAMLRequest") || "";
    relayState = url.searchParams.get("RelayState") || "";
    signature = url.searchParams.get("Signature") || "";
    sigAlg = url.searchParams.get("SigAlg") || "";
    if (signature) {
      const rawRelayState = rawQueryParam(url, "RelayState");
      signedInput = `SAMLRequest=${rawRequest}${rawRelayState !== null ? `&RelayState=${rawRelayState}` : ""}&SigAlg=${rawQueryParam(url, "SigAlg")}`;
    }
    if (!rawRequest) return new Response("Signed out", { status: 200, headers });
    xml = await decodeSamlRequest(decodeQueryValue(rawRequest), true);
  } else {
    const form = await readForm(request);
    rawRequest = form.get("SAMLRequest") || "";
    relayState = form.get("RelayState") || "";
    if (!rawRequest) throw new SamlError("SAMLRequest is required");
    xml = await decodeSamlRequest(rawRequest, false);
  }
  const root = xml.match(/<(?:[A-Za-z_][\w.-]*:)?LogoutRequest\b([^>]*)>/i)?.[1] || "";
  const id = xmlAttribute(root, "ID");
  const version = xmlAttribute(root, "Version");
  const issueInstant = xmlAttribute(root, "IssueInstant");
  const destination = xmlAttribute(root, "Destination");
  const entityId = xmlText(xml.match(/<(?:[A-Za-z_][\w.-]*:)?Issuer\b[^>]*>([^<]+)<\/(?:[A-Za-z_][\w.-]*:)?Issuer>/i)?.[1] || "");
  const issuedAt = Date.parse(issueInstant || "");
  if (xml.length > 100_000 || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml) || !/^_[A-Za-z0-9.-]{8,200}$/.test(id) || version !== "2.0" || !entityId || !Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000) throw new SamlError("SAML LogoutRequest is invalid");
  const provider = config.providers.get(entityId);
  if (!provider || !/^_[A-Za-z0-9.-]{8,200}$/.test(id)) throw new SamlError("SAML LogoutRequest is invalid");
  const endpoint = `${config.baseUrl}/saml/slo`;
  if (destination && destination !== endpoint) throw new SamlError("SAML logout destination is invalid");
  if (provider.wantAuthnRequestsSigned && !signature && !config.allowUnsignedRequests) throw new SamlError("A signed SAML LogoutRequest is required");
  if (signature) {
    if (binding !== REDIRECT_BINDING) throw new SamlError("HTTP-POST SAML LogoutRequest signatures are not supported");
    await verifyRedirectSignature(provider, signedInput, signature, sigAlg);
  }
  const responseId = `_${randomToken()}`;
  const responseCore = `<?xml version="1.0" encoding="UTF-8"?><samlp:LogoutResponse xmlns:samlp="${SAML_PROTOCOL}" xmlns:saml="${SAML_ASSERTION}" ID="${responseId}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${xmlEscape(provider.sloUrls[0])}" InResponseTo="${xmlEscape(id)}"><saml:Issuer>${xmlEscape(config.entityId)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status></samlp:LogoutResponse>`;
  const responseXml = await signAssertion(responseCore, responseId, config);
  if (binding === POST_BINDING) {
    const target = provider.sloUrls[0];
    const formAction = htmlEscape(target);
    const form = `<!doctype html><meta charset="utf-8"><form id="saml-slo" method="post" action="${formAction}"><input type="hidden" name="SAMLResponse" value="${htmlEscape(base64(encoder.encode(responseXml)))}">${relayState ? `<input type="hidden" name="RelayState" value="${htmlEscape(relayState)}">` : ""}</form><script>document.getElementById('saml-slo').submit()</script>`;
    headers.set("Content-Type", "text/html; charset=UTF-8");
    headers.set("Content-Security-Policy", `default-src 'none'; script-src 'unsafe-inline'; form-action ${new URL(target).origin}`);
    return new Response(form, { status: 200, headers });
  }
  const target = new URL(provider.sloUrls[0]);
  target.searchParams.set("SAMLResponse", await deflateBase64(responseXml));
  if (relayState) target.searchParams.set("RelayState", relayState);
  headers.set("Location", target.toString());
  return new Response(null, { status: 302, headers });
}

async function verifyRedirectSignature(provider, signedInput, signature, sigAlg) {
  if (sigAlg !== RSA_SHA256 || !signature || !signedInput) throw new SamlError("Unsupported SAML request signature");
  const signatureBytes = decodeBase64(signature);
  for (const jwk of provider.signingJwks) {
    try {
      const key = await importJWK(jwk, "RS256");
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signatureBytes, encoder.encode(signedInput))) return;
    } catch {
      continue;
    }
  }
  throw new SamlError("SAML request signature is invalid");
}

async function decodeSamlRequest(value, deflated) {
  const bytes = decodeBase64(value);
  if (!deflated) return new TextDecoder().decode(bytes);
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function deflateBase64(value) {
  const stream = new Blob([encoder.encode(value)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return base64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function readForm(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) throw new SamlError("SAML form encoding is required", 415);
  const formData = await request.formData();
  const form = new Map();
  for (const [key, value] of formData) {
    if (typeof value !== "string" || value.length > 200_000 || form.has(key)) throw new SamlError("SAML form is invalid");
    form.set(key, value);
  }
  return form;
}

function parseJson(value, label) {
  if (typeof value !== "string" || !value) throw new SamlError(`${label} is not configured`, 503);
  try {
    return JSON.parse(value);
  } catch {
    throw new SamlError(`${label} is invalid`, 503);
  }
}

function normalizeIssuer(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error();
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    return url.origin;
  } catch {
    throw new SamlError("OIDC issuer is invalid", 503);
  }
}

function validateHttpsUrl(value) {
  if (typeof value !== "string") throw new SamlError("SAML URL is invalid", 503);
  try {
    const url = new URL(value);
    const localhost = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) throw new Error();
    if (url.username || url.password || url.hash) throw new Error();
    return url.toString();
  } catch {
    throw new SamlError("SAML URL is invalid", 503);
  }
}

function normalizeCertificate(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const certificate = value.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
  return /^[A-Za-z0-9+/=]{128,8192}$/.test(certificate) ? certificate : "";
}

function xmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? xmlText(match[2]) : "";
}

function xmlText(value) {
  return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function htmlEscape(value) {
  return xmlEscape(value);
}

function rawQueryParam(url, name) {
  for (const part of url.search.slice(1).split("&")) {
    const separator = part.indexOf("=");
    const rawName = separator < 0 ? part : part.slice(0, separator);
    if (decodeURIComponent(rawName.replace(/\+/g, " ")) === name) return separator < 0 ? "" : part.slice(separator + 1);
  }
  return null;
}

function decodeQueryValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new SamlError("SAML query encoding is invalid");
  }
}

function clearAuthCookie(url) {
  return `authToken=; Max-Age=0; Path=/; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`;
}

function samlError(error) {
  return new Response(`<html><body><h1>SAML request failed</h1><p>${htmlEscape(error.message)}</p></body></html>`, {
    status: error.status,
    headers: new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" }),
  });
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

async function sha256Base64Url(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function sha256Base64(value) {
  return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function decodeBase64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/=]+$/.test(value)) throw new SamlError("SAML base64 value is invalid");
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw new SamlError("SAML base64 value is invalid");
  }
}

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(bytes) {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
