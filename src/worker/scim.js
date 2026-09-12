const encoder = new TextEncoder();
const SCIM_PATH_PREFIX = "/scim/v2/";
const SCIM_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0";
const SCIM_USER_SCHEMA = `${SCIM_SCHEMA}:User`;
const SCIM_GROUP_SCHEMA = `${SCIM_SCHEMA}:Group`;
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const MAX_BODY_BYTES = 128 * 1024;

class ScimError extends Error {
  constructor(status, detail, scimType = null) {
    super(detail);
    this.name = "ScimError";
    this.status = status;
    this.scimType = scimType;
  }
}

export async function handleScimRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(SCIM_PATH_PREFIX)) return null;

  try {
    await authenticateScimRequest(request, env);
    const resourcePath = url.pathname.slice(SCIM_PATH_PREFIX.length).replace(/\/+$/, "");
    if (resourcePath === "ServiceProviderConfig") return serviceProviderConfig();
    if (resourcePath === "ResourceTypes") return resourceTypes();
    if (resourcePath === "Schemas") return schemas();
    if (resourcePath === "Me") throw new ScimError(404, "The Me resource is not available");

    const userMatch = resourcePath.match(/^Users(?:\/([^/]+))?$/);
    if (userMatch) return await handleUser(request, env, url, userMatch[1] ? decodePathPart(userMatch[1]) : null);
    const groupMatch = resourcePath.match(/^Groups(?:\/([^/]+))?$/);
    if (groupMatch) return await handleGroup(request, env, url, groupMatch[1] ? decodePathPart(groupMatch[1]) : null);
    throw new ScimError(404, "SCIM resource was not found");
  } catch (error) {
    if (error instanceof ScimError) return scimError(error);
    return scimError(new ScimError(500, "SCIM service is not available"));
  }
}

async function handleUser(request, env, url, id) {
  if (id) {
    if (request.method === "GET") return getUser(request, env, url, id);
    if (request.method === "PUT") return putUser(request, env, url, id);
    if (request.method === "PATCH") return patchUser(request, env, url, id);
    if (request.method === "DELETE") return deleteUser(request, env, url, id);
    throw new ScimError(405, "Method is not supported for a SCIM user");
  }
  if (request.method === "GET") return listUsers(request, env, url);
  if (request.method === "POST") return createUser(request, env, url);
  throw new ScimError(405, "Method is not supported for SCIM users");
}

async function handleGroup(request, env, url, id) {
  if (id) {
    if (request.method === "GET") return getGroup(request, env, url, id);
    if (request.method === "PUT") return putGroup(request, env, url, id);
    if (request.method === "PATCH") return patchGroup(request, env, url, id);
    if (request.method === "DELETE") return deleteGroup(request, env, url, id);
    throw new ScimError(405, "Method is not supported for a SCIM group");
  }
  if (request.method === "GET") return listGroups(request, env, url);
  if (request.method === "POST") return createGroup(request, env, url);
  throw new ScimError(405, "Method is not supported for SCIM groups");
}

async function authenticateScimRequest(request, env) {
  if (typeof env.SCIM_BEARER_TOKEN !== "string" || env.SCIM_BEARER_TOKEN.length < 32) {
    throw new ScimError(503, "SCIM bearer authorization is not configured");
  }
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match || !(await timingSafeEqual(match[1].trim(), env.SCIM_BEARER_TOKEN))) {
    const error = new ScimError(401, "A valid SCIM bearer token is required");
    error.wwwAuthenticate = "Bearer realm=\"scim\"";
    throw error;
  }
}

function serviceProviderConfig() {
  return scimJson({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://www.simplecloud.info/",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: true },
    etag: { supported: true },
    authenticationSchemes: [{
      type: "oauthbearertoken",
      name: "SCIM bearer token",
      description: "Bearer token provisioned for the SCIM connector",
      specUri: "https://www.rfc-editor.org/rfc/rfc6750",
      primary: true,
    }],
  });
}

function resourceTypes() {
  return scimJson({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      { id: "User", name: "User", endpoint: "/Users", schema: SCIM_USER_SCHEMA, meta: { resourceType: "ResourceType" } },
      { id: "Group", name: "Group", endpoint: "/Groups", schema: SCIM_GROUP_SCHEMA, meta: { resourceType: "ResourceType" } },
    ],
  });
}

function schemas() {
  return scimJson({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        id: SCIM_USER_SCHEMA,
        name: "User",
        description: "User account provisioned by the identity service",
        attributes: [
          { name: "userName", type: "string", multiValued: false, required: true, caseExact: false, mutability: "readWrite", returned: "default", uniqueness: "server" },
          { name: "active", type: "boolean", multiValued: false, required: false, caseExact: false, mutability: "readWrite", returned: "default" },
          { name: "emails", type: "complex", multiValued: true, required: false, mutability: "readWrite", returned: "default" },
        ],
      },
      {
        id: SCIM_GROUP_SCHEMA,
        name: "Group",
        description: "Group resource used for access provisioning",
        attributes: [
          { name: "displayName", type: "string", multiValued: false, required: true, caseExact: false, mutability: "readWrite", returned: "default" },
          { name: "members", type: "complex", multiValued: true, required: false, mutability: "readWrite", returned: "default" },
        ],
      },
    ],
  });
}

async function listUsers(request, env, url) {
  const { startIndex, count } = pageParameters(url);
  const filter = parseFilter(url.searchParams.get("filter"));
  const sortDescending = url.searchParams.get("sortOrder")?.toLowerCase() === "descending";
  const sortBy = url.searchParams.get("sortBy") === "email.value" ? "email" : "username";
  const rows = await env.DB.prepare(`
    SELECT u.id, u.username, u.email, u.created_at, u.updated_at,
           COALESCE(s.external_id, '') AS external_id,
           COALESCE(s.active, 1) AS active, COALESCE(s.version, 1) AS version,
           COALESCE(s.updated_at, strftime('%s', u.updated_at)) AS scim_updated_at
    FROM users u
    LEFT JOIN scim_user_state s ON s.user_id = u.id
    ORDER BY ${sortBy === "email" ? "u.email" : "u.username"} ${sortDescending ? "DESC" : "ASC"}, u.id ASC
  `).all();
  const filtered = (rows.results || []).filter((row) => matchesFilter(row, filter));
  const page = filtered.slice(startIndex - 1, startIndex - 1 + count);
  return listResponse(page.map((row) => userResource(row, url, url.searchParams)), filtered.length, startIndex);
}

async function getUser(request, env, url, id) {
  const row = await loadUser(env, id);
  if (!row) throw new ScimError(404, "SCIM user was not found");
  const etag = etagFor(row.version);
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: scimHeaders(etag) });
  return scimJson(userResource(row, url, url.searchParams), 200, etag);
}

async function createUser(request, env, url) {
  const body = await readJson(request);
  const username = boundedString(body.userName, 256, "userName");
  const email = firstEmail(body) || `scim-${randomToken()}@invalid.local`;
  const now = Math.floor(Date.now() / 1000);
  const placeholderPassword = `scim-managed$${randomToken()}`;
  let result;
  try {
    result = await env.DB.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    ).bind(username, email, placeholderPassword).run();
  } catch {
    throw new ScimError(409, "A user with the same userName or email already exists", "uniqueness");
  }
  const userId = result.meta?.last_row_id;
  await env.DB.prepare(
    "INSERT INTO scim_user_state (user_id, external_id, active, version, updated_at) VALUES (?, ?, 1, 1, ?)",
  ).bind(userId, optionalString(body.externalId, 256), now).run();
  const row = await loadUser(env, String(userId));
  return scimJson(userResource(row, url, url.searchParams), 201, etagFor(row.version), {
    Location: new URL(`/scim/v2/Users/${encodeURIComponent(String(userId))}`, url).toString(),
  });
}

async function putUser(request, env, url, id) {
  const body = await readJson(request);
  const current = await loadUser(env, id);
  if (!current) throw new ScimError(404, "SCIM user was not found");
  enforceIfMatch(request, current.version);
  const username = boundedString(body.userName, 256, "userName");
  const email = firstEmail(body) || current.email;
  const active = body.active === undefined ? current.active : Boolean(body.active);
  const externalId = body.externalId === undefined ? current.external_id : optionalString(body.externalId, 256);
  const next = await updateUser(env, current, { username, email, active, externalId });
  return scimJson(userResource(next, url, url.searchParams), 200, etagFor(next.version));
}

async function patchUser(request, env, url, id) {
  const body = await readJson(request);
  const current = await loadUser(env, id);
  if (!current) throw new ScimError(404, "SCIM user was not found");
  enforceIfMatch(request, current.version);
  if (!Array.isArray(body.Operations) || body.Operations.length > 32) throw new ScimError(400, "Operations must be an array");
  const nextInput = { username: current.username, email: current.email, active: current.active, externalId: current.external_id };
  for (const operation of body.Operations) applyUserOperation(nextInput, operation);
  const next = await updateUser(env, current, nextInput);
  return scimJson(userResource(next, url, url.searchParams), 200, etagFor(next.version));
}

async function deleteUser(request, env, url, id) {
  const current = await loadUser(env, id);
  if (!current) throw new ScimError(404, "SCIM user was not found");
  enforceIfMatch(request, current.version);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT OR IGNORE INTO scim_user_state (user_id, external_id, active, version, updated_at) VALUES (?, ?, 1, 1, ?)").bind(current.id, current.external_id || null, now).run();
  const result = await env.DB.prepare(
    "UPDATE scim_user_state SET active = 0, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?",
  ).bind(now, current.id, current.version).run();
  if (result.meta?.changes !== 1) throw new ScimError(412, "The SCIM user changed while this request was in progress");
  return new Response(null, { status: 204, headers: scimHeaders(etagFor(current.version + 1)) });
}

async function listGroups(request, env, url) {
  const { startIndex, count } = pageParameters(url);
  const filter = parseFilter(url.searchParams.get("filter"));
  const rows = await env.DB.prepare(
    "SELECT id, external_id, display_name, version, created_at, updated_at FROM scim_groups ORDER BY display_name ASC, id ASC",
  ).all();
  const filtered = (rows.results || []).filter((row) => !filter || (filter.attribute.toLowerCase() === "displayname" && containsEqual(row.display_name, filter.value)));
  const page = filtered.slice(startIndex - 1, startIndex - 1 + count);
  const resources = [];
  for (const row of page) resources.push(await groupResource(env, row, url));
  return listResponse(resources, filtered.length, startIndex);
}

async function getGroup(request, env, url, id) {
  const row = await loadGroup(env, id);
  if (!row) throw new ScimError(404, "SCIM group was not found");
  const etag = etagFor(row.version);
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: scimHeaders(etag) });
  return scimJson(await groupResource(env, row, url), 200, etag);
}

async function createGroup(request, env, url) {
  const body = await readJson(request);
  const displayName = boundedString(body.displayName, 256, "displayName");
  const id = randomToken();
  const now = Math.floor(Date.now() / 1000);
  const memberIds = normalizeMembers(body.members);
  await assertUsersExist(env, memberIds);
  try {
    await env.DB.prepare(
      "INSERT INTO scim_groups (id, external_id, display_name, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    ).bind(id, optionalString(body.externalId, 256), displayName, now, now).run();
    if (memberIds.length) await env.DB.batch(memberIds.map((memberId) => env.DB.prepare(
      "INSERT INTO scim_group_members (group_id, user_id) VALUES (?, ?)",
    ).bind(id, memberId)));
  } catch {
    throw new ScimError(409, "A group with the same externalId already exists", "uniqueness");
  }
  const row = await loadGroup(env, id);
  return scimJson(await groupResource(env, row, url), 201, etagFor(row.version), {
    Location: new URL(`/scim/v2/Groups/${encodeURIComponent(id)}`, url).toString(),
  });
}

async function putGroup(request, env, url, id) {
  const current = await loadGroup(env, id);
  if (!current) throw new ScimError(404, "SCIM group was not found");
  enforceIfMatch(request, current.version);
  const body = await readJson(request);
  const displayName = boundedString(body.displayName, 256, "displayName");
  const memberIds = normalizeMembers(body.members);
  await assertUsersExist(env, memberIds);
  const next = await updateGroup(env, current, {
    displayName,
    externalId: body.externalId === undefined ? current.external_id : optionalString(body.externalId, 256),
    memberIds,
  });
  return scimJson(await groupResource(env, next, url), 200, etagFor(next.version));
}

async function patchGroup(request, env, url, id) {
  const current = await loadGroup(env, id);
  if (!current) throw new ScimError(404, "SCIM group was not found");
  enforceIfMatch(request, current.version);
  const body = await readJson(request);
  if (!Array.isArray(body.Operations) || body.Operations.length > 32) throw new ScimError(400, "Operations must be an array");
  const memberRows = await env.DB.prepare("SELECT user_id FROM scim_group_members WHERE group_id = ?").bind(id).all();
  const nextInput = {
    displayName: current.display_name,
    externalId: current.external_id,
    memberIds: (memberRows.results || []).map((row) => String(row.user_id)),
  };
  for (const operation of body.Operations) applyGroupOperation(nextInput, operation);
  await assertUsersExist(env, nextInput.memberIds);
  const next = await updateGroup(env, current, nextInput);
  return scimJson(await groupResource(env, next, url), 200, etagFor(next.version));
}

async function deleteGroup(request, env, url, id) {
  const current = await loadGroup(env, id);
  if (!current) throw new ScimError(404, "SCIM group was not found");
  enforceIfMatch(request, current.version);
  const result = await env.DB.prepare("DELETE FROM scim_groups WHERE id = ? AND version = ?").bind(id, current.version).run();
  if (result.meta?.changes !== 1) throw new ScimError(412, "The SCIM group changed while this request was in progress");
  return new Response(null, { status: 204, headers: scimHeaders() });
}

async function loadUser(env, id) {
  const numericId = String(id).match(/^\d+$/)?.[0];
  if (!numericId) return null;
  return env.DB.prepare(`
    SELECT u.id, u.username, u.email, u.created_at, u.updated_at,
           COALESCE(s.external_id, '') AS external_id,
           COALESCE(s.active, 1) AS active, COALESCE(s.version, 1) AS version,
           COALESCE(s.updated_at, strftime('%s', u.updated_at)) AS scim_updated_at
    FROM users u LEFT JOIN scim_user_state s ON s.user_id = u.id WHERE u.id = ?
  `).bind(Number(numericId)).first();
}

async function loadGroup(env, id) {
  if (!id || id.length > 128) return null;
  return env.DB.prepare(
    "SELECT id, external_id, display_name, version, created_at, updated_at FROM scim_groups WHERE id = ?",
  ).bind(id).first();
}

async function updateUser(env, current, input) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const result = await env.DB.prepare(
      "UPDATE users SET username = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(input.username, input.email, current.id).run();
    if (result.meta?.changes !== 1) throw new ScimError(404, "SCIM user was not found");
    const state = await env.DB.prepare(
      `INSERT INTO scim_user_state (user_id, external_id, active, version, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET external_id = excluded.external_id, active = excluded.active,
       version = scim_user_state.version + 1, updated_at = excluded.updated_at`,
    ).bind(current.id, input.externalId || null, input.active ? 1 : 0, current.version, now).run();
    if (state.meta?.changes !== 1) throw new ScimError(500, "SCIM user state could not be saved");
  } catch (error) {
    if (error instanceof ScimError) throw error;
    throw new ScimError(409, "A user with the same userName or email already exists", "uniqueness");
  }
  return loadUser(env, String(current.id));
}

async function updateGroup(env, current, input) {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "UPDATE scim_groups SET external_id = ?, display_name = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  ).bind(input.externalId || null, input.displayName, now, current.id, current.version).run();
  if (result.meta?.changes !== 1) throw new ScimError(412, "The SCIM group changed while this request was in progress");
  await env.DB.prepare("DELETE FROM scim_group_members WHERE group_id = ?").bind(current.id).run();
  if (input.memberIds.length) await env.DB.batch(input.memberIds.map((memberId) => env.DB.prepare(
    "INSERT INTO scim_group_members (group_id, user_id) VALUES (?, ?)",
  ).bind(current.id, Number(memberId))));
  return loadGroup(env, current.id);
}

function applyUserOperation(target, operation) {
  const op = String(operation?.op || "").toLowerCase();
  if (!["add", "replace", "remove"].includes(op)) throw new ScimError(400, "Unsupported SCIM operation");
  const path = String(operation?.path || "").toLowerCase();
  if (path === "active") {
    if (op === "remove") target.active = true;
    else target.active = Boolean(operation.value);
    return;
  }
  if (path === "username") {
    if (op === "remove") throw new ScimError(400, "userName cannot be removed", "mutability");
    target.username = boundedString(operation.value, 256, "userName");
    return;
  }
  if (path === "emails" || path === "emails.value" || !path) {
    if (op === "remove") throw new ScimError(400, "An email is required", "invalidValue");
    const value = Array.isArray(operation.value) ? operation.value[0]?.value : operation.value?.value || operation.value;
    target.email = boundedString(value, 320, "email");
    return;
  }
  if (path === "externalid") {
    target.externalId = op === "remove" ? null : optionalString(operation.value, 256);
    return;
  }
  throw new ScimError(400, `Unsupported SCIM user path: ${operation.path}`, "noTarget");
}

function applyGroupOperation(target, operation) {
  const op = String(operation?.op || "").toLowerCase();
  const path = String(operation?.path || "").toLowerCase();
  if (!["add", "replace", "remove"].includes(op)) throw new ScimError(400, "Unsupported SCIM operation");
  if (path === "displayname") {
    if (op === "remove") throw new ScimError(400, "displayName cannot be removed", "mutability");
    target.displayName = boundedString(operation.value, 256, "displayName");
    return;
  }
  if (path === "externalid") {
    target.externalId = op === "remove" ? null : optionalString(operation.value, 256);
    return;
  }
  if (path === "members" || !path) {
    const values = Array.isArray(operation.value) ? operation.value : [operation.value];
    const ids = values.map((value) => String(value?.value ?? value?.$ref ?? value)).filter(Boolean);
    if (op === "replace" || op === "add") target.memberIds = op === "replace" ? [...new Set(ids)] : [...new Set([...target.memberIds, ...ids])];
    else target.memberIds = target.memberIds.filter((memberId) => !ids.includes(memberId));
    return;
  }
  throw new ScimError(400, `Unsupported SCIM group path: ${operation.path}`, "noTarget");
}

async function assertUsersExist(env, ids) {
  for (const id of ids) {
    if (!/^\d+$/.test(String(id))) throw new ScimError(400, "Group members must reference numeric user ids", "invalidValue");
    const row = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(Number(id)).first();
    if (!row) throw new ScimError(400, "A group member does not exist", "invalidValue");
  }
}

async function groupResource(env, row, url) {
  const members = await env.DB.prepare(
    "SELECT m.user_id, u.username FROM scim_group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.user_id ASC",
  ).bind(row.id).all();
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: row.id,
    externalId: row.external_id || undefined,
    displayName: row.display_name,
    members: (members.results || []).map((member) => ({ value: String(member.user_id), display: member.username, type: "User", $ref: new URL(`/scim/v2/Users/${member.user_id}`, url).toString() })),
    meta: resourceMeta("Group", row.id, row.created_at, row.updated_at, row.version, url),
  };
}

function userResource(row, url, params) {
  const resource = {
    schemas: [SCIM_USER_SCHEMA],
    id: String(row.id),
    externalId: row.external_id || undefined,
    userName: row.username,
    displayName: row.username,
    active: Boolean(row.active),
    emails: row.email ? [{ value: row.email, primary: true, type: "work" }] : [],
    meta: resourceMeta("User", row.id, row.created_at, row.updated_at, row.version, url),
  };
  const requested = new Set(String(params.get("attributes") || "").split(",").map((value) => value.trim()).filter(Boolean));
  const excluded = new Set(String(params.get("excludedAttributes") || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (requested.size) {
    for (const key of Object.keys(resource)) if (!["schemas", "id", "meta"].includes(key) && !requested.has(key)) delete resource[key];
  }
  for (const key of excluded) delete resource[key];
  return resource;
}

function resourceMeta(resourceType, id, created, updated, version, url) {
  const locationPath = `/scim/v2/${resourceType}s/${encodeURIComponent(String(id))}`;
  return {
    resourceType,
    created: scimTimestamp(created),
    lastModified: scimTimestamp(updated),
    location: new URL(locationPath, url).toString(),
    version: etagFor(version),
  };
}

function scimTimestamp(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = typeof value === "number" || /^\d+$/.test(String(value)) ? Number(value) : NaN;
  const date = Number.isFinite(numeric) ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function listResponse(resources, totalResults, startIndex) {
  return scimJson({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  });
}

function parseFilter(value) {
  if (!value) return null;
  const match = value.match(/^\s*(userName|email\.value|displayName)\s+eq\s+"((?:\\.|[^"])*)"\s*$/i);
  if (!match) throw new ScimError(400, "Only simple equality filters are supported", "invalidFilter");
  return { attribute: match[1], value: match[2].replace(/\\([\\"])/g, "$1") };
}

function matchesFilter(row, filter) {
  if (!filter) return true;
  if (filter.attribute.toLowerCase() === "username") return containsEqual(row.username, filter.value);
  if (filter.attribute.toLowerCase() === "email.value") return containsEqual(row.email, filter.value);
  return containsEqual(row.display_name, filter.value);
}

function containsEqual(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function pageParameters(url) {
  const startIndex = Number(url.searchParams.get("startIndex") || 1);
  const count = Number(url.searchParams.get("count") || 100);
  if (!Number.isInteger(startIndex) || startIndex < 1 || !Number.isInteger(count) || count < 0 || count > 200) {
    throw new ScimError(400, "Invalid pagination parameters", "invalidValue");
  }
  return { startIndex, count };
}

function normalizeMembers(members) {
  if (members === undefined) return [];
  if (!Array.isArray(members) || members.length > 200) throw new ScimError(400, "members must be an array", "invalidValue");
  return [...new Set(members.map((member) => String(member?.value ?? member?.$ref ?? member).trim()).filter(Boolean))];
}

function firstEmail(body) {
  if (!Array.isArray(body?.emails)) return typeof body?.email === "string" ? body.email : "";
  return body.emails.find((email) => typeof email?.value === "string")?.value || "";
}

function boundedString(value, maxLength, name) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new ScimError(400, `${name} is invalid`, "invalidValue");
  return value.trim();
}

function optionalString(value, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) throw new ScimError(400, "SCIM string value is invalid", "invalidValue");
  return value;
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/scim+json") && !contentType.toLowerCase().startsWith("application/json")) {
    throw new ScimError(415, "SCIM JSON content type is required");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new ScimError(413, "SCIM request body is too large");
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ScimError(400, "SCIM request body is invalid JSON");
  }
}

function enforceIfMatch(request, version) {
  const value = request.headers.get("If-Match");
  if (!value || value === "*") return;
  if (value !== etagFor(version)) throw new ScimError(412, "The SCIM resource version does not match");
}

function etagFor(version) {
  return `W/\"${Number(version) || 1}\"`;
}

function scimJson(value, status = 200, etag = null, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: scimHeaders(etag, extra),
  });
}

function scimError(error) {
  const headers = scimHeaders();
  if (error.wwwAuthenticate) headers.set("WWW-Authenticate", error.wwwAuthenticate);
  return new Response(JSON.stringify({
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(error.status),
    scimType: error.scimType || undefined,
    detail: error.message,
  }), { status: error.status, headers });
}

function scimHeaders(etag = null, extra = {}) {
  const headers = new Headers({
    "Content-Type": "application/scim+json; charset=UTF-8",
    "Cache-Control": "no-store",
  });
  if (etag) headers.set("ETag", etag);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

function decodePathPart(value) {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded.length > 128 || /[\u0000-\u001f]/.test(decoded)) throw new Error();
    return decoded;
  } catch {
    throw new ScimError(400, "The SCIM resource id is invalid", "invalidValue");
  }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function timingSafeEqual(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return crypto.subtle.timingSafeEqual(leftDigest, rightDigest);
}
