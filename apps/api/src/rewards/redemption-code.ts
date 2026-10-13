import { randomInt } from 'node:crypto';

/** No 0/O or 1/I/L: codes are read aloud and typed at a busy counter. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

/** A random code like "K7Q-4MP": 31^6 ≈ 887 million possibilities per business. */
export function generateRedemptionCode(): string {
  let raw = '';
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return format(raw);
}

/** Canonical form of a code typed by staff: case, spaces and dashes are ignored. */
export function normalizeRedemptionCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === LENGTH ? format(raw) : raw;
}

function format(raw: string): string {
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}
