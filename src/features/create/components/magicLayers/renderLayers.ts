/**
 * Magic Layers v3: kanvasga chizish, matnni joylash, geometriya va hit-test.
 *
 * Sahna: asl rasm (o'zgarmaydi) → ixtiyoriy rastr qatlamlar → o'zgargan
 * matnlar ostidagi "yamoq" (toza fondan) → yangi matnlar. Tegilmagan matnlar
 * umuman chizilmaydi — asl piksellar ko'rinadi.
 *
 * React'siz toza funksiyalar — muharrir ham, eksport ham bir xil kod bilan
 * chizadi, shuning uchun ekranda ko'ringan narsa faylda ham aynan shunday.
 */
import { isTextDirty, type EditorLayer, type ImageLayerItem, type TextLayerItem } from "./editorTypes";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type HandleId = "nw" | "ne" | "se" | "sw" | "e" | "w";

/* ------------------------------------------------------------------ */
/* Shriftlar                                                           */
/* ------------------------------------------------------------------ */

const FAMILY_STACKS: Record<string, string> = {
  Inter: '"Inter", "Helvetica Neue", Arial, sans-serif',
  Montserrat: '"Montserrat", "Inter", Arial, sans-serif',
  Oswald: '"Oswald", "Arial Narrow", Arial, sans-serif',
  Anton: '"Anton", "Oswald", Impact, sans-serif',
  "Playfair Display": '"Playfair Display", Georgia, "Times New Roman", serif',
  Nunito: '"Nunito", "Inter", Arial, sans-serif',
  Caveat: '"Caveat", "Segoe Print", cursive',
  Arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
};

/** Google Fonts'dan yuklanadigan (tizimda bo'lmasligi mumkin) shriftlar. */
const WEB_FONTS = new Set(["Inter", "Montserrat", "Oswald", "Anton", "Playfair Display", "Nunito", "Caveat"]);

export function fontStack(family: string): string {
  return FAMILY_STACKS[family] ?? `"${family.replace(/"/g, "")}", "Inter", Arial, sans-serif`;
}

export function fontSpec(layer: Pick<TextLayerItem, "fontFamily" | "fontWeight">, size: number): string {
  return `${Math.round(layer.fontWeight)} ${Math.max(1, size)}px ${fontStack(layer.fontFamily)}`;
}

/** Lotin, kirill va o'zbekcha harflar — shu belgilar uchun subsetlar ham yuklanadi. */
const FONT_SAMPLE = "AaBbÑñ0123 АаЁёЯя ЎўҚқҒғҲҳ Oʻoʻ Gʻgʻ";

/**
 * Matn qatlamlari ishlatadigan shriftlar yuklanishini kutadi (`document.fonts.load`).
 * Chizish va eksportdan oldin chaqiriladi. Hech qachon xato tashlamaydi;
 * ko'pi bilan `timeoutMs` kutadi.
 */
export async function ensureFonts(
  layers: Array<Pick<TextLayerItem, "fontFamily" | "fontWeight">>,
  timeoutMs = 5000,
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const specs = new Set<string>();
  for (const layer of layers) {
    if (!WEB_FONTS.has(layer.fontFamily)) continue;
    specs.add(`${Math.round(layer.fontWeight)} 32px "${layer.fontFamily}"`);
  }
  if (!specs.size) return;
  const work = Promise.all([...specs].map((spec) => document.fonts.load(spec, FONT_SAMPLE).catch(() => [])))
    .then(() => undefined)
    .catch(() => undefined);
  let timer = 0;
  await Promise.race([work, new Promise<void>((resolve) => { timer = window.setTimeout(resolve, timeoutMs); })]);
  window.clearTimeout(timer);
}

/* ------------------------------------------------------------------ */
/* O'lchash                                                            */
/* ------------------------------------------------------------------ */

let measureContext: CanvasRenderingContext2D | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureContext && typeof document !== "undefined") {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  return measureContext;
}

const NATIVE_LETTER_SPACING = typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;

type CtxWithSpacing = CanvasRenderingContext2D & { letterSpacing?: string };

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if (NATIVE_LETTER_SPACING) (ctx as CtxWithSpacing).letterSpacing = `${px}px`;
}

type LineMetrics = { advance: number; left: number; right: number; ascent: number; descent: number };

/** Qator o'lchami. `left/right` — `textAlign=left` dagi nuqtadan siyoh chetlarigacha. */
function measureLine(ctx: CanvasRenderingContext2D, text: string, spacing: number): LineMetrics {
  if (!text) return { advance: 0, left: 0, right: 0, ascent: 0, descent: 0 };
  setSpacing(ctx, spacing);
  const m = ctx.measureText(text);
  if (NATIVE_LETTER_SPACING || !spacing) {
    // Oxirgi harfdan keyingi bo'shliq siyohga kirmaydi.
    return { advance: m.width, left: m.actualBoundingBoxLeft || 0, right: m.actualBoundingBoxRight || m.width, ascent: m.actualBoundingBoxAscent || 0, descent: m.actualBoundingBoxDescent || 0 };
  }
  const extra = spacing * Math.max(0, Array.from(text).length - 1);
  return { advance: m.width + extra, left: m.actualBoundingBoxLeft || 0, right: (m.actualBoundingBoxRight || m.width) + extra, ascent: m.actualBoundingBoxAscent || 0, descent: m.actualBoundingBoxDescent || 0 };
}

function fillLine(ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number, spacing: number) {
  if (!text) return;
  if (NATIVE_LETTER_SPACING || !spacing) {
    setSpacing(ctx, spacing);
    ctx.fillText(text, x, baseline);
    return;
  }
  // Eski brauzerlar: harfma-harf.
  let cursor = x;
  for (const char of Array.from(text)) {
    ctx.fillText(char, cursor, baseline);
    cursor += ctx.measureText(char).width + spacing;
  }
}

/* ------------------------------------------------------------------ */
/* Matnni joylash                                                      */
/* ------------------------------------------------------------------ */

export type TextLayout = {
  /** Haqiqiy (avto-o'lcham hisobga olingan) kegl va harf oralig'i. */
  fontSize: number;
  letterSpacing: number;
  lines: string[];
  lineHeightPx: number;
  draws: Array<{ text: string; x: number; baseline: number }>;
  /** Matn egallagan quti (quti + chetga chiqqan siyoh). */
  rect: Rect;
  /** Plashka bilan birga — tanlash va hit-test shu bo'yicha. */
  outer: Rect;
  padX: number;
  padY: number;
  /** Textarea uchun: birinchi CSS qator qutisining yuqorisi. */
  lineBoxTop: number;
  /** Textarea uchun: gorizontal oraliq (advance bo'yicha). */
  areaLeft: number;
  areaWidth: number;
};

export function displayText(layer: Pick<TextLayerItem, "text" | "uppercase">, text = layer.text): string {
  return layer.uppercase ? text.toLocaleUpperCase() : text;
}

/** Plashka (background) paddingi — kegl bo'yicha. */
export function platePadding(background: string | null, fontSize: number): { padX: number; padY: number } {
  if (!background) return { padX: 0, padY: 0 };
  return { padX: Math.round(fontSize * 0.35), padY: Math.round(fontSize * 0.2) };
}

/**
 * Matnni qutiga joylaydi. Qatorlar faqat "\n" bo'yicha bo'linadi (avtomatik
 * ko'chirish yo'q — asl yozuv qanday bo'lsa, shunday). Siyoh qutining
 * yuqorisidan boshlanadi; tekislash siyoh bo'yicha: chap — chap chet, markaz —
 * qutining markazi, o'ng — o'ng chet. Avto-o'lcham yoqilgan bo'lsa, eng uzun
 * qator quti kengligiga sig'guncha kegl kichrayadi (kattalashmaydi).
 */
export function layoutText(layer: TextLayerItem, textOverride?: string): TextLayout {
  const text = displayText(layer, textOverride ?? layer.text);
  const lines = text.split("\n");
  const ctx = getMeasureContext();
  let fontSize = layer.fontSize;
  let spacing = layer.letterSpacing || 0;

  const measureAll = (size: number, ls: number): LineMetrics[] => {
    if (!ctx) return lines.map((l) => ({ advance: l.length * size * 0.55, left: 0, right: l.length * size * 0.55, ascent: size * 0.72, descent: size * 0.2 }));
    ctx.font = fontSpec(layer, size);
    return lines.map((l) => measureLine(ctx, l, ls));
  };
  const inkWidth = (m: LineMetrics) => Math.max(0, m.left + m.right);

  let metrics = measureAll(fontSize, spacing);
  if (layer.autoFit && layer.width > 0) {
    for (let i = 0; i < 4; i += 1) {
      const widest = Math.max(0, ...metrics.map(inkWidth));
      if (widest <= layer.width * 1.001 || widest <= 0) break;
      const factor = (layer.width / widest) * (i < 3 ? 1 : 0.995);
      fontSize = Math.max(4, fontSize * factor);
      spacing *= factor;
      metrics = measureAll(fontSize, spacing);
    }
  }

  let capHeight = fontSize * 0.72;
  let fontAscent = fontSize * 0.92;
  let fontDescent = fontSize * 0.24;
  if (ctx) {
    ctx.font = fontSpec(layer, fontSize);
    setSpacing(ctx, 0);
    const cap = ctx.measureText("H");
    if (cap.actualBoundingBoxAscent) capHeight = cap.actualBoundingBoxAscent;
    const fm = ctx.measureText("Hg");
    if (fm.fontBoundingBoxAscent) fontAscent = fm.fontBoundingBoxAscent;
    if (fm.fontBoundingBoxDescent) fontDescent = fm.fontBoundingBoxDescent;
  }

  const lineHeightPx = fontSize * layer.lineHeight;
  const firstAscent = Math.max(capHeight, metrics[0]?.ascent ?? 0);
  const firstBaseline = layer.y + firstAscent;
  const boxLeft = layer.x;
  const boxRight = layer.x + layer.width;
  const boxCenter = layer.x + layer.width / 2;

  let inkMin = Infinity;
  let inkMax = -Infinity;
  const draws = lines.map((line, index) => {
    const m = metrics[index];
    const iw = inkWidth(m);
    const inkLeft = layer.align === "center" ? boxCenter - iw / 2 : layer.align === "right" ? boxRight - iw : boxLeft;
    if (line) {
      inkMin = Math.min(inkMin, inkLeft);
      inkMax = Math.max(inkMax, inkLeft + iw);
    }
    return { text: line, x: inkLeft + m.left, baseline: firstBaseline + index * lineHeightPx };
  });

  const last = metrics[metrics.length - 1];
  const lastDescent = last && last.advance > 0 ? Math.max(0, last.descent) : fontSize * 0.05;
  const height = Math.max(fontSize * 0.5, firstAscent + (lines.length - 1) * lineHeightPx + lastDescent);
  const left = Math.min(boxLeft, Number.isFinite(inkMin) ? inkMin : boxLeft);
  const right = Math.max(boxRight, Number.isFinite(inkMax) ? inkMax : boxRight);
  const rect = { x: left, y: layer.y, width: right - left, height };
  const { padX, padY } = platePadding(layer.background, fontSize);
  const outer = { x: rect.x - padX, y: rect.y - padY, width: rect.width + padX * 2, height: rect.height + padY * 2 };

  const maxAdvance = Math.max(layer.width, ...metrics.map((m) => m.advance)) + fontSize * 0.1;
  const areaLeft = layer.align === "center" ? boxCenter - maxAdvance / 2 : layer.align === "right" ? boxRight - maxAdvance : boxLeft;
  const halfLeading = (lineHeightPx - (fontAscent + fontDescent)) / 2;

  return {
    fontSize,
    letterSpacing: spacing,
    lines,
    lineHeightPx,
    draws,
    rect,
    outer,
    padX,
    padY,
    lineBoxTop: firstBaseline - halfLeading - fontAscent,
    areaLeft,
    areaWidth: maxAdvance,
  };
}

/** Tegilmagan matn: asl rasmda turgan zich qutisi. */
export function isUntouched(layer: TextLayerItem): boolean {
  return Boolean(layer.pristine) && !isTextDirty(layer);
}

/** Tanlash/hit-test uchun quti. */
export function textRect(layer: TextLayerItem): Rect {
  if (isUntouched(layer)) return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  return layoutText(layer).outer;
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

export function drawTextItem(ctx: CanvasRenderingContext2D, layer: TextLayerItem, options: { glyphs?: boolean } = {}): void {
  const layout = layoutText(layer);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  applyRotation(ctx, layout.outer, layer.rotation);

  if (layer.background) {
    roundRectPath(ctx, layout.outer, Math.round(layout.fontSize * 0.3));
    ctx.fillStyle = layer.background;
    ctx.fill();
  }

  if (options.glyphs !== false) {
    ctx.font = fontSpec(layer, layout.fontSize);
    ctx.fillStyle = layer.color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    for (const draw of layout.draws) fillLine(ctx, draw.text, draw.x, draw.baseline, layout.letterSpacing);
    setSpacing(ctx, 0);
  }
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

function isReady(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

function clipRect(r: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const right = Math.min(width, Math.ceil(r.x + r.width));
  const bottom = Math.min(height, Math.ceil(r.y + r.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Rasmning `r` qismini kanvasning aynan shu joyiga ko'chiradi (rasm o'lchami boshqacha bo'lsa ham). */
function copyRegion(ctx: CanvasRenderingContext2D, image: HTMLImageElement, r: Rect, width: number, height: number) {
  const sx = image.naturalWidth / width;
  const sy = image.naturalHeight / height;
  ctx.drawImage(image, r.x * sx, r.y * sy, r.width * sx, r.height * sy, r.x, r.y, r.width, r.height);
}

export type SceneOptions = {
  width: number;
  height: number;
  /** Asl rasm — o'zgarmaydigan asos. */
  base?: HTMLImageElement;
  /** Matnsiz toza fon (yamoqlar shundan olinadi). */
  clean?: HTMLImageElement;
  layers: EditorLayer[];
  images: Record<string, HTMLImageElement | undefined>;
  /** Toza fon bo'lmasa — yamoq rangi (asl rasm atrofidan olingan). */
  fills?: Record<string, string>;
  /** Shu matn ustida textarea ochiq: yamoq chiziladi, harflar — yo'q. */
  editingId?: string | null;
};

/** Butun sahna: asl rasm → rastr qatlamlar → yamoqlar → o'zgargan matnlar. */
export function renderScene(ctx: CanvasRenderingContext2D, options: SceneOptions): void {
  const { width, height, base, clean, layers, images, fills = {}, editingId } = options;
  ctx.clearRect(0, 0, width, height);
  if (isReady(base)) ctx.drawImage(base, 0, 0, width, height);

  const imageLayers = layers.filter((l): l is ImageLayerItem => l.kind === "image" && !l.deleted && l.visible).sort((a, b) => a.order - b.order);
  let rasterDrawn = false;
  for (const layer of imageLayers) {
    const image = images[layer.id];
    if (isReady(image)) {
      drawImageItem(ctx, layer, image, width, height);
      rasterDrawn = true;
    }
  }

  const texts = layers.filter((l): l is TextLayerItem => l.kind === "text").sort((a, b) => a.order - b.order);
  const patched = texts.filter((t) => t.pristine && t.source && (isTextDirty(t) || t.id === editingId));
  const patchRects: Rect[] = [];
  for (const t of patched) {
    const r = clipRect(t.source!, width, height);
    if (!r) continue;
    patchRects.push(r);
    if (isReady(clean)) {
      copyRegion(ctx, clean, r, width, height);
    } else {
      ctx.fillStyle = fills[t.id] ?? t.background ?? "#FFFFFF";
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
  }

  // Yamoq qo'shni (tegilmagan) yozuvga tegib ketsa — uning asl piksellarini qaytaramiz.
  if (patchRects.length && !rasterDrawn && isReady(base)) {
    for (const t of texts) {
      if (t.id === editingId || !isUntouched(t)) continue;
      const pad = Math.max(2, t.fontSize * 0.06);
      const own = clipRect({ x: t.x - pad, y: t.y - pad, width: t.width + pad * 2, height: t.height + pad * 2 }, width, height);
      if (!own) continue;
      for (const p of patchRects) {
        const overlap = intersect(own, p);
        if (overlap) copyRegion(ctx, base, overlap, width, height);
      }
    }
  }

  for (const t of texts) {
    if (t.deleted || !t.visible || isUntouched(t)) continue;
    drawTextItem(ctx, t, { glyphs: t.id !== editingId });
  }
}

/**
 * Toza fon bo'lmaganda: har matn `source` qutisi atrofidagi halqadan
 * (asl rasm) median rangni oladi. Kanvas CORS bilan ifloslangan bo'lsa — {}.
 */
export function sampleFillColors(base: HTMLImageElement, width: number, height: number, texts: TextLayerItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  const targets = texts.filter((t) => t.pristine && t.source);
  if (!targets.length) return out;
  let data: Uint8ClampedArray;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return out;
    ctx.drawImage(base, 0, 0, width, height);
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return out;
  }
  for (const t of targets) {
    const s = t.source!;
    const band = 4;
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    const push = (x: number, y: number) => {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= width || py >= height) return;
      const i = (py * width + px) * 4;
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    };
    const stepX = Math.max(1, s.width / 120);
    const stepY = Math.max(1, s.height / 60);
    for (let d = 1; d <= band; d += 1) {
      for (let x = s.x - band; x <= s.x + s.width + band; x += stepX) {
        push(x, s.y - d);
        push(x, s.y + s.height + d - 1);
      }
      for (let y = s.y; y <= s.y + s.height; y += stepY) {
        push(s.x - d, y);
        push(s.x + s.width + d - 1, y);
      }
    }
    if (!rs.length) continue;
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    out[t.id] = `#${hex(median(rs))}${hex(median(gs))}${hex(median(bs))}`.toUpperCase();
  }
  return out;
}

/** To'liq o'lchamdagi yakuniy rasm (eksport uchun): asl rasm + yamoqlar + matnlar. */
export async function composeScene(options: Omit<SceneOptions, "editingId">): Promise<HTMLCanvasElement> {
  await ensureFonts(options.layers.filter((l): l is TextLayerItem => l.kind === "text" && !l.deleted && !isUntouched(l)));
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
  return layer.kind === "image" ? imageBounds(layer, width, height) : textRect(layer);
}

export function hitHandle(layer: EditorLayer, pt: Point, width: number, height: number, hitRadius: number): HandleId | null {
  const rect = selectionRect(layer, width, height);
  const local = layer.kind === "text" ? toLocal(pt, rect, layer.rotation) : pt;
  for (const handle of handlePoints(rect, layer.kind === "text")) {
    if (Math.hypot(local.x - handle.x, local.y - handle.y) <= hitRadius) return handle.id;
  }
  return null;
}

/**
 * Rastr qatlam pikselining shaffofligini tekshirish uchun kesh.
 * Kanvas CORS bilan ifloslangan bo'lsa — `null` (to'rtburchak bo'yicha tekshiriladi).
 */
export class AlphaHitCache {
  private entries = new Map<string, { data: Uint8ClampedArray; w: number; h: number } | "tainted">();

  clear(): void {
    this.entries.clear();
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
 * Nuqta ostidagi qatlam: avval matnlar (bir nechtasi ustma-ust bo'lsa —
 * eng kichigi, teng bo'lsa — eng yuqorisi), keyin rastr qatlamlar.
 */
export function hitTestLayers(
  layers: EditorLayer[],
  pt: Point,
  options: { width: number; height: number; images: Record<string, HTMLImageElement | undefined>; alpha: AlphaHitCache; textSlop?: number },
): EditorLayer | null {
  const visible = layers.filter((l) => !l.deleted && l.visible);
  let best: { layer: TextLayerItem; area: number } | null = null;
  for (const layer of visible) {
    if (layer.kind !== "text") continue;
    const rect = textRect(layer);
    if (!inRect(toLocal(pt, rect, layer.rotation), rect, options.textSlop ?? 0)) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area - 1 || (Math.abs(area - best.area) <= 1 && layer.order > best.layer.order)) best = { layer, area };
  }
  if (best) return best.layer;

  const images = visible.filter((l): l is ImageLayerItem => l.kind === "image").sort((a, b) => b.order - a.order);
  for (const layer of images) {
    const rect = imageBounds(layer, options.width, options.height);
    if (!inRect(pt, rect)) continue;
    const image = options.images[layer.id];
    if (!image || !image.complete || !image.naturalWidth) continue;
    const opaque = options.alpha.probe(layer.id, image, (pt.x - rect.x) / rect.width, (pt.y - rect.y) / rect.height);
    if (opaque === null || opaque) return layer;
  }
  return null;
}

export const SELECTION_COLOR = "#ff4d1c";

/** Tahrirlanadigan matn ko'rsatkichi: nozik shtrix ramka (har qanday fonda ko'rinadi). */
export function drawOutline(ctx: CanvasRenderingContext2D, rect: Rect, rotation: number, unit: number, strong = false): void {
  const pad = 4 * unit;
  const r = { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  ctx.save();
  applyRotation(ctx, r, rotation);
  ctx.lineWidth = (strong ? 2 : 1.5) * unit;
  ctx.setLineDash([5 * unit, 4 * unit]);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.lineDashOffset = 4.5 * unit;
  ctx.strokeStyle = strong ? SELECTION_COLOR : "rgba(255, 255, 255, 0.9)";
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.restore();
}

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
