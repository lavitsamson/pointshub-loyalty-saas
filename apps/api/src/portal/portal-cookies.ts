import type { CookieOptions, Response } from 'express';
import { API_PREFIX } from '../app.setup';
import type { Session } from '../auth/session-cookies';
import type { Env } from '../config/env';

export const PORTAL_ACCESS_COOKIE = 'ph_portal_access';
export const PORTAL_REFRESH_COOKIE = 'ph_portal_refresh';

/**
 * Portal cookies are scoped to one business's portal path, so the browser never sends a
 * customer's session to another business's portal (or to the merchant API). It also lets one
 * browser hold sessions for several businesses' portals at once.
 */
const portalPath = (slug: string) => `/${API_PREFIX}/portal/${slug}`;

function baseOptions(env: Env): CookieOptions {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' };
}

export function setPortalCookies(res: Response, slug: string, session: Session, env: Env): void {
  res.cookie(PORTAL_ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(env),
    path: portalPath(slug),
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(PORTAL_REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(env),
    path: `${portalPath(slug)}/auth`,
    expires: session.refreshExpiresAt,
  });
}

export function clearPortalCookies(res: Response, slug: string, env: Env): void {
  res.clearCookie(PORTAL_ACCESS_COOKIE, { ...baseOptions(env), path: portalPath(slug) });
  res.clearCookie(PORTAL_REFRESH_COOKIE, { ...baseOptions(env), path: `${portalPath(slug)}/auth` });
}
