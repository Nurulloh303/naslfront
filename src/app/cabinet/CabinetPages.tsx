import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "../account/AccountContext";
import { accountApi, type AccountProject, type AccountUser } from "../account/accountApi";
import type { CabinetRoute } from "../routes";
import { CabinetFooter, CabinetHeader } from "./CabinetHeader";
import { useLanguage } from "../../i18n/LanguageContext";
import { downloadFile } from "../downloadHelper";
import { BuyTokens } from "./BuyTokens";
import { LEGAL_CONTENT, type LegalDoc } from "./legalContent";
import { ProjectFolderView } from "./ProjectFolderView";

type Props = { route: Exclude<CabinetRoute, "create">; onNavigate: (route: CabinetRoute) => void; onLogout?: () => void };

/* Вкладки профиль-хаба. Роуты остались прежними (billing/history/api/referrals
   продолжают работать и по прямой ссылке), но визуально это одна страница
   «Profil» с переключателем, как в макете. */
type HubTab = "profile" | "billing" | "history" | "api" | "referrals";

function PageFrame({ route, onNavigate, onLogout, title, children }: Props & { title: string; children: ReactNode }) {
  const { account } = useAccount();
  const { t } = useLanguage();
  if (!account) return null;
  return <main className="reference-app cabinet-page"><CabinetHeader route={route} balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} /><section className="cabinet-content"><div className="cabinet-page-heading"><div><p className="eyebrow">{t("cabinet.eyebrow")}</p><h1>{title}</h1></div></div>{children}</section><CabinetFooter onNavigate={onNavigate} /></main>;
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="cabinet-empty"><div className="empty-orbit">✦</div><h2>{title}</h2><p>{text}</p>{action && <button className="button primary" type="button" onClick={onAction}>{action}</button>}</div>;
}

export function ProjectsPage({ onNavigate, onLogout }: Omit<Props, "route">) {
  const { account, refresh } = useAccount();
  const { t } = useLanguage();
  // Какой проект открыт. Раньше открывалась только картинка во весь
  // экран; теперь открывается папка целиком — фото, бриф, текст слайдов,
  // описание для площадки и все картинки в одном месте.
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!account) return null;
  const projects = account.projects;

  const remove = async (id: string) => {
    if (!window.confirm(t("cabinet.projects.deleteConfirm"))) return;
    setBusyId(id);
    try {
      await accountApi.deleteProject(id);
      await refresh();
      if (openId === id) setOpenId(null);
    } catch { /* сообщение об ошибке даст следующий refresh */ }
    finally { setBusyId(null); }
  };

  const download = (project: AccountProject) => {
    if (!project.previewUrl) return;
    void downloadFile(project.previewUrl, `${project.name || "loyiha"}.png`);
  };

  if (openId) {
    return <PageFrame route="projects" onNavigate={onNavigate} onLogout={onLogout} title={t("cabinet.projects.title")}>
      <ProjectFolderView id={openId} onClose={() => setOpenId(null)} onDeleted={() => { setOpenId(null); void refresh(); }} />
    </PageFrame>;
  }

  return <PageFrame route="projects" onNavigate={onNavigate} onLogout={onLogout} title={t("cabinet.projects.title")}>
    {projects.length ? <div className="project-grid">
      {projects.map((project) => <article className="project-card" key={project.id}>
        <button
          type="button"
          className="project-preview"
          onClick={() => setOpenId(project.id)}
          disabled={!project.available}
          aria-label={project.name}
        >
          {project.previewUrl
            ? <img src={project.previewUrl} alt={project.name} loading="lazy" />
            : <span className="project-preview-empty">{t("cabinet.projects.noImage")}</span>}
        </button>
        <div className="project-meta">
          <b>{project.name}</b>
          <span>{project.marketplace} · {new Date(project.createdAt).toLocaleDateString("uz-UZ")}</span>
          {(project.resultCount ?? 0) > 1 && <small>{t("cabinet.projects.count", { count: project.resultCount ?? 0 })}</small>}
        </div>
        <div className="project-actions">
          {project.previewUrl && <button type="button" onClick={() => download(project)}>{t("cabinet.projects.download")}</button>}
          <button type="button" className="is-danger" disabled={busyId === project.id} onClick={() => void remove(project.id)}>
            {busyId === project.id ? "…" : t("cabinet.projects.delete")}
          </button>
        </div>
      </article>)}
    </div> : <EmptyState title={t("cabinet.projects.emptyTitle")} text={t("cabinet.projects.emptyText")} action={t("cabinet.projects.emptyAction")} onAction={() => onNavigate("create")} />}
  </PageFrame>;
}

/* ---------------- модалка пополнения токенов ---------------- */

/** Возвращает null, если числа нет: лучше не показать цену, чем показать «не число». */
const formatSum = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("ru-RU").replace(/,/g, "\u00a0")
    : null;

function PriceList({ dark }: { dark?: boolean }) {
  const { account } = useAccount();
  const { t } = useLanguage();
  if (!account) return null;
  const p = account.pricing;
  // Цена в сумах — по САМОМУ ДОРОГОМУ токену (пакет Start). В крупных
  // пакетах токен дешевле, поэтому показываем «до X сум», не занижая.
  const rows: Array<[string, number]> = [
    [t("profileHub.priceImage"), p.perImage],
    [t("profileHub.priceVariant"), p.perImage],
    [t("profileHub.pricePage"), p.perImage],
    [t("profileHub.pricePackage", { min: p.marketplacePackage.min, max: p.marketplacePackage.max }), p.marketplacePackage.perSlide],
  ];
  return <div className={`price-list ${dark ? "on-dark" : ""}`}>
    {rows.map(([label, tokens]) => {
      const sum = formatSum(typeof p.tokenPriceUzs === "number" ? tokens * p.tokenPriceUzs : null);
      return <div className="price-row" key={label}>
        <span>{label}</span>
        <b>{tokens} {t("common.token")}{sum && <em>≈ {sum} {t("buy.sum")}</em>}</b>
      </div>;
    })}
    <p className="price-note">{t("profileHub.priceNote")}</p>
  </div>;
}

export function TokenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account } = useAccount();
  const { t } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);
  if (!open || !account) return null;
  return <div className="token-modal" role="dialog" aria-modal="true" aria-label={t("profileHub.modalTitle")}>
    <div className="token-modal-back" role="presentation" onMouseDown={onClose} />
    <div className="token-modal-card">
      <button className="token-modal-x" type="button" aria-label={t("profileHub.modalClose")} onClick={onClose}>×</button>
      <p className="eyebrow">{t("cabinet.billing.title")}</p>
      <h3>{t("profileHub.modalTitle")}</h3>
      <p className="modal-sub">{t("profileHub.modalAvailable")}: ✦ <b>{account.balance}</b> {t("common.token")}</p>
      <BuyTokens />
    </div>
  </div>;
}

/* ---------------- панели вкладок ---------------- */

function ProfileFormPanel() {
  const { account, updateProfile } = useAccount();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Pick<AccountUser, "name" | "email" | "language">>(() => account?.user ?? { name: "", email: "", language: "uz" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  useEffect(() => { if (account) setProfile({ name: account.user.name, email: account.user.email, language: account.user.language }); }, [account]);
  if (!account) return null;
  const update = (patch: Partial<typeof profile>) => { setProfile((current) => ({ ...current, ...patch })); setSaved(false); setError(""); };
  const save = async () => { setSaving(true); setError(""); try { await updateProfile(profile); setSaved(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Profilni saqlab bo‘lmadi"); } finally { setSaving(false); } };
  const copyUserCode = async () => { try { await navigator.clipboard.writeText(account.user.supportCode); setCopied(true); window.setTimeout(() => setCopied(false), 2_000); } catch { setError("Koddan nusxa olib bo‘lmadi"); } };
  const requestProvider = (provider: string) => { setLoginNotice(`${provider}: ulash serverda OAuth sozlangandan keyin ishlaydi.`); window.setTimeout(() => setLoginNotice(""), 2_600); };

  return <section className="profile-account-card">
    <h2>{t("cabinet.profile.accountTitle")}</h2>
    <div className="support-code"><div><b>{t("cabinet.profile.supportCode")}</b><span>{t("cabinet.profile.supportCodeHint")}</span></div><strong>{account.user.supportCode}</strong><button type="button" aria-label={t("cabinet.profile.supportCode")} onClick={() => void copyUserCode()}>{copied ? "✓" : "□"}</button></div>
    <form className="profile-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>{t("cabinet.profile.nameLabel")}<input required maxLength={80} value={profile.name} onChange={(event) => update({ name: event.target.value })} /></label>
      <label>{t("cabinet.profile.emailLabel")}<input required type="email" value={profile.email} onChange={(event) => update({ email: event.target.value })} /></label>
      <label>{t("cabinet.profile.languageLabel")}<select value={profile.language} onChange={(event) => update({ language: event.target.value as AccountUser["language"] })}><option value="uz">{t("settings.language.options.uz")}</option></select></label>
      <button className="button primary" type="submit" disabled={saving}>{saving ? t("cabinet.profile.saving") : t("cabinet.profile.save")}</button>
      {saved && <p className="inline-success" role="status">{t("cabinet.profile.saved")}</p>}{error && <p className="inline-warning" role="alert">{error}</p>}
    </form>
    <h3>{t("cabinet.profile.loginMethod")}</h3>
    <div className="login-provider"><span>Y</span><div><b>Yandex</b><small>{t("cabinet.profile.notConnected")}</small></div><button type="button" onClick={() => requestProvider("Yandex")}>{t("cabinet.profile.comingSoon")}</button></div>
    <div className="login-provider"><span>@</span><div><b>Telegram</b><small>{t("cabinet.profile.notConnected")}</small></div><button type="button" onClick={() => requestProvider("Telegram")}>{t("cabinet.profile.comingSoon")}</button></div>
    {loginNotice && <p className="inline-warning" role="status">{loginNotice}</p>}
  </section>;
}

function ProjectShortcutsPanel({ onNavigate }: { onNavigate: (route: CabinetRoute) => void }) {
  const { t } = useLanguage();
  return <section className="profile-projects-card">
    <h2>{t("cabinet.profile.projectsTitle")}</h2>
    <button className="profile-create-project" type="button" onClick={() => onNavigate("create")}><span>+</span><b>{t("cabinet.profile.createProject")}</b><i>›</i></button>
    <button className="profile-project-link" type="button" onClick={() => onNavigate("projects")}><span>▱</span><div><b>{t("cabinet.profile.allProjects")}</b><small>{t("cabinet.profile.allProjectsHint")}</small></div><i>›</i></button>
  </section>;
}

function TokensPanel() {
  const { account } = useAccount();
  const { t } = useLanguage();
  if (!account) return null;
  return <>
    <section className="cabinet-panel panel-dark balance-strip">
      <div>
        <span className="sb-label">{t("profileHub.modalAvailable")}</span>
        <div className="plan-tokens big">✦ {account.balance} <i>{t("common.token")}</i></div>
      </div>
      <div className="balance-prices">
        <h3 className="price-title">{t("profileHub.priceTitle")}</h3>
        <PriceList dark />
      </div>
    </section>
    <BuyTokens />
  </>;
}

function HistoryPanel() {
  const { account } = useAccount();
  const { t } = useLanguage();
  if (!account) return null;
  const entries = account.ledger;
  if (!entries.length) return <EmptyState title={t("cabinet.history.emptyTitle")} text={t("cabinet.history.emptyText")} />;
  return <div className="cabinet-list">{entries.map((entry) => <article className="cabinet-row" key={entry.id}><div><b>{entry.label}</b><span>{new Date(entry.createdAt).toLocaleString("uz-UZ")} · {t("cabinet.history.balanceAfter")} {entry.balanceAfter} {t("cabinet.history.token")}</span></div><strong className={entry.type === "credit" ? "amount-positive" : "amount-negative"}>{entry.type === "credit" ? "+" : "−"}{entry.amount} {t("cabinet.history.token")}</strong></article>)}</div>;
}

function ApiPanel() {
  const { account, refresh } = useAccount();
  const { t } = useLanguage();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!account) return null;
  // Лимит ключей приходит с сервера. Кнопку гасим ЗАРАНЕЕ: раньше её можно
  // было жать бесконечно, и человек упирался в ошибку только после клика.
  const keyLimit = account.apiKeyLimit ?? 3;
  const limitReached = account.apiKeys.length >= keyLimit;
  const createKey = async () => {
    if (limitReached) { setError(t("cabinet.api.limitReached", { limit: keyLimit })); return; }
    setBusy(true); setError("");
    try { const created = await accountApi.createApiKey(); setSecret(created.secret); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Kalitni yaratib bo‘lmadi"); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => { setBusy(true); setError(""); try { await accountApi.revokeApiKey(id); setConfirmId(null); setSecret(""); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Kalitni bekor qilib bo‘lmadi"); } finally { setBusy(false); } };
  const copySecret = async () => { try { await navigator.clipboard.writeText(secret); } catch { setError("Maxfiy kalitdan nusxa olib bo‘lmadi"); } };
  return <>
    <div className="api-hero"><div><h2>{t("cabinet.api.heroTitle")}</h2><p>{t("cabinet.api.heroText")}</p></div><div className="api-hero-action"><button className="button primary" type="button" disabled={busy || limitReached} onClick={() => void createKey()}>{busy ? t("cabinet.api.creating") : t("cabinet.api.create")}</button><small>{t("cabinet.api.keysUsed", { used: account.apiKeys.length, limit: keyLimit })}</small></div></div>
    {secret && <div className="secret-once" role="status"><div><b>{t("cabinet.api.secretSaveNow")}</b><code>{secret}</code><small>{t("cabinet.api.secretNote")}</small></div><button className="button secondary" type="button" onClick={() => void copySecret()}>{t("cabinet.api.copy")}</button><button className="button secondary" type="button" onClick={() => setSecret("")}>{t("cabinet.api.done")}</button></div>}
    {error && <p className="inline-warning" role="alert">{error}</p>}
    <div className="cabinet-panel"><h2>{t("cabinet.api.keysTitle")}</h2>{account.apiKeys.length ? <div className="cabinet-list">{account.apiKeys.map((key) => <article className="cabinet-row" key={key.id}><div><b>{key.name}</b><code>{key.prefix}••••••••</code></div>{confirmId === key.id ? <div className="inline-confirm"><span>{t("cabinet.api.revokeConfirm")}</span><button className="button danger" type="button" disabled={busy} onClick={() => void revoke(key.id)}>{t("cabinet.api.revokeYes")}</button><button className="button secondary" type="button" onClick={() => setConfirmId(null)}>{t("cabinet.api.cancel")}</button></div> : <button className="button danger" type="button" onClick={() => setConfirmId(key.id)}>{t("cabinet.api.revoke")}</button>}</article>)}</div> : <EmptyState title={t("cabinet.api.emptyTitle")} text={t("cabinet.api.emptyText")} action={t("cabinet.api.create")} onAction={() => void createKey()} />}</div>
  </>;
}

function ReferralsPanel() {
  const { account } = useAccount();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  if (!account) return null;
  const referral = `https://naslai.uz/r/${account.referrals.code}`;
  const copy = async () => { try { await navigator.clipboard.writeText(referral); setCopied(true); setError(""); window.setTimeout(() => setCopied(false), 2_000); } catch { setError("Havoladan nusxa olib bo‘lmadi"); } };
  return <>
    <section className="referral-hero"><div><span>{t("cabinet.referrals.heroLabel")}</span><h2>{t("cabinet.referrals.heroTitle")}</h2><p>{t("cabinet.referrals.heroText")}</p></div><div className="referral-orbit">+10</div></section>
    <div className="referral-link"><span>{referral}</span><button className="button primary" type="button" onClick={() => void copy()}>{copied ? t("cabinet.referrals.copied") : t("cabinet.referrals.copy")}</button></div>
    {error && <p className="inline-warning" role="alert">{error}</p>}
    <div className="cabinet-grid three-columns"><div className="metric-card"><span>{t("cabinet.referrals.invited")}</span><b>{account.referrals.invited}</b><small>{t("cabinet.referrals.invitedUnit")}</small></div><div className="metric-card"><span>{t("cabinet.referrals.credited")}</span><b>{account.referrals.credited}</b><small>{t("cabinet.referrals.creditedUnit")}</small></div><div className="metric-card"><span>{t("cabinet.referrals.level")}</span><b>{account.referrals.level}</b><small>{t("cabinet.referrals.levelUnit")}</small></div></div>
  </>;
}

/* ---------------- сам хаб ---------------- */

function ProfileHub({ initialTab, onNavigate, onLogout }: { initialTab: HubTab } & Omit<Props, "route">) {
  const { account } = useAccount();
  const { t } = useLanguage();
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [topUpOpen, setTopUpOpen] = useState(false);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  if (!account) return null;
  const initial = account.user.name.trim().charAt(0).toUpperCase() || "A";
  const tabs: Array<[HubTab, string]> = [
    ["profile", t("profileHub.tabProfile")],
    ["billing", t("profileHub.tabTokens")],
    ["history", t("profileHub.tabHistory")],
    ["api", t("profileHub.tabApi")],
    ["referrals", t("profileHub.tabRef")],
  ];

  return <main className="reference-app cabinet-page profile-hub-page">
    <CabinetHeader route={tab} balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content">
      <div className="cabinet-page-heading">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            type="button"
            className="folder-back"
            style={{ alignSelf: "flex-start", marginBottom: "4px" }}
            onClick={() => onNavigate("create")}
          >
            ← {t("profileHub.backHome") || "Bosh sahifaga qaytish"}
          </button>
          <p className="eyebrow">{t("cabinet.eyebrow")}</p>
          <h1>{t("cabinet.profile.title")}</h1>
        </div>
      </div>

      <div className="prof-hero">
        <div className="profile-avatar">{initial}</div>
        <div className="ph-info"><h3>{account.user.name || t("cabinet.profile.defaultName")}</h3><span>{account.user.email}</span></div>
        <button className="token-chip" type="button" onClick={() => setTab("billing")}>✦ {account.balance} <i>{t("common.token")}</i></button>
        <button className="button primary" type="button" onClick={() => setTopUpOpen(true)}>{t("cabinet.billing.topUp")}</button>
      </div>

      <div className="prof-tabs" role="tablist" aria-label={t("profileHub.tabsAria")}>
        {tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}
      </div>

      <div className="ppanel">
        {tab === "profile" && <div className="two-col"><ProfileFormPanel /><ProjectShortcutsPanel onNavigate={onNavigate} /></div>}
        {tab === "billing" && <TokensPanel />}
        {tab === "history" && <HistoryPanel />}
        {tab === "api" && <ApiPanel />}
        {tab === "referrals" && <ReferralsPanel />}
      </div>
    </section>
    <TokenModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}

/* Экспорты под существующие роуты — App.tsx менять не нужно. */
export function ProfilePage(props: Omit<Props, "route">) { return <ProfileHub initialTab="profile" {...props} />; }
export function BillingPage(props: Omit<Props, "route">) { return <ProfileHub initialTab="billing" {...props} />; }
export function HistoryPage(props: Omit<Props, "route">) { return <ProfileHub initialTab="history" {...props} />; }
export function ApiPage(props: Omit<Props, "route">) { return <ProfileHub initialTab="api" {...props} />; }
export function ReferralsPage(props: Omit<Props, "route">) { return <ProfileHub initialTab="referrals" {...props} />; }

/* ---------------- юридические документы ---------------- */

export function LegalPageView({ doc, onNavigate, onLogout }: { doc: LegalDoc } & Omit<Props, "route">) {
  const { language, t } = useLanguage();
  const page = LEGAL_CONTENT[language][doc];
  return <PageFrame route={doc} onNavigate={onNavigate} onLogout={onLogout} title={page.title}>
    <article className="legal-page">
      <p className="legal-updated">{t("legal.updated")}: {page.updated}</p>
      <p className="legal-intro">{page.intro}</p>
      {page.sections.map((section) => <section key={section.heading}>
        <h2>{section.heading}</h2>
        {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </section>)}
      <p className="legal-draft">{t("legal.draftNote")}</p>
    </article>
  </PageFrame>;
}

export function PrivacyPage(props: Omit<Props, "route">) { return <LegalPageView doc="privacy" {...props} />; }
export function TermsPage(props: Omit<Props, "route">) { return <LegalPageView doc="terms" {...props} />; }
export function OfferPage(props: Omit<Props, "route">) { return <LegalPageView doc="offer" {...props} />; }
