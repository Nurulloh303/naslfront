import { useEffect, useRef, useState, type ReactNode } from "react";
import { CardSettings } from "./components/CardSettings";
import { CopyStyleSettings } from "./components/CopyStyleSettings";
import { FashionSettings } from "./components/FashionSettings";
import { MarketplacePackageSettings } from "./components/MarketplacePackageSettings";
import { PhotoSettings } from "./components/PhotoSettings";
import { ProductUpload } from "./components/ProductUpload";
import { ProductSummaryCard } from "./components/ProductSummaryCard";
import { ResultPanel } from "./components/ResultPanel";
import { EditHelp } from "./components/EditHelp";
import { Hint } from "./components/Hint";
import { VideoSettings } from "./components/VideoSettings";
import { useCreateFlow } from "./hooks/useCreateFlow";
import { AUDIT_FIX_KEY } from "../../app/cabinet/AuditPage";
import type { CabinetRoute } from "../../app/routes";
import { CabinetFooter, ProfileMenu } from "../../app/cabinet/CabinetHeader";
import { BrandMark } from "../../app/BrandMark";
import { useAccount } from "../../app/account/AccountContext";
import { useLanguage } from "../../i18n/LanguageContext";
import type { ContentMode, Marketplace } from "./domain/types";

const BASE_MODES = new Set<ContentMode>(["photo", "card", "video"]);

/** Старший сервис семейства — вынесен константой, чтобы менять в одном месте. */
const PRO_SITE_URL = "https://www.infografikaai.uz/";

type Step = 1 | 2 | 3;

function Stepper({ activeStep, availableStep, onStep }: { activeStep: Step; availableStep: Step; onStep: (step: Step) => void }) {
  const { t } = useLanguage();
  const stepLabels: Array<[Step, string]> = [[1, t("stepper.step1")], [2, t("stepper.step2")], [3, t("stepper.step3")]];
  return <nav className="stepper" aria-label={t("stepper.ariaLabel")}>
    {stepLabels.map(([step, label]) => <button key={step} type="button" disabled={step > availableStep} aria-current={activeStep === step ? "step" : undefined} onClick={() => onStep(step)}>
      <span>{String(step).padStart(2, "0")}</span><b>{label}</b>
    </button>)}
  </nav>;
}

function CardHeader({ number, title }: { number: string; title: string }) {
  return <div className="reference-card-header"><h2>{title}</h2><span>{number}</span></div>;
}

function marketplaceLabel(marketplace: Marketplace) {
  if (marketplace === "uzum") return "Uzum";
  if (marketplace === "ozon") return "Ozon";
  return "WB";
}

function ResultShell({ children }: { children: ReactNode }) {
  return <aside className="reference-results"><div className="reference-card result-card-shell">{children}</div></aside>;
}

export function CreateCardPage({ onNavigate, onLogout }: { onNavigate?: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { t, dict, language: uiLanguage } = useLanguage();
  const { account, setBalance, refresh } = useAccount();
  const flow = useCreateFlow({ initialBalance: account?.balance ?? 0, onBalanceChange: setBalance, onJobSettled: () => { void refresh(); } });
  const { state } = flow;
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [pageFocusOpen, setPageFocusOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  // Блок «поправить текст сам» живёт в ЛЕВОЙ колонке: справа он
  // отодвигал результат далеко вниз, а слева пустовало место.
  const [helpOpen, setHelpOpen] = useState(false);
  const contentMode = state.settings.contentType;
  const isAnalyzing = state.job.status === "analyzing";
  // Kartochka tili sayt tiliga ergashadi. Foydalanuvchi o'zi boshqa til
  // tanlagan bo'lsa — tanlovi saqlanadi va biz uni bekor qilmaymiz.
  const languageTouched = useRef(false);
  const updateSettings: typeof flow.updateSettings = (patch) => {
    if (patch.language) languageTouched.current = true;
    flow.updateSettings(patch);
  };
  useEffect(() => {
    if (languageTouched.current) return;
    if (state.settings.language === uiLanguage) return;
    flow.updateSettings({ language: uiLanguage });
    // Faqat sayt tili o'zgarganda ishlashi kerak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiLanguage]);
  const isRunning = state.job.status === "submitting" || state.job.status === "queued" || state.job.status === "processing";
  const availableStep: Step = isRunning || state.job.status === "success" || state.job.status === "failed" ? 3 : state.assets.length && !isAnalyzing ? 2 : 1;
  const disabled = !state.assets.length || isAnalyzing;
  const quote = state.job.quote;
  const hasBalance = !quote || state.balance >= quote.tokens;
  const isPhoto = contentMode === "photo";
  const SPECIAL_MODE_LABEL: Partial<Record<ContentMode, string>> = { copyStyle: dict.featureCards.copyStyle.title, fashion: dict.featureCards.fashion.title, marketplacePackage: dict.featureCards.marketplacePackage.title };
  const SPECIAL_MODE_ICON: Partial<Record<ContentMode, string>> = { copyStyle: "↗", fashion: "♢", marketplacePackage: "▦" };
  const previousJobStatus = useRef(state.job.status);
  const [cancelling, setCancelling] = useState(false);

  // Отмена спрашивает подтверждение: нажать её случайно легко, а вернуть
  // уже отрисованные картинки нельзя.
  const cancelGeneration = async () => {
    if (cancelling) return;
    if (!window.confirm(t("results.cancelConfirm"))) return;
    setCancelling(true);
    const result = await flow.cancel();
    setCancelling(false);
    if (!result) return;
    flow.setNotice(result.delivered > 0
      ? t("results.cancelledPartial", { count: result.delivered })
      : t("results.cancelledAll"));
  };

  useEffect(() => {
    if (activeStep > availableStep) setActiveStep(availableStep);
  }, [activeStep, availableStep]);

  // Переход из аудита по кнопке «Исправить»: подставляем бриф и найденные
  // правки. Читаем один раз и сразу удаляем, чтобы при следующем заходе
  // старые данные не всплыли.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(AUDIT_FIX_KEY);
      if (raw) window.sessionStorage.removeItem(AUDIT_FIX_KEY);
    } catch { return; }
    if (!raw) return;
    try {
      const fix = JSON.parse(raw) as { title?: string; category?: string; benefits?: string[]; fixes?: string[]; image?: string };
      flow.updateBrief({
        title: fix.title || "",
        category: fix.category || "",
        benefits: (fix.benefits ?? []).slice(0, 4),
      });
      // Фото из аудита сразу становится товаром — повторно загружать не нужно.
      if (fix.image) {
        flow.setAssets([{
          id: `audit-${Date.now()}`,
          name: "audit.jpg",
          url: fix.image,
          sourceDataUrl: fix.image,
          isPrimary: true,
        }]);
      }
      if (fix.fixes?.length) flow.setNotice(t("audit.applied", { count: fix.fixes.length }));
    } catch { /* повреждённые данные просто игнорируем */ }
    // Намеренно один раз при монтировании.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (previousJobStatus.current === state.job.status) return;
    previousJobStatus.current = state.job.status;
    if (state.job.status === "ready") setActiveStep(2);
    if (["submitting", "queued", "processing", "success", "failed"].includes(state.job.status)) setActiveStep(3);
  }, [state.job.status]);

  useEffect(() => {
    if (!featuresOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFeaturesOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [featuresOpen]);

  const startGeneration = async () => {
    if (await flow.generate()) setActiveStep(3);
  };

  const selectContentMode = (mode: ContentMode) => {
    flow.updateSettings({ contentType: mode });
    if (state.assets.length) setActiveStep(2);
    else { setActiveStep(1); flow.setNotice(mode === "photo" ? t("create.photoModeNotice") : t("create.uploadFirstNotice")); }
    setAdvancedOpen(true);
    if (state.assets.length) flow.setNotice(null);
  };

  const createProject = () => {
    state.assets.forEach((asset) => { if (asset.url.startsWith("blob:")) URL.revokeObjectURL(asset.url); });
    if (state.settings.designReferenceUrl.startsWith("blob:")) URL.revokeObjectURL(state.settings.designReferenceUrl);
    flow.reset();
    setAdvancedOpen(false);
    setVariantsOpen(false);
    setActiveStep(1);
    onNavigate?.("create");
    window.location.hash = "top";
  };

  const openSpecialMode = (mode: ContentMode) => {
    setFeaturesOpen(false);
    selectContentMode(mode);
  };

  const featureCards: Array<{ icon: string; title: string; description: string; badge: string; mode: ContentMode }> = [
    { icon: "↗", ...dict.featureCards.copyStyle, mode: "copyStyle" },
    { icon: "♢", ...dict.featureCards.fashion, mode: "fashion" },
    { icon: "▦", ...dict.featureCards.marketplacePackage, mode: "marketplacePackage" },
  ];

  return <main className="reference-app">
    <header className="reference-header">
      <a className="reference-brand" href="#top"><BrandMark size={24} /> {t("common.brand")}</a>
      <div className="reference-header-nav"><button type="button" aria-expanded={featuresOpen} onClick={() => setFeaturesOpen((open) => !open)}>{t("nav.otherFeatures")}</button><button type="button" onClick={() => onNavigate?.("projects")}>{t("nav.allProjects")}</button><button type="button" className="nav-audit" onClick={() => onNavigate?.("audit")}>{t("audit.nav")}</button></div>
      {onNavigate ? <ProfileMenu route="create" balance={state.balance} onNavigate={onNavigate} onLogout={onLogout} /> : <button className="reference-profile" type="button" aria-label={t("nav.profileAria")} onClick={() => flow.setNotice(t("create.profileNotice"))}><span className="profile-spark">✦</span><b>{state.balance}</b><i>A</i></button>}
    </header>

    {state.notice && <div className="toast" role="status">{state.notice}<button type="button" onClick={flow.dismissNotice}>×</button></div>}
    {featuresOpen && <div className="feature-modal-backdrop" role="presentation" onMouseDown={() => setFeaturesOpen(false)}>
      <section className="feature-catalog" role="dialog" aria-modal="true" aria-labelledby="feature-catalog-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") setFeaturesOpen(false); }} tabIndex={-1}>
        <div className="feature-catalog-head"><div><p className="eyebrow">{t("featureCatalog.eyebrow")}</p><h1 id="feature-catalog-title">{t("featureCatalog.title")}</h1><p>{t("featureCatalog.subtitle")}</p></div><button className="feature-catalog-close" type="button" aria-label={t("featureCatalog.closeAria")} onClick={() => setFeaturesOpen(false)}>×</button></div>
        <div className="feature-catalog-grid">{featureCards.map((feature) => <article className="reference-card feature-card" key={feature.mode}>
          <div className="feature-card-top"><span className="feature-icon" aria-hidden="true">{feature.icon}</span><span className="feature-badge">{feature.badge}</span></div>
          <h2>{feature.title}</h2><p>{feature.description}</p>
          <button className="button primary" type="button" onClick={() => openSpecialMode(feature.mode)}>{t("featureCatalog.use")}</button>
          {/* Тот же инструмент на старшем сайте — там настроек больше.
              Ссылка вторичная, чтобы не уводить с рабочего сценария. */}
          <a className="feature-card-more" href={PRO_SITE_URL} target="_blank" rel="noopener noreferrer">{t("featureCatalog.pro.more")}</a>
        </article>)}</div>

        {/* Переход на «старший» сервис. Он живёт отдельно и умеет больше,
            поэтому ведём туда явно, а не прячем ссылку в подвале. */}
        <a className="pro-banner" href={PRO_SITE_URL} target="_blank" rel="noopener noreferrer">
          <div className="pro-banner-text">
            <span className="pro-banner-badge">{t("featureCatalog.pro.badge")}</span>
            <b>{t("featureCatalog.pro.title")}</b>
            <p>{t("featureCatalog.pro.text")}</p>
            <ul className="pro-banner-list">
              {["fashion", "smartText", "photoPro", "package"].map((key) => <li key={key}>{t(`featureCatalog.pro.items.${key}`)}</li>)}
            </ul>
            <span className="pro-banner-cta">{t("featureCatalog.pro.cta")} ↗</span>
          </div>
          <div className="pro-banner-preview" aria-hidden="true">
            <div className="pro-preview-card"><i /><b /><em /><em /></div>
            <div className="pro-preview-card is-second"><i /><b /><em /></div>
            <span className="pro-preview-glow" />
          </div>
        </a>
      </section>
    </div>}
    <section id="top" className="reference-workspace">
      <Stepper activeStep={activeStep} availableStep={availableStep} onStep={setActiveStep} />
      {/* На третьем шаге главный объект страницы — результат, а слева
          остаётся маленькая сводка. Поэтому колонки меняются местами по
          ширине: иначе слева пустота, а справа всё сжато в узкий столбец. */}
      <div className={`reference-grid ${activeStep === 3 ? "is-results" : ""}`}>
        <div className="reference-left">
          <div className="step-screen" key={activeStep}>
          {activeStep === 1 && <article className="reference-card step-card active-card">
            {/* Режим, выбранный в «Других возможностях», виден уже здесь.
                Раньше он показывался только на шаге 02, и человек после
                нажатия «Ishlatish» решал, что его просто вернуло назад. */}
            {!BASE_MODES.has(contentMode) && <div className="mode-chip-step1">
              <span aria-hidden="true">{SPECIAL_MODE_ICON[contentMode]}</span>
              <div>
                <b>{SPECIAL_MODE_LABEL[contentMode]}</b>
                <small>{t("create.modeReadyHint")}</small>
              </div>
              <button type="button" onClick={() => selectContentMode("card")}>{t("contentMode.backToCard")}</button>
            </div>}
            <ProductUpload assets={state.assets} isAnalyzing={isAnalyzing} onAssetsChange={flow.setAssets} />
            <div className="step-actions"><button type="button" className="reference-next" disabled={availableStep < 2} onClick={() => setActiveStep(2)}>{isAnalyzing ? t("create.analyzing") : t("create.continue")}</button></div>
          </article>}

          {activeStep === 2 && <>
          <ProductSummaryCard assets={state.assets} brief={state.brief} disabled={isAnalyzing || isRunning} onAssetsChange={flow.setAssets} onBriefChange={flow.updateBrief} />
          <div className="step-connector" aria-hidden="true" />
          <article className="reference-card step-card settings-card">
            <CardHeader number="02" title={t("create.settingsTitle")} />
            {BASE_MODES.has(contentMode) ? <>
              <div className="reference-label">{t("contentMode.typeLabel")}</div>
              <div className="content-tabs" aria-label={t("contentMode.typeLabel")}><button type="button" aria-pressed={contentMode === "photo"} onClick={() => selectContentMode("photo")}>▣ {t("contentMode.photo")}</button><button type="button" aria-pressed={contentMode === "card"} onClick={() => selectContentMode("card")}>T {t("contentMode.card")}</button><button type="button" aria-pressed={contentMode === "video"} disabled title={t("create.videoSoonTitle")}>▭ {t("contentMode.video")} · {t("create.soon")}</button></div>
            </> : <div className="special-mode-chip"><span aria-hidden="true">{SPECIAL_MODE_ICON[contentMode]}</span><b>{SPECIAL_MODE_LABEL[contentMode]}</b><button type="button" onClick={() => selectContentMode("card")}>× {t("contentMode.backToCard")}</button></div>}
            <p className="content-mode-description">{t(`contentMode.description.${contentMode}`)}</p>
            {contentMode === "video" ? <VideoSettings assets={state.assets} brief={state.brief} settings={state.settings} disabled={disabled} onChange={updateSettings} />
              : isPhoto ? <PhotoSettings assets={state.assets} settings={state.settings} disabled={disabled} advancedOpen={advancedOpen} onChange={updateSettings} onAdvancedToggle={() => setAdvancedOpen((open) => !open)} />
              : contentMode === "fashion" ? <FashionSettings settings={state.settings} disabled={disabled} onChange={updateSettings} />
              : contentMode === "copyStyle" ? <CopyStyleSettings settings={state.settings} disabled={disabled} onChange={updateSettings} />
              : contentMode === "marketplacePackage" ? <MarketplacePackageSettings brief={state.brief} settings={state.settings} disabled={disabled} onBriefChange={flow.updateBrief} onChange={updateSettings} />
              : <CardSettings brief={state.brief} assets={state.assets} onPrimaryAssetChange={flow.setPrimaryAsset} onRebuildPlan={flow.rebuildPlan} settings={state.settings} disabled={disabled} advancedOpen={advancedOpen} onBriefChange={flow.updateBrief} onSettingsChange={updateSettings} onAdvancedToggle={() => setAdvancedOpen((open) => !open)} />}
            {contentMode !== "video" && <label className="include-listing-toggle" aria-pressed={state.settings.includeListing}>
              <input
                className="sr-only"
                type="checkbox"
                disabled={disabled || isRunning}
                checked={state.settings.includeListing}
                onChange={(event) => updateSettings({ includeListing: event.target.checked })}
              />
              <span className="listing-toggle-box" aria-hidden="true" />
              <span className="listing-toggle-text"><b>{t("create.includeListing.label")}</b><small>{t("create.includeListing.hint")}</small></span>
            </label>}
            <div className="reference-primary-group">
              <button type="button" disabled={disabled || isRunning || !quote || !hasBalance} onClick={startGeneration}>{state.job.status === "submitting" ? t("generate.creatingTask") : hasBalance ? <>{t("generate.generate")} <b>{quote?.tokens ?? ""} {t("common.token")}</b></> : t("generate.insufficientTokens")}</button>
              {contentMode !== "marketplacePackage" && <>
                <button type="button" disabled={disabled || isRunning} aria-expanded={variantsOpen} aria-label={t("create.variantsAria")} onClick={() => { setVariantsOpen((open) => !open); setPagesOpen(false); }}>x{state.settings.variants}<i className="chev" aria-hidden="true">⌄</i></button>
                <button type="button" disabled={disabled || isRunning} aria-expanded={pagesOpen} aria-label={t("create.pagesAria")} onClick={() => { setPagesOpen((open) => !open); setVariantsOpen(false); }}>{state.settings.pages} {t("create.pagesLabel")}<i className="chev" aria-hidden="true">⌄</i></button>
              </>}
            </div>
            {variantsOpen && contentMode !== "marketplacePackage" && <div className="variants-menu" role="menu" aria-label={t("create.variantsMenu")}><p className="variants-hint">{t("create.variantsHint")}<Hint text={t("hints.variants")} label={t("hints.aria")} /></p>{([1, 2, 4] as const).map((variants) => <button key={variants} type="button" aria-current={state.settings.variants === variants ? "true" : undefined} onClick={() => { flow.updateSettings({ variants }); setVariantsOpen(false); }}>x{variants} <span>{t("create.variantsLabel")}</span></button>)}</div>}
            {pagesOpen && contentMode !== "marketplacePackage" && <div className="variants-menu pages-menu" role="menu" aria-label={t("create.pagesMenu")}><p className="variants-hint">{t("create.pagesHint", { price: account?.pricing.perImage ?? 1 })}<Hint text={t("hints.pages")} label={t("hints.aria")} /></p>{([1, 2, 3, 4, 5] as const).map((pages) => <button key={pages} type="button" aria-current={state.settings.pages === pages ? "true" : undefined} onClick={() => { flow.updateSettings({ pages }); setPagesOpen(false); if (pages > 1) setPageFocusOpen(true); }}>{pages} <span>{t("create.pagesLabel")}</span></button>)}</div>}
            {contentMode !== "marketplacePackage" && state.settings.pages > 1 && <div className="pages-advanced">
              <button type="button" aria-expanded={pageFocusOpen} onClick={() => setPageFocusOpen((open) => !open)}>{t("create.pagesAdvanced")} <span>{pageFocusOpen ? "⌃" : "⌄"}</span></button>
              {pageFocusOpen && <div className="pages-advanced-panel">
                <p className="field-help">{t("create.pagesAdvancedHint")}</p>
                {Array.from({ length: state.settings.pages }, (_, index) => <label key={index}>
                  <span>{t("create.pageNumber", { n: index + 1 })}</span>
                  <input
                    disabled={disabled || isRunning}
                    maxLength={200}
                    value={state.settings.pageFocus[index] ?? ""}
                    placeholder={t("create.pageFocusPlaceholder")}
                    onChange={(event) => {
                      const pageFocus = [...state.settings.pageFocus];
                      pageFocus[index] = event.target.value;
                      flow.updateSettings({ pageFocus });
                    }}
                  />
                </label>)}
              </div>}
            </div>}
            {!hasBalance && quote && <p className="balance-warning">{t("generate.balanceWarning", { need: quote.tokens, have: state.balance })}</p>}
            <p className="reference-summary">{contentMode === "video" ? `${t("create.summary.video")} · ${state.settings.video.duration} ${t("create.summary.seconds")}` : isPhoto ? `${t("create.summary.photo")} · ${marketplaceLabel(state.settings.marketplace)} · 1080×1440` : contentMode === "fashion" ? `Fashion AI · ${state.settings.fashion.gender === "none" ? "Flatlay" : state.settings.fashion.gender === "male" ? t("create.summary.fashionMale") : t("create.summary.fashionFemale")} · 1080×1440` : contentMode === "copyStyle" ? `${t("create.summary.copyStyle")} · 1080×1440 · ${t(`settings.language.options.${state.settings.language}`)}` : contentMode === "marketplacePackage" ? `${t("create.summary.marketplacePackage")} · ${t("create.summary.slidesCount", { count: state.settings.packageSlides })} · 1080×1440` : `${t("create.summary.card")} · ${state.settings.style === "commercial" ? t("create.summary.commercial") : t("create.summary.creative")} · ${marketplaceLabel(state.settings.marketplace)} · 1080×1440 · ${t(`settings.language.options.${state.settings.language}`)}`}</p>
          </article>
          </>}

          {activeStep === 3 && <article className="reference-card compact-project-card">
            <CardHeader number="01" title={t("productSummary.title")} />
            {state.assets[0] ? <div className="compact-asset"><img src={state.assets[0].url} alt={state.assets[0].name} /><div><b>{state.brief.title || t("create.productFallback")}</b><span>{state.brief.category || t("create.categoryFallback")}</span></div></div> : state.job.context ? <div className="recovered-job"><b>{state.job.context.title}</b><span>{state.job.context.category}</span><small>{t("create.recovered")}</small></div> : <p>{t("create.uploadProduct")}</p>}
            <div className="compact-divider" />
            <CardHeader number="02" title={t("create.settingsCompact")} />
            <p className="reference-summary">{state.job.context?.summary ?? (state.settings.contentType === "video" ? `${t("create.summary.video")} · ${state.settings.video.duration} ${t("create.summary.seconds")}` : state.settings.contentType === "photo" ? `${t("create.summary.photo")} · ${marketplaceLabel(state.settings.marketplace)} · 1080×1440` : `${marketplaceLabel(state.settings.marketplace)} · 1080×1440`)}</p>
            {state.assets.length ? <button type="button" className="reference-back" disabled={isRunning} onClick={() => setActiveStep(2)}>{isRunning ? t("create.waitGeneration") : t("create.editSettings")}</button> : <button type="button" className="reference-back" onClick={createProject}>{t("create.createAgain")}</button>}
          </article>}

          {activeStep === 3 && state.job.status === "success" && state.settings.contentType !== "video" && state.job.results.length > 0 && <article className="reference-card edit-help-card">
            <EditHelp
              open={helpOpen}
              onToggle={() => setHelpOpen((value) => !value)}
              onDownload={() => flow.download(state.job.results[0].downloadUrl)}
            />
          </article>}
          </div>
        </div>

        <ResultShell>
          <ResultPanel job={state.job} contentType={state.settings.contentType} onGenerate={startGeneration} onDownload={flow.download} onEditSettings={() => setActiveStep(2)} onNewProject={createProject} onRate={(value) => { if (value <= 3) setHelpOpen(true); }} onCancel={state.job.id ? cancelGeneration : undefined} cancelling={cancelling} onRegenerateSlide={(variant, note) => void flow.regenerateSlide(variant, note)} onComposeSlide={(variant, dataUrl) => flow.composeSlide(variant, dataUrl)} onRetryListing={flow.retryListing} />
        </ResultShell>
      </div>
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}
