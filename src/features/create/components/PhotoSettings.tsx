import { marketplacePresets } from "../domain/marketplacePresets";
import type { GenerationSettings, Marketplace, PhotoShot, PhotoStyle, ProductAsset } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  assets: ProductAsset[];
  settings: GenerationSettings;
  disabled: boolean;
  advancedOpen: boolean;
  onChange: (patch: Partial<GenerationSettings>) => void;
  onAdvancedToggle: () => void;
};

const photoStyleValues: PhotoStyle[] = ["commercial", "home"];
const shotValues: PhotoShot[] = ["person", "detail", "lifestyle", "catalog"];
const marketplaceOptions: Marketplace[] = ["uzum", "wb", "ozon"];

export function PhotoSettings({ assets, settings, disabled, advancedOpen, onChange, onAdvancedToggle }: Props) {
  const { t } = useLanguage();
  const generateIdea = () => onChange({ photoPrompt: "yumshoq yorug‘lik, minimalizm, neytral fon, toza soya, mahsulot kadr markazida." });

  return <div className="photo-settings" aria-label={t("settings.photo.shotQuestion")}>
    <section className="shot-section">
      <div className="reference-label">{t("settings.photo.shotQuestion")}</div>
      <div className="shot-list">
        {shotValues.map((value) => <button key={value} type="button" aria-pressed={settings.photoShot === value} disabled={disabled} onClick={() => onChange({ photoShot: value })}>
          <span className={`shot-preview ${value}`}>{value === "person" && assets[0] ? <img src={assets[0].url} alt="" /> : null}</span>
          <b>{t(`settings.photo.shots.${value}.title`)}</b>
          <small>{t(`settings.photo.shots.${value}.text`)}</small>
        </button>)}
      </div>
    </section>

    <label className="prompt-block">
      <span><b>{t("settings.prompt.photoLabel")}</b><button type="button" onClick={generateIdea} disabled={disabled}>{t("settings.prompt.idea")}</button></span>
      <small>{t("settings.prompt.photoHint")}</small>
      <textarea disabled={disabled} maxLength={5000} value={settings.photoPrompt} onChange={(event) => onChange({ photoPrompt: event.target.value })} placeholder={t("settings.prompt.photoPlaceholder")} />
      <i>{settings.photoPrompt.length}/5000</i>
    </label>

    <div className="reference-advanced"><button type="button" disabled={disabled} aria-expanded={advancedOpen} onClick={onAdvancedToggle}>{t("settings.advanced.toggle")} <span>{advancedOpen ? "⌃" : "⌄"}</span></button></div>
    {advancedOpen && <div className="mode-advanced-panel">
      <div className="optional-upload-grid">
        <label>{t("settings.photo.modelPhoto")} <button type="button" disabled aria-label={t("settings.photo.modelPhoto")}>☼</button><small>{t("settings.photo.comingSoon")}</small></label>
        <label>{t("settings.photo.envPhoto")} <button type="button" disabled aria-label={t("settings.photo.envPhoto")}>☼</button><small>{t("settings.photo.comingSoon")}</small></label>
      </div>

      <fieldset disabled={disabled}>
        <legend>{t("settings.photo.styleLegend")}</legend>
        <div className="photo-style-grid">
          {photoStyleValues.map((value) => <button key={value} type="button" aria-pressed={settings.photoStyle === value} onClick={() => onChange({ photoStyle: value })}>
            <b>{value === "commercial" ? t("settings.photo.styleCommercial") : t("settings.photo.styleHome")}</b>
          </button>)}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>{t("settings.marketplace.legend")}</legend>
        <div className="marketplace-grid">
          {marketplaceOptions.map((marketplace) => <button type="button" key={marketplace} aria-pressed={settings.marketplace === marketplace} onClick={() => onChange({ marketplace, aspectRatio: "3:4", resolution: "1k" })}>
            <b>{marketplacePresets[marketplace].shortLabel}</b>
            <span>{marketplacePresets[marketplace].label}</span>
          </button>)}
        </div>
      </fieldset>

      <div className="fixed-output-note"><b>{t("settings.outputSize.photoTitle")}</b><span>{t("settings.outputSize.cardNote")}</span></div>
    </div>}
  </div>;
}
