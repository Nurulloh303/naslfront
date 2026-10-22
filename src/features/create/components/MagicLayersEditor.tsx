import { useEffect, useRef, useState, useCallback } from "react";
import type { GenerationLayer } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import "./MagicLayersEditor.css";

type Props = {
  jobId: string;
  variant: number;
  initialLayers: GenerationLayer[];
  resultWidth?: number;
  resultHeight?: number;
  onClose: () => void;
  onSave: (imageDataUrl: string) => Promise<boolean | void>;
  onReseparate?: () => Promise<GenerationLayer[]>;
};

interface LayerItemState {
  id: string;
  name: string;
  url: string;
  order: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  visible: boolean;
  deleted: boolean;
  image: HTMLImageElement | null;
  loaded: boolean;
  width: number;
  height: number;
}

type DragMode = "move" | "resize-nw" | "resize-ne" | "resize-se" | "resize-sw" | null;

export function MagicLayersEditor({
  jobId: _jobId,
  variant,
  initialLayers,
  resultWidth = 1080,
  resultHeight = 1440,
  onClose,
  onSave,
  onReseparate,
}: Props) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [layers, setLayers] = useState<LayerItemState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reseparating, setReseparating] = useState(false);

  // Dragging and interaction state
  const isInteracting = useRef(false);
  const dragMode = useRef<DragMode>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const layerStartPos = useRef<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });

  // Initialize and load images
  const initLayers = useCallback((rawLayers: GenerationLayer[]) => {
    // Sort ascending by order (order 1 is background, order 2 is product, order 3 is text, etc.)
    const sorted = [...rawLayers].sort((a, b) => a.order - b.order);
    const initialItems: LayerItemState[] = sorted.map((layer) => ({
      id: layer.id,
      name: layer.name || `${t("magicLayers.defaultLayer")} ${layer.order}`,
      url: layer.url,
      order: layer.order,
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      visible: true,
      deleted: false,
      image: null,
      loaded: false,
      width: layer.width || resultWidth,
      height: layer.height || resultHeight,
    }));

    setLayers(initialItems);
    if (initialItems.length > 0) {
      // Select the top-most or product layer by default
      const defaultSelected = initialItems.find((l) => l.order === 2) || initialItems[initialItems.length - 1];
      setSelectedId(defaultSelected.id);
    }

    // Preload all image assets
    initialItems.forEach((item) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setLayers((current) =>
          current.map((l) => (l.id === item.id ? { ...l, image: img, loaded: true, width: img.naturalWidth || l.width, height: img.naturalHeight || l.height } : l))
        );
      };
      img.onerror = () => {
        // Fallback without crossOrigin if CORS fails
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          setLayers((current) =>
            current.map((l) => (l.id === item.id ? { ...l, image: fallbackImg, loaded: true } : l))
          );
        };
        fallbackImg.src = item.url;
      };
      img.src = item.url;
    });
  }, [resultHeight, resultWidth, t]);

  useEffect(() => {
    initLayers(initialLayers);
  }, [initialLayers, initLayers]);

  // Selected layer
  const activeLayer = layers.find((l) => l.id === selectedId && !l.deleted);

  // Redraw canvas on state changes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear whole canvas
    ctx.clearRect(0, 0, resultWidth, resultHeight);

    // Filter active & visible layers sorted by order
    const renderList = [...layers]
      .filter((l) => !l.deleted && l.visible && l.loaded && l.image)
      .sort((a, b) => a.order - b.order);

    for (const layer of renderList) {
      if (!layer.image) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

      const w = resultWidth;
      const h = resultHeight;
      const cx = layer.x + w / 2;
      const cy = layer.y + h / 2;

      ctx.translate(cx, cy);
      ctx.scale(layer.scale, layer.scale);
      ctx.drawImage(layer.image, -w / 2, -h / 2, w, h);

      ctx.restore();
    }

    // Draw selection outline and resize handles for the active layer
    if (activeLayer && activeLayer.visible && !activeLayer.deleted) {
      ctx.save();
      const w = resultWidth;
      const h = resultHeight;
      const cx = activeLayer.x + w / 2;
      const cy = activeLayer.y + h / 2;

      ctx.translate(cx, cy);
      ctx.scale(activeLayer.scale, activeLayer.scale);

      // Selection bounding box
      ctx.strokeStyle = "#ff4d1c";
      ctx.lineWidth = 3 / activeLayer.scale;
      ctx.setLineDash([8 / activeLayer.scale, 6 / activeLayer.scale]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      // Corner handles
      const handleSize = 18 / activeLayer.scale;
      const corners = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 },
      ];

      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ff4d1c";
      ctx.lineWidth = 2.5 / activeLayer.scale;

      for (const corner of corners) {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }, [activeLayer, layers, resultHeight, resultWidth]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Transform client pointer coordinates into canvas coordinates (1080x1440)
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = resultWidth / rect.width;
    const scaleY = resultHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Check if click hits a corner resize handle of the active layer
  const hitTestHandle = (pt: { x: number; y: number }): DragMode => {
    if (!activeLayer) return null;
    const w = resultWidth;
    const h = resultHeight;
    const cx = activeLayer.x + w / 2;
    const cy = activeLayer.y + h / 2;

    const corners: { mode: DragMode; x: number; y: number }[] = [
      { mode: "resize-nw", x: cx - (w / 2) * activeLayer.scale, y: cy - (h / 2) * activeLayer.scale },
      { mode: "resize-ne", x: cx + (w / 2) * activeLayer.scale, y: cy - (h / 2) * activeLayer.scale },
      { mode: "resize-se", x: cx + (w / 2) * activeLayer.scale, y: cy + (h / 2) * activeLayer.scale },
      { mode: "resize-sw", x: cx - (w / 2) * activeLayer.scale, y: cy + (h / 2) * activeLayer.scale },
    ];

    const hitThreshold = 35; // handle touch radius in canvas px
    for (const c of corners) {
      const dist = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (dist <= hitThreshold) return c.mode;
    }
    return null;
  };

  // Pointer interactions
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e.clientX, e.clientY);

    // 1. Check if clicking on active handle
    const handleHit = hitTestHandle(pt);
    if (handleHit && activeLayer) {
      isInteracting.current = true;
      dragMode.current = handleHit;
      dragStartPos.current = pt;
      layerStartPos.current = { x: activeLayer.x, y: activeLayer.y, scale: activeLayer.scale };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 2. Click on canvas: find which layer was clicked (from top to bottom)
    const reversed = [...layers].filter((l) => !l.deleted && l.visible).sort((a, b) => b.order - a.order);
    let hitLayer: LayerItemState | null = null;

    for (const layer of reversed) {
      const cx = layer.x + resultWidth / 2;
      const cy = layer.y + resultHeight / 2;
      const halfW = (resultWidth / 2) * layer.scale;
      const halfH = (resultHeight / 2) * layer.scale;

      if (pt.x >= cx - halfW && pt.x <= cx + halfW && pt.y >= cy - halfH && pt.y <= cy + halfH) {
        hitLayer = layer;
        break;
      }
    }

    if (hitLayer) {
      setSelectedId(hitLayer.id);
      isInteracting.current = true;
      dragMode.current = "move";
      dragStartPos.current = pt;
      layerStartPos.current = { x: hitLayer.x, y: hitLayer.y, scale: hitLayer.scale };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      setSelectedId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInteracting.current || !activeLayer || !dragMode.current) return;
    const pt = getCanvasCoords(e.clientX, e.clientY);
    const dx = pt.x - dragStartPos.current.x;
    const dy = pt.y - dragStartPos.current.y;

    if (dragMode.current === "move") {
      setLayers((current) =>
        current.map((l) =>
          l.id === activeLayer.id
            ? { ...l, x: layerStartPos.current.x + dx, y: layerStartPos.current.y + dy }
            : l
        )
      );
    } else if (dragMode.current.startsWith("resize-")) {
      // Calculate scale change from center
      const cx = layerStartPos.current.x + resultWidth / 2;
      const cy = layerStartPos.current.y + resultHeight / 2;
      const initialDist = Math.hypot(dragStartPos.current.x - cx, dragStartPos.current.y - cy);
      const currentDist = Math.hypot(pt.x - cx, pt.y - cy);

      if (initialDist > 0) {
        const factor = currentDist / initialDist;
        const newScale = Math.max(0.2, Math.min(3.5, layerStartPos.current.scale * factor));
        setLayers((current) =>
          current.map((l) => (l.id === activeLayer.id ? { ...l, scale: Number(newScale.toFixed(2)) } : l))
        );
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isInteracting.current = false;
    dragMode.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Keyboard navigation (Nudge with arrows, Delete key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, x: l.x - step } : l)));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, x: l.x + step } : l)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, y: l.y - step } : l)));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, y: l.y + step } : l)));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        toggleDelete(selectedId);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selectedId]);

  // Operations on layers
  const toggleVisibility = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLayers((curr) => curr.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const toggleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLayers((curr) => curr.map((l) => (l.id === id ? { ...l, deleted: !l.deleted } : l)));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const updateScale = (val: number) => {
    if (!selectedId) return;
    setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, scale: val } : l)));
  };

  const updateOpacity = (val: number) => {
    if (!selectedId) return;
    setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, opacity: val } : l)));
  };

  const centerSelected = () => {
    if (!selectedId) return;
    setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, x: 0, y: 0 } : l)));
  };

  const resetSelected = () => {
    if (!selectedId) return;
    setLayers((curr) => curr.map((l) => (l.id === selectedId ? { ...l, x: 0, y: 0, scale: 1, opacity: 1, visible: true, deleted: false } : l)));
  };

  const resetAll = () => {
    setLayers((curr) =>
      curr.map((l) => ({
        ...l,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        deleted: false,
      }))
    );
  };

  const moveOrder = (id: string, direction: "up" | "down", e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLayers((curr) => {
      const sorted = [...curr].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((l) => l.id === id);
      if (index === -1) return curr;

      const targetIndex = direction === "up" ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) return curr;

      // Swap orders
      const currentOrder = sorted[index].order;
      const targetOrder = sorted[targetIndex].order;

      return curr.map((l) => {
        if (l.id === sorted[index].id) return { ...l, order: targetOrder };
        if (l.id === sorted[targetIndex].id) return { ...l, order: currentOrder };
        return l;
      });
    });
  };

  // Re-separate AI
  const handleReseparate = async () => {
    if (!onReseparate || reseparating) return;
    try {
      setReseparating(true);
      const newLayers = await onReseparate();
      initLayers(newLayers);
    } catch {
      // Handled by parent
    } finally {
      setReseparating(false);
    }
  };

  // Compose & Save
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Create high-res offscreen canvas
      const offscreen = document.createElement("canvas");
      offscreen.width = resultWidth;
      offscreen.height = resultHeight;
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Canvas context init failed");

      const renderList = [...layers]
        .filter((l) => !l.deleted && l.visible && l.loaded && l.image)
        .sort((a, b) => a.order - b.order);

      for (const layer of renderList) {
        if (!layer.image) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

        const w = resultWidth;
        const h = resultHeight;
        const cx = layer.x + w / 2;
        const cy = layer.y + h / 2;

        ctx.translate(cx, cy);
        ctx.scale(layer.scale, layer.scale);
        ctx.drawImage(layer.image, -w / 2, -h / 2, w, h);

        ctx.restore();
      }

      const dataUrl = offscreen.toDataURL("image/png");
      await onSave(dataUrl);
      onClose();
    } catch {
      // Handled
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = resultWidth;
      offscreen.height = resultHeight;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;

      const renderList = [...layers]
        .filter((l) => !l.deleted && l.visible && l.loaded && l.image)
        .sort((a, b) => a.order - b.order);

      for (const layer of renderList) {
        if (!layer.image) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

        const w = resultWidth;
        const h = resultHeight;
        const cx = layer.x + w / 2;
        const cy = layer.y + h / 2;

        ctx.translate(cx, cy);
        ctx.scale(layer.scale, layer.scale);
        ctx.drawImage(layer.image, -w / 2, -h / 2, w, h);

        ctx.restore();
      }

      offscreen.toBlob((blob) => {
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `naslai-magic-layers-${variant}.png`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      }, "image/png");
    } catch {
      // Handled
    }
  };

  // List of layers sorted descending by order for the sidebar (top layer shown first)
  const displayLayers = [...layers].sort((a, b) => b.order - a.order);

  return (
    <div className="magic-layers-backdrop" role="dialog" aria-modal="true" aria-labelledby="magic-editor-title">
      {/* Top Header */}
      <header className="magic-layers-header">
        <div className="magic-header-left">
          <span className="magic-brand-badge">✨ {t("magicLayers.badge")}</span>
          <div className="magic-header-titles">
            <h2 id="magic-editor-title">
              {t("magicLayers.modalTitle")} · {variant}-slayd
            </h2>
            <p>{t("magicLayers.modalSubtitle")}</p>
          </div>
        </div>

        <div className="magic-header-actions">
          {onReseparate && (
            <button
              type="button"
              className="magic-btn magic-btn-secondary"
              onClick={handleReseparate}
              disabled={reseparating || saving}
            >
              🔄 {reseparating ? t("magicLayers.reseparating") : t("magicLayers.reseparate")}
            </button>
          )}

          <button
            type="button"
            className="magic-btn magic-btn-secondary"
            onClick={resetAll}
            disabled={saving}
          >
            ↺ {t("magicLayers.resetAll")}
          </button>

          <button
            type="button"
            className="magic-btn magic-btn-secondary"
            onClick={handleDownload}
            disabled={saving}
            title={t("magicLayers.download")}
          >
            ⬇ {t("magicLayers.download")}
          </button>

          <button
            type="button"
            className="magic-btn magic-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            ✓ {saving ? t("magicLayers.saving") : t("magicLayers.save")}
          </button>

          <button
            type="button"
            className="magic-btn-icon"
            onClick={onClose}
            aria-label={t("magicLayers.close")}
            disabled={saving}
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <div className="magic-workspace">
        {/* Canvas Area */}
        <section className="magic-canvas-container">
          <div className="magic-canvas-hint-bar">
            <span>💡</span> {t("magicLayers.dragHint")}
          </div>

          <div className="magic-canvas-wrapper">
            <canvas
              ref={canvasRef}
              className="magic-canvas-element"
              width={resultWidth}
              height={resultHeight}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>

          {reseparating && (
            <div className="magic-loading-overlay">
              <div className="magic-spinner" />
              <div className="magic-loading-title">{t("magicLayers.loadingTitle")}</div>
              <div className="magic-loading-sub">{t("magicLayers.loadingText")}</div>
            </div>
          )}
        </section>

        {/* Right Sidebar */}
        <aside className="magic-sidebar">
          {/* Active Layer Properties */}
          {activeLayer ? (
            <div className="magic-layer-props">
              <div className="magic-section-title">
                <span>{t("magicLayers.activeLayer")}</span>
                <b>{activeLayer.name}</b>
              </div>

              {/* Scale slider */}
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
                  onChange={(e) => updateScale(parseFloat(e.target.value))}
                />
              </div>

              {/* Opacity slider */}
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
                  onChange={(e) => updateOpacity(parseFloat(e.target.value))}
                />
              </div>

              {/* Layer Actions */}
              <div className="magic-action-grid">
                <button
                  type="button"
                  className="magic-btn magic-btn-secondary"
                  onClick={centerSelected}
                >
                  🎯 {t("magicLayers.centerLayer")}
                </button>
                <button
                  type="button"
                  className="magic-btn magic-btn-secondary"
                  onClick={resetSelected}
                >
                  ↺ {t("magicLayers.resetSelected")}
                </button>
                <button
                  type="button"
                  className="magic-btn magic-btn-secondary"
                  onClick={() => moveOrder(activeLayer.id, "up")}
                >
                  ▲ {t("magicLayers.moveUp")}
                </button>
                <button
                  type="button"
                  className="magic-btn magic-btn-secondary"
                  onClick={() => moveOrder(activeLayer.id, "down")}
                >
                  ▼ {t("magicLayers.moveDown")}
                </button>
              </div>
            </div>
          ) : null}

          {/* Layer List */}
          <div>
            <div className="magic-section-title">
              <span>{t("magicLayers.layersTitle")}</span>
              <span>({displayLayers.filter((l) => !l.deleted).length})</span>
            </div>

            <div className="magic-layer-list">
              {displayLayers.map((layer) => {
                const isSelected = layer.id === selectedId;
                return (
                  <div
                    key={layer.id}
                    className={`magic-layer-item ${isSelected ? "is-active" : ""} ${
                      !layer.visible || layer.deleted ? "is-hidden" : ""
                    }`}
                    onClick={() => {
                      if (!layer.deleted) setSelectedId(layer.id);
                    }}
                  >
                    <img
                      src={layer.url}
                      alt={layer.name}
                      className="magic-layer-thumb"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <div className="magic-layer-info">
                      <div className="magic-layer-name">
                        {layer.name}
                        {layer.deleted && ` (${t("magicLayers.delete")})`}
                      </div>
                      <div className="magic-layer-meta">
                        {t("magicLayers.layerOrder")}: #{layer.order} · {Math.round(layer.scale * 100)}%
                      </div>
                    </div>

                    <div className="magic-layer-btns">
                      <button
                        type="button"
                        className={`magic-mini-btn ${layer.visible ? "is-active" : ""}`}
                        title={layer.visible ? t("magicLayers.hide") : t("magicLayers.show")}
                        onClick={(e) => toggleVisibility(layer.id, e)}
                      >
                        {layer.visible ? "👁" : "🕶"}
                      </button>
                      <button
                        type="button"
                        className="magic-mini-btn"
                        title={layer.deleted ? t("magicLayers.restore") : t("magicLayers.delete")}
                        onClick={(e) => toggleDelete(layer.id, e)}
                      >
                        {layer.deleted ? "↩" : "🗑"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
