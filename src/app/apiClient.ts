/**
 * Barcha API so'rovlari shu yerdan o'tadi.
 *
 * Ikkita narsa uchun kerak:
 *
 * 1. CSRF. Django sessiya cookie'si bilan kirgan foydalanuvchidan POST /
 *    PATCH / DELETE so'rovlarida `X-CSRFToken` sarlavhasini talab qiladi.
 *    Sarlavhasiz har bir yozuv so'rovi 403 bilan qaytadi. Token
 *    `csrftoken` cookie'sida keladi — uni backend `/api/auth/session`
 *    javobida o'rnatadi.
 *
 * 2. Manzil asosi. Sayt va API bitta domenda bo'lsa (tavsiya etilgani —
 *    naslai.uz, nginx `/api` ni Django'ga uzatadi) hech narsa kerak emas.
 *    API alohida domenga chiqarilsa — `VITE_API_BASE` ni to'ldiring.
 */

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

/** Bu usullar serverdagi holatni o'zgartirmaydi — ularga CSRF kerak emas. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const chunk of document.cookie.split(";")) {
    const item = chunk.trim();
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
  }
  return "";
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(init?.body ? { "content-type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  }

  return fetch(apiUrl(path), {
    // "include" — chunki API boshqa domenga chiqarilganda ham sessiya
    // cookie'si yuborilishi kerak. Bitta domenda ham xuddi shunday ishlaydi.
    credentials: "include",
    ...init,
    headers,
  });
}
