import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token with 256 bits of entropy. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Tokens are stored as SHA-256 hashes. They are high-entropy random values, so a fast hash
 * is sufficient; a slow password hash would only add latency.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
