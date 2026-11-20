// Best-effort abuse mitigation for pre-login routes.
// This map is scoped to a single serverless runtime instance, NOT a durable global lock.
// The hosting platform must also enforce distributed per-client rate limits.
// No CPF, password, or IP is logged, exposed, or written to a database by this helper.
const WINDOW_MS = 10 * 60 * 1000;
const BASE_COOLDOWN_MS = 30 * 1000;
const MAX_COOLDOWN_MS = 5 * 60 * 1000;
const ALLOWED_ATTEMPTS = 5;
const MAX_KEYS = 4096;
const attempts = new Map();

function purgeExpired(now) {
  for (const [key, entry] of attempts) {
    if (entry.firstAt + WINDOW_MS <= now && entry.blockedUntil <= now) attempts.delete(key);
  }
  // Bound memory even under a surge of distinct identifiers.
  while (attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value);
}

/**
 * Counts an authentication attempt before the password or activation credential is verified.
 * A successful login clears its own counter. Do not use this as the only protection.
 * @param {string} operation - login or activate
 * @param {string} normalizedCpf - internally normalized CPF (never returned)
 * @param {number} [now]
 * @returns {{allowed: true, retryAfterSeconds: 0} | {allowed: false, retryAfterSeconds: number}}
 */
export function consumeAuthAttempt(operation, normalizedCpf, now = Date.now()) {
  if (!['login', 'activate'].includes(operation) || !/^\d{11}$/.test(normalizedCpf)) {
    return { allowed: false, retryAfterSeconds: 60 };
  }
  const key = operation + ':' + normalizedCpf;
  let entry = attempts.get(key);
  if (!entry || entry.firstAt + WINDOW_MS <= now && entry.blockedUntil <= now) {
    purgeExpired(now);
    entry = { firstAt: now, count: 0, blockedUntil: 0 };
  }
  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  entry.count++;
  if (entry.count > ALLOWED_ATTEMPTS) {
    const steps = Math.floor((entry.count - ALLOWED_ATTEMPTS - 1) / 2);
    entry.blockedUntil = now + Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** steps);
    attempts.set(key, entry);
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  attempts.set(key, entry);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearAuthAttempts(operation, normalizedCpf) {
  attempts.delete(operation + ':' + normalizedCpf);
}
