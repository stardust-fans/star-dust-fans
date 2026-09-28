const USERNAME_RE = /^[a-z0-9_-]{2,32}$/;

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidUsername(value) {
  return USERNAME_RE.test(value);
}

export function usernameCandidate(value, userId) {
  const stripped = normalizeUsername(value).replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  return isValidUsername(stripped) ? stripped : `user_${userId}`;
}

export function normalizeDisplayName(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidDisplayName(value) {
  return typeof value === "string" && value.length > 0 && [...value].length <= 32 && !/[\p{Cc}]/u.test(value);
}
