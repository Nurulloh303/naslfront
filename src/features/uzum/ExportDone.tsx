import { useState } from "react";
import { downloadBlob, saveBlobAsFile } from "../../app/downloadHelper";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatDate } from "./draft";
import { uzumApi, type UzumExport } from "./uzumApi";
import { XlsmGlyph, apiMessage } from "./fields";

/** Faylni yuklab olish: telefonda ulashish oynasi, iOS rad etsa — oddiy saqlash. */
export function useExportDownload() {
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const download = async (item: UzumExport) => {
    setBusyId(item.id);
    setError(null);
    try {
      const { blob, fileName } = await uzumApi.download(item);
      const outcome = await downloadBlob(blob, fileName);
      if (outcome === "needs-gesture") saveBlobAsFile(blob, fileName);
      if (outcome !== "cancelled") setSavedId(item.id);
    } catch (reason) {
      setError({ id: item.id, message: apiMessage(reason, t, "uzum.errors.download") });
    } finally {
      setBusyId(null);
    }
  };
  return { download, busyId, error, savedId };
}

export function ExportDone({ item, onEdit, onNew, onList }: { item: UzumExport; onEdit: () => void; onNew: () => void; onList: () => void }) {
  const { t, language } = useLanguage();
  const { download, busyId, error, savedId } = useExportDownload();
  const [copied, setCopied] = useState<number | null>(null);
  const crumbs = item.categoryPath.split(/\s*(?:>|\/|→|»)\s*/).filter(Boolean);

  const copy = (url: string, index: number) => {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };

  return <div className="uz-done">
    <header className="uz-done-head">
      <span className="uz-done-mark" aria-hidden="true">✓</span>
      <div>
        <h2>{t("uzum.done.title")}</h2>
        <p>{t("uzum.done.lead")}</p>
      </div>
    </header>

    <div className="uz-done-grid">
      <section className="uz-ticket">
        <div className="uz-ticket-file">
          <XlsmGlyph />
          <div>
            <b>{item.fileName}</b>
            <span>{crumbs[crumbs.length - 1] ?? item.categoryPath} · {t("uzum.home.skuCount", { n: item.skuCount })}</span>
          </div>
        </div>
        <button type="button" className="uz-cta" disabled={busyId === item.id} onClick={() => void download(item)}>
          {busyId === item.id ? t("uzum.done.downloading") : t("uzum.done.download")}
        </button>
        {error?.id === item.id && <p className="uz-error" role="alert">{error.message}</p>}
        {savedId === item.id && !error && <p className="uz-saved" role="status">✓ {t("uzum.done.downloaded")}</p>}
        <p className="uz-expiry">{t("uzum.done.expires", { date: formatDate(item.expiresAt, language) })}</p>

        {item.photoUrls.length > 0 && <details className="uz-links">
          <summary>{t("uzum.done.photos")} ({item.photoUrls.length})</summary>
          <ol>
            {item.photoUrls.map((url, index) => <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")}</a>
              <button type="button" className="uz-link" onClick={() => copy(url, index)}>{copied === index ? t("uzum.done.copied") : t("uzum.done.copy")}</button>
            </li>)}
          </ol>
        </details>}
      </section>

      <section className="uz-how">
        <h3>{t("uzum.done.howTitle")}</h3>
        <ol>
          <li>{t("uzum.done.how1")}</li>
          <li>{t("uzum.done.how2")}</li>
          <li>{t("uzum.done.how3")}</li>
        </ol>
        <p className="uz-tip">{t("uzum.done.tip")}</p>
      </section>
    </div>

    <div className="uz-done-actions">
      <button type="button" className="button secondary" onClick={onEdit}>{t("uzum.done.edit")}</button>
      <button type="button" className="button secondary" onClick={onList}>{t("uzum.done.toList")}</button>
      <button type="button" className="button secondary" onClick={onNew}>{t("uzum.done.again")}</button>
    </div>
  </div>;
}
