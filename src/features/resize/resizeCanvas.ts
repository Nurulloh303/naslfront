import type { ResizeMode } from "./resizeApi";

/**
 * Brauzerdagi taxminiy prevyular. Haqiqiy natijani server chizadi — bu yerda
 * faqat foydalanuvchi usulni tanlashi uchun tezkor, kichik ko'rinish.
 */

export const TARGET_W = 1080;
export const TARGET_H = 1440;
export const TARGET_RATIO = TARGET_W / TARGET_H;
const MAX_SEND_SIDE = 4096;

export type Rect = { x: number; y: number; w: number; h: number };

export function isThreeByFour(width: number, height: number): boolean {
  return Math.abs(width / height - TARGET_RATIO) < 0.01;
}

export function shapeOf(width: number, height: number): "square" | "portrait" | "landscape" | "target" {
  if (isThreeByFour(width, height)) return "target";
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.03) return "square";
  return ratio < 1 ? "portrait" : "landscape";
}

/** Rasmni W×H ichiga sig'dirish (contain). */
export function containRect(iw: number, ih: number, W: number, H: number): Rect {
  const scale = Math.min(W / iw, H / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** Rasm W×H ni to'liq qoplaydi (cover); fx/fy — ortiqcha qismning qaysi tomoni qoladi (0..1). */
export function coverRect(iw: number, ih: number, W: number, H: number, fx = 0.5, fy = 0.5): Rect {
  const scale = Math.max(W / iw, H / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: -(w - W) * clamp01(fx), y: -(h - H) * clamp01(fy), w, h };
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

/** Contain joylashuvidagi bo'sh chetlar (foizda) — "AI to'ldiradi" qatlami uchun. */
export function emptyEdges(iw: number, ih: number): Rect[] {
  const r = containRect(iw, ih, 100, 100 / TARGET_RATIO);
  const H = 100 / TARGET_RATIO;
  const edges: Rect[] = [];
  if (r.y > 0.5) {
    edges.push({ x: 0, y: 0, w: 100, h: (r.y / H) * 100 });
    edges.push({ x: 0, y: ((r.y + r.h) / H) * 100, w: 100, h: (r.y / H) * 100 });
  }
  if (r.x > 0.5) {
    edges.push({ x: 0, y: 0, w: r.x, h: 100 });
    edges.push({ x: r.x + r.w, y: 0, w: r.x, h: 100 });
  }
  return edges;
}

/** Rasm chetidagi eng ko'p uchraydigan rang (#RRGGBB). */
export function dominantEdgeColor(image: CanvasImageSource, iw: number, ih: number): string {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#ffffff";
  ctx.drawImage(image, 0, 0, iw, ih, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const band = 3;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x >= band && x < size - band && y >= band && y < size - band) continue;
      const i = (y * size + x) * 4;
      if (data[i + 3] < 128) continue;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n += 1; bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2];
      buckets.set(key, bucket);
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
  if (!best) return "#ffffff";
  const hex = (value: number) => Math.round(value / best!.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

/** Xira fon: rasmni juda kichik qilib, keyin cho'zib chizamiz (Safari'da ctx.filter yo'q). */
function drawBlurredCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, iw: number, ih: number, W: number, H: number) {
  const steps = [[9, 12], [36, 48]];
  let source: CanvasImageSource = image;
  let sw = iw;
  let sh = ih;
  let first = true;
  for (const [w, h] of steps) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    if (!cx) return;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    if (first) {
      const r = coverRect(sw, sh, w, h);
      cx.drawImage(source, r.x, r.y, r.w, r.h);
      first = false;
    } else {
      cx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h);
    }
    source = c;
    sw = w;
    sh = h;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Biroz kattaroq chizamiz — chetlarda yorug' "halqa" qolmasin.
  const pad = W * 0.06;
  ctx.drawImage(source, 0, 0, sw, sh, -pad, -pad, W + pad * 2, H + pad * 2);
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, 0, W, H);
}

function drawHatch(ctx: CanvasRenderingContext2D, rect: Rect, base: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#808080";
  ctx.lineWidth = Math.max(1, rect.w / 60, rect.h / 60);
  const step = ctx.lineWidth * 5;
  const span = rect.w + rect.h;
  for (let d = -span; d < span; d += step) {
    ctx.beginPath();
    ctx.moveTo(rect.x + d, rect.y);
    ctx.lineTo(rect.x + d + rect.h, rect.y + rect.h);
    ctx.stroke();
  }
  ctx.restore();
}

export type PreviewOptions = {
  mode: ResizeMode;
  fill: string;
  edgeColor: string;
  focusX: number;
  focusY: number;
};

/** Prevyuni W×H (CSS px) canvasga chizadi, DPR hisobga olinadi. */
export function drawPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, cssWidth: number, options: PreviewOptions) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  if (!iw || !ih || !cssWidth) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(cssWidth * dpr);
  const H = Math.round(W / TARGET_RATIO);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (options.mode === "crop") {
    const r = coverRect(iw, ih, W, H, options.focusX, options.focusY);
    ctx.drawImage(image, r.x, r.y, r.w, r.h);
    return;
  }

  const fit = containRect(iw, ih, W, H);
  if (options.mode === "blur") {
    drawBlurredCover(ctx, image, iw, ih, W, H);
  } else if (options.mode === "color") {
    ctx.fillStyle = options.fill;
    ctx.fillRect(0, 0, W, H);
  } else {
    // AI: bo'sh chetlar shtrixlangan — "bu yerni AI chizadi".
    const edges: Rect[] = fit.y > 0.5
      ? [{ x: 0, y: 0, w: W, h: fit.y }, { x: 0, y: fit.y + fit.h, w: W, h: H - fit.y - fit.h }]
      : fit.x > 0.5 ? [{ x: 0, y: 0, w: fit.x, h: H }, { x: fit.x + fit.w, y: 0, w: W - fit.x - fit.w, h: H }] : [];
    edges.forEach((edge) => drawHatch(ctx, edge, options.edgeColor));
  }
  ctx.drawImage(image, fit.x, fit.y, fit.w, fit.h);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read")));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Yuborish uchun data URL. Kichraytiramiz faqat uzun tomoni 4096 px dan
 * oshsa — oddiy rasmlarni tegmaymiz, kichiklarini server o'zi kattalashtiradi.
 */
export async function prepareResizeUpload(file: File, image: HTMLImageElement): Promise<string> {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const longest = Math.max(iw, ih);
  if (longest <= MAX_SEND_SIDE) return readAsDataUrl(file);
  const scale = MAX_SEND_SIDE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(iw * scale);
  canvas.height = Math.round(ih * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return readAsDataUrl(file);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  // PNG shaffofligini saqlaymiz, qolganlari — yuqori sifatli JPEG.
  return file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.93);
}
