import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { prepareImageDataUrl } from "../domain/prepareImage";
import type { ProductAsset, ProductBrief } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { MAX_UPLOAD_BYTES } from "../domain/uploadLimits";

type Props = {
  assets: ProductAsset[];
  brief: ProductBrief;
  disabled: boolean;
  onAssetsChange: (assets: ProductAsset[]) => void;
  onBriefChange: (patch: Partial<ProductBrief>) => void;
};

// Список должен совпадать с CATEGORY_OPTIONS на сервере: сервер сверяет
// категорию по enum и молча заменяет незнакомую на "Boshqa".
const categoryOptions = ["Aksessuarlar", "Kiyim", "Poyabzal", "Go‘zallik", "Salomatlik", "Sport", "Bolalar", "Uy", "Elektronika", "Boshqa"];

export function ProductSummaryCard({ assets, brief, disabled, onAssetsChange, onBriefChange }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [error, setError] = useState("");
  const benefitSlots = [...brief.benefits, "", "", "", ""].slice(0, 4);
  const changeBenefit = (index: number, value: string) => {
    const benefits = [...benefitSlots];
    benefits[index] = value;
    onBriefChange({ benefits });
  };

  useEffect(() => {
    if (!categoryOpen) return;
    const close = (event: MouseEvent) => { if (!categoryRef.current?.contains(event.target as Node)) setCategoryOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setCategoryOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [categoryOpen]);

  const readFiles = async (files: FileList | null) => {
    if (!files) return;
    const candidates = Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, 4 - assets.length);
    if (!candidates.length) { setError(t("productSummary.invalidType")); return; }
    if (candidates.some((file) => file.size > MAX_UPLOAD_BYTES)) { setError(t("productSummary.maxSize")); return; }
    try {
      const next = await Promise.all(candidates.map(async (file, index) => ({ id: `${file.name}-${file.lastModified}-${assets.length + index}`, name: file.name, url: URL.createObjectURL(file), sourceDataUrl: await prepareImageDataUrl(file), isPrimary: assets.length + index === 0 })));
      setError("");
      if (next.length) onAssetsChange([...assets, ...next]);
    } catch { setError(t("productSummary.readFailed")); }
  };

  const removeAll = () => { assets.forEach((asset) => { if (asset.url.startsWith("blob:")) URL.revokeObjectURL(asset.url); }); onAssetsChange([]); };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => { void readFiles(event.target.files); event.target.value = ""; };

  return <article className="reference-card product-summary-card">
    <div className="product-summary-head"><b>{t("productSummary.title")}</b><span>01</span></div>
    <div className="product-summary-media">
      {assets.map((asset) => <div className="summary-thumb" key={asset.id}>
        <img src={asset.url} alt={asset.name} />
        {asset.isPrimary && <i>✓</i>}
      </div>)}
      {assets.length < 4 && <button type="button" className="summary-add" onClick={() => inputRef.current?.click()} disabled={disabled}>+<span>{t("productSummary.addMore")}</span></button>}
      <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onChange} />
    </div>
    <p className="summary-count">{t("productSummary.count")}<br />{assets.length} / 4 · <button type="button" onClick={removeAll} disabled={disabled || !assets.length}>{t("productSummary.clear")}</button></p>
    <div className="product-summary-fields">
      <span>{t("productSummary.label")}</span>
      <div>
        <input disabled={disabled} value={brief.title} onChange={(event) => onBriefChange({ title: event.target.value })} placeholder={t("productSummary.titlePlaceholder")} />
        {/* Подзаголовок — вторая строка на карточке, поэтому стоит сразу
            под названием. Его пишет AI по фото; продавец может поправить
            или стереть — пустой лучше бессмысленного. */}
        <input disabled={disabled} value={brief.subtitle} onChange={(event) => onBriefChange({ subtitle: event.target.value })} placeholder={t("productSummary.subtitlePlaceholder")} maxLength={40} />
        <div className="category-picker" ref={categoryRef}>
          <button className="category-trigger" type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={categoryOpen} onClick={() => setCategoryOpen((open) => !open)}><span>{brief.category || t("create.categoryFallback")}</span><i>⌄</i></button>
          {categoryOpen && <div className="category-menu" role="listbox" aria-label={t("productSummary.categoryAria")}>{categoryOptions.map((category) => <button type="button" role="option" aria-selected={brief.category === category} key={category} onClick={() => { onBriefChange({ category }); setCategoryOpen(false); }}>{category}</button>)}</div>}
        </div>
      </div>
    </div>
    <div className="benefits-label"><span>{t("brief.benefits")}</span><span>{brief.benefits.filter(Boolean).length}/4</span></div>
    <div className="benefits-list">
      {benefitSlots.map((benefit, index) => <label key={index} className="benefit-input">
        <span>{index + 1}</span>
        <input disabled={disabled} value={benefit} onChange={(event) => changeBenefit(index, event.target.value)} placeholder={t("brief.benefitPlaceholder")} />
      </label>)}
    </div>
    {brief.aiNotice && <p className={`analysis-note ${brief.aiNotice.startsWith("AI tahlil ishlamadi") ? "is-warning" : ""}`}>{brief.aiNotice}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </article>;
}
