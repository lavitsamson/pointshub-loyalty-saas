import { type ProblemDetails, ProblemDetailsSchema } from '@pointshub/shared';

/** Same-origin path; Next.js forwards it to the API (see next.config.ts). */
export const API_BASE = '/api/v1';

/** An error response from the API, carrying its RFC 9457 Problem Details body. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
  }

  get status(): number {
    return this.problem.status;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

/** A human-readable message for any error thrown by a request. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection.';
  return 'Something went wrong. Please try again.';
}

/**
 * The message to show above a form, or null when there is nothing to show there: field
 * validation errors are shown on the fields themselves (see applyServerErrors).
 */
export function formError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.problem.errors?.length) return null;
  return errorMessage(error);
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal | undefined;
}

// Requests that must not trigger a refresh: they are how a session is created or renewed.
const SESSION_ENDPOINTS = /^\/auth\/(login|register|refresh|logout)$/;

let refreshing: Promise<boolean> | null = null;

/**
 * Renews the session once, however many requests hit a 401 at the same time. Refresh tokens
 * rotate and the API treats reuse as theft (revoking the whole session), so two concurrent
 * refreshes with the same cookie would sign the user out. The Web Locks API extends the same
 * guarantee across browser tabs.
 */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return res.ok;
    };
    try {
      return typeof navigator !== 'undefined' && 'locks' in navigator
        ? await navigator.locks.request('pointshub-session-refresh', run)
        : await run();
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, headers = {}, signal } = options;
  return fetch(API_BASE + path, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      // Required by the API's CSRF guard on every state-changing request.
      ...(method === 'GET' ? {} : { 'X-Requested-With': 'XMLHttpRequest' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function toApiError(res: Response): Promise<ApiError> {
  const parsed = ProblemDetailsSchema.safeParse(await res.json().catch(() => null));
  return new ApiError(
    parsed.success
      ? parsed.data
      : { type: 'about:blank', title: res.statusText || 'Request failed', status: res.status },
  );
}

/**
 * Calls the API with the session cookies. An expired access token is renewed transparently
 * and the request retried once; if renewal fails the 401 is surfaced so the app can send the
 * user to the login page.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options);

  if (res.status === 401 && !SESSION_ENDPOINTS.test(path) && (await refreshSession())) {
    res = await send(path, options);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

/** Builds a query string, skipping empty values. */
export function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
