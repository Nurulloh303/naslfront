/**
 * CORS-xavfsiz rasm yuklash.
 *
 * Har bir qatlam rasmi `fetch(url, { mode: "cors" })` bilan blob sifatida
 * olinadi va objectURL orqali `<img>` ga beriladi. objectURL — sahifaning
 * o'z manbasi, shuning uchun kanvas hech qachon "ifloslanmaydi": eksport va
 * piksel bo'yicha hit-test doim ishlaydi. Yuklab bo'lmasa — xato (hech qachon
 * jimgina oq quti chizilmaydi).
 */
import type { Drawable } from "./renderLayers";

export type LoadedImage = Drawable & {
  /** `<img>` uchun: ro'yxatdagi kichik rasmlar ham shu (CORS'siz qayta yuklamaymiz). */
  objectUrl: string;
  /** Alfa bo'yicha hit-test uchun. */
  element: HTMLImageElement;
};

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}

async function fetchBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    const res = await fetch(url, { signal });
    return res.blob();
  }
  // Avval cookie'siz ("omit" — `Access-Control-Allow-Origin: *` bilan ishlaydi); manzil sessiya
  // talab qilsa (401/403 yoki rad etilsa) — cookie bilan ("include") qayta urinamiz.
  const first: RequestCredentials = sameOrigin(url) ? "same-origin" : "omit";
  const attempts: RequestCredentials[] = [first, "include"];
  let lastError: unknown = null;
  for (const credentials of attempts) {
    try {
      const res = await fetch(url, { mode: "cors", credentials, signal });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const blob = await res.blob();
      if (blob.type && !blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
        lastError = new Error(`Not an image: ${blob.type}`);
        continue;
      }
      return blob;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LOAD_FAILED");
}

function decodeImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("DECODE_FAILED"));
    img.src = objectUrl;
  });
}

export async function loadCorsImage(url: string, signal?: AbortSignal): Promise<LoadedImage> {
  const blob = await fetchBlob(url, signal);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const element = await decodeImage(objectUrl);
    if (!element.naturalWidth || !element.naturalHeight) throw new Error("EMPTY_IMAGE");
    return { image: element, element, width: element.naturalWidth, height: element.naturalHeight, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Bir nechta rasmni "hammasi yoki hech biri" tarzida yuklaydi ("Bosib ajratish":
 * yangi obyekt + yangi fon birga paydo bo'lishi kerak). Biri yuklanmasa —
 * yuklanganlari bo'shatiladi va xato qaytadi.
 */
export async function loadCorsImages(urls: string[], signal?: AbortSignal): Promise<Record<string, LoadedImage>> {
  const settled = await Promise.allSettled(urls.map((url) => loadCorsImage(url, signal)));
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    for (const r of settled) if (r.status === "fulfilled") releaseImage(r.value);
    throw failed.reason instanceof Error ? failed.reason : new Error("LOAD_FAILED");
  }
  const out: Record<string, LoadedImage> = {};
  settled.forEach((r, i) => { if (r.status === "fulfilled") out[urls[i]] = r.value; });
  return out;
}

export function releaseImage(image: LoadedImage | undefined): void {
  if (image) URL.revokeObjectURL(image.objectUrl);
}

/**
 * Kesma piksellarining shaffofligi bo'yicha hit-test uchun kesh (URL bo'yicha).
 * Rasmlar objectURL'dan — kanvas ifloslanmaydi; baribir xato bo'lsa `null`
 * (to'rtburchak bo'yicha tekshiriladi).
 */
export class AlphaHitCache {
  private entries = new Map<string, { data: Uint8ClampedArray; w: number; h: number } | "failed">();

  clear(): void {
    this.entries.clear();
  }

  /** u, v — 0..1 oralig'idagi normallashtirilgan koordinatalar. */
  probe(key: string, image: HTMLImageElement, u: number, v: number): boolean | null {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = this.build(image);
      this.entries.set(key, entry);
    }
    if (entry === "failed") return null;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    const { data, w, h } = entry;
    const cx = Math.floor(u * w);
    const cy = Math.floor(v * h);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        if (data[(py * w + px) * 4 + 3] > 24) return true;
      }
    }
    return false;
  }

  private build(image: HTMLImageElement): { data: Uint8ClampedArray; w: number; h: number } | "failed" {
    try {
      const natW = image.naturalWidth || 1;
      const natH = image.naturalHeight || 1;
      const scale = Math.min(1, 512 / Math.max(natW, natH));
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return "failed";
      ctx.drawImage(image, 0, 0, w, h);
      return { data: ctx.getImageData(0, 0, w, h).data, w, h };
    } catch {
      return "failed";
    }
  }
}
