import { useRef, useState, type ChangeEvent } from "react";
import type { CopyStylePresentation, GenerationSettings, InfographicLanguage } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { Hint } from "./Hint";
import { prepareImageDataUrl } from "../domain/prepareImage";
import { MAX_UPLOAD_BYTES } from "../domain/uploadLimits";

type Props = {
  settings: GenerationSettings;
  disabled: boolean;
  onChange: (patch: Partial<GenerationSettings>) => void;
};

const LANGUAGES: InfographicLanguage[] = ["uz", "ru", "tg"];
const PRESENTATIONS: CopyStylePresentation[] = ["auto", "model", "product"];

export function CopyStyleSettings({ settings, disabled, onChange }: Props) {
  const { t } = useLanguage();
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [referenceError, setReferenceError] = useState("");
  const copyStyle = settings.copyStyle;

  const onReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setReferenceError(t("settings.designReference.invalidType")); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setReferenceError(t("settings.designReference.maxSize")); return; }
    try {
      if (settings.designReferenceUrl.startsWith("blob:")) URL.revokeObjectURL(settings.designReferenceUrl);
      onChange({ designReferenceUrl: URL.createObjectURL(file), designReferenceName: file.name, designReferenceDataUrl: await prepareImageDataUrl(file) });
      setReferenceError("");
    } catch {
      setReferenceError(t("settings.designReference.readFailed"));
    }
  };
  const clearReference = () => {
    if (settings.designReferenceUrl.startsWith("blob:")) URL.revokeObjectURL(settings.designReferenceUrl);
    onChange({ designReferenceUrl: "", designReferenceName: "", designReferenceDataUrl: "" });
    setReferenceError("");
  };

  return <div className="card-settings" aria-label={t("settings.copyStyle.referenceLegend")}>
    <fieldset disabled={disabled}>
      <legend>{t("settings.copyStyle.referenceLegend")}<Hint text={t("hints.designReference")} label={t("hints.aria")} /></legend>
      <div className="design-reference-block">
        <button type="button" className={`design-ref-tile ${settings.designReferenceUrl ? "has-image" : ""}`} disabled={disabled} aria-label={t("settings.copyStyle.referenceLegend")} onClick={() => referenceInputRef.current?.click()}>
          {settings.designReferenceUrl ? <img src={settings.designReferenceUrl} alt={settings.designReferenceName || t("settings.copyStyle.referenceLegend")} /> : <span>+</span>}
        </button>
        <input ref={referenceInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onReferenceChange} />
        {settings.designReferenceUrl ? <button type="button" className="design-ref-reset" disabled={disabled} onClick={clearReference}>{t("settings.designReference.clear")}</button> : <small>{t("settings.copyStyle.referenceRequired")}</small>}
        {referenceError && <small className="field-error" role="alert">{referenceError}</small>}
      </div>
      <small className="field-help">{t("settings.copyStyle.referenceHelp")}</small>
    </fieldset>

    {/* Til shu yerda ham turishi kerak: foydalanuvchi referens rus tilida
        bo'lsa ham karta o'zi tanlagan tilda chiqishini ko'rishi lozim. */}
    <fieldset disabled={disabled}>
      <legend>{t("settings.language.legend")}<Hint text={t("hints.language")} label={t("hints.aria")} /></legend>
      <div className="segmented three">
        {LANGUAGES.map((value) => <button key={value} type="button" aria-pressed={settings.language === value} onClick={() => onChange({ language: value })}>
          {t(`settings.language.options.${value}`)}
        </button>)}
      </div>
      <small className="field-help">{t("settings.copyStyle.languageHelp")}</small>
    </fieldset>

    {/* Referensda mahsulot odam ustida bo'lsa, natijada ham shunday bo'lishi
        kerak — aks holda "referens ishlamadi" degan taassurot qoladi. */}
    <fieldset disabled={disabled}>
      <legend>{t("settings.copyStyle.presentationLegend")}<Hint text={t("hints.presentation")} label={t("hints.aria")} /></legend>
      <div className="segmented three">
        {PRESENTATIONS.map((value) => <button key={value} type="button" aria-pressed={copyStyle.presentation === value} onClick={() => onChange({ copyStyle: { ...copyStyle, presentation: value } })}>
          {t(`settings.copyStyle.presentation.${value}`)}
        </button>)}
      </div>
      <small className="field-help">{t(`settings.copyStyle.presentationHelp.${copyStyle.presentation}`)}</small>
    </fieldset>

    <label className="prompt-block">
      <span><b>{t("settings.copyStyle.notesLabel")}</b></span>
      <small>{t("settings.copyStyle.notesHint")}</small>
      <textarea disabled={disabled} maxLength={600} value={copyStyle.extraNotes} onChange={(event) => onChange({ copyStyle: { ...copyStyle, extraNotes: event.target.value } })} placeholder={t("settings.copyStyle.notesPlaceholder")} />
      <i>{copyStyle.extraNotes.length}/600</i>
    </label>
    <div className="fixed-output-note"><b>{t("settings.outputSize.cardTitle")}</b><span>1080×1440 px · {t("settings.copyStyle.outputNote")}</span></div>
  </div>;
}
