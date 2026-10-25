import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GenerationLayer, GenerationTextLayer } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { downloadBlob } from "../../../app/downloadHelper";
import {
  buildEditorLayers,
  firstLine,
  isTextDirty,
  newLocalId,
  normalizeOrders,
  resetTextLayer,
  type EditorLayer,
  type ImageLayerItem,
  type TextLayerItem,
  type TextPatch,
} from "./magicLayers/editorTypes";
import {
  AlphaHitCache,
  canvasToBlob,
  canvasToDataUrl,
  composeScene,
  drawOutline,
  drawSelection,
  ensureFonts,
  fontStack,
  hitHandle,
  hitTestLayers,
  isUntouched,
  layoutText,
  renderScene,
  rotateVector,
  sampleFillColors,
  selectionRect,
  textRect,
  type HandleId,
  type Point,
} from "./magicLayers/renderLayers";
import { useLayerHistory } from "./magicLayers/useLayerHistory";
import { TextLayerProps } from "./magicLayers/TextLayerProps";
import { ConfirmDialog, DownloadReadySheet } from "./magicLayers/EditorDialogs";
import "./MagicLayersEditor.css";

/** Muharrir ochiladigan ma'lumot (API kontrakti v3). */
export type MagicLayersSource = {
  /** Asl rasm — o'zgarmaydi. */
  baseUrl: string;
  /** Matnsiz toza fon. null — yo'q (yamoq asl rasm rangi bilan to'ldiriladi). */
  cleanUrl: string | null;
  width: number;
  height: number;
  /** Ixtiyoriy rastr qatlamlar (odatda bo'sh). */
  layers: GenerationLayer[];
  textLayers: GenerationTextLayer[];
  textRemoved?: boolean;
};

type Props = {
  jobId: string;
  variant: number;
  source: MagicLayersSource;
  onClose: () => void;
  /** "← Orqaga": muharrirni yopib, bosh sahifaga qaytish. */
  onBack?: () => void;
  onSave: (imageDataUrl: string) => Promise<boolean | void>;
  /** "Matnlarni qayta aniqlash" (force). */
  onReseparate?: () => Promise<MagicLayersSource>;
};

type Interaction = {
  pointerId: number;
  mode: "move" | "resize";
  handle: HandleId | null;
  layerId: string;
  startPt: Point;
  start: EditorLayer;
  startHeight: number;
  /** Sudrashdan oldingi holat — tugaganda bitta undo qadami bo'ladi. */
  snapshot: EditorLayer[];
  moved: boolean;
};

type ImageLoadState = "loading" | "ok" | "error";

const BASE_KEY = "__base";
const CLEAN_KEY = "__clean";
const MIN_TEXT_WIDTH = 16;
const MIN_FONT = 6;
const MAX_FONT = 600;
const DOUBLE_TAP_MS = 350;
const OUTLINE_INTRO_MS = 2000;

/** Och rang (oq matn) — ro'yxatdagi belgida to'q fon kerak. */
function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.75;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "color", "submit", "reset"].includes(type);
  }
  return false;
}

export function MagicLayersEditor({ jobId: _jobId, variant, source, onClose, onBack, onSave, onReseparate }: Props) {
  const { t } = useLanguage();
  const [scene, setScene] = useState<MagicLayersSource>(source);
  const W = Math.max(1, Math.round(scene.width || 1080));
  const H = Math.max(1, Math.round(scene.height || 1440));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const alphaCache = useRef(new AlphaHitCache());
  const interaction = useRef<Interaction | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const loadToken = useRef(0);
  const sourceLayers = useRef<EditorLayer[]>([]);

  const history = useLayerHistory<EditorLayer[]>([]);
  const layers = history.present;
  const { update, commitFrom, reset: resetHistory } = history;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [outlinesOn, setOutlinesOn] = useState(true);
  const outlinesTouched = useRef(false);
  const [images, setImages] = useState<Record<string, HTMLImageElement | undefined>>({});
  const [loadStates, setLoadStates] = useState<Record<string, ImageLoadState>>({});
  const [fills, setFills] = useState<Record<string, string>>({});
  const [fontsTick, setFontsTick] = useState(0);
  const [cssWidth, setCssWidth] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editingRef = useRef<string | null>(null);
  const draftRef = useRef("");
  /** Yangi qo'shilgan va hali birinchi marta saqlanmagan matn qatlami. */
  const pendingNewRef = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reseparating, setReseparating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; action: () => void } | null>(null);
  const [downloadSheet, setDownloadSheet] = useState<{ blob: Blob; filename: string } | null>(null);

  const coarsePointer = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);

  /* ---------------------------------------------------------------- */
  /* Yuklash                                                           */
  /* ---------------------------------------------------------------- */

  const loadImages = useCallback((entries: Array<{ key: string; url: string }>) => {
    const token = ++loadToken.current;
    alphaCache.current.clear();
    setImages({});
    setFills({});
    setLoadStates(Object.fromEntries(entries.map((e) => [e.key, "loading" as ImageLoadState])));
    const done = (key: string, image: HTMLImageElement | undefined, state: ImageLoadState) => {
      if (token !== loadToken.current) return;
      setImages((current) => ({ ...current, [key]: image }));
      setLoadStates((current) => ({ ...current, [key]: state }));
    };
    for (const entry of entries) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => done(entry.key, img, "ok");
      img.onerror = () => {
        if (entry.key === CLEAN_KEY) {
          // Toza fon CORS'siz yuklansa, eksport baribir buziladi — rang bilan to'ldiramiz.
          done(entry.key, undefined, "error");
          return;
        }
        // CORS rad etsa — crossOrigin'siz. Ko'rinadi, lekin eksportda kanvas ifloslanadi.
        const fallback = new Image();
        fallback.onload = () => done(entry.key, fallback, "ok");
        fallback.onerror = () => done(entry.key, undefined, "error");
        fallback.src = entry.url;
      };
      img.src = entry.url;
    }
  }, []);

  const loadSource = useCallback((next: MagicLayersSource) => {
    const width = Math.max(1, Math.round(next.width || 1080));
    const height = Math.max(1, Math.round(next.height || 1440));
    const items = buildEditorLayers(next.layers ?? [], next.textLayers ?? [], { width, height, layerLabel: t("magicLayers.defaultLayer"), textLabel: t("magicLayers.textLayer") });
    sourceLayers.current = items;
    resetHistory(items);
    setScene(next);
    setSelectedId(null);
    setHoverId(null);
    setEditingId(null);
    editingRef.current = null;
    pendingNewRef.current = null;
    const entries = [{ key: BASE_KEY, url: next.baseUrl }];
    if (next.cleanUrl) entries.push({ key: CLEAN_KEY, url: next.cleanUrl });
    for (const layer of items) if (layer.kind === "image") entries.push({ key: layer.id, url: layer.url });
    loadImages(entries);
  }, [loadImages, resetHistory, t]);

  // Faqat ochilganda: ota komponent qayta chizilganda foydalanuvchi o'zgarishlari yo'qolmasin.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadSource(source);
  }, [loadSource, source]);

  // Ochilganda 2 soniya barcha tahrirlanadigan matnlar ko'rsatiladi, keyin — faqat kursor ostida.
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!outlinesTouched.current) setOutlinesOn(false); }, OUTLINE_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const baseImage = images[BASE_KEY];
  const cleanImage = images[CLEAN_KEY];
  const cleanAvailable = Boolean(scene.cleanUrl) && loadStates[CLEAN_KEY] === "ok" && Boolean(cleanImage);
  const cleanSettled = !scene.cleanUrl || (loadStates[CLEAN_KEY] !== undefined && loadStates[CLEAN_KEY] !== "loading");

  // Toza fon yo'q: yamoq rangini asl rasmdan bir marta olamiz.
  useEffect(() => {
    if (!baseImage || cleanAvailable || !cleanSettled) return;
    const texts = sourceLayers.current.filter((l): l is TextLayerItem => l.kind === "text");
    setFills(sampleFillColors(baseImage, W, H, texts));
  }, [baseImage, cleanAvailable, cleanSettled, H, W]);

  // Shriftlar: kerakli oilalar/qalinliklar yuklangach qayta chizamiz.
  const fontKey = useMemo(
    () => [...new Set(layers.filter((l): l is TextLayerItem => l.kind === "text").map((l) => `${l.fontFamily}:${l.fontWeight}`))].sort().join("|"),
    [layers],
  );
  useEffect(() => {
    if (!fontKey) return;
    let alive = true;
    const specs = fontKey.split("|").map((k) => {
      const [fontFamily, weight] = k.split(":");
      return { fontFamily, fontWeight: Number(weight) };
    });
    void ensureFonts(specs).then(() => { if (alive) setFontsTick((n) => n + 1); });
    return () => { alive = false; };
  }, [fontKey]);

  // Kanvasning ekrandagi kengligi: tutqichlar o'lchami va textarea joylashuvi uchun.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setCssWidth(canvas.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ---------------------------------------------------------------- */
  /* Chizish                                                           */
  /* ---------------------------------------------------------------- */

  const activeLayer = layers.find((l) => l.id === selectedId && !l.deleted) ?? null;
  const editingLayer = editingId ? (layers.find((l) => l.id === editingId && l.kind === "text") as TextLayerItem | undefined) ?? null : null;
  const unit = cssWidth > 0 ? W / cssWidth : 1;
  const sceneImages = { base: baseImage, clean: cleanAvailable ? cleanImage : undefined };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    renderScene(ctx, { width: W, height: H, ...sceneImages, layers, images, fills, editingId });
    if (editingId) return;
    for (const layer of layers) {
      if (layer.kind !== "text" || layer.deleted || !layer.visible || layer.id === activeLayer?.id) continue;
      if (outlinesOn || layer.id === hoverId) drawOutline(ctx, textRect(layer), layer.rotation, unit);
    }
    if (activeLayer && activeLayer.visible) drawSelection(ctx, activeLayer, W, H, unit, coarsePointer ? 10 : 7);
  }, [activeLayer, baseImage, cleanAvailable, cleanImage, coarsePointer, editingId, fills, fontsTick, H, hoverId, images, layers, outlinesOn, unit, W]);

  /* ---------------------------------------------------------------- */
  /* Qatlam amallari                                                   */
  /* ---------------------------------------------------------------- */

  const patchLayer = useCallback((id: string, patch: Partial<EditorLayer>, coalesce?: string) => {
    update((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as EditorLayer) : l)), { coalesce });
  }, [update]);

  const patchText = useCallback((id: string, patch: TextPatch, coalesce?: string) => {
    update((prev) => prev.map((l) => {
      if (l.id !== id || l.kind !== "text") return l;
      const next: TextLayerItem = { ...l, ...patch };
      if (patch.text !== undefined) next.name = firstLine(patch.text) || l.name;
      return next;
    }), { coalesce });
  }, [update]);

  const toggleVisibility = (id: string) => {
    update((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const toggleDelete = (id: string) => {
    update((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: !l.deleted } : l)));
    if (selectedId === id) setSelectedId(null);
  };

  const resetText = (id: string) => {
    update((prev) => prev.map((l) => (l.id === id && l.kind === "text" ? resetTextLayer(l) : l)));
  };

  const moveImageOrder = (id: string, direction: "up" | "down") => {
    update((prev) => {
      const sorted = prev.filter((l) => l.kind === "image").sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((l) => l.id === id);
      const target = direction === "up" ? index + 1 : index - 1;
      if (index === -1 || target < 0 || target >= sorted.length) return prev;
      const a = sorted[index];
      const b = sorted[target];
      return prev.map((l) => (l.id === a.id ? { ...l, order: b.order } : l.id === b.id ? { ...l, order: a.order } : l));
    });
  };

  const resetImage = (layer: ImageLayerItem) => {
    const original = sourceLayers.current.find((l) => l.id === layer.id);
    if (original) update((prev) => prev.map((l) => (l.id === original.id ? { ...original, order: l.order } : l)));
    else patchLayer(layer.id, { x: 0, y: 0, scale: 1, opacity: 1, visible: true, deleted: false });
  };

  const resetAll = () => {
    update(() => sourceLayers.current);
    setSelectedId(null);
  };

  const duplicateText = (id: string) => {
    const src = layers.find((l) => l.id === id);
    if (!src || src.kind !== "text") return;
    const offset = Math.round(Math.max(16, src.fontSize * 0.4));
    const copy: TextLayerItem = { ...src, id: newLocalId("text"), x: src.x + offset, y: src.y + offset, order: src.order + 0.5, deleted: false, visible: true, pristine: null, source: null };
    update((prev) => normalizeOrders([...prev, copy]));
    setSelectedId(copy.id);
  };

  /* ---------------------------------------------------------------- */
  /* Matnni joyida tahrirlash                                          */
  /* ---------------------------------------------------------------- */

  const startEditing = (layer: TextLayerItem) => {
    setSelectedId(layer.id);
    editingRef.current = layer.id;
    draftRef.current = layer.text;
    setEditDraft(layer.text);
    setEditingId(layer.id);
  };

  const finishEditing = (mode: "commit" | "cancel") => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);
    const isNew = pendingNewRef.current === id;
    pendingNewRef.current = null;
    const draft = draftRef.current;
    if (mode === "cancel" || !draft.trim()) {
      if (isNew) {
        // Yangi qatlam: qo'shilishini ham bekor qilamiz (tarixda iz qolmaydi).
        history.undo();
        setSelectedId(null);
      } else if (mode === "commit") {
        // Matn butunlay o'chirildi — o'chirilgan deb belgilaymiz (asl joy toza fon bilan yopiladi).
        update((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
        setSelectedId(null);
      }
      return;
    }
    const current = layers.find((l) => l.id === id);
    if (current && current.kind === "text" && current.text !== draft) patchText(id, { text: draft });
  };

  const addText = () => {
    const fontSize = Math.round(W * 0.065);
    const width = Math.round(W * 0.7);
    const text = t("magicLayers.newText");
    const maxOrder = layers.reduce((m, l) => Math.max(m, l.order), 0);
    const layer: TextLayerItem = {
      kind: "text",
      id: newLocalId("text"),
      name: text,
      order: maxOrder + 1,
      text,
      x: Math.round((W - width) / 2),
      y: Math.round(H / 2 - fontSize * 0.6),
      width,
      height: Math.round(fontSize * 1.15),
      fontSize,
      fontWeight: 700,
      color: "#111111",
      align: "center",
      fontFamily: "Inter",
      lineHeight: 1.15,
      letterSpacing: 0,
      uppercase: false,
      background: null,
      rotation: 0,
      autoFit: true,
      source: null,
      pristine: null,
      opacity: 1,
      visible: true,
      deleted: false,
    };
    if (editingRef.current) finishEditing("commit");
    update((prev) => [...prev, layer]);
    pendingNewRef.current = layer.id;
    startEditing(layer);
  };

  useEffect(() => {
    if (!editingId) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, [editingId]);

  /* ---------------------------------------------------------------- */
  /* Kursor / barmoq                                                   */
  /* ---------------------------------------------------------------- */

  const getCanvasCoords = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) * W) / rect.width, y: ((clientY - rect.top) * H) / rect.height };
  };

  const hitAt = (pt: Point, touch: boolean) =>
    hitTestLayers(layers, pt, { width: W, height: H, images, alpha: alphaCache.current, textSlop: (touch ? 10 : 4) * unit });

  const beginInteraction = (e: React.PointerEvent<HTMLCanvasElement>, layer: EditorLayer, mode: Interaction["mode"], handle: HandleId | null, pt: Point) => {
    const startHeight = selectionRect(layer, W, H).height;
    interaction.current = { pointerId: e.pointerId, mode, handle, layerId: layer.id, startPt: pt, start: layer, startHeight, snapshot: layers, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (editingRef.current) {
      // Birinchi bosish — tahrirlashni tugatish.
      finishEditing("commit");
      return;
    }
    const pt = getCanvasCoords(e.clientX, e.clientY);
    const touch = e.pointerType !== "mouse";
    const hitRadius = (touch || coarsePointer ? 24 : 12) * unit;

    if (activeLayer && activeLayer.visible) {
      const handle = hitHandle(activeLayer, pt, W, H, hitRadius);
      if (handle) {
        beginInteraction(e, activeLayer, "resize", handle, pt);
        return;
      }
    }

    const hit = hitAt(pt, touch);
    if (!hit) {
      setSelectedId(null);
      lastTap.current = null;
      return;
    }

    const now = Date.now();
    if (hit.kind === "text" && lastTap.current?.id === hit.id && now - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      e.preventDefault();
      startEditing(hit);
      return;
    }
    lastTap.current = { id: hit.id, at: now };
    setSelectedId(hit.id);
    beginInteraction(e, hit, "move", null, pt);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const it = interaction.current;
    if (!it || it.pointerId !== e.pointerId) {
      if (e.pointerType === "mouse" && !editingRef.current) {
        const hit = hitAt(getCanvasCoords(e.clientX, e.clientY), false);
        const id = hit?.kind === "text" ? hit.id : null;
        if (id !== hoverId) setHoverId(id);
      }
      return;
    }
    const pt = getCanvasCoords(e.clientX, e.clientY);
    const dx = pt.x - it.startPt.x;
    const dy = pt.y - it.startPt.y;
    if (!it.moved) {
      if (Math.hypot(dx, dy) < 3 * unit) return;
      it.moved = true;
      lastTap.current = null;
    }

    const start = it.start;
    let patch: Partial<EditorLayer>;
    if (it.mode === "move") {
      patch = { x: Math.round(start.x + dx), y: Math.round(start.y + dy) };
    } else if (start.kind === "image") {
      const cx = start.x + W / 2;
      const cy = start.y + H / 2;
      const initialDist = Math.hypot(it.startPt.x - cx, it.startPt.y - cy);
      if (initialDist <= 0) return;
      const factor = Math.hypot(pt.x - cx, pt.y - cy) / initialDist;
      patch = { scale: Number(Math.max(0.2, Math.min(3.5, start.scale * factor)).toFixed(3)) };
    } else {
      const local = rotateVector({ x: dx, y: dy }, start.rotation);
      const handle = it.handle;
      if (handle === "e" || handle === "w") {
        const raw = handle === "e" ? start.width + local.x : start.width - local.x;
        const width = Math.max(MIN_TEXT_WIDTH, Math.min(W * 3, raw));
        patch = { width: Math.round(width), x: Math.round(handle === "w" ? start.x + start.width - width : start.x) };
      } else {
        const east = handle === "ne" || handle === "se";
        const north = handle === "nw" || handle === "ne";
        const raw = east ? start.width + local.x : start.width - local.x;
        const minFactor = Math.max(MIN_TEXT_WIDTH / start.width, MIN_FONT / start.fontSize);
        const maxFactor = Math.min((W * 3) / start.width, MAX_FONT / start.fontSize);
        const factor = Math.max(minFactor, Math.min(maxFactor, raw / start.width));
        const width = start.width * factor;
        patch = {
          width: Math.round(width),
          fontSize: Math.round(start.fontSize * factor * 10) / 10,
          letterSpacing: Math.round((start.letterSpacing || 0) * factor * 10) / 10,
          height: Math.round(start.height * factor),
          x: Math.round(east ? start.x : start.x + start.width - width),
          y: Math.round(north ? start.y + it.startHeight * (1 - factor) : start.y),
        };
      }
    }
    update((prev) => prev.map((l) => (l.id === it.layerId ? ({ ...l, ...patch } as EditorLayer) : l)), { transient: true });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const it = interaction.current;
    if (!it || it.pointerId !== e.pointerId) return;
    interaction.current = null;
    if (it.moved) commitFrom(it.snapshot);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  /* ---------------------------------------------------------------- */
  /* Chiqish, saqlash, yuklab olish                                    */
  /* ---------------------------------------------------------------- */

  const busy = saving || downloading || reseparating;
  const imagesReady = Object.values(loadStates).every((s) => s !== "loading") && loadStates[BASE_KEY] === "ok";
  const baseLoading = loadStates[BASE_KEY] === "loading";
  const baseFailed = loadStates[BASE_KEY] === "error";
  const dirty = history.dirty;

  const requestExit = (action: () => void) => {
    let pendingEdit = false;
    if (editingRef.current) {
      const editing = layers.find((l) => l.id === editingRef.current);
      pendingEdit = editing?.kind === "text" && editing.text !== draftRef.current;
      finishEditing("commit");
    }
    if (!dirty && !pendingEdit) {
      action();
      return;
    }
    setConfirm({
      title: t("magicLayers.unsavedTitle"),
      message: t("magicLayers.unsavedText"),
      confirmLabel: t("magicLayers.leave"),
      action,
    });
  };

  const handleBack = () => requestExit(() => (onBack ?? onClose)());
  const handleClose = () => requestExit(onClose);

  const exportError = (reason: unknown) =>
    reason instanceof Error && reason.message === "TAINTED" ? t("magicLayers.exportTainted") : t("magicLayers.exportFailed");

  const compose = () => composeScene({ width: W, height: H, ...sceneImages, layers, images, fills });

  const handleSave = async () => {
    if (busy) return;
    if (editingRef.current) finishEditing("commit");
    setSaving(true);
    setError(null);
    try {
      const dataUrl = canvasToDataUrl(await compose());
      const result = await onSave(dataUrl);
      if (result === false) {
        setError(t("magicLayers.saveFailed"));
        return;
      }
      history.markSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error && reason.message === "TAINTED" ? t("magicLayers.exportTainted") : t("magicLayers.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (busy) return;
    if (editingRef.current) finishEditing("commit");
    setDownloading(true);
    setError(null);
    try {
      const blob = await canvasToBlob(await compose());
      const filename = `naslai-${variant}-slayd-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      const outcome = await downloadBlob(blob, filename);
      if (outcome === "needs-gesture") setDownloadSheet({ blob, filename });
      else if (outcome !== "cancelled") setToast(t("magicLayers.downloaded"));
    } catch (reason) {
      setError(exportError(reason));
    } finally {
      setDownloading(false);
    }
  };

  const runReseparate = async () => {
    if (!onReseparate || busy) return;
    try {
      setReseparating(true);
      setError(null);
      loadSource(await onReseparate());
    } catch {
      // Xabar ota komponentda (createFlow notice) ko'rsatiladi.
    } finally {
      setReseparating(false);
    }
  };

  const handleReseparate = () => {
    if (!dirty) {
      void runReseparate();
      return;
    }
    setConfirm({
      title: t("magicLayers.unsavedTitle"),
      message: t("magicLayers.reseparateConfirm"),
      confirmLabel: t("magicLayers.reseparate"),
      action: () => void runReseparate(),
    });
  };

  const toggleOutlines = () => {
    outlinesTouched.current = true;
    setOutlinesOn((v) => !v);
  };

  /* ---------------------------------------------------------------- */
  /* Klaviatura                                                        */
  /* ---------------------------------------------------------------- */

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (e: KeyboardEvent) => {
    if (confirm || downloadSheet || editingRef.current) return;
    if (isTypingTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const keyZ = e.code === "KeyZ" || e.key.toLowerCase() === "z";
    const keyY = e.code === "KeyY" || e.key.toLowerCase() === "y";
    const keyD = e.code === "KeyD" || e.key.toLowerCase() === "d";

    if (mod && keyZ) {
      e.preventDefault();
      if (e.shiftKey) history.redo(); else history.undo();
      return;
    }
    if (mod && keyY) {
      e.preventDefault();
      history.redo();
      return;
    }
    if (busy) return;

    if (!activeLayer) {
      if (e.key === "Escape") { e.preventDefault(); handleClose(); }
      return;
    }
    if (mod && keyD && activeLayer.kind === "text") {
      e.preventDefault();
      duplicateText(activeLayer.id);
      return;
    }
    const step = e.shiftKey ? 10 : 2;
    const nudges: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const nudge = nudges[e.key];
    if (nudge) {
      e.preventDefault();
      patchLayer(activeLayer.id, { x: activeLayer.x + nudge.x, y: activeLayer.y + nudge.y }, `nudge:${activeLayer.id}`);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      toggleDelete(activeLayer.id);
    } else if (e.key === "Enter" && activeLayer.kind === "text") {
      e.preventDefault();
      startEditing(activeLayer);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedId(null);
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Textarea joylashuvi                                               */
  /* ---------------------------------------------------------------- */

  const textareaStyle = useMemo<CSSProperties | null>(() => {
    if (!editingLayer || cssWidth <= 0) return null;
    const r = cssWidth / W; // 1 kanvas px necha CSS px
    const layout = layoutText(editingLayer, editDraft || " ");
    const cssFont = layout.fontSize * r;
    // iOS 16px dan kichik shriftli maydonga fokusda sahifani kattalashtiradi —
    // shuning uchun kamida 16px bilan yozib, transform bilan kichraytiramiz.
    const k = cssFont < 16 ? cssFont / 16 : 1;
    const lineCount = Math.max(1, layout.lines.length);
    const w = layout.areaWidth * r;
    const h = lineCount * layout.lineHeightPx * r;
    const centerX = layout.areaLeft * r + w / 2;
    const centerY = layout.lineBoxTop * r + h / 2;
    return {
      left: centerX - w / k / 2,
      top: centerY - h / k / 2,
      width: w / k,
      height: h / k,
      padding: 0,
      fontFamily: fontStack(editingLayer.fontFamily),
      fontWeight: editingLayer.fontWeight,
      fontSize: cssFont / k,
      // Global mobil qoida (textarea 16px !important) ustidan — CSS o'zgaruvchisi orqali.
      ["--ml-font-size" as string]: `${cssFont / k}px`,
      lineHeight: `${(layout.lineHeightPx * r) / k}px`,
      letterSpacing: `${(layout.letterSpacing * r) / k}px`,
      color: editingLayer.color,
      textAlign: editingLayer.align,
      textTransform: editingLayer.uppercase ? "uppercase" : "none",
      whiteSpace: "pre",
      background: "transparent",
      opacity: editingLayer.opacity,
      transform: `rotate(${editingLayer.rotation}deg) scale(${k})`,
    };
  }, [cssWidth, editDraft, editingLayer, fontsTick, W]);

  /* ---------------------------------------------------------------- */
  /* Ko'rinish                                                         */
  /* ---------------------------------------------------------------- */

  const textItems = layers.filter((l): l is TextLayerItem => l.kind === "text").sort((a, b) => a.y - b.y || a.x - b.x);
  const imageItems = layers.filter((l): l is ImageLayerItem => l.kind === "image").sort((a, b) => b.order - a.order);
  const textCount = textItems.filter((l) => !l.deleted).length;
  const detectedCount = textItems.filter((l) => l.pristine).length;
  const showFallbackNotice = detectedCount > 0 && cleanSettled && !cleanAvailable;
  const editedCount = textItems.filter((l) => isTextDirty(l)).length;

  const textStatus = (layer: TextLayerItem) => {
    if (layer.deleted) return t("magicLayers.deleted");
    if (!layer.pristine) return t("magicLayers.stateNew");
    return isUntouched(layer) ? t("magicLayers.stateOriginal") : t("magicLayers.stateEdited");
  };

  return (
    <div className="magic-layers-backdrop" role="dialog" aria-modal="true" aria-labelledby="magic-editor-title">
      <header className="magic-layers-header">
        <div className="magic-header-left">
          <button type="button" className="magic-btn magic-btn-secondary magic-back-btn" onClick={handleBack} disabled={saving} aria-label={t("magicLayers.backAria")}>
            <span aria-hidden="true">←</span>
            <span className="magic-btn-label">{t("magicLayers.back")}</span>
          </button>
          <span className="magic-brand-badge">✨ {t("magicLayers.badge")}</span>
          <div className="magic-header-titles">
            <h2 id="magic-editor-title">
              <span className="magic-title-long">{t("magicLayers.modalTitle")} · </span>{variant}-slayd
            </h2>
            <p>{t("magicLayers.modalSubtitle")}</p>
          </div>
        </div>

        <div className="magic-header-actions">
          <button type="button" className="magic-btn magic-btn-secondary magic-hide-sm" onClick={resetAll} disabled={busy || !dirty} title={t("magicLayers.resetAll")}>
            <span aria-hidden="true">↺</span>
            <span className="magic-btn-label">{t("magicLayers.resetAll")}</span>
          </button>
          <button type="button" className="magic-btn magic-btn-download" onClick={() => void handleDownload()} disabled={busy || !imagesReady} title={t("magicLayers.download")}>
            <span aria-hidden="true">⬇</span>
            <span className="magic-btn-label">{downloading ? t("magicLayers.downloadPreparing") : t("magicLayers.download")}</span>
          </button>
          <button type="button" className="magic-btn magic-btn-primary" onClick={() => void handleSave()} disabled={busy || !imagesReady} title={t("magicLayers.save")}>
            <span aria-hidden="true">✓</span>
            <span className="magic-btn-label">{saving ? t("magicLayers.saving") : t("magicLayers.save")}</span>
          </button>
          <button type="button" className="magic-btn-icon" onClick={handleClose} aria-label={t("magicLayers.close")} disabled={saving}>✕</button>
        </div>
      </header>

      <div className="magic-workspace">
        <section className="magic-canvas-container">
          <div className="magic-toolbar" role="toolbar" aria-label={t("magicLayers.toolbarAria")}>
            <button type="button" className="magic-btn magic-btn-primary magic-btn-sm" onClick={addText} disabled={busy}>
              ＋ {t("magicLayers.addText")}
            </button>
            {activeLayer?.kind === "text" && !editingId ? (
              <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" onClick={() => startEditing(activeLayer)}>
                ✎ <span className="magic-btn-label">{t("magicLayers.editText")}</span>
              </button>
            ) : null}
            {detectedCount > 0 ? (
              <button
                type="button"
                className={`magic-btn magic-btn-secondary magic-btn-sm magic-toggle ${outlinesOn ? "is-on" : ""}`}
                onClick={toggleOutlines}
                aria-pressed={outlinesOn}
                title={t("magicLayers.showTexts")}
              >
                <span aria-hidden="true">▢</span> <span className="magic-btn-label">{t("magicLayers.showTexts")}</span>
              </button>
            ) : null}
            <span className="magic-toolbar-sep" />
            <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm magic-btn-square" onClick={history.undo} disabled={!history.canUndo || busy} title={`${t("magicLayers.undo")} (Ctrl+Z)`} aria-label={t("magicLayers.undo")}>↶</button>
            <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm magic-btn-square" onClick={history.redo} disabled={!history.canRedo || busy} title={`${t("magicLayers.redo")} (Ctrl+Shift+Z)`} aria-label={t("magicLayers.redo")}>↷</button>
            <span className="magic-toolbar-hint">💡 {editingId ? t("magicLayers.inlineHint") : t("magicLayers.dragHint")}</span>
          </div>

          {error ? (
            <div className="magic-error-banner" role="alert">
              <span>{error}</span>
              <button type="button" className="magic-mini-btn" onClick={() => setError(null)} aria-label={t("magicLayers.close")}>✕</button>
            </div>
          ) : null}
          {baseFailed ? (
            <div className="magic-error-banner" role="alert"><span>{t("magicLayers.baseFailed")}</span></div>
          ) : null}

          <div className="magic-canvas-stage">
            <div className="magic-canvas-wrapper">
              <canvas
                ref={canvasRef}
                className={`magic-canvas-element ${hoverId ? "is-over-text" : ""}`}
                width={W}
                height={H}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => setHoverId(null)}
                onContextMenu={(e) => e.preventDefault()}
              />
              {editingLayer && textareaStyle ? (
                <textarea
                  ref={textareaRef}
                  className="magic-inline-textarea"
                  style={textareaStyle}
                  value={editDraft}
                  spellCheck={false}
                  wrap="off"
                  aria-label={t("magicLayers.text")}
                  onChange={(e) => { draftRef.current = e.target.value; setEditDraft(e.target.value); }}
                  onBlur={() => finishEditing("commit")}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") { e.preventDefault(); finishEditing("cancel"); }
                    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishEditing("commit"); }
                  }}
                />
              ) : null}
            </div>
          </div>

          {reseparating || baseLoading ? (
            <div className="magic-loading-overlay">
              <div className="magic-spinner" />
              <div className="magic-loading-title">{reseparating ? t("magicLayers.loadingTitle") : t("magicLayers.imageLoadingTitle")}</div>
              {reseparating ? <div className="magic-loading-sub">{t("magicLayers.loadingText")}</div> : null}
            </div>
          ) : null}
        </section>

        <aside className="magic-sidebar">
          {showFallbackNotice ? (
            <div className="magic-notice" role="note">
              <b>ℹ {t("magicLayers.textNotRemovedTitle")}</b>
              <span>{t("magicLayers.textNotRemovedText")}</span>
            </div>
          ) : null}

          {activeLayer?.kind === "text" ? (
            <TextLayerProps
              layer={activeLayer}
              onChange={(patch, coalesce) => patchText(activeLayer.id, patch, coalesce)}
              onEditInline={() => startEditing(activeLayer)}
              onDuplicate={() => duplicateText(activeLayer.id)}
              onDelete={() => toggleDelete(activeLayer.id)}
              onReset={() => resetText(activeLayer.id)}
            />
          ) : activeLayer?.kind === "image" ? (
            <div className="magic-layer-props">
              <div className="magic-section-title">
                <span>{t("magicLayers.activeLayer")}</span>
                <b>{activeLayer.name}</b>
              </div>

              <div className="magic-prop-row">
                <div className="magic-prop-header">
                  <span>{t("magicLayers.scale")}</span>
                  <b>{Math.round(activeLayer.scale * 100)}%</b>
                </div>
                <input
                  type="range"
                  className="magic-slider"
                  min={0.3}
                  max={2.5}
                  step={0.02}
                  value={activeLayer.scale}
                  onChange={(e) => patchLayer(activeLayer.id, { scale: parseFloat(e.target.value) }, `scale:${activeLayer.id}`)}
                />
              </div>

              <div className="magic-prop-row">
                <div className="magic-prop-header">
                  <span>{t("magicLayers.opacity")}</span>
                  <b>{Math.round(activeLayer.opacity * 100)}%</b>
                </div>
                <input
                  type="range"
                  className="magic-slider"
                  min={0}
                  max={1}
                  step={0.02}
                  value={activeLayer.opacity}
                  onChange={(e) => patchLayer(activeLayer.id, { opacity: parseFloat(e.target.value) }, `opacity:${activeLayer.id}`)}
                />
              </div>

              <div className="magic-action-grid">
                <button type="button" className="magic-btn magic-btn-secondary" onClick={() => patchLayer(activeLayer.id, { x: 0, y: 0 })}>🎯 {t("magicLayers.centerLayer")}</button>
                <button type="button" className="magic-btn magic-btn-secondary" onClick={() => resetImage(activeLayer)}>↺ {t("magicLayers.resetSelected")}</button>
                <button type="button" className="magic-btn magic-btn-secondary" onClick={() => moveImageOrder(activeLayer.id, "up")}>▲ {t("magicLayers.moveUp")}</button>
                <button type="button" className="magic-btn magic-btn-secondary" onClick={() => moveImageOrder(activeLayer.id, "down")}>▼ {t("magicLayers.moveDown")}</button>
              </div>
            </div>
          ) : (
            <p className="magic-empty-hint">
              {textCount > 0 ? t("magicLayers.selectHintText") : t("magicLayers.selectHint")}
            </p>
          )}

          <div>
            <div className="magic-section-title">
              <span>{t("magicLayers.layersTitle")}</span>
              <span>{editedCount > 0 ? t("magicLayers.editedCount", { count: editedCount }) : `(${textCount})`}</span>
            </div>

            <div className="magic-layer-list">
              {textItems.map((layer) => {
                const isSelected = layer.id === selectedId;
                return (
                  <div
                    key={layer.id}
                    className={`magic-layer-item ${isSelected ? "is-active" : ""} ${layer.deleted ? "is-hidden" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => { if (!layer.deleted) setSelectedId(layer.id); }}
                    onDoubleClick={() => { if (!layer.deleted) startEditing(layer); }}
                    onMouseEnter={() => setHoverId(layer.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !layer.deleted) {
                        e.preventDefault();
                        setSelectedId(layer.id);
                      }
                    }}
                  >
                    <span
                      className="magic-layer-thumb is-text"
                      aria-hidden="true"
                      style={{ fontFamily: fontStack(layer.fontFamily), color: layer.color, background: layer.background ?? (isLightColor(layer.color) ? "#2A2523" : undefined) }}
                    >T</span>
                    <div className="magic-layer-info">
                      <div className="magic-layer-name">{firstLine(layer.text) || t("magicLayers.textLayer")}</div>
                      <div className="magic-layer-meta">
                        {textStatus(layer)} · {layer.fontFamily} · {Math.round(layer.fontSize)}px
                      </div>
                    </div>
                    <div className="magic-layer-btns">
                      {layer.pristine && isTextDirty(layer) && !layer.deleted ? (
                        <button
                          type="button"
                          className="magic-mini-btn"
                          title={t("magicLayers.resetText")}
                          aria-label={t("magicLayers.resetText")}
                          onClick={(e) => { e.stopPropagation(); resetText(layer.id); }}
                        >↺</button>
                      ) : null}
                      <button
                        type="button"
                        className="magic-mini-btn"
                        title={layer.deleted ? t("magicLayers.restore") : t("magicLayers.delete")}
                        aria-label={layer.deleted ? t("magicLayers.restore") : t("magicLayers.delete")}
                        onClick={(e) => { e.stopPropagation(); toggleDelete(layer.id); }}
                      >
                        {layer.deleted ? "↩" : "🗑"}
                      </button>
                    </div>
                  </div>
                );
              })}

              {imageItems.map((layer) => {
                const isSelected = layer.id === selectedId;
                return (
                  <div
                    key={layer.id}
                    className={`magic-layer-item ${isSelected ? "is-active" : ""} ${!layer.visible || layer.deleted ? "is-hidden" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => { if (!layer.deleted) setSelectedId(layer.id); }}
                  >
                    <img src={layer.url} alt={layer.name} className="magic-layer-thumb" onError={(e) => { (e.target as HTMLElement).style.visibility = "hidden"; }} />
                    <div className="magic-layer-info">
                      <div className="magic-layer-name">{layer.name}{layer.deleted && ` (${t("magicLayers.deleted")})`}</div>
                      <div className="magic-layer-meta">
                        {`${t("magicLayers.layerOrder")}: #${layer.order} · ${Math.round(layer.scale * 100)}%`}
                        {loadStates[layer.id] === "loading" ? ` · ${t("magicLayers.imageLoading")}` : ""}
                        {loadStates[layer.id] === "error" ? ` · ${t("magicLayers.imageFailed")}` : ""}
                      </div>
                    </div>
                    <div className="magic-layer-btns">
                      <button
                        type="button"
                        className={`magic-mini-btn ${layer.visible ? "is-active" : ""}`}
                        title={layer.visible ? t("magicLayers.hide") : t("magicLayers.show")}
                        aria-label={layer.visible ? t("magicLayers.hide") : t("magicLayers.show")}
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
                      >
                        {layer.visible ? "👁" : "🕶"}
                      </button>
                      <button
                        type="button"
                        className="magic-mini-btn"
                        title={layer.deleted ? t("magicLayers.restore") : t("magicLayers.delete")}
                        aria-label={layer.deleted ? t("magicLayers.restore") : t("magicLayers.delete")}
                        onClick={(e) => { e.stopPropagation(); toggleDelete(layer.id); }}
                      >
                        {layer.deleted ? "↩" : "🗑"}
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="magic-layer-item is-locked" aria-disabled="true">
                <img src={scene.baseUrl} alt="" className="magic-layer-thumb" onError={(e) => { (e.target as HTMLElement).style.visibility = "hidden"; }} />
                <div className="magic-layer-info">
                  <div className="magic-layer-name">{t("magicLayers.baseLayer")}</div>
                  <div className="magic-layer-meta">{t("magicLayers.baseLayerMeta")}</div>
                </div>
                <span className="magic-lock" aria-label={t("magicLayers.locked")} title={t("magicLayers.locked")}>🔒</span>
              </div>
            </div>

            {onReseparate ? (
              <button type="button" className="magic-btn magic-btn-ghost magic-btn-sm magic-redetect" onClick={handleReseparate} disabled={busy}>
                🔍 {reseparating ? t("magicLayers.reseparating") : t("magicLayers.reseparate")}
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {toast ? <div className="magic-toast" role="status">{toast}</div> : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={t("magicLayers.stay")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const action = confirm.action; setConfirm(null); action(); }}
        />
      ) : null}

      {downloadSheet ? (
        <DownloadReadySheet blob={downloadSheet.blob} filename={downloadSheet.filename} onClose={() => setDownloadSheet(null)} />
      ) : null}
    </div>
  );
}
