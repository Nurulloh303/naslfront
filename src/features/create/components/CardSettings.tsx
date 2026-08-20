import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { marketplacePresets } from "../domain/marketplacePresets";
import type { GenerationSettings, InfographicLanguage, Marketplace, ProductAsset, ProductBrief, ReferenceMode } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { prepareImageDataUrl } from "../domain/prepareImage";
import { Hint } from "./Hint";
import { MAX_UPLOAD_BYTES } from "../domain/uploadLimits";

type Props = {
  brief: ProductBrief;
  assets: ProductAsset[];
  settings: GenerationSettings;
  disabled: boolean;
  advancedOpen: boolean;
  onBriefChange: (patch: Partial<ProductBrief>) => void;
  onSettingsChange: (patch: Partial<GenerationSettings>) => void;
  onAdvancedToggle: () => void;
  /** Sahifa 02 da asos fotoni almashtirish (qayta AI tahlilisiz). */
  onPrimaryAssetChange: (assetId: string) => void;
};

const marketplaceOptions: Marketplace[] = ["uzum", "wb", "ozon"];
const referenceModeValues: ReferenceMode[] = ["copy", "inspire"];
const languageOptions: Array<{ value: InfographicLanguage; description: string }> = [
  { value: "uz", description: "Latin" },
  { value: "ru", description: "Kirill" },
  { value: "tg", description: "Kirill" },
];

export function CardSettings({ brief, assets, settings, disabled, advancedOpen, onBriefChange, onSettingsChange, onAdvancedToggle, onPrimaryAssetChange }: Props) {
  const { t } = useLanguage();
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [referenceError, setReferenceError] = useState("");
  const [promptNotice, setPromptNotice] = useState("");
  useEffect(() => {
    if (!promptNotice) return;
    const timer = window.setTimeout(() => setPromptNotice(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [promptNotice]);
  const textValue = settings.cardPrompt || brief.benefits.filter(Boolean).join("\n");
  const briefBenefits = brief.benefits.map((benefit) => benefit.trim()).filter(Boolean);
  const hasVerifiedBriefBenefits = briefBenefits.length > 0;
  const updateText = (value: string) => {
    onSettingsChange({ cardPrompt: value });
    onBriefChange({ benefits: value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5) });
  };
  /* Кнопка «AI briefdan olish» подставляет в поле те преимущества, которые
     AI нашёл при анализе фото. Раньше она молча ничего не делала, если текст
     уже совпадал, — теперь всегда даёт видимый ответ. */
  const generateIdea = () => {
    if (!briefBenefits.length) {
      setPromptNotice(t("settings.prompt.aiEmpty"));
      return;
    }
    const next = briefBenefits.join("\n");
    updateText(next);
    setPromptNotice(next === textValue.trim() ? t("settings.prompt.aiSame") : t("settings.prompt.aiFilled", { count: briefBenefits.length }));
  };
  const onReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setReferenceError(t("settings.designReference.invalidType")); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setReferenceError(t("settings.designReference.maxSize")); return; }
    try {
      if (settings.designReferenceUrl.startsWith("blob:")) URL.revokeObjectURL(settings.designReferenceUrl);
      onSettingsChange({
        designReferenceUrl: URL.createObjectURL(file),
        designReferenceName: file.name,
        designReferenceDataUrl: await prepareImageDataUrl(file),
      });
      setReferenceError("");
    } catch {
      setReferenceError(t("settings.designReference.readFailed"));
    }
  };
  const clearReference = () => {
    if (settings.designReferenceUrl.startsWith("blob:")) URL.revokeObjectURL(settings.designReferenceUrl);
    onSettingsChange({ designReferenceUrl: "", designReferenceName: "", designReferenceDataUrl: "" });
    setReferenceError("");
  };

  const baseAsset = assets.find((asset) => asset.isPrimary) ?? assets[0];

  return <div className="card-settings" aria-label={t("settings.designReference.label")}>
    {/* Два слота рядом: на чём делаем и на что похоже. Раньше был виден
        только референс, и человек не понимал, какое из четырёх
        загруженных фото пойдёт в работу. */}
    <div className="source-grid">
      <div className="source-slot">
        <p>{t("settings.basePhoto.label")}<Hint text={t("hints.basePhoto")} label={t("hints.aria")} /></p>
        <div className={`design-ref-tile ${baseAsset ? "has-image" : ""} base-photo-tile`}>
          {baseAsset ? <img src={baseAsset.url} alt={baseAsset.name} /> : <span>✧</span>}
        </div>
        {assets.length > 1
          ? <div className="base-photo-switch" role="group" aria-label={t("settings.basePhoto.chooseAria")}>
              {assets.map((asset, index) => <button
                key={asset.id}
                type="button"
                disabled={disabled}
                aria-pressed={asset.id === baseAsset?.id}
                aria-label={`${index + 1}`}
                onClick={() => onPrimaryAssetChange(asset.id)}
              >
                <img src={asset.url} alt="" />
              </button>)}
            </div>
          : <small>{t("settings.basePhoto.hint")}</small>}
      </div>

      <div className="source-slot design-reference-block">
        <p>{t("settings.designReference.label")}<Hint text={t("hints.designReference")} label={t("hints.aria")} /></p>
        <button type="button" className={`design-ref-tile ${settings.designReferenceUrl ? "has-image" : ""}`} disabled={disabled} aria-label={t("settings.designReference.uploadAria")} onClick={() => referenceInputRef.current?.click()}>
          {settings.designReferenceUrl ? <img src={settings.designReferenceUrl} alt={settings.designReferenceName || t("settings.designReference.label")} /> : <span>+</span>}
        </button>
        <input ref={referenceInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onReferenceChange} />
        {settings.designReferenceUrl ? <button type="button" className="design-ref-reset" disabled={disabled} onClick={clearReference}>{t("settings.designReference.clear")}</button> : <small>{t("settings.designReference.hint")}</small>}
        {referenceError && <small className="field-error" role="alert">{referenceError}</small>}
      </div>
    </div>

    <label className="prompt-block">
      <span><b>{t("settings.prompt.cardLabel")}</b><button type="button" className="ai-brief-button" onClick={generateIdea} disabled={disabled} title={hasVerifiedBriefBenefits ? "" : t("settings.prompt.aiEmpty")}>✦ {t("settings.prompt.aiFromBrief")}</button></span>
      <small>{t("settings.prompt.cardHint")}</small>
      <textarea disabled={disabled} maxLength={5000} value={textValue} onChange={(event) => updateText(event.target.value)} placeholder={t("settings.prompt.cardPlaceholder")} />
      <i>{textValue.length}/5000</i>
      {promptNotice && <small className="prompt-notice" role="status">{promptNotice}</small>}
    </label>

    {/* Пожелание по сцене — отдельно от блока преимуществ.
        То, что человек пишет выше, уходит НА карточку плашкой. Просьба
        «покажи машину, это товар для авто» — про фон, а не про плашку;
        в одном поле эти два смысла путались. */}
    <label className="prompt-block scene-wish-block">
      <span><b>{t("settings.prompt.sceneLabel")}</b><Hint text={t("hints.sceneWish")} label={t("hints.aria")} /></span>
      <small>{t("settings.prompt.sceneHint")}</small>
      <textarea
        disabled={disabled}
        maxLength={300}
        value={settings.sceneWish}
        onChange={(event) => onSettingsChange({ sceneWish: event.target.value })}
        placeholder={t("settings.prompt.scenePlaceholder")}
      />
      <i>{settings.sceneWish.length}/300</i>
    </label>

    <fieldset className="language-settings" disabled={disabled}>
      <legend>{t("settings.language.legend")}<Hint text={t("hints.language")} label={t("hints.aria")} /></legend>
      <div className="marketplace-grid language-grid">
        {languageOptions.map((option) => <button type="button" key={option.value} aria-pressed={settings.language === option.value} onClick={() => onSettingsChange({ language: option.value })}>
          <b>{t(`settings.language.options.${option.value}`)}</b>
          <span>{option.description}</span>
        </button>)}
      </div>
    </fieldset>

    <div className="reference-advanced"><button type="button" disabled={disabled} aria-expanded={advancedOpen} onClick={onAdvancedToggle}>{t("settings.advanced.toggle")} <span>{advancedOpen ? "⌃" : "⌄"}</span></button></div>
    {advancedOpen && <div className="mode-advanced-panel">
      <fieldset disabled={disabled}>
        <legend>{t("settings.cardStyle.legend")}<Hint text={t("hints.cardStyle")} label={t("hints.aria")} /></legend>
        <div className="photo-style-grid">
          <button type="button" aria-pressed={settings.style === "commercial"} onClick={() => onSettingsChange({ style: "commercial" })}>{t("settings.cardStyle.commercial")}</button>
          <button type="button" aria-pressed={settings.style === "creative"} onClick={() => onSettingsChange({ style: "creative" })}>{t("settings.cardStyle.creative")}</button>
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>{t("settings.referenceMode.legend")}<Hint text={t("hints.referenceMode")} label={t("hints.aria")} /></legend>
        <div className="photo-style-grid">
          {referenceModeValues.map((mode) => <button type="button" key={mode} aria-pressed={settings.referenceMode === mode} onClick={() => onSettingsChange({ referenceMode: mode })}>{t(`settings.referenceMode.${mode}`)}</button>)}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>{t("settings.marketplace.legend")}<Hint text={t("hints.marketplace")} label={t("hints.aria")} /></legend>
        <div className="marketplace-grid">
          {marketplaceOptions.map((marketplace) => <button type="button" key={marketplace} aria-pressed={settings.marketplace === marketplace} onClick={() => onSettingsChange({ marketplace, aspectRatio: "3:4", resolution: "1k" })}>
            <b>{marketplacePresets[marketplace].shortLabel}</b>
            <span>{marketplacePresets[marketplace].label}</span>
          </button>)}
        </div>
      </fieldset>

      <div className="fixed-output-note"><b>{t("settings.outputSize.cardTitle")}</b><span>{t("settings.outputSize.cardNote")}</span></div>
    </div>}
  </div>;
}
