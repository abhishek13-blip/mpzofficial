import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// Secret key loaded from environment variable
export function getOwnerKey(): string {
  return process.env.MPZ_HUB_OWNER_KEY || 'mpz-hub-secret-owner-key-2026';
}

// Session signing secret
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

// Rate limiter for login attempts (in-memory)
interface AttemptRecord {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(ip: string): { allowed: boolean; remainingWaitMs: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true, remainingWaitMs: 0 };
  if (now > record.resetAt) {
    loginAttempts.delete(ip);
    return { allowed: true, remainingWaitMs: 0 };
  }
  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, remainingWaitMs: record.resetAt - now };
  }
  return { allowed: true, remainingWaitMs: 0 };
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + LOCKOUT_MS };
  record.count += 1;
  loginAttempts.set(ip, record);
}

export function resetAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// Generate signed session token: base64(payload).signature
export function createSessionToken(): string {
  const payload = {
    role: 'owner',
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${hmac}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadStr, signature] = parts;
  const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  if (signature !== expectedHmac) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
    if (payload.role !== 'owner') return false;
    if (Date.now() > payload.expiresAt) return false;
    return true;
  } catch {
    return false;
  }
}

// Timing safe comparison of owner key
export function verifyOwnerKey(providedKey: unknown): boolean {
  if (typeof providedKey !== 'string') return false;
  const targetKey = getOwnerKey();
  const bufA = Buffer.from(providedKey);
  const bufB = Buffer.from(targetKey);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Express middleware
export function requireOwnerAuth(req: Request, res: Response, next: NextFunction): void {
  // Check Authorization header or cookie
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = req.cookies?.mpz_owner_session;
  const token = bearerToken || cookieToken;

  if (!token || !verifySessionToken(token)) {
    res.status(401).json({
      error: 'Unauthorized: Valid MPZ HUB Owner session required',
    });
    return;
  }
  next();
}
