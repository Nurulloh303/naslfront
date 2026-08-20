import type { FashionEnv, FashionGender, FashionPose, FashionStyle, GenerationSettings } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  settings: GenerationSettings;
  disabled: boolean;
  onChange: (patch: Partial<GenerationSettings>) => void;
};

const genderValues: FashionGender[] = ["female", "male", "none"];
const poseValues: FashionPose[] = ["front", "side", "dynamic", "sitting"];
const styleValues: FashionStyle[] = ["studio", "street", "lookbook", "cinematic"];
const envValues: FashionEnv[] = ["minimal", "urban", "interior", "nature"];

export function FashionSettings({ settings, disabled, onChange }: Props) {
  const { t } = useLanguage();
  const fashion = settings.fashion;
  const update = (patch: Partial<GenerationSettings["fashion"]>) => onChange({ fashion: { ...fashion, ...patch } });

  return <div className="card-settings" aria-label={t("nav.otherFeatures")}>
    <fieldset disabled={disabled}>
      <legend>{t("settings.fashion.genderLegend")}</legend>
      <div className="photo-style-grid">{genderValues.map((value) => <button type="button" key={value} aria-pressed={fashion.gender === value} onClick={() => update({ gender: value })}>{t(`settings.fashion.genders.${value}`)}</button>)}</div>
    </fieldset>

    {fashion.gender !== "none" && <fieldset disabled={disabled}>
      <legend>{t("settings.fashion.poseLegend")}</legend>
      <div className="photo-style-grid">{poseValues.map((value) => <button type="button" key={value} aria-pressed={fashion.pose === value} onClick={() => update({ pose: value })}>{t(`settings.fashion.poses.${value}`)}</button>)}</div>
    </fieldset>}

    <fieldset disabled={disabled}>
      <legend>{t("settings.fashion.styleLegend")}</legend>
      <div className="photo-style-grid">{styleValues.map((value) => <button type="button" key={value} aria-pressed={fashion.style === value} onClick={() => update({ style: value })}>{t(`settings.fashion.styles.${value}`)}</button>)}</div>
    </fieldset>

    <fieldset disabled={disabled}>
      <legend>{t("settings.fashion.envLegend")}</legend>
      <div className="photo-style-grid">{envValues.map((value) => <button type="button" key={value} aria-pressed={fashion.env === value} onClick={() => update({ env: value })}>{t(`settings.fashion.envs.${value}`)}</button>)}</div>
    </fieldset>

    <label className="prompt-block">
      <span><b>{t("settings.fashion.promptLabel")}</b></span>
      <small>{t("settings.fashion.promptHint")}</small>
      <textarea disabled={disabled} maxLength={600} value={fashion.customPrompt} onChange={(event) => update({ customPrompt: event.target.value })} placeholder={t("settings.fashion.promptPlaceholder")} />
      <i>{fashion.customPrompt.length}/600</i>
    </label>
    <div className="fixed-output-note"><b>{t("settings.outputSize.cardTitle")}</b><span>1080×1440 px · {t("settings.fashion.outputNote")}</span></div>
  </div>;
}
