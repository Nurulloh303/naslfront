/**
 * Magic Layers v4: geometriya — tanlash qutilari, tutqichlar, hit-test,
 * o'lchash/aylantirish matematikasi, yopishish (snapping) va kanvas ustidagi
 * yordamchi chiziqlar.
 */
import { sceneOrder, type EditorLayer, type ElementItem, type TextLayerItem } from "./editorTypes";
import { applyRotation, roundRectPath, textRect, type HandleId, type Point, type Rect } from "./renderLayers";
import type { AlphaHitCache, LoadedImage } from "./loadImages";

export type CornerHandle = "nw" | "ne" | "se" | "sw";
export const CORNERS: CornerHandle[] = ["nw", "ne", "se", "sw"];

export function layerRect(layer: EditorLayer): Rect {
  return layer.kind === "element" ? { x: layer.x, y: layer.y, width: layer.width, height: layer.height } : textRect(layer);
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Vektorni lokal (aylantirilmagan) fazoga o'tkazadi: −deg ga buradi. */
export function rotateVector(v: Point, degrees: number): Point {
  if (!degrees) return v;
  const rad = (-degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(rad) - v.y * Math.sin(rad), y: v.x * Math.sin(rad) + v.y * Math.cos(rad) };
}

/** Nuqtani qatlamning lokal fazosiga o'tkazadi. */
export function toLocal(pt: Point, rect: Rect, degrees: number): Point {
  if (!degrees) return pt;
  const c = rectCenter(rect);
  const v = rotateVector({ x: pt.x - c.x, y: pt.y - c.y }, degrees);
  return { x: c.x + v.x, y: c.y + v.y };
}

/** Aylantirilgan qutini o'rab turgan o'qqa parallel quti. */
export function boundingBox(rect: Rect, degrees: number): Rect {
  if (!degrees) return rect;
  const c = rectCenter(rect);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = rect.width * cos + rect.height * sin;
  const h = rect.width * sin + rect.height * cos;
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}

export function layerBounds(layer: EditorLayer): Rect {
  return boundingBox(layerRect(layer), layer.rotation);
}

function inRect(pt: Point, r: Rect, slop = 0): boolean {
  return pt.x >= r.x - slop && pt.x <= r.x + r.width + slop && pt.y >= r.y - slop && pt.y <= r.y + r.height + slop;
}

/* ------------------------------------------------------------------ */
/* Tutqichlar                                                          */
/* ------------------------------------------------------------------ */

/** Qatlamdagi tutqichlar. Kenglik (e/w) — faqat shrift bilan chiziladigan matnda. */
export function handlesFor(layer: EditorLayer): HandleId[] {
  if (layer.locked) return [];
  const sides = layer.kind === "text" && (layer.rendered || !layer.imageUrl);
  return sides ? [...CORNERS, "e", "w", "rot"] : [...CORNERS, "rot"];
}

function rotBelow(r: Rect, rotOffset: number): boolean {
  return r.y - rotOffset < 0;
}

function localHandlePoint(r: Rect, id: HandleId, rotOffset: number): Point {
  switch (id) {
    case "nw": return { x: r.x, y: r.y };
    case "ne": return { x: r.x + r.width, y: r.y };
    case "se": return { x: r.x + r.width, y: r.y + r.height };
    case "sw": return { x: r.x, y: r.y + r.height };
    case "e": return { x: r.x + r.width, y: r.y + r.height / 2 };
    case "w": return { x: r.x, y: r.y + r.height / 2 };
    // Yuqorida joy bo'lmasa (kanvas chetidan chiqib ketadi) — pastga.
    case "rot": return { x: r.x + r.width / 2, y: rotBelow(r, rotOffset) ? r.y + r.height + rotOffset : r.y - rotOffset };
  }
}

export function hitHandle(layer: EditorLayer, pt: Point, hitRadius: number, rotOffset: number): HandleId | null {
  const rect = layerRect(layer);
  const local = toLocal(pt, rect, layer.rotation);
  let best: { id: HandleId; d: number } | null = null;
  for (const id of handlesFor(layer)) {
    const h = localHandlePoint(rect, id, rotOffset);
    const d = Math.hypot(local.x - h.x, local.y - h.y);
    if (d <= hitRadius && (!best || d < best.d)) best = { id, d };
  }
  return best?.id ?? null;
}

export function handleCursor(handle: HandleId, rotation: number): string {
  if (handle === "rot") return "grab";
  const base: Record<Exclude<HandleId, "rot">, number> = { e: 0, se: 45, sw: 135, w: 180, nw: 225, ne: 315 };
  const angle = (((base[handle] + rotation) % 180) + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return "ew-resize";
  if (angle < 67.5) return "nwse-resize";
  if (angle < 112.5) return "ns-resize";
  return "nesw-resize";
}

/* ------------------------------------------------------------------ */
/* O'lchash                                                            */
/* ------------------------------------------------------------------ */

/**
 * Burchakdan o'lchash: qarama-qarshi burchak joyida qoladi (aylantirilgan
 * bo'lsa ham). `proportional` — tomonlar nisbati saqlanadi.
 */
export function resizeFromCorner(start: Rect, degrees: number, handle: CornerHandle, pt: Point, proportional: boolean, minSize: number): { rect: Rect; fx: number; fy: number } {
  const c = rectCenter(start);
  const sx = handle === "ne" || handle === "se" ? 1 : -1;
  const sy = handle === "sw" || handle === "se" ? 1 : -1;
  const p = rotateVector({ x: pt.x - c.x, y: pt.y - c.y }, degrees);
  const o = { x: (-sx * start.width) / 2, y: (-sy * start.height) / 2 };
  let w: number;
  let h: number;
  if (proportional) {
    const dx = sx * start.width;
    const dy = sy * start.height;
    let f = ((p.x - o.x) * dx + (p.y - o.y) * dy) / (dx * dx + dy * dy || 1);
    f = Math.max(f, minSize / Math.max(1, Math.min(start.width, start.height)));
    w = start.width * f;
    h = start.height * f;
  } else {
    w = Math.max(minSize, sx * (p.x - o.x));
    h = Math.max(minSize, sy * (p.y - o.y));
  }
  const localCenter = { x: o.x + (sx * w) / 2, y: o.y + (sy * h) / 2 };
  const world = rotateVector(localCenter, -degrees);
  const cx = c.x + world.x;
  const cy = c.y + world.y;
  return { rect: { x: cx - w / 2, y: cy - h / 2, width: w, height: h }, fx: w / start.width, fy: h / start.height };
}

/** Markaz atrofida `f` marta kattalashtirish (+ siljish) — ikki barmoq bilan. */
export function scaleAroundCenter(start: Rect, f: number, shift: Point = { x: 0, y: 0 }): Rect {
  const c = rectCenter(start);
  const w = start.width * f;
  const h = start.height * f;
  return { x: c.x + shift.x - w / 2, y: c.y + shift.y - h / 2, width: w, height: h };
}

/** Matn qatlamini `f` marta o'lchaydi: yangi tanlash qutisi `rect` bo'yicha joylashadi. */
export function scaleTextPatch(start: TextLayerItem, startRect: Rect, rect: Rect, f: number): Partial<TextLayerItem> {
  return {
    fontSize: Math.round(start.fontSize * f * 100) / 100,
    letterSpacing: Math.round((start.letterSpacing || 0) * f * 100) / 100,
    width: Math.max(8, Math.round(start.width * f * 100) / 100),
    height: Math.max(1, Math.round(start.height * f)),
    x: Math.round((rect.x + (start.x - startRect.x) * f) * 100) / 100,
    y: Math.round((rect.y + (start.y - startRect.y) * f) * 100) / 100,
  };
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return Math.round(a * 10) / 10;
}

/** 15° ga yaqin bo'lsa — yopishadi (Shift — doim 15° qadam). */
export function snapAngle(deg: number, force: boolean): number {
  const step = 15;
  const nearest = Math.round(deg / step) * step;
  if (force || Math.abs(nearest - deg) < 3) return normalizeAngle(nearest);
  return normalizeAngle(deg);
}

/* ------------------------------------------------------------------ */
/* Yopishish (snapping)                                                */
/* ------------------------------------------------------------------ */

export type Guide = { axis: "x" | "y"; value: number };
export type SnapTargets = { xs: number[]; ys: number[] };

export function snapTargets(layers: EditorLayer[], excludeId: string, width: number, height: number): SnapTargets {
  const xs = [0, width / 2, width];
  const ys = [0, height / 2, height];
  for (const layer of layers) {
    if (layer.id === excludeId || layer.deleted || !layer.visible) continue;
    const b = layerBounds(layer);
    xs.push(b.x, b.x + b.width / 2, b.x + b.width);
    ys.push(b.y, b.y + b.height / 2, b.y + b.height);
  }
  return { xs, ys };
}

function snapAxis(values: number[], targets: number[], threshold: number): { delta: number; lines: number[] } {
  let best: { delta: number; abs: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      const abs = Math.abs(d);
      if (abs <= threshold && (!best || abs < best.abs)) best = { delta: d, abs };
    }
  }
  if (!best) return { delta: 0, lines: [] };
  const lines = new Set<number>();
  for (const v of values) for (const t of targets) if (Math.abs(t - (v + best.delta)) < 0.5) lines.add(t);
  return { delta: best.delta, lines: [...lines] };
}

/** Siljitilayotgan qutini kanvas markazi/chetlari va boshqa qatlamlarga yopishtiradi. */
export function snapBounds(bounds: Rect, targets: SnapTargets, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const x = snapAxis([bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width], targets.xs, threshold);
  const y = snapAxis([bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height], targets.ys, threshold);
  return {
    dx: x.delta,
    dy: y.delta,
    guides: [...x.lines.map((value) => ({ axis: "x" as const, value })), ...y.lines.map((value) => ({ axis: "y" as const, value }))],
  };
}

/* ------------------------------------------------------------------ */
/* Hit-test                                                            */
/* ------------------------------------------------------------------ */

function hitElement(layer: ElementItem, pt: Point, images: Record<string, LoadedImage | undefined>, alpha: AlphaHitCache): boolean {
  const rect = layerRect(layer);
  const local = toLocal(pt, rect, layer.rotation);
  if (!inRect(local, rect)) return false;
  const image = images[layer.url];
  if (!image) return true;
  let u = (local.x - rect.x) / rect.width;
  let v = (local.y - rect.y) / rect.height;
  if (layer.flipX) u = 1 - u;
  if (layer.flipY) v = 1 - v;
  const opaque = alpha.probe(layer.url, image.element, u, v);
  return opaque === null || opaque;
}

/**
 * Nuqta ostidagi qatlam. Matnlar obyektlardan yuqorida: avval matnlar
 * (ustma-ust bo'lsa — eng kichigi), keyin obyektlar yuqoridan pastga
 * (shaffof piksel — o'tkazib yuboriladi).
 */
export function hitTest(
  layers: EditorLayer[],
  pt: Point,
  options: { images: Record<string, LoadedImage | undefined>; alpha: AlphaHitCache; textSlop?: number },
): EditorLayer | null {
  const live = sceneOrder(layers).filter((l) => !l.deleted && l.visible).reverse();
  let best: { layer: TextLayerItem; area: number } | null = null;
  for (const layer of live) {
    if (layer.kind !== "text") continue;
    const rect = layerRect(layer);
    if (!inRect(toLocal(pt, rect, layer.rotation), rect, options.textSlop ?? 0)) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area - 1) best = { layer, area };
  }
  if (best) return best.layer;
  for (const layer of live) {
    if (layer.kind === "element" && hitElement(layer, pt, options.images, options.alpha)) return layer;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Kanvas ustidagi chiziqlar                                           */
/* ------------------------------------------------------------------ */

export const SELECTION_COLOR = "#FF4D1C";
export const GUIDE_COLOR = "#FF2BD6";

/** Nozik ramka (kursor ostidagi yoki "Qatlamlarni ko'rsatish"). */
export function drawOutline(ctx: CanvasRenderingContext2D, layer: EditorLayer, unit: number, dashed = true): void {
  const rect = layerRect(layer);
  const pad = 2 * unit;
  const r = { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  ctx.save();
  applyRotation(ctx, r, layer.rotation);
  ctx.lineWidth = 1.5 * unit;
  if (dashed) {
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.lineDashOffset = 4.5 * unit;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  } else {
    ctx.strokeStyle = SELECTION_COLOR;
  }
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.restore();
}

/** Ro'yxatdagi qatorga kursor kelganda: qatlam ramkasi yorqin chiziq va yengil to'ldirish bilan. */
export function drawHighlight(ctx: CanvasRenderingContext2D, layer: EditorLayer, unit: number): void {
  const rect = layerRect(layer);
  const pad = 3 * unit;
  const r = { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  ctx.save();
  applyRotation(ctx, r, layer.rotation);
  ctx.fillStyle = "rgba(255, 77, 28, 0.12)";
  ctx.fillRect(r.x, r.y, r.width, r.height);
  ctx.lineWidth = 4 * unit;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.lineWidth = 2 * unit;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.restore();
}

/** Tanlangan qatlam ramkasi va tutqichlari. `unit` — 1 CSS px necha kanvas px. */
export function drawSelection(ctx: CanvasRenderingContext2D, layer: EditorLayer, unit: number, handleRadiusCss: number, rotOffsetCss: number): void {
  const rect = layerRect(layer);
  ctx.save();
  applyRotation(ctx, rect, layer.rotation);
  ctx.lineWidth = 2 * unit;
  if (layer.locked) {
    ctx.setLineDash([6 * unit, 4 * unit]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  const radius = handleRadiusCss * unit;
  const handles = handlesFor(layer);
  const rotOffset = rotOffsetCss * unit;
  if (handles.includes("rot")) {
    const top = localHandlePoint(rect, "rot", rotOffset);
    ctx.beginPath();
    const below = rotBelow(rect, rotOffset);
    ctx.moveTo(rect.x + rect.width / 2, below ? rect.y + rect.height : rect.y);
    ctx.lineTo(top.x, below ? top.y - radius : top.y + radius);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 4 * unit;
  for (const id of handles) {
    const h = localHandlePoint(rect, id, rotOffset);
    ctx.beginPath();
    if (id === "e" || id === "w") {
      roundRectPath(ctx, { x: h.x - radius * 0.55, y: h.y - radius * 1.5, width: radius * 1.1, height: radius * 3 }, radius * 0.55);
    } else {
      ctx.arc(h.x, h.y, id === "rot" ? radius * 1.15 : radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5 * unit;
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.stroke();
    ctx.shadowBlur = 4 * unit;
    if (id === "rot") {
      // Aylantirish belgisi: yarim yoy + o'q.
      const r = radius * 0.55;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.6 * unit;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, -Math.PI * 0.9, Math.PI * 0.55);
      ctx.stroke();
      const ax = h.x + r * Math.cos(Math.PI * 0.55);
      const ay = h.y + r * Math.sin(Math.PI * 0.55);
      ctx.beginPath();
      ctx.moveTo(ax - 2.6 * unit, ay - 0.6 * unit);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax + 0.6 * unit, ay - 2.8 * unit);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawGuides(ctx: CanvasRenderingContext2D, guides: Guide[], width: number, height: number, unit: number): void {
  if (!guides.length) return;
  ctx.save();
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1 * unit;
  ctx.beginPath();
  for (const g of guides) {
    if (g.axis === "x") {
      ctx.moveTo(g.value, 0);
      ctx.lineTo(g.value, height);
    } else {
      ctx.moveTo(0, g.value);
      ctx.lineTo(width, g.value);
    }
  }
  ctx.stroke();
  ctx.restore();
}
