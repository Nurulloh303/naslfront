import { useLanguage } from "../../../../i18n/LanguageContext";
import { COLOR_SWATCHES, FONT_FAMILIES, FONT_WEIGHTS, PLATE_SWATCHES, type TextLayerItem, type TextPatch } from "./editorTypes";
import { fontStack } from "./renderLayers";

type Props = {
  layer: TextLayerItem;
  onChange: (patch: TextPatch, coalesceKey?: string) => void;
  onEditInline: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

const MIN_FONT = 8;
const MAX_FONT = 400;

function closestWeight(weight: number): number {
  return FONT_WEIGHTS.reduce((best, w) => (Math.abs(w.value - weight) < Math.abs(best - weight) ? w.value : best), FONT_WEIGHTS[0].value as number);
}

/** Tanlangan matn qatlamining sozlamalari (o'ng panel / pastki varaq). */
export function TextLayerProps({ layer, onChange, onEditInline, onDuplicate, onDelete, onMoveUp, onMoveDown }: Props) {
  const { t } = useLanguage();
  const key = (field: string) => `${field}:${layer.id}`;
  const activeWeight = closestWeight(layer.fontWeight);
  const families: readonly string[] = FONT_FAMILIES.includes(layer.fontFamily as (typeof FONT_FAMILIES)[number])
    ? FONT_FAMILIES
    : [layer.fontFamily, ...FONT_FAMILIES];

  const setFontSize = (value: number) => {
    if (!Number.isFinite(value)) return;
    onChange({ fontSize: Math.round(Math.min(MAX_FONT, Math.max(MIN_FONT, value))) }, key("fontSize"));
  };

  return (
    <div className="magic-layer-props">
      <div className="magic-section-title">
        <span>{t("magicLayers.textLayer")}</span>
        <button type="button" className="magic-btn magic-btn-secondary magic-btn-sm" onClick={onEditInline}>
          ✎ {t("magicLayers.editText")}
        </button>
      </div>

      <label className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.text")}</span></span>
        <textarea
          className="magic-textarea"
          value={layer.text}
          rows={3}
          placeholder={t("magicLayers.textPlaceholder")}
          onChange={(e) => onChange({ text: e.target.value }, key("text"))}
        />
      </label>

      <div className="magic-prop-row">
        <div className="magic-prop-header">
          <span>{t("magicLayers.fontSize")}</span>
          <input
            type="number"
            className="magic-number"
            min={MIN_FONT}
            max={MAX_FONT}
            value={Math.round(layer.fontSize)}
            aria-label={t("magicLayers.fontSize")}
            onChange={(e) => setFontSize(parseFloat(e.target.value))}
          />
        </div>
        <input
          type="range"
          className="magic-slider"
          min={MIN_FONT}
          max={Math.max(240, Math.round(layer.fontSize))}
          step={1}
          value={layer.fontSize}
          onChange={(e) => setFontSize(parseFloat(e.target.value))}
        />
      </div>

      <div className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.fontFamily")}</span></span>
        <select
          className="magic-select"
          value={layer.fontFamily}
          style={{ fontFamily: fontStack(layer.fontFamily) }}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
        >
          {families.map((family) => (
            <option key={family} value={family} style={{ fontFamily: fontStack(family) }}>{family}</option>
          ))}
        </select>
      </div>

      <div className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.fontWeight")}</span></span>
        <div className="magic-segmented" role="group" aria-label={t("magicLayers.fontWeight")}>
          {FONT_WEIGHTS.map((w) => (
            <button
              key={w.value}
              type="button"
              className={activeWeight === w.value ? "is-active" : ""}
              aria-pressed={activeWeight === w.value}
              style={{ fontWeight: w.value }}
              onClick={() => onChange({ fontWeight: w.value })}
            >
              {t(`magicLayers.${w.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.align")}</span></span>
        <div className="magic-segmented" role="group" aria-label={t("magicLayers.align")}>
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              type="button"
              className={layer.align === align ? "is-active" : ""}
              aria-pressed={layer.align === align}
              title={t(`magicLayers.align_${align}`)}
              onClick={() => onChange({ align })}
            >
              <AlignIcon align={align} />
              <span className="magic-visually-hidden">{t(`magicLayers.align_${align}`)}</span>
            </button>
          ))}
          <button
            type="button"
            className={layer.uppercase ? "is-active" : ""}
            aria-pressed={layer.uppercase}
            title={t("magicLayers.uppercase")}
            onClick={() => onChange({ uppercase: !layer.uppercase })}
          >
            Aa→AA
          </button>
        </div>
      </div>

      <div className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.color")}</span><b>{layer.color}</b></span>
        <div className="magic-swatches">
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              className={`magic-swatch ${layer.color.toUpperCase() === color ? "is-active" : ""}`}
              style={{ background: color }}
              aria-label={color}
              onClick={() => onChange({ color })}
            />
          ))}
          <label className="magic-swatch magic-swatch-picker" title={t("magicLayers.customColor")}>
            <input
              type="color"
              value={layer.color}
              aria-label={t("magicLayers.customColor")}
              onChange={(e) => onChange({ color: e.target.value.toUpperCase() }, key("color"))}
            />
          </label>
        </div>
      </div>

      <div className="magic-prop-row">
        <span className="magic-prop-header"><span>{t("magicLayers.background")}</span><b>{layer.background ?? t("magicLayers.backgroundNone")}</b></span>
        <div className="magic-swatches">
          <button
            type="button"
            className={`magic-swatch magic-swatch-none ${layer.background === null ? "is-active" : ""}`}
            aria-label={t("magicLayers.backgroundNone")}
            title={t("magicLayers.backgroundNone")}
            onClick={() => onChange({ background: null })}
          />
          {PLATE_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              className={`magic-swatch ${layer.background?.toUpperCase() === color ? "is-active" : ""}`}
              style={{ background: color }}
              aria-label={color}
              onClick={() => onChange({ background: color })}
            />
          ))}
          <label className="magic-swatch magic-swatch-picker" title={t("magicLayers.customColor")}>
            <input
              type="color"
              value={layer.background ?? "#FFFFFF"}
              aria-label={t("magicLayers.customColor")}
              onChange={(e) => onChange({ background: e.target.value.toUpperCase() }, key("background"))}
            />
          </label>
        </div>
      </div>

      <div className="magic-prop-row">
        <div className="magic-prop-header">
          <span>{t("magicLayers.opacity")}</span>
          <b>{Math.round(layer.opacity * 100)}%</b>
        </div>
        <input
          type="range"
          className="magic-slider"
          min={0}
          max={1}
          step={0.02}
          value={layer.opacity}
          onChange={(e) => onChange({ opacity: parseFloat(e.target.value) }, key("opacity"))}
        />
      </div>

      <div className="magic-action-grid">
        <button type="button" className="magic-btn magic-btn-secondary" onClick={onDuplicate}>⧉ {t("magicLayers.duplicate")}</button>
        <button type="button" className="magic-btn magic-btn-secondary" onClick={onDelete}>🗑 {t("magicLayers.delete")}</button>
        <button type="button" className="magic-btn magic-btn-secondary" onClick={onMoveUp}>▲ {t("magicLayers.moveUp")}</button>
        <button type="button" className="magic-btn magic-btn-secondary" onClick={onMoveDown}>▼ {t("magicLayers.moveDown")}</button>
      </div>
    </div>
  );
}

function AlignIcon({ align }: { align: "left" | "center" | "right" }) {
  const rows = [14, 9, 12];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      {rows.map((w, i) => {
        const x = align === "left" ? 1 : align === "right" ? 15 - w : (16 - w) / 2;
        return <rect key={i} x={x} y={1 + i * 5} width={w} height="2" rx="1" fill="currentColor" />;
      })}
    </svg>
  );
}
