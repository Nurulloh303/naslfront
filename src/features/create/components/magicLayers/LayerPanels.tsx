import { useState, type DragEvent } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import {
  BACKGROUND_ID,
  BACKGROUND_SWATCHES,
  firstLine,
  groupOf,
  isElementMoved,
  isTextDirty,
  type BackgroundState,
  type EditorLayer,
  type ElementItem,
  type ElementPatch,
  type OrderAction,
  type TextLayerItem,
} from "./editorTypes";
import { fontStack } from "./renderLayers";

/* ------------------------------------------------------------------ */
/* Tartib tugmalari                                                    */
/* ------------------------------------------------------------------ */

export function OrderButtons({ isTop, isBottom, disabled, onOrder }: { isTop: boolean; isBottom: boolean; disabled?: boolean; onOrder: (action: OrderAction) => void }) {
  const { t } = useLanguage();
  return (
    <div className="magic-prop-row">
      <span className="magic-prop-header"><span>{t("magicLayers.orderTitle")}</span></span>
      <div className="magic-order-grid">
        <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" disabled={disabled || isTop} onClick={() => onOrder("forward")} title={t("magicLayers.bringForward")}>▲ {t("magicLayers.bringForward")}</button>
        <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" disabled={disabled || isBottom} onClick={() => onOrder("backward")} title={t("magicLayers.sendBackward")}>▼ {t("magicLayers.sendBackward")}</button>
        <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" disabled={disabled || isTop} onClick={() => onOrder("front")} title={t("magicLayers.bringToFront")}>⤒ {t("magicLayers.bringToFront")}</button>
        <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" disabled={disabled || isBottom} onClick={() => onOrder("back")} title={t("magicLayers.sendToBack")}>⤓ {t("magicLayers.sendToBack")}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Obyekt sozlamalari                                                  */
/* ------------------------------------------------------------------ */

type ElementPropsProps = {
  layer: ElementItem;
  thumbUrl?: string;
  isTop: boolean;
  isBottom: boolean;
  onChange: (patch: ElementPatch, coalesce?: string) => void;
  onOrder: (action: OrderAction) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
  onToggleLock: () => void;
};

export function ElementProps({ layer, thumbUrl, isTop, isBottom, onChange, onOrder, onDuplicate, onDelete, onReset, onToggleLock }: ElementPropsProps) {
  const { t } = useLanguage();
  const key = (field: string) => `${field}:${layer.id}`;
  const locked = layer.locked;
  return (
    <div className="magic-layer-props">
      <div className="magic-section-title">
        <span className="magic-prop-title">
          {thumbUrl ? <img src={thumbUrl} alt="" className="magic-prop-thumb" /> : null}
          <span>
            <b className="magic-prop-name">{layer.name}</b>
            <small>{layer.elementKind === "product" ? t("magicLayers.elementProduct") : t("magicLayers.elementGraphic")}</small>
          </span>
        </span>
        <button type="button" className={`magic-btn magic-btn-secondary magic-btn-sm ${locked ? "is-on" : ""}`} onClick={onToggleLock} aria-pressed={locked}>
          {locked ? "🔒" : "🔓"} <span className="magic-btn-label-sm">{locked ? t("magicLayers.unlock") : t("magicLayers.lock")}</span>
        </button>
      </div>

      {locked ? <p className="magic-locked-hint">{t("magicLayers.lockedHint")}</p> : null}

      <div className="magic-prop-row">
        <div className="magic-prop-header">
          <span>{t("magicLayers.opacity")}</span>
          <b>{Math.round(layer.opacity * 100)}%</b>
        </div>
        <input type="range" className="magic-slider" min={0} max={1} step={0.02} value={layer.opacity} disabled={locked}
          aria-label={t("magicLayers.opacity")}
          onChange={(e) => onChange({ opacity: parseFloat(e.target.value) }, key("opacity"))} />
      </div>

      <div className="magic-prop-row">
        <div className="magic-prop-header">
          <span>{t("magicLayers.rotation")}</span>
          <b>{Math.round(layer.rotation)}°</b>
        </div>
        <input type="range" className="magic-slider" min={-180} max={180} step={1} value={layer.rotation} disabled={locked}
          aria-label={t("magicLayers.rotation")}
          onChange={(e) => onChange({ rotation: parseFloat(e.target.value) }, key("rotation"))} />
      </div>

      <div className="magic-action-grid">
        <button type="button" className={`magic-btn magic-btn-secondary ${layer.flipX ? "is-on" : ""}`} disabled={locked} aria-pressed={layer.flipX} onClick={() => onChange({ flipX: !layer.flipX })}>⇋ {t("magicLayers.flipH")}</button>
        <button type="button" className={`magic-btn magic-btn-secondary ${layer.flipY ? "is-on" : ""}`} disabled={locked} aria-pressed={layer.flipY} onClick={() => onChange({ flipY: !layer.flipY })}>⇵ {t("magicLayers.flipV")}</button>
      </div>

      <OrderButtons isTop={isTop} isBottom={isBottom} onOrder={onOrder} />

      <div className="magic-action-grid">
        <button type="button" className="magic-btn magic-btn-secondary" onClick={onDuplicate}>⧉ {t("magicLayers.duplicate")}</button>
        <button type="button" className="magic-btn magic-btn-secondary" disabled={locked} onClick={onDelete}>🗑 {t("magicLayers.delete")}</button>
        <button type="button" className="magic-btn magic-btn-secondary magic-span-2" disabled={locked || !isElementMoved(layer)} onClick={onReset}>↺ {t("magicLayers.resetPosition")}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fon sozlamalari                                                     */
/* ------------------------------------------------------------------ */

export function BackgroundProps({ state, thumbUrl, onChange }: { state: BackgroundState; thumbUrl?: string; onChange: (patch: Partial<BackgroundState>, coalesce?: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="magic-layer-props">
      <div className="magic-section-title">
        <span className="magic-prop-title">
          {thumbUrl && !state.color ? <img src={thumbUrl} alt="" className="magic-prop-thumb" /> : <span className="magic-prop-thumb" style={{ background: state.color ?? undefined }} />}
          <span>
            <b className="magic-prop-name">{t("magicLayers.bgLayer")}</b>
            <small>{t("magicLayers.bgLayerMeta")}</small>
          </span>
        </span>
        <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" onClick={() => onChange({ visible: !state.visible })} aria-pressed={!state.visible}>
          {state.visible ? "👁" : "🕶"} <span className="magic-btn-label-sm">{state.visible ? t("magicLayers.hide") : t("magicLayers.show")}</span>
        </button>
      </div>

      {!state.visible ? <p className="magic-locked-hint">{t("magicLayers.bgHidden")}</p> : null}

      <div className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.bgColor")}</span><b>{state.color ?? t("magicLayers.bgOriginal")}</b></span>
        <div className="magic-swatches">
          <button
            type="button"
            className={`magic-swatch magic-swatch-image ${state.color === null ? "is-active" : ""}`}
            style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
            aria-label={t("magicLayers.bgOriginal")}
            title={t("magicLayers.bgOriginal")}
            onClick={() => onChange({ color: null, visible: true })}
          />
          {BACKGROUND_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              className={`magic-swatch ${state.color?.toUpperCase() === color ? "is-active" : ""}`}
              style={{ background: color }}
              aria-label={color}
              onClick={() => onChange({ color, visible: true })}
            />
          ))}
          <label className="magic-swatch magic-swatch-picker" title={t("magicLayers.customColor")}>
            <input type="color" value={state.color ?? "#FFFFFF"} aria-label={t("magicLayers.customColor")}
              onChange={(e) => onChange({ color: e.target.value.toUpperCase(), visible: true }, "bg-color")} />
          </label>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Qatlamlar ro'yxati                                                  */
/* ------------------------------------------------------------------ */

type LayersListProps = {
  layers: EditorLayer[];
  background: BackgroundState;
  selectedId: string | null;
  thumbs: Record<string, string | undefined>;
  failed: Record<string, boolean>;
  onSelect: (id: string) => void;
  onEdit: (layer: TextLayerItem) => void;
  onHover: (id: string | null) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToIndex: (id: string, index: number) => void;
  onBackgroundVisible: () => void;
};

/** Och rang (oq matn) — ro'yxatdagi belgida to'q fon kerak. */
function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.75;
}

export function LayersList({ layers, background, selectedId, thumbs, failed, onSelect, onEdit, onHover, onToggleVisible, onToggleLock, onDelete, onMoveToIndex, onBackgroundVisible }: LayersListProps) {
  const { t } = useLanguage();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  // Ro'yxat yuqoridan pastga: matnlar (yuqorisi birinchi), obyektlar, fon.
  const texts = groupOf(layers, "text").filter((l) => !l.deleted).reverse() as TextLayerItem[];
  const elements = groupOf(layers, "element").filter((l) => !l.deleted).reverse() as ElementItem[];
  const dragLayer = dragId ? layers.find((l) => l.id === dragId) : null;

  const onDrop = (target: EditorLayer) => (e: DragEvent) => {
    e.preventDefault();
    setDropId(null);
    if (!dragLayer || dragLayer.kind !== target.kind || dragLayer.id === target.id) return;
    const group = groupOf(layers, target.kind);
    onMoveToIndex(dragLayer.id, group.findIndex((l) => l.id === target.id));
    setDragId(null);
  };

  const row = (layer: EditorLayer) => {
    const isSelected = layer.id === selectedId;
    const isText = layer.kind === "text";
    const canDrop = dragLayer && dragLayer.kind === layer.kind && dragLayer.id !== layer.id;
    const status = isText
      ? `${!layer.pristine ? t("magicLayers.stateNew") : isTextDirty(layer) ? t("magicLayers.stateEdited") : t("magicLayers.stateOriginal")} · ${layer.fontFamily}`
      : `${layer.elementKind === "product" ? t("magicLayers.elementProduct") : t("magicLayers.elementGraphic")}${failed[layer.url] ? ` · ${t("magicLayers.imageFailed")}` : ""}`;
    return (
      <div
        key={layer.id}
        className={`magic-layer-item ${isSelected ? "is-active" : ""} ${!layer.visible ? "is-hidden" : ""} ${dropId === layer.id && canDrop ? "is-drop" : ""} ${dragId === layer.id ? "is-dragging" : ""}`}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        draggable
        onDragStart={(e) => { setDragId(layer.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", layer.id); }}
        onDragEnd={() => { setDragId(null); setDropId(null); }}
        onDragOver={(e) => { if (canDrop) { e.preventDefault(); setDropId(layer.id); } }}
        onDragLeave={() => setDropId((cur) => (cur === layer.id ? null : cur))}
        onDrop={onDrop(layer)}
        onClick={() => onSelect(layer.id)}
        onDoubleClick={() => { if (layer.kind === "text" && !layer.locked) onEdit(layer); }}
        onMouseEnter={() => onHover(layer.id)}
        onMouseLeave={() => onHover(null)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            e.preventDefault();
            onSelect(layer.id);
          }
        }}
      >
        <span className="magic-drag-grip" aria-hidden="true">⋮⋮</span>
        {layer.kind === "text" ? (
          <span
            className="magic-layer-thumb is-text"
            aria-hidden="true"
            style={{ fontFamily: fontStack(layer.fontFamily), color: layer.color, background: layer.background ?? (isLightColor(layer.color) ? "#2A2523" : undefined) }}
          >T</span>
        ) : thumbs[layer.url] ? (
          <img src={thumbs[layer.url]} alt="" className="magic-layer-thumb is-cutout" />
        ) : (
          <span className="magic-layer-thumb is-cutout" aria-hidden="true" />
        )}
        <div className="magic-layer-info">
          <div className="magic-layer-name">{layer.kind === "text" ? firstLine(layer.text) || t("magicLayers.textLayer") : layer.name}</div>
          <div className="magic-layer-meta">{status}</div>
        </div>
        <div className="magic-layer-btns">
          <button type="button" className={`magic-mini-btn ${layer.visible ? "" : "is-active"}`}
            title={layer.visible ? t("magicLayers.hide") : t("magicLayers.show")}
            aria-label={layer.visible ? t("magicLayers.hide") : t("magicLayers.show")}
            onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}>
            {layer.visible ? "👁" : "🕶"}
          </button>
          <button type="button" className={`magic-mini-btn ${layer.locked ? "is-active" : ""}`}
            title={layer.locked ? t("magicLayers.unlock") : t("magicLayers.lock")}
            aria-label={layer.locked ? t("magicLayers.unlock") : t("magicLayers.lock")}
            onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}>
            {layer.locked ? "🔒" : "🔓"}
          </button>
          <button type="button" className="magic-mini-btn" disabled={layer.locked}
            title={t("magicLayers.delete")} aria-label={t("magicLayers.delete")}
            onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}>
            🗑
          </button>
        </div>
      </div>
    );
  };

  const bgSelected = selectedId === BACKGROUND_ID;
  return (
    <div className="magic-layer-list">
      {texts.map(row)}
      {elements.map(row)}
      <div
        className={`magic-layer-item is-background ${bgSelected ? "is-active" : ""} ${!background.visible ? "is-hidden" : ""}`}
        role="button"
        tabIndex={0}
        aria-pressed={bgSelected}
        onClick={() => onSelect(BACKGROUND_ID)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onSelect(BACKGROUND_ID); } }}
      >
        <span className="magic-drag-grip is-disabled" aria-hidden="true">⋮⋮</span>
        {background.color ? (
          <span className="magic-layer-thumb" style={{ background: background.color }} aria-hidden="true" />
        ) : thumbs.__background ? (
          <img src={thumbs.__background} alt="" className="magic-layer-thumb" />
        ) : (
          <span className="magic-layer-thumb" aria-hidden="true" />
        )}
        <div className="magic-layer-info">
          <div className="magic-layer-name">{t("magicLayers.bgLayer")}</div>
          <div className="magic-layer-meta">{background.color ? `${t("magicLayers.bgColor")} · ${background.color}` : t("magicLayers.bgLayerMeta")}</div>
        </div>
        <div className="magic-layer-btns">
          <button type="button" className={`magic-mini-btn ${background.visible ? "" : "is-active"}`}
            title={background.visible ? t("magicLayers.hide") : t("magicLayers.show")}
            aria-label={background.visible ? t("magicLayers.hide") : t("magicLayers.show")}
            onClick={(e) => { e.stopPropagation(); onBackgroundVisible(); }}>
            {background.visible ? "👁" : "🕶"}
          </button>
          <span className="magic-lock" aria-label={t("magicLayers.locked")} title={t("magicLayers.locked")}>🔒</span>
        </div>
      </div>
    </div>
  );
}
