import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { sha256 } from '../common/crypto';

/** OWASP-recommended argon2id baseline: 19 MiB memory, 2 iterations, 1 lane. */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A short digest of the current password hash (or of no password). Embedded in emailed
 * password links, it makes them stop working once the password changes: single-use without
 * storing the link.
 */
export function passwordFingerprint(passwordHash: string | null): string {
  return sha256(passwordHash ?? '').slice(0, 16);
}

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
  }

  /** Parameters are read from the stored hash, so older hashes keep verifying after tuning. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real verification. Used when the account does not exist so
   * response timing does not reveal which emails are registered.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
