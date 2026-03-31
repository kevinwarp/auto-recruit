import { auth } from './firebase';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const url = path.startsWith('http') ? path : `${API_BASE}/api${path}`;
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> ?? {}) },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText })) as { message?: string };
    throw new Error(error.message ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/** Flat REST client used across all pages */
export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Returns a Blob (for CSV downloads) */
  download: async (path: string, options?: RequestInit): Promise<Blob> => {
    const headers = await getAuthHeaders();
    const url = path.startsWith('http') ? path : `${API_BASE}/api${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers as Record<string, string> ?? {}),
      },
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText })) as { message?: string };
      throw new Error(error.message ?? `Download failed: ${response.status}`);
    }
    return response.blob();
  },
};
