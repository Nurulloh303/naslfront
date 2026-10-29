import type { GenerationElement, GenerationRect, GenerationTextLayer } from "../../domain/types";

/**
 * Magic Layers v4/v5 muharriri holati.
 *
 * Sahna (pastdan yuqoriga): fon → obyektlar (`order` bo'yicha) → matnlar
 * (`order` bo'yicha). Obyekt va matnlar o'z guruhi ichida tartiblanadi.
 */

export type Rect = { x: number; y: number; width: number; height: number };

type LayerBase = {
  id: string;
  name: string;
  /** Guruh ichidagi Z-tartib: kattaroq — yuqoriroq. */
  order: number;
  opacity: number;
  visible: boolean;
  /** Qulflangan: tanlanadi, lekin surilmaydi/o'zgarmaydi/o'chirilmaydi. */
  locked: boolean;
  deleted: boolean;
};

/** Rasmdan ajratilgan obyekt (RGBA kesma). */
export type ElementItem = LayerBase & {
  kind: "element";
  elementKind: "product" | "graphic";
  url: string;
  /** Aylantirilmagan quti (rasm px). Aylantirish — markaz atrofida. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** Asl joyi — "Asl joyiga qaytarish" uchun. */
  original: Rect;
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
 * Aniqlangan matn avval asl harflar kesmasi (`imageUrl`, `imageBox`) sifatida
 * chiziladi — asl rasm bilan aynan bir xil. Surish/o'lchash/aylantirish
 * kesmani o'zgartiradi. Matn yoki tipografiya o'zgarsa (`rendered: true`) —
 * shrift bilan chiziladi.
 */
export type TextLayerItem = LayerBase & TextStyle & {
  kind: "text";
  /** Kenglikka sig'magan matn shriftini avtomatik kichraytirish. */
  autoFit: boolean;
  /** Asl harflar kesmasi. null — yo'q (doim shrift bilan). */
  imageUrl: string | null;
  /** Kesmaning ASL joyi (rasm px, `pristine` holatiga nisbatan). */
  imageBox: Rect | null;
  /** true — shrift bilan chiziladi; false — kesma rasmi. */
  rendered: boolean;
  /** Aniqlangan asl holat. null — foydalanuvchi qo'shgan matn. */
  pristine: TextStyle | null;
};

export type EditorLayer = ElementItem | TextLayerItem;

export type BackgroundState = {
  visible: boolean;
  /** null — asl fon rasmi; aks holda bir xil rang. */
  color: string | null;
  /**
   * Joriy fon rasmi URL'i (v5: "Bosib ajratish" har safar yangi fon qaytaradi).
   * null — manbadagi `backgroundUrl`. Tarixda saqlanadi — undo eski fonni qaytaradi.
   */
  imageUrl: string | null;
};

export type EditorState = {
  layers: EditorLayer[];
  background: BackgroundState;
};

export const BACKGROUND_ID = "__background";

export type TextPatch = Partial<Omit<TextLayerItem, "kind" | "id" | "pristine" | "imageUrl" | "imageBox">>;
export type ElementPatch = Partial<Omit<ElementItem, "kind" | "id" | "url" | "original">>;

/** Shu maydonlardan biri o'zgarsa — matn kesmadan shrift bilan chizishga o'tadi. */
export const TYPOGRAPHY_KEYS = [
  "text", "fontFamily", "fontWeight", "color", "fontSize", "letterSpacing", "uppercase", "align", "background", "lineHeight",
] as const;

/** Muharrirdagi shriftlar (index.html'da Google Fonts'dan yuklanadi) + Arial. */
export const FONT_FAMILIES = ["Inter", "Montserrat", "Oswald", "Anton", "Playfair Display", "Nunito", "Caveat", "Arial"] as const;

export const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;

export const COLOR_SWATCHES = ["#FFFFFF", "#111111", "#FF4D1C", "#FFD60A", "#1E88E5", "#2E7D32", "#E91E63"];

export const PLATE_SWATCHES = ["#FFFFFF", "#111111", "#FF4D1C", "#FFD60A", "#1E88E5"];

export const BACKGROUND_SWATCHES = ["#FFFFFF", "#F4EFE6", "#111111", "#1E2A44", "#FF4D1C", "#FFD60A", "#2E7D32"];

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

function validRect(r: GenerationRect | null | undefined): Rect | null {
  if (!r) return null;
  if (![r.x, r.y, r.width, r.height].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
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

/** Patch tipografiyani o'zgartiradimi (kesmadan shriftga o'tish kerakmi). */
export function touchesTypography(patch: object): boolean {
  return TYPOGRAPHY_KEYS.some((key) => key in patch);
}

/** Matn asl holatidan farq qiladimi (joyi, o'lchami yoki tipografiyasi). */
export function isTextDirty(layer: TextLayerItem): boolean {
  if (!layer.pristine) return true;
  if (layer.rendered && layer.imageUrl) return true;
  if (layer.deleted || !layer.visible || layer.opacity < 1) return true;
  const p = layer.pristine;
  return STYLE_KEYS.some((key) => {
    const a = layer[key];
    const b = p[key];
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) > 0.01;
    return a !== b;
  });
}

/** Matn kesma rasmi bilan chiziladimi (asl piksellar). */
export function usesCutout(layer: TextLayerItem): boolean {
  return !layer.rendered && Boolean(layer.imageUrl && layer.imageBox && layer.pristine);
}

/** Matnni aniqlangan holatiga va asl joyiga qaytaradi (kesma bo'lsa — yana kesma). */
export function resetTextLayer(layer: TextLayerItem): TextLayerItem {
  if (!layer.pristine) return layer;
  return {
    ...layer,
    ...layer.pristine,
    name: firstLine(layer.pristine.text) || layer.name,
    rendered: !layer.imageUrl,
    opacity: 1,
    visible: true,
    deleted: false,
  };
}

export function isElementMoved(layer: ElementItem): boolean {
  const o = layer.original;
  return Math.abs(layer.x - o.x) > 0.5 || Math.abs(layer.y - o.y) > 0.5 || Math.abs(layer.width - o.width) > 0.5
    || Math.abs(layer.height - o.height) > 0.5 || Math.abs(layer.rotation) > 0.01 || layer.flipX || layer.flipY || layer.opacity < 1;
}

export function resetElement(layer: ElementItem): ElementItem {
  return { ...layer, ...layer.original, rotation: 0, flipX: false, flipY: false, opacity: 1, visible: true, deleted: false };
}

/** Serverdan kelgan qatlamlarni muharrir holatiga aylantiradi. */
export function buildEditorLayers(
  elements: GenerationElement[] | undefined,
  text: GenerationTextLayer[] | undefined,
  defaults: { width: number; height: number; productLabel: string; graphicLabel: string; textLabel: string },
): EditorLayer[] {
  const sorted = [...(elements ?? [])]
    .filter((e) => e && typeof e.url === "string" && e.url && e.width > 0 && e.height > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let productIndex = 0;
  let graphicIndex = 0;
  const items: ElementItem[] = sorted.map((el, index) => {
    const elementKind = el.kind === "product" ? "product" : "graphic";
    const label = elementKind === "product"
      ? `${defaults.productLabel}${++productIndex > 1 ? ` ${productIndex}` : ""}`
      : `${defaults.graphicLabel} ${++graphicIndex}`;
    const original = { x: Math.round(el.x), y: Math.round(el.y), width: Math.round(el.width), height: Math.round(el.height) };
    return {
      kind: "element",
      id: el.id || newLocalId("el"),
      name: (el.name || "").trim() || label,
      elementKind,
      url: el.url,
      order: index + 1,
      ...original,
      rotation: 0,
      flipX: false,
      flipY: false,
      original,
      opacity: 1,
      visible: true,
      locked: false,
      deleted: false,
    };
  });

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
      const imageBox = validRect(t.imageBox);
      const imageUrl = typeof t.imageUrl === "string" && t.imageUrl && imageBox ? t.imageUrl : null;
      return {
        kind: "text",
        id: t.id || newLocalId("text"),
        name: firstLine(t.text) || `${defaults.textLabel} ${index + 1}`,
        order: index + 1,
        ...style,
        autoFit: true,
        imageUrl,
        imageBox: imageUrl ? imageBox : null,
        rendered: !imageUrl,
        pristine: style,
        opacity: 1,
        visible: true,
        locked: false,
        deleted: false,
      };
    });

  return [...items, ...texts];
}

/**
 * "Bosib ajratish" (v5) natijasidan yangi obyekt qatlami: boshqa obyektlar ustida
 * (obyektlar guruhining eng yuqorisi — ya'ni matnlardan bir pog'ona pastda).
 */
export function extractedElementItem(el: GenerationElement, layers: EditorLayer[], fallbackName: string): ElementItem {
  const original = { x: Math.round(el.x), y: Math.round(el.y), width: Math.max(1, Math.round(el.width)), height: Math.max(1, Math.round(el.height)) };
  const maxOrder = groupOf(layers, "element").reduce((m, l) => Math.max(m, l.order), 0);
  // Server id'si takrorlansa (masalan, redo'dan keyin yana bosilsa) — mahalliy id.
  const id = el.id && !layers.some((l) => l.id === el.id) ? el.id : newLocalId("el");
  return {
    kind: "element",
    id,
    name: (el.name || "").trim() || fallbackName,
    elementKind: el.kind === "product" ? "product" : "graphic",
    url: el.url,
    order: maxOrder + 1,
    ...original,
    rotation: 0,
    flipX: false,
    flipY: false,
    original,
    opacity: 1,
    visible: true,
    locked: false,
    deleted: false,
  };
}

/** Bir guruh (obyektlar yoki matnlar) pastdan yuqoriga. */
export function groupOf(layers: EditorLayer[], kind: EditorLayer["kind"]): EditorLayer[] {
  return layers.filter((l) => l.kind === kind).sort((a, b) => a.order - b.order);
}

/** Butun sahna tartibi (pastdan yuqoriga): obyektlar, keyin matnlar. */
export function sceneOrder(layers: EditorLayer[]): EditorLayer[] {
  return [...groupOf(layers, "element"), ...groupOf(layers, "text")];
}

/** Qatlamni o'z guruhi ichida `index` (0 — eng pastki) o'ringa ko'chiradi. */
export function moveToIndex(layers: EditorLayer[], id: string, index: number): EditorLayer[] {
  const target = layers.find((l) => l.id === id);
  if (!target) return layers;
  const group = groupOf(layers, target.kind).filter((l) => l.id !== id);
  const clamped = Math.max(0, Math.min(group.length, index));
  group.splice(clamped, 0, target);
  const orders = new Map(group.map((l, i) => [l.id, i + 1]));
  let changed = false;
  const next = layers.map((l) => {
    const order = orders.get(l.id);
    if (order === undefined || order === l.order) return l;
    changed = true;
    return { ...l, order };
  });
  return changed ? next : layers;
}

export type OrderAction = "forward" | "backward" | "front" | "back";

/** Oldinga/Orqaga/Eng oldinga/Eng orqaga — o'chirilgan qatlamlar hisobga olinmaydi. */
export function reorderLayer(layers: EditorLayer[], id: string, action: OrderAction): EditorLayer[] {
  const target = layers.find((l) => l.id === id);
  if (!target) return layers;
  const group = groupOf(layers, target.kind);
  const live = group.filter((l) => !l.deleted);
  const liveIndex = live.findIndex((l) => l.id === id);
  if (liveIndex === -1) return layers;
  let neighbour: EditorLayer | undefined;
  if (action === "forward") neighbour = live[liveIndex + 1];
  else if (action === "backward") neighbour = live[liveIndex - 1];
  else if (action === "front") neighbour = live[live.length - 1];
  else neighbour = live[0];
  if (!neighbour || neighbour.id === id) return layers;
  const groupIndex = group.findIndex((l) => l.id === neighbour!.id);
  // Qo'shnining o'rniga: yuqoriga ketsa — undan keyin, pastga ketsa — undan oldin
  // (nishon olib tashlangach, qo'shnining indeksiga qo'yish ikkalasini ham beradi).
  return moveToIndex(layers, id, groupIndex);
}

/** Qatlam o'z guruhida eng yuqori/eng pastkimi (tugmalarni o'chirish uchun). */
export function orderPosition(layers: EditorLayer[], id: string): { isTop: boolean; isBottom: boolean } {
  const target = layers.find((l) => l.id === id);
  if (!target) return { isTop: true, isBottom: true };
  const live = groupOf(layers, target.kind).filter((l) => !l.deleted);
  const index = live.findIndex((l) => l.id === id);
  return { isTop: index === live.length - 1, isBottom: index <= 0 };
}
