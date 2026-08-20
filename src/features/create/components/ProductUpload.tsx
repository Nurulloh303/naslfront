import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { AnalysisProgress } from "./AnalysisProgress";
import type { ProductAsset } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { prepareImageDataUrl } from "../domain/prepareImage";
import { MAX_UPLOAD_BYTES } from "../domain/uploadLimits";

type Props = { assets: ProductAsset[]; isAnalyzing: boolean; onAssetsChange: (assets: ProductAsset[]) => void };

export function ProductUpload({ assets, isAnalyzing, onAssetsChange }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const readFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, 4 - assets.length);
    if (!selected.length) { setError(t("productUpload.invalidType")); return; }
    if (selected.some((file) => file.size > MAX_UPLOAD_BYTES)) { setError(t("productUpload.maxSize")); return; }
    try {
      const next = await Promise.all(selected.map(async (file, index) => ({ id: `${file.name}-${file.lastModified}-${assets.length + index}`, name: file.name, url: URL.createObjectURL(file), sourceDataUrl: await prepareImageDataUrl(file), isPrimary: assets.length + index === 0 })));
      setError("");
      onAssetsChange([...assets, ...next]);
    } catch { setError(t("productUpload.readFailed")); }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void readFiles(event.target.files); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void readFiles(event.dataTransfer.files); };
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => { if (event.clipboardData.files.length) { event.preventDefault(); void readFiles(event.clipboardData.files); } };
  const remove = (id: string) => {
    const removed = assets.find((asset) => asset.id === id);
    if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
    const rest = assets.filter((asset) => asset.id !== id);
    onAssetsChange(rest.map((asset, index) => ({ ...asset, isPrimary: index === 0 })));
  };

  return <section className="flow-section" aria-labelledby="product-step">
    <div className="section-heading"><span>01</span><div><h2 id="product-step">{t("productUpload.title")}</h2><p>{t("productUpload.subtitle")}</p></div></div>
    {!assets.length ? <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onPaste={onPaste} tabIndex={0} aria-label={t("productUpload.dropAria")}>
      <div className="upload-icon">↑</div><h3>{t("productUpload.dropTitle")}</h3><p>{t("productUpload.dropHint")}</p><button className="button secondary" type="button" onClick={() => inputRef.current?.click()}>{t("productUpload.upload")}</button><input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onChange} />
    </div> : <>
      <div className="asset-strip">{assets.map((asset) => <article className="asset-card" key={asset.id}><img src={asset.url} alt={asset.name} />{asset.isPrimary && <span className="asset-badge">{t("productUpload.primary")}</span>}<button className="icon-button" type="button" onClick={() => remove(asset.id)} aria-label={t("productUpload.removeAria", { name: asset.name })}>×</button></article>)}{assets.length < 4 && <button className="asset-add" type="button" onClick={() => inputRef.current?.click()}>+<span>{t("productUpload.add")}</span></button>}</div>
      <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onChange} />{isAnalyzing ? <AnalysisProgress compact /> : <p className="field-help">{t("productUpload.primaryHelp")}</p>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
