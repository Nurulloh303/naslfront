import { useEffect, useState } from "react";
import { accountApi, type ProductListing, type ProjectFolder } from "../account/accountApi";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Проект как папка.
 *
 * Раньше проект был строкой в списке: имя, дата и одна превьюшка. Всё
 * остальное — исходное фото, бриф, текст на слайдах, описание для
 * площадки — либо жило в разных местах, либо только в памяти вкладки.
 * Человек, вернувшийся через неделю, не мог собрать карточку заново и
 * начинал с нуля.
 *
 * Здесь всё вместе: слева то, из чего сделана карточка, справа то, что
 * нужно вставить в карточку товара. И кнопка «скачать всё» — архив с
 * пронумерованными файлами, чтобы слайды не перемешались при загрузке.
 */
export function ProjectFolderView({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useLanguage();
  const [folder, setFolder] = useState<ProjectFolder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    accountApi.project(id)
      .then((payload) => { if (alive) setFolder(payload.project); })
      .catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : t("cabinet.folder.loadFailed")); });
    return () => { alive = false; };
  }, [id, t]);

  const writeListing = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await accountApi.projectListing(id);
      setFolder((current) => (current ? { ...current, listing: payload.listing } : current));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("cabinet.folder.listingFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("cabinet.projects.deleteConfirm"))) return;
    setBusy(true);
    try {
      await accountApi.deleteProject(id);
      onDeleted();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("cabinet.folder.loadFailed"));
      setBusy(false);
    }
  };

  if (error && !folder) return <div className="folder-state"><p>{error}</p><button className="button secondary" type="button" onClick={onClose}>{t("cabinet.projects.close")}</button></div>;
  if (!folder) return <div className="folder-state"><p>{t("cabinet.folder.loading")}</p></div>;

  return <div className="project-folder">
    <div className="folder-bar">
      <button type="button" className="folder-back" onClick={onClose}>← {t("cabinet.folder.back")}</button>
      <div>
        <h2>{folder.brief?.title || folder.name}</h2>
        <span>{folder.summary ?? folder.marketplace} · {new Date(folder.createdAt).toLocaleDateString("uz-UZ")}</span>
      </div>
      <div className="folder-bar-actions">
        <a className="button primary" href={folder.archiveUrl} download>{t("cabinet.folder.downloadAll")}</a>
        <button type="button" className="button secondary is-danger" disabled={busy} onClick={() => void remove()}>{t("cabinet.projects.delete")}</button>
      </div>
    </div>

    {error ? <p className="reference-warning" role="status">{error}</p> : null}

    <div className="folder-body">
      <section className="folder-column">
        <h3>{t("cabinet.folder.sourceTitle")}</h3>
        {folder.sourceUrl
          ? <img className="folder-source" src={folder.sourceUrl} alt={t("cabinet.folder.sourceTitle")} />
          : <p className="folder-muted">{t("cabinet.folder.noSource")}</p>}

        {folder.brief ? <>
          <h3>{t("cabinet.folder.briefTitle")}</h3>
          <dl className="folder-brief">
            <dt>{t("cabinet.folder.briefName")}</dt><dd>{folder.brief.title || "—"}</dd>
            {folder.brief.subtitle ? <><dt>{t("cabinet.folder.briefSubtitle")}</dt><dd>{folder.brief.subtitle}</dd></> : null}
            <dt>{t("cabinet.folder.briefCategory")}</dt><dd>{folder.brief.category || "—"}</dd>
          </dl>
          {folder.brief.benefits.length ? <ul className="folder-benefits">{folder.brief.benefits.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </> : null}

        {folder.plan.length ? <>
          <h3>{t("cabinet.folder.planTitle")}</h3>
          <ol className="folder-plan">{folder.plan.map((slide, index) => <li key={slide.id ?? index}>
            <b>{slide.headline}</b>
            {slide.subtitle ? <span>{slide.subtitle}</span> : null}
            {slide.lines.length ? <small>{slide.lines.join(" · ")}</small> : null}
          </li>)}</ol>
        </> : null}
      </section>

      <section className="folder-column folder-column-wide">
        <h3>{t("cabinet.folder.slidesTitle", { count: folder.results.length })}</h3>
        <div className="folder-slides">
          {folder.results.map((result, index) => <figure key={result.id}>
            <button type="button" onClick={() => setZoom(result.previewUrl)} aria-label={result.title}>
              <img src={result.previewUrl} alt={result.title} loading="lazy" />
            </button>
            <figcaption>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <a href={result.downloadUrl} download>{t("cabinet.projects.download")}</a>
            </figcaption>
          </figure>)}
        </div>

        <h3>{t("cabinet.folder.listingTitle")}</h3>
        {folder.listing
          ? <ListingBlocks listing={folder.listing} />
          : <div className="folder-listing-empty">
              <p>{t("cabinet.folder.listingHint")}</p>
              <button type="button" className="button secondary" disabled={busy} onClick={() => void writeListing()}>
                {busy ? t("cabinet.folder.listingWorking") : t("cabinet.folder.listingAction")}
              </button>
            </div>}
      </section>
    </div>

    {zoom ? <div className="project-viewer" role="dialog" onClick={() => setZoom(null)}>
      <img src={zoom} alt="" onClick={(event) => event.stopPropagation()} />
      <div className="project-viewer-actions" onClick={(event) => event.stopPropagation()}>
        <button className="button secondary" type="button" onClick={() => setZoom(null)}>{t("cabinet.projects.close")}</button>
      </div>
    </div> : null}
  </div>;
}

/** Описание для площадки: два языка рядом, каждый блок копируется отдельно. */
function ListingBlocks({ listing }: { listing: ProductListing }) {
  const { t } = useLanguage();
  const rows: [string, string, string][] = [
    [t("listing.name"), listing.title.uz, listing.title.ru],
    [t("listing.utp"), listing.utp.uz, listing.utp.ru],
    [t("listing.short"), listing.shortDescription.uz, listing.shortDescription.ru],
    [t("listing.full"), listing.fullDescription.uz, listing.fullDescription.ru],
  ];
  return <div className="folder-listing">
    {rows.map(([label, uz, ru]) => <div className="folder-listing-row" key={label}>
      <b>{label}</b>
      <div><CopyText value={uz} lang="O‘z" /><CopyText value={ru} lang="Ру" /></div>
    </div>)}
    {listing.characteristics.length ? <table className="folder-chars"><tbody>
      {listing.characteristics.map((item, index) => <tr key={index}><th>{item.name.uz}</th><td>{item.value.uz}</td></tr>)}
    </tbody></table> : null}
    <div className="folder-listing-row">
      <b>{t("listing.keywords")}</b>
      <div><CopyText value={listing.keywords.uz.join(", ")} lang="O‘z" /><CopyText value={listing.keywords.ru.join(", ")} lang="Ру" /></div>
    </div>
  </div>;
}

function CopyText({ value, lang }: { value: string; lang: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return <p className="folder-copy">
    <i>{lang}</i>
    <span>{value}</span>
    <button type="button" onClick={() => {
      void navigator.clipboard?.writeText(value).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      });
    }}>{copied ? t("listing.copied") : t("listing.copy")}</button>
  </p>;
}
