const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiFetchInit extends RequestInit {
  /**
   * Send raw body without JSON stringify + Content-Type. Used for multipart
   * uploads where the browser sets Content-Type: multipart/form-data with a
   * boundary that we must not overwrite.
   */
  raw?: boolean;
  /** JSON body — object; will be stringified. Ignored when `raw` is true. */
  json?: unknown;
  /** Set to true to skip the refresh-on-401 interceptor (used by refresh itself). */
  skipAuthRetry?: boolean;
}

let refreshPromise: Promise<void> | null = null;

/**
 * On 401 we attempt POST /auth/refresh exactly once, then retry the original
 * request. Concurrent 401s share a single refresh call so we don't stampede
 * the endpoint (TRD §9 frontend behavior).
 */
async function ensureRefreshed(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) {
          // Bubble a distinctive error so callers can force logout.
          throw new ApiError(res.status, 'UNAUTHENTICATED', 'Session expired');
        }
      })
      .finally(() => {
        // Clear so subsequent 401s can trigger a fresh refresh cycle.
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const { raw, json, skipAuthRetry, headers, body, ...rest } = init;

  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  let finalBody: BodyInit | undefined;
  if (raw) {
    finalBody = body as BodyInit | undefined;
  } else if (json !== undefined) {
    finalBody = JSON.stringify(json);
    finalHeaders['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    finalBody = body as BodyInit;
    if (!finalHeaders['Content-Type']) finalHeaders['Content-Type'] = 'application/json';
  }

  const send = () =>
    fetch(url, {
      ...rest,
      credentials: 'include',
      headers: finalHeaders,
      body: finalBody,
    });

  let response = await send();

  if (response.status === 401 && !skipAuthRetry && !path.includes('/auth/')) {
    try {
      await ensureRefreshed();
      response = await send();
    } catch {
      // Fall through — original 401 body still applies below.
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? response.statusText,
    );
  }
  return response.json() as Promise<T>;
}
