import type { ProductBrief } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = { brief: ProductBrief; disabled: boolean; notice: string | null; onChange: (patch: Partial<ProductBrief>) => void };

export function BriefEditor({ brief, disabled, notice, onChange }: Props) {
  const { t } = useLanguage();
  const benefitSlots = [...brief.benefits, "", "", "", ""].slice(0, 4);
  const changeBenefit = (index: number, value: string) => {
    const benefits = [...benefitSlots];
    benefits[index] = value;
    onChange({ benefits });
  };
  return <section className="brief-panel" aria-labelledby="brief-heading">
    <div className="section-heading compact"><div><h3 id="brief-heading">{t("brief.title")}</h3><p>{t("brief.subtitle")}</p></div><span className="ai-pill">{t("brief.pill")}</span></div>
    {notice && <div className="inline-notice">✦ {notice}</div>}
    <div className="field-grid">
      <label>{t("brief.productName")}<input disabled={disabled} value={brief.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={t("brief.productPlaceholder")} /></label>
      <label>{t("brief.category")}<input disabled={disabled} value={brief.category} onChange={(e) => onChange({ category: e.target.value })} placeholder={t("brief.categoryPlaceholder")} /></label>
      <label>{t("brief.sku")} <span className="optional">{t("brief.optional")}</span><input disabled={disabled} value={brief.sku} onChange={(e) => onChange({ sku: e.target.value })} placeholder={t("brief.skuPlaceholder")} /></label>
    </div>
    <div className="benefits-label"><span>{t("brief.benefits")}</span><span>{brief.benefits.filter(Boolean).length}/4</span></div>
    <div className="benefits-list">
      {benefitSlots.map((benefit, index) => <label key={index} className="benefit-input"><span>{index + 1}</span><input disabled={disabled} value={benefit} onChange={(e) => changeBenefit(index, e.target.value)} placeholder={t("brief.benefitPlaceholder")} /></label>)}
    </div>
  </section>;
}
