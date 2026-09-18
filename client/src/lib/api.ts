export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let tokenGetter: () => string | null = () => null;
export function setTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = tokenGetter();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Hãy chắc chắn server đang chạy.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { message?: string | string[] })?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(", ") : msg || `Lỗi ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export interface CloudProject {
  _id: string;
  clientId: string;
  name: string;
  width: number;
  height: number;
  frameCount: number;
  thumbnail: string;
  published: boolean;
  description?: string;
  tags?: string[];
  ownerName?: string;
  downloads?: number;
  /** epoch milliseconds */
  updatedAt: number;
  createdAt: number;
  publishedAt?: number;
}
