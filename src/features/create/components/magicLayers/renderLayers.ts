/**
 * Magic Layers v4: kanvasga chizish va matnni joylash.
 *
 * Sahna: fon (rasm yoki rang) → obyektlar (RGBA kesmalar, `order` bo'yicha)
 * → matnlar. Matn avval asl harflar kesmasi bilan chiziladi (piksel-ma-piksel
 * asl rasm), o'zgargach — shrift bilan.
 *
 * React'siz toza funksiyalar — muharrir ham, eksport ham bir xil kod bilan
 * chizadi, shuning uchun ekranda ko'ringan narsa faylda ham aynan shunday.
 */
import { groupOf, usesCutout, type BackgroundState, type EditorLayer, type ElementItem, type TextLayerItem } from "./editorTypes";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type HandleId = "nw" | "ne" | "se" | "sw" | "e" | "w" | "rot";

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
/** Kesma rejimidagi matnning joriy qutisi: asl `imageBox`, joriy joy va masshtab bo'yicha. */
export function cutoutRect(layer: TextLayerItem): Rect | null {
  const box = layer.imageBox;
  const p = layer.pristine;
  if (!box || !p) return null;
  const s = p.fontSize > 0 ? layer.fontSize / p.fontSize : 1;
  return {
    x: layer.x + (box.x - p.x) * s,
    y: layer.y + (box.y - p.y) * s,
    width: box.width * s,
    height: box.height * s,
  };
}

/** Tanlash/hit-test uchun quti (aylantirilmagan; aylantirish — markaz atrofida). */
export function textRect(layer: TextLayerItem): Rect {
  if (usesCutout(layer)) {
    const r = cutoutRect(layer);
    if (r) return r;
  }
  return layoutText(layer).outer;
}

/* ------------------------------------------------------------------ */
/* Chizish                                                             */
/* ------------------------------------------------------------------ */

/** Yuklangan (CORS-xavfsiz) rasm. */
export type Drawable = { image: CanvasImageSource; width: number; height: number };
export type ImageMap = Record<string, Drawable | undefined>;

export function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rad);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rad);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rad);
  ctx.closePath();
}

export function applyRotation(ctx: CanvasRenderingContext2D, rect: Rect, degrees: number) {
  if (!degrees) return;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

/** Matnni shrift bilan chizadi. `glyphs: false` — faqat plashka (textarea ochiq). */
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

/** Asl harflar kesmasini joriy joyi/masshtabi/burchagi bilan chizadi. */
export function drawCutout(ctx: CanvasRenderingContext2D, layer: TextLayerItem, image: Drawable): void {
  const r = cutoutRect(layer);
  if (!r) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  applyRotation(ctx, r, layer.rotation);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image.image, r.x, r.y, r.width, r.height);
  ctx.restore();
}

export function drawElement(ctx: CanvasRenderingContext2D, layer: ElementItem, image: Drawable): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  if (layer.flipX || layer.flipY) ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image.image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();
}

export type SceneOptions = {
  width: number;
  height: number;
  /** Fon rasmi (obyekt va matnlarsiz). */
  backgroundImage?: Drawable;
  background: BackgroundState;
  layers: EditorLayer[];
  /** URL → yuklangan rasm. */
  images: ImageMap;
  /** Shu matn ustida textarea ochiq: harflar chizilmaydi. */
  editingId?: string | null;
};

/** Butun sahna: fon → obyektlar → matnlar. Rasm yuklanmagan bo'lsa — hech narsa chizilmaydi (oq quti emas). */
export function renderScene(ctx: CanvasRenderingContext2D, options: SceneOptions): void {
  const { width, height, backgroundImage, background, layers, images, editingId } = options;
  ctx.clearRect(0, 0, width, height);
  if (background.visible) {
    if (background.color) {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, width, height);
    } else if (backgroundImage) {
      ctx.drawImage(backgroundImage.image, 0, 0, width, height);
    }
  }

  for (const layer of groupOf(layers, "element") as ElementItem[]) {
    if (layer.deleted || !layer.visible) continue;
    const image = images[layer.url];
    if (image) drawElement(ctx, layer, image);
  }

  for (const layer of groupOf(layers, "text") as TextLayerItem[]) {
    if (layer.deleted || !layer.visible) continue;
    const editing = layer.id === editingId;
    if (usesCutout(layer)) {
      if (editing) continue;
      const image = layer.imageUrl ? images[layer.imageUrl] : undefined;
      // Kesma yuklanmagan bo'lsa — shrift bilan (banner foydalanuvchiga aytadi).
      if (image) drawCutout(ctx, layer, image);
      else drawTextItem(ctx, layer);
      continue;
    }
    drawTextItem(ctx, layer, { glyphs: !editing });
  }
}

/** Faqat asl rasm ("Asl rasm" bilan solishtirish). */
export function renderOriginal(ctx: CanvasRenderingContext2D, width: number, height: number, base: Drawable | undefined): void {
  ctx.clearRect(0, 0, width, height);
  if (base) ctx.drawImage(base.image, 0, 0, width, height);
}

/** To'liq o'lchamdagi yakuniy rasm (eksport uchun). Shriftlar yuklanishini kutadi. */
export async function composeScene(options: Omit<SceneOptions, "editingId">): Promise<HTMLCanvasElement> {
  await ensureFonts(options.layers.filter((l): l is TextLayerItem => l.kind === "text" && !l.deleted && l.visible && !usesCutout(l)));
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
