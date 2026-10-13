import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';

export const ACCESS_COOKIE = 'ph_access';
export const REFRESH_COOKIE = 'ph_refresh';

/** The refresh token is only ever sent to the auth endpoints, never with ordinary API calls. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function baseOptions(env: Env): CookieOptions {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' };
}

export function setSessionCookies(res: Response, session: Session, env: Env): void {
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(env),
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(env),
    path: REFRESH_COOKIE_PATH,
    expires: session.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response, env: Env): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(env), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(env), path: REFRESH_COOKIE_PATH });
}
