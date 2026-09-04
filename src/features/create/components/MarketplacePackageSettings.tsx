import type { GenerationSettings, ProductBrief } from "../domain/types";
import { fitSlideTypes, MAX_PACKAGE_SLIDES, MIN_PACKAGE_SLIDES, SLIDE_TYPE_IDS } from "../domain/slideTypes";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  brief: ProductBrief;
  settings: GenerationSettings;
  disabled: boolean;
  onBriefChange: (patch: Partial<ProductBrief>) => void;
  onChange: (patch: Partial<GenerationSettings>) => void;
};

export function MarketplacePackageSettings({ brief, settings, disabled, onBriefChange, onChange }: Props) {
  const { t } = useLanguage();
  const pkg = settings.marketplacePackage;
  const count = Math.min(MAX_PACKAGE_SLIDES, Math.max(MIN_PACKAGE_SLIDES, settings.packageSlides || 5));
  const types = fitSlideTypes(settings.slideTypes ?? [], count);

  /** Меняем число слайдов — темы подтягиваются сами, чтобы не было пустых мест. */
  const setCount = (next: number) => {
    const clamped = Math.min(MAX_PACKAGE_SLIDES, Math.max(MIN_PACKAGE_SLIDES, next));
    onChange({ packageSlides: clamped, slideTypes: fitSlideTypes(types, clamped) });
  };

  const setType = (index: number, value: string) => {
    const next = [...types];
    next[index] = value;
    onChange({ slideTypes: next });
  };

  return <div className="card-settings" aria-label={t("settings.marketplacePackage.titleLabel")}>
    <label className="prompt-block">
      <span><b>{t("settings.marketplacePackage.titleLabel")}</b></span>
      <input disabled={disabled} maxLength={80} value={brief.title} onChange={(event) => onBriefChange({ title: event.target.value })} placeholder={t("settings.marketplacePackage.titlePlaceholder")} />
    </label>

    <label className="prompt-block">
      <span><b>{t("settings.marketplacePackage.descLabel")}</b></span>
      <small>{t("settings.marketplacePackage.descHint", { count })}</small>
      <textarea disabled={disabled} maxLength={800} value={pkg.productDescription} onChange={(event) => onChange({ marketplacePackage: { ...pkg, productDescription: event.target.value } })} placeholder={t("settings.marketplacePackage.descPlaceholder")} />
      <i>{pkg.productDescription.length}/800</i>
    </label>

    <label className="prompt-block">
      <span><b>{t("settings.marketplacePackage.styleNotesLabel")}</b></span>
      <textarea disabled={disabled} maxLength={400} value={pkg.styleNotes} onChange={(event) => onChange({ marketplacePackage: { ...pkg, styleNotes: event.target.value } })} placeholder={t("settings.marketplacePackage.stylePlaceholder")} />
      <i>{pkg.styleNotes.length}/400</i>
    </label>

    <fieldset disabled={disabled} className="package-count">
      <legend>{t("settings.marketplacePackage.countLegend")}</legend>
      <div className="package-count-row">
        <button type="button" className="ghost-btn" disabled={disabled || count <= MIN_PACKAGE_SLIDES} onClick={() => setCount(count - 1)} aria-label={t("settings.marketplacePackage.fewer")}>−</button>
        <b>{count}</b>
        <button type="button" className="ghost-btn" disabled={disabled || count >= MAX_PACKAGE_SLIDES} onClick={() => setCount(count + 1)} aria-label={t("settings.marketplacePackage.more")}>+</button>
        <small>{t("settings.marketplacePackage.countHint", { count })}</small>
      </div>
    </fieldset>

    <fieldset disabled={disabled} className="package-slides">
      <legend>{t("settings.marketplacePackage.slidesLegend")}</legend>
      <ol className="package-slide-list">
        {types.map((type, index) => <li key={index}>
          <span className="package-slide-no">{index + 1}</span>
          <select value={type} disabled={disabled} onChange={(event) => setType(index, event.target.value)} aria-label={t("settings.marketplacePackage.slideAria", { number: index + 1 })}>
            {SLIDE_TYPE_IDS.map((id) => <option key={id} value={id}>{t(`settings.marketplacePackage.slideTypes.${id}`)}</option>)}
          </select>
        </li>)}
      </ol>
      <small>{t("settings.marketplacePackage.slidesHint")}</small>
    </fieldset>

    <div className="fixed-output-note"><b>{t("settings.outputSize.cardTitle")}</b><span>{t("settings.marketplacePackage.outputNote", { count })}</span></div>
  </div>;
}
