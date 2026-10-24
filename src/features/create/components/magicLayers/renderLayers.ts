/**
 * Magic Layers: kanvasga chizish, matnni joylash, geometriya va hit-test.
 *
 * React'siz toza funksiyalar — muharrir ham, eksport (yuklab olish/saqlash)
 * ham bir xil kod bilan chizadi, shuning uchun ekranda ko'ringan narsa
 * faylda ham aynan shunday chiqadi.
 */
import { FONT_STACK } from "../../domain/drawTextLayer";
import type { EditorLayer, ImageLayerItem, TextLayerItem } from "./editorTypes";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type HandleId = "nw" | "ne" | "se" | "sw" | "e" | "w";

/* ------------------------------------------------------------------ */
/* Shriftlar                                                           */
/* ------------------------------------------------------------------ */

const FAMILY_STACKS: Record<string, string> = {
  Inter: FONT_STACK,
  Montserrat: '"Montserrat", "Inter", Arial, sans-serif',
  Roboto: '"Roboto", "Inter", Arial, sans-serif',
  Arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
};

/** Google Fonts'dan yuklanadigan (tizimda bo'lmasligi mumkin) shriftlar. */
const WEB_FONTS = new Set(["Inter", "Montserrat", "Roboto"]);

export function fontStack(family: string): string {
  return FAMILY_STACKS[family] ?? `"${family.replace(/"/g, "")}", ${FONT_STACK}`;
}

export function fontSpec(layer: Pick<TextLayerItem, "fontFamily" | "fontWeight" | "fontSize">, size = layer.fontSize): string {
  return `${Math.round(layer.fontWeight)} ${Math.max(1, size)}px ${fontStack(layer.fontFamily)}`;
}

/** Lotin, kirill va o'zbekcha harflar — shu belgilar uchun subsetlar ham yuklanadi. */
const FONT_SAMPLE = "AaBbÑñ0123 АаЁёЯя ЎўҚқҒғҲҳ Oʻoʻ Gʻgʻ";

/**
 * Matn qatlamlari ishlatadigan shriftlar yuklanishini kutadi.
 * Chizish va eksportdan oldin chaqiriladi, aks holda birinchi kadr zaxira
 * shriftda chiqadi. Hech qachon xato tashlamaydi; ko'pi bilan `timeoutMs` kutadi.
 */
export async function ensureFonts(
  layers: Array<Pick<TextLayerItem, "fontFamily" | "fontWeight">>,
  timeoutMs = 4000,
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const specs = new Set<string>();
  for (const layer of layers) {
    if (!WEB_FONTS.has(layer.fontFamily)) continue;
    specs.add(`${Math.round(layer.fontWeight)} 32px "${layer.fontFamily}"`);
  }
  const work = Promise.all([...specs].map((spec) => document.fonts.load(spec, FONT_SAMPLE).catch(() => [])))
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  await Promise.race([work, new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs))]);
}

/* ------------------------------------------------------------------ */
/* Matnni joylash                                                      */
/* ------------------------------------------------------------------ */

let measureContext: CanvasRenderingContext2D | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureContext && typeof document !== "undefined") {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  return measureContext;
}

function breakLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of Array.from(word)) {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Bitta paragrafni so'zlar bo'yicha `maxWidth` ga sig'diradi. */
function wrapParagraph(ctx: CanvasRenderingContext2D, paragraph: string, maxWidth: number): string[] {
  const words = paragraph.split(/[ \t]+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const pieces = ctx.measureText(word).width > maxWidth ? breakLongWord(ctx, word, maxWidth) : [word];
    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }
  lines.push(current);
  return lines;
}

export type TextLayout = {
  /** Matnning o'zi egallagan quti (plashka paddingisiz). */
  box: Rect;
  /** Plashka bilan birga tashqi quti — tanlash va hit-test shu bo'yicha. */
  outer: Rect;
  lines: string[];
  lineHeightPx: number;
  padX: number;
  padY: number;
};

export function displayText(layer: Pick<TextLayerItem, "text" | "uppercase">, text = layer.text): string {
  return layer.uppercase ? text.toLocaleUpperCase() : text;
}

/** Plashka (background) paddingi — kegl bo'yicha. */
export function platePadding(layer: Pick<TextLayerItem, "background" | "fontSize">): { padX: number; padY: number } {
  if (!layer.background) return { padX: 0, padY: 0 };
  return { padX: Math.round(layer.fontSize * 0.35), padY: Math.round(layer.fontSize * 0.18) };
}

export function layoutText(layer: TextLayerItem, textOverride?: string): TextLayout {
  const ctx = getMeasureContext();
  const lineHeightPx = layer.fontSize * layer.lineHeight;
  const text = displayText(layer, textOverride ?? layer.text);
  let lines: string[];
  if (ctx) {
    ctx.font = fontSpec(layer);
    lines = text.split("\n").flatMap((p) => wrapParagraph(ctx, p, Math.max(1, layer.width)));
  } else {
    lines = text.split("\n");
  }
  const height = Math.max(1, lines.length) * lineHeightPx;
  const box = { x: layer.x, y: layer.y, width: layer.width, height };
  const { padX, padY } = platePadding(layer);
  const outer = { x: box.x - padX, y: box.y - padY, width: box.width + padX * 2, height: box.height + padY * 2 };
  return { box, outer, lines, lineHeightPx, padX, padY };
}

/* ------------------------------------------------------------------ */
/* Chizish                                                             */
/* ------------------------------------------------------------------ */

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rad);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rad);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rad);
  ctx.closePath();
}

function applyRotation(ctx: CanvasRenderingContext2D, rect: Rect, degrees: number) {
  if (!degrees) return;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

export function drawTextItem(ctx: CanvasRenderingContext2D, layer: TextLayerItem): void {
  const layout = layoutText(layer);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  applyRotation(ctx, layout.outer, layer.rotation);

  if (layer.background) {
    roundRectPath(ctx, layout.outer, Math.round(layer.fontSize * 0.3));
    ctx.fillStyle = layer.background;
    ctx.fill();
  }

  ctx.font = fontSpec(layer);
  ctx.fillStyle = layer.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = layer.align;
  const anchorX = layer.align === "center" ? layout.box.x + layout.box.width / 2
    : layer.align === "right" ? layout.box.x + layout.box.width
    : layout.box.x;
  layout.lines.forEach((line, index) => {
    ctx.fillText(line, anchorX, layout.box.y + index * layout.lineHeightPx + layout.lineHeightPx / 2);
  });
  ctx.restore();
}

export function drawImageItem(ctx: CanvasRenderingContext2D, layer: ImageLayerItem, image: CanvasImageSource, width: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  ctx.translate(layer.x + width / 2, layer.y + height / 2);
  ctx.scale(layer.scale, layer.scale);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export type SceneOptions = {
  width: number;
  height: number;
  layers: EditorLayer[];
  images: Record<string, HTMLImageElement | undefined>;
  /** Shu matn qatlami chizilmaydi (ustida textarea ochiq). */
  skipTextId?: string | null;
  /** Shaffof fon o'rniga shu rang bilan to'ldirish. */
  background?: string;
};

/** Barcha ko'rinadigan qatlamlarni z-tartibda chizadi. */
export function renderScene(ctx: CanvasRenderingContext2D, options: SceneOptions): void {
  const { width, height, layers, images, skipTextId } = options;
  ctx.clearRect(0, 0, width, height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  const visible = layers.filter((l) => !l.deleted && l.visible).sort((a, b) => a.order - b.order);
  for (const layer of visible) {
    if (layer.kind === "image") {
      const image = images[layer.id];
      if (image && image.complete && image.naturalWidth > 0) drawImageItem(ctx, layer, image, width, height);
    } else if (layer.id !== skipTextId) {
      drawTextItem(ctx, layer);
    }
  }
}

/** To'liq o'lchamdagi yakuniy rasm (eksport uchun). */
export async function composeScene(options: Omit<SceneOptions, "skipTextId">): Promise<HTMLCanvasElement> {
  await ensureFonts(options.layers.filter((l): l is TextLayerItem => l.kind === "text" && !l.deleted && l.visible));
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  renderScene(ctx, options);
  return canvas;
}

/** `toBlob` ni promise'ga o'raydi. Ifloslangan (CORS) kanvasda `TAINTED` xatosi. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("EXPORT_FAILED"))), type);
    } catch (error) {
      reject(isSecurityError(error) ? new Error("TAINTED") : error);
    }
  });
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/png");
  } catch (error) {
    throw isSecurityError(error) ? new Error("TAINTED") : error;
  }
}

function isSecurityError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "SecurityError";
}

/* ------------------------------------------------------------------ */
/* Geometriya va tanlash                                               */
/* ------------------------------------------------------------------ */

export function imageBounds(layer: ImageLayerItem, width: number, height: number): Rect {
  const cx = layer.x + width / 2;
  const cy = layer.y + height / 2;
  return { x: cx - (width / 2) * layer.scale, y: cy - (height / 2) * layer.scale, width: width * layer.scale, height: height * layer.scale };
}

/** Nuqtani qatlamning (aylantirilmagan) lokal fazosiga o'tkazadi. */
export function toLocal(pt: Point, rect: Rect, degrees: number): Point {
  if (!degrees) return pt;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rad = (-degrees * Math.PI) / 180;
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  return { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) };
}

export function rotateVector(v: Point, degrees: number): Point {
  if (!degrees) return v;
  const rad = (-degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(rad) - v.y * Math.sin(rad), y: v.x * Math.sin(rad) + v.y * Math.cos(rad) };
}

function inRect(pt: Point, r: Rect, slop = 0): boolean {
  return pt.x >= r.x - slop && pt.x <= r.x + r.width + slop && pt.y >= r.y - slop && pt.y <= r.y + r.height + slop;
}

function handlePoints(r: Rect, withSides: boolean): Array<{ id: HandleId; x: number; y: number }> {
  const points: Array<{ id: HandleId; x: number; y: number }> = [
    { id: "nw", x: r.x, y: r.y },
    { id: "ne", x: r.x + r.width, y: r.y },
    { id: "se", x: r.x + r.width, y: r.y + r.height },
    { id: "sw", x: r.x, y: r.y + r.height },
  ];
  if (withSides) {
    points.push({ id: "e", x: r.x + r.width, y: r.y + r.height / 2 }, { id: "w", x: r.x, y: r.y + r.height / 2 });
  }
  return points;
}

export function selectionRect(layer: EditorLayer, width: number, height: number): Rect {
  return layer.kind === "image" ? imageBounds(layer, width, height) : layoutText(layer).outer;
}

export function hitHandle(layer: EditorLayer, pt: Point, width: number, height: number, hitRadius: number): HandleId | null {
  const rect = selectionRect(layer, width, height);
  const local = layer.kind === "text" ? toLocal(pt, rect, layer.rotation) : pt;
  // Yon tutqichlar burchaklardan oldin tekshirilmaydi: kichik qutida burchak muhimroq.
  for (const handle of handlePoints(rect, layer.kind === "text")) {
    if (Math.hypot(local.x - handle.x, local.y - handle.y) <= hitRadius) return handle.id;
  }
  return null;
}

export function hitTextLayer(layer: TextLayerItem, pt: Point, slop = 0): boolean {
  const rect = layoutText(layer).outer;
  return inRect(toLocal(pt, rect, layer.rotation), rect, slop);
}

/**
 * Rastr qatlam pikselining shaffofligini tekshirish uchun kesh.
 * Har qatlam uchun kichraytirilgan offscreen canvas'dan `getImageData` olinadi.
 * Kanvas CORS bilan ifloslangan bo'lsa — `null` (to'rtburchak bo'yicha tekshiriladi).
 */
export class AlphaHitCache {
  private entries = new Map<string, { data: Uint8ClampedArray; w: number; h: number } | "tainted">();

  clear(): void {
    this.entries.clear();
  }

  delete(id: string): void {
    this.entries.delete(id);
  }

  /** u, v — 0..1 oralig'idagi normallashtirilgan koordinatalar. */
  probe(id: string, image: HTMLImageElement, u: number, v: number): boolean | null {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = this.build(image);
      this.entries.set(id, entry);
    }
    if (entry === "tainted") return null;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    const { data, w, h } = entry;
    const cx = Math.floor(u * w);
    const cy = Math.floor(v * h);
    // 1px atrofini ham ko'ramiz: yupqa chiziq va harflar chetini bosish oson bo'lsin.
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        if (data[(py * w + px) * 4 + 3] > 12) return true;
      }
    }
    return false;
  }

  private build(image: HTMLImageElement): { data: Uint8ClampedArray; w: number; h: number } | "tainted" {
    try {
      const natW = image.naturalWidth || 1;
      const natH = image.naturalHeight || 1;
      const w = Math.max(1, Math.min(natW, 540));
      const h = Math.max(1, Math.round((w * natH) / natW));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return "tainted";
      ctx.drawImage(image, 0, 0, w, h);
      return { data: ctx.getImageData(0, 0, w, h).data, w, h };
    } catch {
      return "tainted";
    }
  }
}

/**
 * Nuqta ostidagi eng yuqori qatlamni topadi. Rasm qatlamining shaffof joyini
 * bossangiz, tanlov pastdagi qatlamga "o'tib ketadi".
 */
export function hitTestLayers(
  layers: EditorLayer[],
  pt: Point,
  options: { width: number; height: number; images: Record<string, HTMLImageElement | undefined>; alpha: AlphaHitCache; textSlop?: number },
): EditorLayer | null {
  const candidates = layers.filter((l) => !l.deleted && l.visible).sort((a, b) => b.order - a.order);
  for (const layer of candidates) {
    if (layer.kind === "text") {
      if (hitTextLayer(layer, pt, options.textSlop ?? 0)) return layer;
      continue;
    }
    const rect = imageBounds(layer, options.width, options.height);
    if (!inRect(pt, rect)) continue;
    const image = options.images[layer.id];
    if (!image || !image.complete || !image.naturalWidth) continue;
    const u = (pt.x - rect.x) / rect.width;
    const v = (pt.y - rect.y) / rect.height;
    const opaque = options.alpha.probe(layer.id, image, u, v);
    if (opaque === null || opaque) return layer;
  }
  return null;
}

export const SELECTION_COLOR = "#ff4d1c";

/** Tanlangan qatlam ramkasi va tutqichlari. `unit` — 1 CSS px necha kanvas px. */
export function drawSelection(ctx: CanvasRenderingContext2D, layer: EditorLayer, width: number, height: number, unit: number, handleRadiusCss = 7): void {
  const rect = selectionRect(layer, width, height);
  const rotation = layer.kind === "text" ? layer.rotation : 0;
  ctx.save();
  applyRotation(ctx, rect, rotation);
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2 * unit;
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.setLineDash([]);

  const radius = handleRadiusCss * unit;
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2 * unit;
  for (const handle of handlePoints(rect, layer.kind === "text")) {
    ctx.beginPath();
    if (handle.id === "e" || handle.id === "w") {
      roundRectPath(ctx, { x: handle.x - radius * 0.55, y: handle.y - radius * 1.5, width: radius * 1.1, height: radius * 3 }, radius * 0.55);
    } else {
      ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
