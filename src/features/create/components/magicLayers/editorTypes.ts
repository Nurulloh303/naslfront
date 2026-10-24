import type { GenerationLayer, GenerationTextLayer } from "../../domain/types";

type LayerBase = {
  id: string;
  name: string;
  /** Z-tartib: kattaroq — yuqoriroq. Har o'zgarishdan keyin 1..n ga normallanadi. */
  order: number;
  opacity: number;
  visible: boolean;
  deleted: boolean;
};

/** Rastr qatlam (AI ajratgan shaffof PNG). Butun kanvas o'lchamida chiziladi. */
export type ImageLayerItem = LayerBase & {
  kind: "image";
  url: string;
  /** Markazning siljishi (kanvas px). */
  x: number;
  y: number;
  scale: number;
};

/** Tahrirlanadigan matn qatlami. */
export type TextLayerItem = LayerBase & Omit<GenerationTextLayer, "id"> & {
  kind: "text";
};

export type EditorLayer = ImageLayerItem | TextLayerItem;

export type TextPatch = Partial<Omit<TextLayerItem, "kind" | "id">>;

export const FONT_FAMILIES = ["Inter", "Montserrat", "Roboto", "Arial", "Georgia"] as const;

export const FONT_WEIGHTS = [
  { value: 400, key: "weightRegular" },
  { value: 700, key: "weightBold" },
  { value: 900, key: "weightBlack" },
] as const;

export const COLOR_SWATCHES = ["#FFFFFF", "#111111", "#FF4D1C", "#FFD60A", "#1E88E5", "#2E7D32", "#E91E63"];

export const PLATE_SWATCHES = ["#FFFFFF", "#111111", "#FF4D1C", "#FFD60A", "#1E88E5"];

export function newLocalId(prefix: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now().toString(16)}${random}`;
}

function clampNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(value: unknown, fallback: string): string {
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
      const fontSize = clampNumber(t.fontSize, 48, 6, 1000);
      return {
        kind: "text",
        id: t.id || newLocalId("text"),
        name: firstLine(t.text) || `${defaults.textLabel} ${index + 1}`,
        order: images.length + index + 1,
        text: t.text,
        x: clampNumber(t.x, 0),
        y: clampNumber(t.y, 0),
        width: clampNumber(t.width, defaults.width * 0.6, 20, defaults.width * 3),
        height: clampNumber(t.height, fontSize * 1.2, 1),
        fontSize,
        fontWeight: clampNumber(t.fontWeight, 700, 100, 900),
        color: normalizeHex(t.color, "#111111"),
        align: t.align === "center" || t.align === "right" ? t.align : "left",
        fontFamily: t.fontFamily || "Inter",
        lineHeight: clampNumber(t.lineHeight, 1.15, 0.7, 3),
        uppercase: Boolean(t.uppercase),
        background: t.background ? normalizeHex(t.background, "#FFFFFF") : null,
        rotation: clampNumber(t.rotation, 0),
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
