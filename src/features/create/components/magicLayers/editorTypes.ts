import type { GenerationLayer, GenerationRect, GenerationTextLayer } from "../../domain/types";

type LayerBase = {
  id: string;
  name: string;
  /** Z-tartib: kattaroq — yuqoriroq. */
  order: number;
  opacity: number;
  visible: boolean;
  deleted: boolean;
};

/** Ixtiyoriy rastr qatlam (AI ajratgan shaffof PNG). Butun kanvas o'lchamida chiziladi. */
export type ImageLayerItem = LayerBase & {
  kind: "image";
  url: string;
  /** Markazning siljishi (kanvas px). */
  x: number;
  y: number;
  scale: number;
};

/** Matnning ko'rinishini belgilaydigan maydonlar — "asl holat" shular bilan solishtiriladi. */
export type TextStyle = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  fontFamily: string;
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  background: string | null;
  rotation: number;
};

/**
 * Matn qatlami.
 *
 * Rasmdan aniqlangan matn (`pristine` bor) o'zgarmaguncha CHIZILMAYDI —
 * asl piksellar ko'rinadi. O'zgargach: `source` joyi toza fondan "yamaladi"
 * va yangi matn chiziladi. Foydalanuvchi qo'shgan matnda `pristine` yo'q —
 * u doim chiziladi.
 */
export type TextLayerItem = LayerBase & TextStyle & {
  kind: "text";
  /** Kenglikka sig'magan matn shriftini avtomatik kichraytirish. */
  autoFit: boolean;
  /** Asl yozuvni o'chirish uchun quti (rasm px). Qo'shilgan matnda — null. */
  source: GenerationRect | null;
  /** Aniqlangan asl holat. null — foydalanuvchi qo'shgan matn. */
  pristine: TextStyle | null;
};

export type EditorLayer = ImageLayerItem | TextLayerItem;

export type TextPatch = Partial<Omit<TextLayerItem, "kind" | "id" | "pristine" | "source">>;

/** Muharrirdagi shriftlar (index.html'da Google Fonts'dan yuklanadi) + Arial. */
export const FONT_FAMILIES = ["Inter", "Montserrat", "Oswald", "Anton", "Playfair Display", "Nunito", "Caveat", "Arial"] as const;

export const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;

export const COLOR_SWATCHES = ["#FFFFFF", "#111111", "#FF4D1C", "#FFD60A", "#1E88E5", "#2E7D32", "#E91E63"];

export const PLATE_SWATCHES = ["#FFFFFF", "#111111", "#FF4D1C", "#FFD60A", "#1E88E5"];

const STYLE_KEYS: Array<keyof TextStyle> = [
  "text", "x", "y", "width", "fontSize", "fontWeight", "color", "align", "fontFamily",
  "lineHeight", "letterSpacing", "uppercase", "background", "rotation",
];

export function newLocalId(prefix: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now().toString(16)}${random}`;
}

function clampNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split("").map((c) => c + c).join("")}`.toUpperCase();
  return fallback;
}

export function firstLine(text: string, max = 28): string {
  const line = text.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function pickStyle(layer: TextStyle): TextStyle {
  const out = {} as Record<string, unknown>;
  for (const key of [...STYLE_KEYS, "height" as const]) out[key] = layer[key];
  return out as TextStyle;
}

/**
 * Matn o'zgarganmi (chizilishi kerakmi). Qo'shilgan matn — doim "o'zgargan".
 * Balandlik hisoblanadigan qiymat — solishtirilmaydi.
 */
export function isTextDirty(layer: TextLayerItem): boolean {
  if (!layer.pristine) return true;
  if (layer.deleted || !layer.visible || layer.opacity < 1) return true;
  const p = layer.pristine;
  return STYLE_KEYS.some((key) => {
    const a = layer[key];
    const b = p[key];
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) > 0.01;
    return a !== b;
  });
}

/** Matnni aniqlangan holatiga qaytaradi (tegilmagan — yana chizilmaydi). */
export function resetTextLayer(layer: TextLayerItem): TextLayerItem {
  if (!layer.pristine) return layer;
  return { ...layer, ...layer.pristine, name: firstLine(layer.pristine.text) || layer.name, opacity: 1, visible: true, deleted: false };
}

/** O'chirish uchun quti: serverdan kelmagan bo'lsa — zich qutini biroz kengaytiramiz. */
function fallbackSource(t: { x: number; y: number; width: number; height: number; fontSize: number }): GenerationRect {
  const pad = Math.round(Math.max(4, t.fontSize * 0.18));
  return { x: t.x - pad, y: t.y - pad, width: t.width + pad * 2, height: t.height + pad * 2 };
}

/** Serverdan kelgan qatlamlarni muharrir holatiga aylantiradi. */
export function buildEditorLayers(
  raster: GenerationLayer[],
  text: GenerationTextLayer[] | undefined,
  defaults: { width: number; height: number; layerLabel: string; textLabel: string },
): EditorLayer[] {
  const sorted = [...raster].sort((a, b) => a.order - b.order);
  const images: ImageLayerItem[] = sorted.map((layer, index) => ({
    kind: "image",
    id: layer.id,
    name: layer.name || `${defaults.layerLabel} ${layer.order}`,
    url: layer.url,
    order: index + 1,
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    visible: true,
    deleted: false,
  }));

  const texts: TextLayerItem[] = (text ?? [])
    .filter((t) => t && typeof t.text === "string")
    .map((t, index) => {
      const fontSize = clampNumber(t.fontSize, 48, 4, 1000);
      const style: TextStyle = {
        text: t.text,
        x: Math.round(clampNumber(t.x, 0)),
        y: Math.round(clampNumber(t.y, 0)),
        width: Math.round(clampNumber(t.width, defaults.width * 0.6, 8, defaults.width * 3)),
        height: Math.round(clampNumber(t.height, fontSize * 1.2, 1)),
        fontSize,
        fontWeight: Math.round(clampNumber(t.fontWeight, 700, 100, 900) / 100) * 100,
        color: normalizeHex(t.color, "#111111"),
        align: t.align === "center" || t.align === "right" ? t.align : "left",
        fontFamily: t.fontFamily || "Inter",
        lineHeight: clampNumber(t.lineHeight, 1.15, 0.6, 3),
        letterSpacing: clampNumber(t.letterSpacing, 0, -fontSize, fontSize),
        uppercase: Boolean(t.uppercase),
        background: t.background ? normalizeHex(t.background, "#FFFFFF") : null,
        rotation: clampNumber(t.rotation, 0),
      };
      const src = t.source;
      const source = src && [src.x, src.y, src.width, src.height].every((v) => typeof v === "number" && Number.isFinite(v)) && src.width > 0 && src.height > 0
        ? { x: src.x, y: src.y, width: src.width, height: src.height }
        : fallbackSource(style);
      return {
        kind: "text",
        id: t.id || newLocalId("text"),
        name: firstLine(t.text) || `${defaults.textLabel} ${index + 1}`,
        order: images.length + index + 1,
        ...style,
        autoFit: true,
        source,
        pristine: style,
        opacity: 1,
        visible: true,
        deleted: false,
      };
    });

  return [...images, ...texts];
}

/** Tartibni 1..n ga qayta raqamlaydi (o'chirilganlar ham joyini saqlaydi). */
export function normalizeOrders(layers: EditorLayer[]): EditorLayer[] {
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  const orderById = new Map(sorted.map((l, i) => [l.id, i + 1]));
  return layers.map((l) => (l.order === orderById.get(l.id) ? l : { ...l, order: orderById.get(l.id) ?? l.order }));
}
