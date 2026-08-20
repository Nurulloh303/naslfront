import type { GenerationSettings, ProductBrief } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  brief: ProductBrief;
  settings: GenerationSettings;
  disabled: boolean;
  onBriefChange: (patch: Partial<ProductBrief>) => void;
  onChange: (patch: Partial<GenerationSettings>) => void;
};

export function MarketplacePackageSettings({ brief, settings, disabled, onBriefChange, onChange }: Props) {
  const { t, dict } = useLanguage();
  const pkg = settings.marketplacePackage;

  return <div className="card-settings" aria-label={t("settings.marketplacePackage.titleLabel")}>
    <label className="prompt-block">
      <span><b>{t("settings.marketplacePackage.titleLabel")}</b></span>
      <input disabled={disabled} maxLength={80} value={brief.title} onChange={(event) => onBriefChange({ title: event.target.value })} placeholder={t("settings.marketplacePackage.titlePlaceholder")} />
    </label>

    <label className="prompt-block">
      <span><b>{t("settings.marketplacePackage.descLabel")}</b></span>
      <small>{t("settings.marketplacePackage.descHint")}</small>
      <textarea disabled={disabled} maxLength={800} value={pkg.productDescription} onChange={(event) => onChange({ marketplacePackage: { ...pkg, productDescription: event.target.value } })} placeholder={t("settings.marketplacePackage.descPlaceholder")} />
      <i>{pkg.productDescription.length}/800</i>
    </label>

    <label className="prompt-block">
      <span><b>{t("settings.marketplacePackage.styleNotesLabel")}</b></span>
      <textarea disabled={disabled} maxLength={400} value={pkg.styleNotes} onChange={(event) => onChange({ marketplacePackage: { ...pkg, styleNotes: event.target.value } })} placeholder={t("settings.marketplacePackage.stylePlaceholder")} />
      <i>{pkg.styleNotes.length}/400</i>
    </label>

    <fieldset disabled>
      <legend>{t("settings.marketplacePackage.slidesLegend")}</legend>
      <ol className="package-slide-list">{dict.settings.marketplacePackage.slides.map((slide) => <li key={slide}>{slide}</li>)}</ol>
    </fieldset>
    <div className="fixed-output-note"><b>{t("settings.outputSize.cardTitle")}</b><span>{t("settings.marketplacePackage.outputNote")}</span></div>
  </div>;
}
