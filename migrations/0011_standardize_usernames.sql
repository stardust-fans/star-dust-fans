UPDATE users
SET display_name = username
WHERE (length(username) < 2 OR length(username) > 32 OR lower(username) GLOB '*[^a-z0-9_-]*' OR username <> lower(username))
  AND instr(username, '@') = 0;

UPDATE users
SET username = 'user_' || id, updated_at = CURRENT_TIMESTAMP
WHERE length(username) < 2 OR length(username) > 32 OR lower(username) GLOB '*[^a-z0-9_-]*';

UPDATE users
SET username = lower(username), updated_at = CURRENT_TIMESTAMP
WHERE username <> lower(username);
