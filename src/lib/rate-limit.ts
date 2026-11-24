const rateLimit = new Map<string, { count: number; resetTime: number }>();

let nextCleanup = 0;

export function checkRateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  if (now >= nextCleanup) {
    rateLimit.forEach((record, entry) => {
      if (record.resetTime <= now) rateLimit.delete(entry);
    });
    nextCleanup = now + 60000;
  }
  const record = rateLimit.get(key);
  if (!record && rateLimit.size >= 20000) return { allowed: false, remaining: 0 };

  if (!record || now > record.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}
