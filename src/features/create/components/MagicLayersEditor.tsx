import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { GenerationElement, GenerationTextLayer } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { downloadBlob } from "../../../app/downloadHelper";
import {
  BACKGROUND_ID,
  buildEditorLayers,
  firstLine,
  groupOf,
  moveToIndex,
  newLocalId,
  orderPosition,
  reorderLayer,
  resetElement,
  resetTextLayer,
  touchesTypography,
  type BackgroundState,
  type EditorLayer,
  type EditorState,
  type ElementItem,
  type ElementPatch,
  type OrderAction,
  type TextLayerItem,
  type TextPatch,
} from "./magicLayers/editorTypes";
import {
  canvasToBlob,
  canvasToDataUrl,
  composeScene,
  ensureFonts,
  fontStack,
  layoutText,
  renderOriginal,
  renderScene,
  type HandleId,
  type Point,
  type Rect,
} from "./magicLayers/renderLayers";
import {
  boundingBox,
  drawGuides,
  drawOutline,
  drawSelection,
  handleCursor,
  hitHandle,
  hitTest,
  layerRect,
  rectCenter,
  resizeFromCorner,
  rotateVector,
  scaleAroundCenter,
  scaleTextPatch,
  snapAngle,
  snapBounds,
  snapTargets,
  toLocal,
  normalizeAngle,
  type CornerHandle,
  type Guide,
  type SnapTargets,
} from "./magicLayers/geometry";
import { AlphaHitCache, loadCorsImage, releaseImage, type LoadedImage } from "./magicLayers/loadImages";
import { useLayerHistory } from "./magicLayers/useLayerHistory";
import { TextLayerProps } from "./magicLayers/TextLayerProps";
import { BackgroundProps, ElementProps, LayersList } from "./magicLayers/LayerPanels";
import { ConfirmDialog, DownloadReadySheet } from "./magicLayers/EditorDialogs";
import "./MagicLayersEditor.css";

/** Muharrir ochiladigan ma'lumot (API kontrakti v4). */
export type MagicLayersSource = {
  /** Asl rasm — "Asl rasm" bilan solishtirish uchun. */
  baseUrl: string;
  /** Obyektlar va matnlarsiz fon. */
  backgroundUrl: string;
  width: number;
  height: number;
  /** Ajratilgan obyektlar (RGBA kesmalar). */
  elements: GenerationElement[];
  textLayers: GenerationTextLayer[];
  textRemoved?: boolean;
  objectsRemoved?: boolean;
};

type Props = {
  jobId: string;
  variant: number;
  source: MagicLayersSource;
  onClose: () => void;
  /** "← Orqaga": muharrirni yopib, bosh sahifaga qaytish. */
  onBack?: () => void;
  onSave: (imageDataUrl: string) => Promise<boolean | void>;
  /** "Qayta ajratish" (force). */
  onReseparate?: () => Promise<MagicLayersSource>;
};

type Interaction = {
  pointerId: number;
  mode: "move" | "resize" | "width" | "rotate" | "pinch";
  handle: HandleId | null;
  layerId: string;
  startPt: Point;
  start: EditorLayer;
  startRect: Rect;
  /** Sudrashdan oldingi holat — tugaganda bitta undo qadami bo'ladi. */
  snapshot: EditorState;
  moved: boolean;
  targets: SnapTargets | null;
  pinch?: { ids: [number, number]; startDist: number; startAngle: number; startMid: Point };
};

type ImageLoadState = "loading" | "ok" | "error";

const EMPTY_STATE: EditorState = { layers: [], background: { visible: true, color: null } };
const MIN_TEXT_WIDTH = 16;
const MIN_FONT = 6;
const MAX_FONT = 600;
const MIN_ELEMENT = 12;
const DOUBLE_TAP_MS = 350;
const OUTLINE_INTRO_MS = 2000;
const SNAP_CSS_PX = 6;

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

/** Manbadagi barcha qatlam rasmlari (fon, obyektlar, matn kesmalari). */
function requiredUrls(source: MagicLayersSource): string[] {
  const urls = new Set<string>();
  if (source.backgroundUrl) urls.add(source.backgroundUrl);
  for (const el of source.elements ?? []) if (el?.url) urls.add(el.url);
  for (const t of source.textLayers ?? []) if (t?.imageUrl && t.imageBox) urls.add(t.imageUrl);
  return [...urls];
}

function insideLayer(layer: EditorLayer, pt: Point): boolean {
  const rect = layerRect(layer);
  const local = toLocal(pt, rect, layer.rotation);
  return local.x >= rect.x && local.x <= rect.x + rect.width && local.y >= rect.y && local.y <= rect.y + rect.height;
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
  const pointers = useRef(new Map<number, Point>());
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  /** Barmoq bo'sh joyga tegdi: tanlov qo'yib yuborilganda olinadi (ikkinchi barmoq — chimchilash). */
  const pendingDeselect = useRef(false);
  const loadToken = useRef(0);
  const sourceState = useRef<EditorState>(EMPTY_STATE);

  const history = useLayerHistory<EditorState>(EMPTY_STATE);
  const { layers, background } = history.present;
  const { update, commitFrom, reset: resetHistory } = history;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [cursor, setCursor] = useState("default");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [outlinesOn, setOutlinesOn] = useState(true);
  const outlinesTouched = useRef(false);
  const [comparing, setComparing] = useState(false);

  const [images, setImages] = useState<Record<string, LoadedImage | undefined>>({});
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const [loadStates, setLoadStates] = useState<Record<string, ImageLoadState>>({});
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

  const coarsePointer = useMemo(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches), []);
  const handleRadiusCss = coarsePointer ? 11 : 7;
  const rotOffsetCss = coarsePointer ? 34 : 26;

  /* ---------------------------------------------------------------- */
  /* Yuklash (CORS-xavfsiz)                                            */
  /* ---------------------------------------------------------------- */

  const loadUrls = useCallback((urls: string[]) => {
    const token = loadToken.current;
    if (!urls.length) return;
    setLoadStates((current) => ({ ...current, ...Object.fromEntries(urls.map((u) => [u, "loading" as ImageLoadState])) }));
    for (const url of urls) {
      loadCorsImage(url).then(
        (image) => {
          if (token !== loadToken.current) {
            releaseImage(image);
            return;
          }
          releaseImage(imagesRef.current[url]);
          imagesRef.current = { ...imagesRef.current, [url]: image };
          setImages(imagesRef.current);
          setLoadStates((current) => ({ ...current, [url]: "ok" }));
        },
        () => {
          if (token !== loadToken.current) return;
          setLoadStates((current) => ({ ...current, [url]: "error" }));
        },
      );
    }
  }, []);

  const loadSource = useCallback((next: MagicLayersSource) => {
    const width = Math.max(1, Math.round(next.width || 1080));
    const height = Math.max(1, Math.round(next.height || 1440));
    loadToken.current += 1;
    for (const image of Object.values(imagesRef.current)) releaseImage(image);
    imagesRef.current = {};
    setImages({});
    setLoadStates({});
    alphaCache.current.clear();
    const items = buildEditorLayers(next.elements ?? [], next.textLayers ?? [], {
      width,
      height,
      productLabel: t("magicLayers.elementProduct"),
      graphicLabel: t("magicLayers.elementGraphic"),
      textLabel: t("magicLayers.textLayer"),
    });
    const state: EditorState = { layers: items, background: { visible: true, color: null } };
    sourceState.current = state;
    resetHistory(state);
    setScene(next);
    setSelectedId(null);
    setHoverId(null);
    setEditingId(null);
    setGuides([]);
    editingRef.current = null;
    pendingNewRef.current = null;
    const urls = requiredUrls(next);
    if (next.baseUrl && !urls.includes(next.baseUrl)) urls.push(next.baseUrl);
    loadUrls(urls);
  }, [loadUrls, resetHistory, t]);

  // Faqat ochilganda (ota komponent qayta chizilganda foydalanuvchi o'zgarishlari yo'qolmasin).
  // Yopilganda — kechikkan yuklashlar e'tiborsiz qoladi va objectURL'lar bo'shatiladi.
  // StrictMode (dev) effektni ikki marta ishga tushiradi — shuning uchun tozalash + qayta yuklash.
  useEffect(() => {
    loadSource(source);
    return () => {
      loadToken.current += 1;
      for (const image of Object.values(imagesRef.current)) releaseImage(image);
      imagesRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ochilganda 2 soniya barcha qatlamlar ramkasi ko'rsatiladi, keyin — faqat kursor ostida.
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!outlinesTouched.current) setOutlinesOn(false); }, OUTLINE_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const required = useMemo(() => requiredUrls(scene), [scene]);
  const failedUrls = required.filter((u) => loadStates[u] === "error");
  const pendingUrls = required.filter((u) => !loadStates[u] || loadStates[u] === "loading");
  const backgroundImage = images[scene.backgroundUrl];
  const baseImage = images[scene.baseUrl];
  const bgLoading = !backgroundImage && loadStates[scene.backgroundUrl] !== "error";
  const imagesReady = pendingUrls.length === 0 && failedUrls.length === 0;

  const retryFailed = () => {
    const urls = Object.entries(loadStates).filter(([, s]) => s === "error").map(([u]) => u);
    loadUrls(urls);
  };

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

  const activeLayer = selectedId && selectedId !== BACKGROUND_ID ? layers.find((l) => l.id === selectedId && !l.deleted) ?? null : null;
  const editingLayer = editingId ? (layers.find((l) => l.id === editingId && l.kind === "text") as TextLayerItem | undefined) ?? null : null;
  const unit = cssWidth > 0 ? W / cssWidth : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (comparing) {
      renderOriginal(ctx, W, H, baseImage);
      return;
    }
    renderScene(ctx, { width: W, height: H, backgroundImage, background, layers, images, editingId });
    if (editingId) return;
    for (const layer of layers) {
      if (layer.deleted || !layer.visible || layer.id === activeLayer?.id) continue;
      if (layer.id === hoverId) drawOutline(ctx, layer, unit, false);
      else if (outlinesOn) drawOutline(ctx, layer, unit);
    }
    drawGuides(ctx, guides, W, H, unit);
    if (activeLayer && activeLayer.visible) drawSelection(ctx, activeLayer, unit, handleRadiusCss, rotOffsetCss);
  }, [activeLayer, background, backgroundImage, baseImage, comparing, editingId, fontsTick, guides, H, handleRadiusCss, hoverId, images, layers, outlinesOn, rotOffsetCss, unit, W]);

  /* ---------------------------------------------------------------- */
  /* Qatlam amallari                                                   */
  /* ---------------------------------------------------------------- */

  type UpdateOpts = { coalesce?: string; transient?: boolean };
  const updateLayers = useCallback((fn: (prev: EditorLayer[]) => EditorLayer[], options?: UpdateOpts) => {
    update((s) => {
      const next = fn(s.layers);
      return next === s.layers ? s : { ...s, layers: next };
    }, options);
  }, [update]);

  const patchBackground = (patch: Partial<BackgroundState>, coalesce?: string) => {
    update((s) => ({ ...s, background: { ...s.background, ...patch } }), { coalesce });
  };

  const patchElement = (id: string, patch: ElementPatch, coalesce?: string) => {
    updateLayers((prev) => prev.map((l) => (l.id === id && l.kind === "element" ? { ...l, ...patch } : l)), { coalesce });
  };

  /** Matn/tipografiya o'zgarsa — kesmadan shrift bilan chizishga o'tadi. */
  const patchText = (id: string, patch: TextPatch, coalesce?: string) => {
    updateLayers((prev) => prev.map((l) => {
      if (l.id !== id || l.kind !== "text") return l;
      const next: TextLayerItem = { ...l, ...patch };
      if (touchesTypography(patch)) next.rendered = true;
      if (patch.text !== undefined) next.name = firstLine(patch.text) || l.name;
      return next;
    }), { coalesce });
  };

  const nudgeLayer = (id: string, dx: number, dy: number) => {
    updateLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, x: l.x + dx, y: l.y + dy } as EditorLayer) : l)), { coalesce: `nudge:${id}` });
  };

  const toggleVisibility = (id: string) => {
    updateLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const toggleLock = (id: string) => {
    updateLayers((prev) => prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
  };

  const deleteLayer = (id: string) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    updateLayers((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
    if (selectedId === id) setSelectedId(null);
    setHoverId(null);
    setToast(t("magicLayers.deletedToast"));
  };

  const reorder = (id: string, action: OrderAction) => updateLayers((prev) => reorderLayer(prev, id, action));
  const moveLayerToIndex = (id: string, index: number) => updateLayers((prev) => moveToIndex(prev, id, index));

  const resetText = (id: string) => {
    updateLayers((prev) => prev.map((l) => (l.id === id && l.kind === "text" ? resetTextLayer(l) : l)));
  };

  const resetElementPosition = (id: string) => {
    updateLayers((prev) => prev.map((l) => (l.id === id && l.kind === "element" ? resetElement(l) : l)));
  };

  const resetAll = () => {
    update(() => sourceState.current);
    setSelectedId(null);
  };

  const duplicateLayer = (id: string) => {
    const src = layers.find((l) => l.id === id && !l.deleted);
    if (!src) return;
    let copy: EditorLayer;
    if (src.kind === "text") {
      const offset = Math.round(Math.max(16, src.fontSize * 0.4));
      copy = { ...src, id: newLocalId("text"), x: src.x + offset, y: src.y + offset, deleted: false, visible: true, locked: false };
    } else {
      const offset = Math.round(Math.max(16, Math.min(src.width, src.height) * 0.08));
      const x = src.x + offset;
      const y = src.y + offset;
      copy = { ...src, id: newLocalId("el"), name: `${src.name} (${t("magicLayers.copySuffix")})`, x, y, original: { x, y, width: src.width, height: src.height }, deleted: false, visible: true, locked: false };
    }
    updateLayers((prev) => {
      const index = groupOf(prev, src.kind).findIndex((l) => l.id === src.id);
      return moveToIndex([...prev, copy], copy.id, index + 1);
    });
    setSelectedId(copy.id);
  };

  /* ---------------------------------------------------------------- */
  /* Matnni joyida tahrirlash                                          */
  /* ---------------------------------------------------------------- */

  const startEditing = (layer: TextLayerItem) => {
    if (layer.locked) return;
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
        updateLayers((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
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
    const maxOrder = groupOf(layers, "text").reduce((m, l) => Math.max(m, l.order), 0);
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
      imageUrl: null,
      imageBox: null,
      rendered: true,
      pristine: null,
      opacity: 1,
      visible: true,
      locked: false,
      deleted: false,
    };
    if (editingRef.current) finishEditing("commit");
    updateLayers((prev) => [...prev, layer]);
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
    hitTest(layers, pt, { images, alpha: alphaCache.current, textSlop: (touch ? 10 : 4) * unit });

  const beginInteraction = (e: React.PointerEvent<HTMLCanvasElement>, layer: EditorLayer, mode: Interaction["mode"], handle: HandleId | null, pt: Point) => {
    interaction.current = {
      pointerId: e.pointerId,
      mode,
      handle,
      layerId: layer.id,
      startPt: pt,
      start: layer,
      startRect: layerRect(layer),
      snapshot: history.present,
      moved: false,
      targets: mode === "move" ? snapTargets(layers, layer.id, W, H) : null,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  /** Ikkinchi barmoq: tanlangan qatlamni chimchilab o'lchash va aylantirish. */
  const beginPinch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const it = interaction.current;
    const layerId = it?.layerId ?? activeLayer?.id;
    const layer = layerId ? layers.find((l) => l.id === layerId && !l.deleted) : null;
    if (!layer || layer.locked) return false;
    const ids = [...pointers.current.keys()].slice(0, 2) as [number, number];
    const a = pointers.current.get(ids[0])!;
    const b = pointers.current.get(ids[1])!;
    interaction.current = {
      pointerId: ids[0],
      mode: "pinch",
      handle: null,
      layerId: layer.id,
      startPt: a,
      start: layer,
      startRect: layerRect(layer),
      snapshot: it?.snapshot ?? history.present,
      moved: Boolean(it?.moved),
      targets: null,
      pinch: {
        ids,
        startDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        startAngle: Math.atan2(b.y - a.y, b.x - a.x),
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      },
    };
    setSelectedId(layer.id);
    setGuides([]);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    return true;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (comparing) return;
    const pt = getCanvasCoords(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, pt);
    if (editingRef.current) {
      // Birinchi bosish — tahrirlashni tugatish.
      finishEditing("commit");
      return;
    }
    if (pointers.current.size === 2 && e.pointerType === "touch") {
      pendingDeselect.current = false;
      beginPinch(e);
      return;
    }
    if (pointers.current.size > 1) return;
    const touch = e.pointerType !== "mouse";
    const hitRadius = (touch || coarsePointer ? 24 : 11) * unit;

    if (activeLayer && activeLayer.visible) {
      const handle = hitHandle(activeLayer, pt, hitRadius, rotOffsetCss * unit);
      if (handle) {
        const mode = handle === "rot" ? "rotate" : handle === "e" || handle === "w" ? "width" : "resize";
        beginInteraction(e, activeLayer, mode, handle, pt);
        return;
      }
    }

    let hit = hitAt(pt, touch);
    // Tanlangan obyekt qutisining shaffof joyidan ham sudrash mumkin.
    if (activeLayer && activeLayer.visible && (!hit || hit.kind === "element") && insideLayer(activeLayer, pt)) hit = activeLayer;
    if (!hit) {
      lastTap.current = null;
      if (touch && activeLayer) pendingDeselect.current = true;
      else setSelectedId(null);
      return;
    }

    const now = Date.now();
    if (hit.kind === "text" && !hit.locked && lastTap.current?.id === hit.id && now - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      e.preventDefault();
      startEditing(hit);
      return;
    }
    lastTap.current = { id: hit.id, at: now };
    setSelectedId(hit.id);
    if (!hit.locked) beginInteraction(e, hit, "move", null, pt);
  };

  const applyPatch = (id: string, patch: Partial<EditorLayer>) => {
    updateLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as EditorLayer) : l)), { transient: true });
  };

  const updateHover = (pt: Point) => {
    if (activeLayer && activeLayer.visible) {
      const handle = hitHandle(activeLayer, pt, 11 * unit, rotOffsetCss * unit);
      if (handle) {
        setCursor(handleCursor(handle, activeLayer.rotation));
        if (hoverId) setHoverId(null);
        return;
      }
    }
    const hit = hitAt(pt, false);
    const id = hit?.id ?? null;
    if (id !== hoverId) setHoverId(id);
    setCursor(hit ? (hit.locked ? "pointer" : "move") : activeLayer && insideLayer(activeLayer, pt) && !activeLayer.locked ? "move" : "default");
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e.clientX, e.clientY);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, pt);
    const it = interaction.current;
    if (!it) {
      if (e.pointerType === "mouse" && !editingRef.current && !comparing) updateHover(pt);
      return;
    }
    const start = it.start;

    if (it.mode === "pinch" && it.pinch) {
      if (!it.pinch.ids.includes(e.pointerId)) return;
      const a = pointers.current.get(it.pinch.ids[0]);
      const b = pointers.current.get(it.pinch.ids[1]);
      if (!a || !b) return;
      it.moved = true;
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let f = dist / it.pinch.startDist;
      const shift = { x: mid.x - it.pinch.startMid.x, y: mid.y - it.pinch.startMid.y };
      const rotation = normalizeAngle(start.rotation + ((angle - it.pinch.startAngle) * 180) / Math.PI);
      if (start.kind === "text") {
        f = Math.max(MIN_FONT / start.fontSize, Math.min(MAX_FONT / start.fontSize, f));
        const rect = scaleAroundCenter(it.startRect, f, shift);
        applyPatch(it.layerId, { ...scaleTextPatch(start, it.startRect, rect, f), rotation });
      } else {
        f = Math.max(MIN_ELEMENT / Math.max(1, Math.min(start.width, start.height)), f);
        const rect = scaleAroundCenter(it.startRect, f, shift);
        applyPatch(it.layerId, { ...rect, rotation });
      }
      return;
    }

    if (it.pointerId !== e.pointerId) return;
    const dx = pt.x - it.startPt.x;
    const dy = pt.y - it.startPt.y;
    if (!it.moved) {
      if (Math.hypot(dx, dy) < 3 * unit) return;
      it.moved = true;
      lastTap.current = null;
    }

    if (it.mode === "move") {
      let mx = dx;
      let my = dy;
      if (it.targets && !e.altKey) {
        const moved = { ...it.startRect, x: it.startRect.x + dx, y: it.startRect.y + dy };
        const snap = snapBounds(boundingBox(moved, start.rotation), it.targets, SNAP_CSS_PX * unit);
        mx += snap.dx;
        my += snap.dy;
        setGuides(snap.guides);
      } else if (guides.length) {
        setGuides([]);
      }
      applyPatch(it.layerId, { x: Math.round((start.x + mx) * 100) / 100, y: Math.round((start.y + my) * 100) / 100 });
      return;
    }

    if (it.mode === "rotate") {
      const c = rectCenter(it.startRect);
      const a0 = Math.atan2(it.startPt.y - c.y, it.startPt.x - c.x);
      const a1 = Math.atan2(pt.y - c.y, pt.x - c.x);
      applyPatch(it.layerId, { rotation: snapAngle(start.rotation + ((a1 - a0) * 180) / Math.PI, e.shiftKey) });
      setCursor("grabbing");
      return;
    }

    if (it.mode === "width" && start.kind === "text") {
      const local = rotateVector({ x: dx, y: dy }, start.rotation);
      const handle = it.handle;
      const raw = handle === "e" ? start.width + local.x : start.width - local.x;
      const width = Math.max(MIN_TEXT_WIDTH, Math.min(W * 3, raw));
      applyPatch(it.layerId, { width: Math.round(width), x: Math.round(handle === "w" ? start.x + start.width - width : start.x) });
      return;
    }

    if (it.mode === "resize" && it.handle) {
      const handle = it.handle as CornerHandle;
      if (start.kind === "element") {
        const res = resizeFromCorner(it.startRect, start.rotation, handle, pt, !e.shiftKey, MIN_ELEMENT);
        applyPatch(it.layerId, {
          x: Math.round(res.rect.x * 100) / 100,
          y: Math.round(res.rect.y * 100) / 100,
          width: Math.round(res.rect.width * 100) / 100,
          height: Math.round(res.rect.height * 100) / 100,
        });
      } else {
        const minFactor = Math.max(MIN_FONT / start.fontSize, MIN_TEXT_WIDTH / Math.max(1, start.width));
        const minSize = Math.min(it.startRect.width, it.startRect.height) * minFactor;
        const res = resizeFromCorner(it.startRect, start.rotation, handle, pt, true, minSize);
        const f = Math.min(res.fx, MAX_FONT / start.fontSize);
        applyPatch(it.layerId, scaleTextPatch(start, it.startRect, res.rect, f));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pendingDeselect.current && pointers.current.size === 0) {
      pendingDeselect.current = false;
      setSelectedId(null);
    }
    const it = interaction.current;
    if (!it) return;
    const ends = it.mode === "pinch" ? Boolean(it.pinch?.ids.includes(e.pointerId)) : it.pointerId === e.pointerId;
    if (!ends) return;
    interaction.current = null;
    setGuides([]);
    if (it.moved) commitFrom(it.snapshot);
    if (e.pointerType === "mouse") updateHover(getCanvasCoords(e.clientX, e.clientY));
  };

  /* ---------------------------------------------------------------- */
  /* Chiqish, saqlash, yuklab olish                                    */
  /* ---------------------------------------------------------------- */

  const busy = saving || downloading || reseparating;
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

  /** Tahrirlash oynasi ochiq bo'lsa — joriy qoralamani ham hisobga oladi. */
  const exportLayers = (): EditorLayer[] => {
    const id = editingRef.current;
    if (!id) return layers;
    const draft = draftRef.current;
    return layers.map((l) => (l.id === id && l.kind === "text" && l.text !== draft ? { ...l, text: draft, rendered: true } : l));
  };

  const compose = () => composeScene({ width: W, height: H, backgroundImage, background, layers: exportLayers(), images });

  const handleSave = async () => {
    if (busy || !imagesReady) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = await compose();
      if (editingRef.current) finishEditing("commit");
      const result = await onSave(canvasToDataUrl(canvas));
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
    if (busy || !imagesReady) return;
    setDownloading(true);
    setError(null);
    try {
      const canvas = await compose();
      if (editingRef.current) finishEditing("commit");
      const blob = await canvasToBlob(canvas);
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
    if (editingRef.current) finishEditing("commit");
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

  const selectFromList = (id: string) => {
    if (editingRef.current) finishEditing("commit");
    setSelectedId(id);
  };

  /* ---------------------------------------------------------------- */
  /* Klaviatura                                                        */
  /* ---------------------------------------------------------------- */

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (e: KeyboardEvent) => {
    if (confirm || downloadSheet || editingRef.current) return;
    if (isTypingTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const keyZ = e.code === "KeyZ" || key === "z" || key === "я";
    const keyY = e.code === "KeyY" || key === "y" || key === "н";
    const keyD = e.code === "KeyD" || key === "d" || key === "в";

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
    if (e.key === "Escape") {
      if (selectedId) { e.preventDefault(); setSelectedId(null); }
      return;
    }
    if (!activeLayer) return;
    if (mod && keyD) {
      e.preventDefault();
      duplicateLayer(activeLayer.id);
      return;
    }
    if (activeLayer.locked) return;
    const step = e.shiftKey ? 10 : 1;
    const nudges: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const nudge = nudges[e.key];
    if (nudge) {
      e.preventDefault();
      nudgeLayer(activeLayer.id, nudge.x, nudge.y);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteLayer(activeLayer.id);
    } else if (e.key === "Enter" && activeLayer.kind === "text") {
      e.preventDefault();
      startEditing(activeLayer);
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
    // fontsTick: shriftlar yuklangach o'lchamlar o'zgaradi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cssWidth, editDraft, editingLayer, fontsTick, W]);

  /* ---------------------------------------------------------------- */
  /* Ko'rinish                                                         */
  /* ---------------------------------------------------------------- */

  const liveTexts = layers.filter((l) => l.kind === "text" && !l.deleted);
  const liveElements = layers.filter((l) => l.kind === "element" && !l.deleted);
  const showTextNotice = scene.textRemoved === false && (scene.textLayers?.length ?? 0) > 0;
  const showObjectsNotice = scene.objectsRemoved === false && (scene.elements?.length ?? 0) > 0;
  const thumbs = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [url, image] of Object.entries(images)) out[url] = image?.objectUrl;
    out.__background = images[scene.backgroundUrl]?.objectUrl;
    return out;
  }, [images, scene.backgroundUrl]);
  const failedMap = useMemo(() => Object.fromEntries(failedUrls.map((u) => [u, true])), [failedUrls.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const position = activeLayer ? orderPosition(layers, activeLayer.id) : { isTop: true, isBottom: true };
  const hint = editingId ? t("magicLayers.inlineHint") : activeLayer?.kind === "element" ? t("magicLayers.elementHint") : t("magicLayers.dragHint");

  const stopCompare = () => setComparing(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Portal: muharrir sayt menyusi va boshqa "position:fixed"/transform'li
  // ota-elementlar ichida qolib, yuqori qatori (Saqlash, Yuklab olish,
  // Orqaga) menyu tagida yashirinib qolmasligi uchun to'g'ridan-to'g'ri
  // <body> ga chiqariladi.
  return createPortal(
    <div className="magic-layers-backdrop" role="dialog" aria-modal="true" aria-labelledby="magic-editor-title">
      <header className="magic-layers-header">
        <div className="magic-header-left">
          <button type="button" className="magic-btn magic-btn-secondary magic-back-btn" onClick={handleBack} disabled={saving} aria-label={t("magicLayers.backAria")}>
            <span aria-hidden="true">←</span>
            <span className="magic-btn-label">{t("magicLayers.back")}</span>
          </button>
          <span className="magic-brand-badge">✨ {t("magicLayers.badge")}</span>
          <span className="magic-beta-badge">{t("magicLayers.betaBadge")}</span>
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
              ＋ <span className="magic-btn-label-sm">{t("magicLayers.addText")}</span>
            </button>
            {activeLayer?.kind === "text" && !editingId && !activeLayer.locked ? (
              <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" onClick={() => startEditing(activeLayer)}>
                ✎ <span className="magic-btn-label">{t("magicLayers.editText")}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`magic-btn magic-btn-secondary magic-btn-sm magic-toggle ${outlinesOn ? "is-on" : ""}`}
              onClick={toggleOutlines}
              aria-pressed={outlinesOn}
              title={t("magicLayers.showTexts")}
            >
              <span aria-hidden="true">▢</span> <span className="magic-btn-label">{t("magicLayers.showTexts")}</span>
            </button>
            <button
              type="button"
              className={`magic-btn magic-btn-secondary magic-btn-sm magic-compare ${comparing ? "is-on" : ""}`}
              disabled={!baseImage}
              title={t("magicLayers.compareHint")}
              aria-pressed={comparing}
              onPointerDown={(e) => { e.preventDefault(); if (editingRef.current) finishEditing("commit"); setComparing(true); }}
              onPointerUp={stopCompare}
              onPointerLeave={stopCompare}
              onPointerCancel={stopCompare}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setComparing(true); } }}
              onKeyUp={stopCompare}
              onBlur={stopCompare}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span aria-hidden="true">🖼</span> <span className="magic-btn-label-sm">{t("magicLayers.compare")}</span>
            </button>
            <span className="magic-toolbar-sep" />
            <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm magic-btn-square" onClick={history.undo} disabled={!history.canUndo || busy} title={`${t("magicLayers.undo")} (Ctrl+Z)`} aria-label={t("magicLayers.undo")}>↶</button>
            <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm magic-btn-square" onClick={history.redo} disabled={!history.canRedo || busy} title={`${t("magicLayers.redo")} (Ctrl+Shift+Z)`} aria-label={t("magicLayers.redo")}>↷</button>
            <span className="magic-toolbar-hint">💡 {hint}</span>
          </div>

          {error ? (
            <div className="magic-error-banner" role="alert">
              <span>{error}</span>
              <button type="button" className="magic-mini-btn" onClick={() => setError(null)} aria-label={t("magicLayers.close")}>✕</button>
            </div>
          ) : null}
          {failedUrls.length ? (
            <div className="magic-error-banner" role="alert" data-testid="layers-failed">
              <span><b>{t("magicLayers.imagesFailed")}</b> {t("magicLayers.imagesFailedText", { count: failedUrls.length })}</span>
              <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" onClick={retryFailed}>↻ {t("magicLayers.retry")}</button>
            </div>
          ) : null}

          <div className="magic-canvas-stage">
            <div className={`magic-canvas-wrapper ${comparing ? "is-comparing" : ""}`}>
              <canvas
                ref={canvasRef}
                className="magic-canvas-element"
                style={{ cursor }}
                width={W}
                height={H}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => { if (!interaction.current) setHoverId(null); }}
                onContextMenu={(e) => e.preventDefault()}
              />
              {comparing ? <span className="magic-compare-badge">{t("magicLayers.compareBadge")}</span> : null}
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

          {reseparating || bgLoading ? (
            <div className="magic-loading-overlay">
              <div className="magic-spinner" />
              <div className="magic-loading-title">{reseparating ? t("magicLayers.loadingTitle") : t("magicLayers.imageLoadingTitle")}</div>
              {reseparating ? <div className="magic-loading-sub">{t("magicLayers.loadingText")}</div> : null}
            </div>
          ) : null}
        </section>

        <aside className="magic-sidebar">
          {showObjectsNotice ? (
            <div className="magic-notice" role="note">
              <b>ℹ {t("magicLayers.objectsNotRemovedTitle")}</b>
              <span>{t("magicLayers.objectsNotRemovedText")}</span>
            </div>
          ) : null}
          {showTextNotice ? (
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
              onDuplicate={() => duplicateLayer(activeLayer.id)}
              onDelete={() => deleteLayer(activeLayer.id)}
              onReset={() => resetText(activeLayer.id)}
              isTop={position.isTop}
              isBottom={position.isBottom}
              onOrder={(action) => reorder(activeLayer.id, action)}
              onToggleLock={() => toggleLock(activeLayer.id)}
            />
          ) : activeLayer?.kind === "element" ? (
            <ElementProps
              layer={activeLayer}
              thumbUrl={thumbs[activeLayer.url]}
              isTop={position.isTop}
              isBottom={position.isBottom}
              onChange={(patch, coalesce) => patchElement(activeLayer.id, patch, coalesce)}
              onOrder={(action) => reorder(activeLayer.id, action)}
              onDuplicate={() => duplicateLayer(activeLayer.id)}
              onDelete={() => deleteLayer(activeLayer.id)}
              onReset={() => resetElementPosition(activeLayer.id)}
              onToggleLock={() => toggleLock(activeLayer.id)}
            />
          ) : selectedId === BACKGROUND_ID ? (
            <BackgroundProps state={background} thumbUrl={thumbs.__background} onChange={patchBackground} />
          ) : (
            <p className="magic-empty-hint">
              {liveTexts.length + liveElements.length > 0 ? t("magicLayers.selectHintText") : t("magicLayers.selectHint")}
            </p>
          )}

          <div className="magic-layers-section">
            <div className="magic-section-title">
              <span>{t("magicLayers.layersTitle")}</span>
              <span className="magic-layer-count">{t("magicLayers.layerCount", { elements: liveElements.length, texts: liveTexts.length })}</span>
            </div>

            <LayersList
              layers={layers}
              background={background}
              selectedId={selectedId}
              thumbs={thumbs}
              failed={failedMap}
              onSelect={selectFromList}
              onEdit={startEditing}
              onHover={setHoverId}
              onToggleVisible={toggleVisibility}
              onToggleLock={toggleLock}
              onDelete={deleteLayer}
              onMoveToIndex={moveLayerToIndex}
              onBackgroundVisible={() => patchBackground({ visible: !background.visible })}
            />

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
  , document.body);
}
