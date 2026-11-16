import type { User } from "firebase/auth";

export class ApiError extends Error {
  constructor(public readonly kind: "http" | "network" | "timeout" | "session", public readonly status?: number) {
    super(kind);
    this.name = "ApiError";
  }
}

// Bound token refresh as well as fetch; never replay a mutation automatically.
export async function authenticatedRequest(user: User, path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("Request cancelled", "AbortError");
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(timedOut ? new ApiError("timeout") : new DOMException("Request cancelled", "AbortError"));
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const token = await Promise.race([user.getIdToken(), interrupted]);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await Promise.race([fetch(path, { ...init, headers, signal: controller.signal }), interrupted]);
    // These bounded JSON/text API replies are consumed before clearing the deadline.
    const body = await Promise.race([response.arrayBuffer(), interrupted]);
    return new Response([204, 205, 304].includes(response.status) || init.method === "HEAD" ? null : body,
      { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (timedOut) throw new ApiError("timeout");
    if (init.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    const code = (error as { code?: string })?.code;
    if (code?.startsWith("auth/") && code !== "auth/network-request-failed") throw new ApiError("session");
    throw new ApiError("network");
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
    init.signal?.removeEventListener("abort", cancel);
  }
}

export function readableApiError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.kind === "session" || error.status === 401 || error.status === 403) return "Не вдалося підтвердити вхід. Вийдіть з акаунта й увійдіть знову.";
  if (error.kind === "timeout") return "Сервіс не відповів вчасно. Оновіть дані перед повторною спробою.";
  if (error.kind === "network") return "Немає зв’язку із сервісом. Перевірте з’єднання та спробуйте ще раз.";
  if (error.status === 429) return "Забагато запитів. Зачекайте трохи й спробуйте ще раз.";
  if (error.status === 503) return "Сервіс тимчасово недоступний. Спробуйте трохи пізніше.";
  return fallback;
}
