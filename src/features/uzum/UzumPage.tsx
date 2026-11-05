import { useCallback, useEffect, useState } from "react";
import { useAccount } from "../../app/account/AccountContext";
import { CabinetFooter, CabinetHeader } from "../../app/cabinet/CabinetHeader";
import type { CabinetRoute } from "../../app/routes";
import { useLanguage } from "../../i18n/LanguageContext";
import { formatDate, loadState } from "./draft";
import { useExportDownload } from "./ExportDone";
import { XlsmGlyph, apiMessage } from "./fields";
import { UzumWizard } from "./UzumWizard";
import { mediaUrl, uzumApi, type UzumExport } from "./uzumApi";
import "./uzum.css";

/**
 * «Uzum uchun Excel» — Uzum import fayli (.xlsm) tayyorlash.
 *
 * Manzillar:
 *   #uzum                 — boshlash + tayyorlangan fayllar ro'yxati
 *   #uzum?project=<jobId> — loyihadan to'ldirilgan ustoz
 *   #uzum?new=1           — loyihasiz ustoz
 *
 * Naslai faylni faqat tayyorlaydi: "Uzumda yaratildi" demaymiz.
 */

type Params = { project?: string; blank: boolean };

function readParams(): Params {
  const query = window.location.hash.split("?")[1] ?? "";
  const search = new URLSearchParams(query);
  const project = search.get("project")?.trim();
  return { project: project || undefined, blank: search.get("new") === "1" };
}

export function uzumHash(projectId?: string): string {
  return projectId ? `uzum?project=${encodeURIComponent(projectId)}` : "uzum";
}

export function UzumPage({ onNavigate, onLogout }: { onNavigate: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { account } = useAccount();
  const { t } = useLanguage();
  const [params, setParams] = useState<Params>(readParams);

  useEffect(() => {
    const onHash = () => { setParams(readParams()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!account) return null;
  const inWizard = Boolean(params.project) || params.blank;
  const project = params.project ? account.projects.find((item) => item.id === params.project) : undefined;

  return <main className="reference-app cabinet-page uz-page">
    <CabinetHeader route="uzum" balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content">
      <div className="cabinet-page-heading">
        <div>
          <p className="eyebrow">{t("cabinet.eyebrow")}</p>
          <h1>{t("uzum.title")}</h1>
          {!inWizard && <p className="audit-lead">{t("uzum.lead")}</p>}
        </div>
      </div>

      {inWizard
        ? <UzumWizard key={params.project ?? "new"} projectId={params.project} projectName={project?.name} onExit={() => { window.location.hash = "uzum"; }} />
        : <UzumHome />}
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}

function UzumHome() {
  const { account } = useAccount();
  const { t, language } = useLanguage();
  const [exports, setExports] = useState<UzumExport[] | null>(null);
  const [error, setError] = useState("");
  const { download, busyId, error: downloadError } = useExportDownload();
  const blankDraft = loadState(undefined);
  const hasBlankDraft = Boolean(blankDraft && (blankDraft.draft.categoryId || blankDraft.draft.titleRu || blankDraft.draft.titleUz));
  const projects = (account?.projects ?? []).filter((item) => item.status === "ready" && item.available !== false && item.contentType !== "resize" && item.marketplace !== "Video").slice(0, 8);

  const load = useCallback(() => {
    setError("");
    uzumApi.exports().then(setExports).catch((reason) => { setError(apiMessage(reason, t, "uzum.home.loadFailed")); setExports([]); });
  }, [t]);
  useEffect(load, [load]);

  const now = Date.now();

  return <div className="uz-home">
    <section className="uz-start">
      <div className="uz-start-card">
        <h2>{t("uzum.home.fromProject")}</h2>
        <p>{t("uzum.home.fromProjectHint")}</p>
        {projects.length
          ? <ul className="uz-start-projects">
            {projects.map((item) => <li key={item.id}>
              <a href={`#${uzumHash(item.id)}`}>
                {item.previewUrl ? <img src={mediaUrl(item.previewUrl)} alt="" loading="lazy" /> : <span className="uz-start-ph" aria-hidden="true">✦</span>}
                <span>{item.name}</span>
              </a>
            </li>)}
          </ul>
          : <p className="uz-muted">{t("uzum.home.noProjects")}</p>}
      </div>
      <div className="uz-start-card is-blank">
        <h2>{t("uzum.home.empty")}</h2>
        <p>{t("uzum.home.emptyHint")}</p>
        <a className="button primary uz-start-btn" href="#uzum?new=1">{hasBlankDraft ? t("uzum.home.continue") : t("uzum.home.startTitle")}</a>
        {hasBlankDraft && <small className="uz-muted">{t("uzum.home.draftNote")}</small>}
      </div>
    </section>

    <section className="uz-exports">
      <h2>{t("uzum.home.exportsTitle")}</h2>
      {error && <p className="uz-error" role="alert">{error} <button type="button" className="uz-link" onClick={load}>{t("uzum.home.retry")}</button></p>}
      {exports === null && <p className="uz-muted" role="status">{t("uzum.loading")}</p>}
      {exports && !exports.length && !error && <div className="uz-exports-empty"><XlsmGlyph /><div><b>{t("uzum.home.exportsEmpty")}</b><p>{t("uzum.home.exportsEmptyHint")}</p></div></div>}
      {exports && exports.length > 0 && <ul className="uz-export-list">
        {exports.map((item) => {
          const parts = item.categoryPath.split(/\s*(?:>|\/|→|»)\s*/).filter(Boolean);
          const expired = new Date(item.expiresAt).getTime() < now;
          return <li key={item.id}>
            <time dateTime={item.createdAt}>{formatDate(item.createdAt, language)}</time>
            <div className="uz-export-main">
              <b>{parts[parts.length - 1] ?? item.categoryPath}</b>
              <span>{parts.slice(0, -1).join(" › ")}</span>
            </div>
            <span className="uz-export-meta">
              {t("uzum.home.skuCount", { n: item.skuCount })}
              <small className={expired ? "is-expired" : ""}>{expired ? t("uzum.home.expired") : t("uzum.home.expires", { date: formatDate(item.expiresAt, language) })}</small>
            </span>
            <button type="button" className="button secondary" disabled={busyId === item.id} onClick={() => void download(item)}>
              {busyId === item.id ? t("uzum.home.downloading") : t("uzum.home.download")}
            </button>
            {downloadError?.id === item.id && <p className="uz-error uz-export-err" role="alert">{downloadError.message}</p>}
          </li>;
        })}
      </ul>}
    </section>
  </div>;
}
