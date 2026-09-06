/**
 * One place that knows how to talk to the API.
 *
 * Every request sends cookies (credentials: "include") because the session lives
 * in httpOnly cookies rather than localStorage — a token in localStorage is
 * readable by any script that manages to run on the page.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: FieldError[]) {
    super(message);
  }
}
export type FieldError = { field: string; message: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `request failed (${res.status})`, body.details);
  }
  return body as T;
}

export const api = {
  get:  <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put:  <T>(p: string, body: unknown) => request<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  del:  <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

/* ---------- shapes returned by the API ---------- */

export type User = {
  id: string; email: string; display_name: string; role: string;
  created_at: string; last_login_at: string | null;
};

export type KeyField = { path: string; description: string };

export type K8sObject = {
  id: string; kind: string; apiVersion: string; category: string;
  shortNames: string[]; namespaced: boolean; summary: string; explanation: string;
  whenToUse: string[]; keyFields: KeyField[]; example: string;
  relatedIds: string[]; commonMistakes: string[]; kubectlTips: string[];
};

export type RelatedObject = { id: string; kind: string; summary: string; category: string };

export type KubectlCommand = {
  id: string; category: string; command: string; description: string;
  example: string | null; notes: string | null; danger: boolean; tags: string[];
};

export type ProgressItem = {
  itemType: "object" | "command"; itemId: string;
  status: "learning" | "learned"; updatedAt: string;
};

export type Note = {
  itemType: "object" | "command"; itemId: string; body: string; updatedAt: string;
};

export type CategoryCount = { category: string; count: number };
