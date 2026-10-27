import { useEffect, useId, useState } from "react";
import { AnalysisProgress } from "./AnalysisProgress";
// Mini o'yin vaqtincha o'chirilgan (variant 6) — qaytarish uchun izohdan chiqaring
// import { GameDoneToast, WaitingArea } from "./WaitingGame";
// Variant 4: kutish paytida 3D aylanuvchi vitrina
import { Showcase3D } from "./Showcase3D";
import { TextLayerEditor } from "./TextLayerEditor";
import { MagicLayersEditor, type MagicLayersSource } from "./MagicLayersEditor";
import { ListingResult } from "./ListingBlocks";
import type { AspectRatio, ContentMode, GenerationJob, GenerationResult } from "../domain/types";
import type { SeparateLayersOptions, SeparateLayersResponse } from "../services/createApi";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  job: GenerationJob;
  contentType: ContentMode;
  hasReference?: boolean;
  /** Yuklangan asosiy mahsulot rasmi — kutish sahnasida ko'rsatiladi. */
  productImageUrl?: string;
  /** Kutish sahnasidagi ramka nisbati (video/foto uchun). Standart 3:4. */
  stageAspectRatio?: AspectRatio;
  onGenerate: () => void;
  onDownload: (url: string) => void;
  onEditSettings: () => void;
  onNewProject: () => void;
  /** Past baho — chap ustundagi yordam blokini ochish signali. */
  onRate?: (value: number) => void;
  /** Ishlab turgan generatsiyani bekor qilish. */
  onCancel?: () => void;
  cancelling?: boolean;
  /** Bitta slaydni qayta chizish: 1 token, qolgan rasmlar joyida qoladi. */
  onRegenerateSlide?: (variant: number, note: string) => void;
  /** Brauzer yig'gan rasmni loyihaga saqlash. Token sarflanmaydi. */
  onComposeSlide?: (variant: number, imageDataUrl: string) => Promise<boolean> | void;
  /** AI orqali rasmni shaffof qatlamlarga ajratish (Magic Layers). */
  onSeparateLayers?: (variant: number, options?: SeparateLayersOptions) => Promise<SeparateLayersResponse>;
  /** Magic Layers muharriridagi "← Orqaga": bosh sahifaga (karta yaratish) qaytish. */
  onBack?: () => void;
  /** Тавсиф yozishda xatolik bo'lsa — qayta urinish. */
  onRetryListing?: () => void;
};

/**
 * Тавсиф блок — карта тайёр bo'lgandan keyin, galochka yoqilgan bo'lsa.
 * Generatsiyaning o'zi bu so'rovni kutmaydi — shuning uchun alohida holat:
 * "loading" hali yozilayotganda, "failed" bo'lsa qayta urinish tugmasi bilan.
 */
function ListingSection({ job, onRetry }: { job: GenerationJob; onRetry?: () => void }) {
  const { t } = useLanguage();
  if (!job.listingStatus || job.listingStatus === "idle") return null;
  if (job.listingStatus === "loading") return <div className="listing-loading" aria-live="polite"><span className="pulse-dot" />{t("results.listingWorking")}</div>;
  if (job.listingStatus === "failed") return <div className="listing-loading is-failed"><span>{t("results.listingFailed")}</span>{onRetry ? <button type="button" className="button secondary" onClick={onRetry}>{t("results.listingRetry")}</button> : null}</div>;
  if (!job.listing) return null;
  return <ListingResult listing={job.listing} labels={{
    title: t("listing.blockTitle"),
    utp: t("listing.blockUtp"),
    short: t("listing.blockShort"),
    full: t("listing.blockFull"),
    characteristics: t("listing.blockCharacteristics"),
    keywords: t("listing.blockKeywords"),
    copy: t("listing.copy"),
  }} />;
}

/**
 * Оценка результата.
 *
 * Звёзды заполняются ДО выбранной включительно — так это работает везде,
 * и именно этого человек ждёт. Раньше горела только нажатая, и пятёрка
 * выглядела как «поставили одну звезду справа».
 */
function Rating({ value, onRate }: { value: number | null; onRate: (value: number) => void }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState<number | null>(null);
  // У каждого варианта своя оценка, значит и подпись своя: одинаковый id
  // на странице связал бы все группы звёзд с одной подписью.
  const labelId = useId();
  const shown = hover ?? value;

  return <div className="result-rating">
    <span id={labelId}>{value === null ? t("results.ratingLabel") : t("results.ratingThanks")}</span>
    <div role="radiogroup" aria-labelledby={labelId} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((star) => <button
        type="button"
        key={star}
        role="radio"
        aria-checked={value === star}
        aria-label={`${star}`}
        className={shown !== null && star <= shown ? "is-filled" : ""}
        onMouseEnter={() => setHover(star)}
        onFocus={() => setHover(star)}
        onBlur={() => setHover(null)}
        onClick={() => onRate(star)}
      >★</button>)}
    </div>
  </div>;
}

/**
 * Таймер ожидания.
 *
 * Полоса растёт всё медленнее и в конце почти стоит — это честно, но без
 * часов выглядит как зависание. Секунды идут ровно и показывают, что
 * процесс живой. Плюс сразу говорим, сколько это обычно занимает.
 */
function WaitTimer({ startMs }: { startMs: number }) {
  const { t } = useLanguage();
  const [ms, setMs] = useState(startMs);
  useEffect(() => {
    setMs(startMs);
    const timer = window.setInterval(() => setMs((value) => value + 1000), 1000);
    return () => window.clearInterval(timer);
  }, [startMs]);

  const total = Math.floor(ms / 1000);
  const clock = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  return <p className="job-timer"><b>{clock}</b><span>{t("results.usuallyTakes")}</span></p>;
}

/**
 * Переделать один кадр.
 *
 * Поле пожелания открывается по кнопке, а не висит всегда: в большинстве
 * случаев человеку нечего добавить, ему просто не понравилась картинка.
 * Кто хочет — пишет «фон посветлее», и это уходит в промпт как правка
 * поверх остальных правил.
 */
function SlideFix({ variant, count, note, busy, disabled, onSubmit }: {
  variant: number;
  count: number;
  note: string;
  busy: boolean;
  disabled: boolean;
  onSubmit: (note: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState(note);

  if (busy) return <p className="slide-fix-busy" aria-live="polite"><span className="pulse-dot" />{t("results.slideFixWorking")}</p>;

  return <div className="slide-fix">
    {open ? <>
      <label className="slide-fix-field">
        <span>{t("results.slideFixWishLabel")}</span>
        <input value={wish} maxLength={300} disabled={disabled} placeholder={t("results.slideFixWishPlaceholder")} onChange={(event) => setWish(event.target.value)} />
      </label>
      <div className="slide-fix-actions">
        <button type="button" className="button primary" disabled={disabled} onClick={() => { setOpen(false); onSubmit(wish.trim()); }}>{t("results.slideFixConfirm")}</button>
        <button type="button" className="button secondary" onClick={() => setOpen(false)}>{t("results.slideFixCancel")}</button>
      </div>
    </> : <button type="button" className="button secondary slide-fix-open" disabled={disabled} onClick={() => setOpen(true)}>
      {t("results.slideFix")}
      {count > 0 ? <i>{t("results.slideFixCount", { count })}</i> : null}
    </button>}
  </div>;
}

/** Joriy qatlamlar formati: fon + obyektlar + matn kesmalari. Boshqa versiya ochilganda qayta ajratiladi. */
const LAYERS_VERSION = 4;

/** Natija/javobdan muharrir manbasini yig'adi. `baseUrl` bo'lmasa — natijaning o'z rasmi. */
function toMagicSource(result: GenerationResult, data?: Partial<SeparateLayersResponse>): MagicLayersSource {
  const pick = <T,>(a: T | undefined, b: T | undefined) => (a !== undefined ? a : b);
  const baseUrl = pick(data?.baseUrl, result.baseUrl) || result.previewUrl || result.downloadUrl;
  return {
    baseUrl,
    // Fon bo'lmasa (ajratilmagan) — asl rasmning o'zi fon bo'ladi (ustiga matn qo'shish mumkin).
    backgroundUrl: pick(data?.backgroundUrl, result.backgroundUrl) || baseUrl,
    width: data?.width || result.width,
    height: data?.height || result.height,
    elements: pick(data?.elements, result.elements) ?? [],
    textLayers: pick(data?.textLayers, result.textLayers) ?? [],
    textRemoved: pick(data?.textRemoved, result.textRemoved),
    objectsRemoved: pick(data?.objectsRemoved, result.objectsRemoved),
  };
}

export function ResultPanel({ job, contentType, hasReference, productImageUrl, stageAspectRatio, onGenerate, onDownload, onEditSettings, onNewProject, onRate, onCancel, cancelling, onRegenerateSlide, onComposeSlide, onSeparateLayers, onBack, onRetryListing }: Props) {
  const { t } = useLanguage();
  // Оценка хранится ПО ВАРИАНТАМ. Раньше состояние было одно на всю
  // панель, и оценка одного варианта подсвечивала звёзды у всех.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  // Какой кадр правим текстом и какой сейчас сохраняется.
  const [editing, setEditing] = useState<number | null>(null);
  const [savingVariant, setSavingVariant] = useState<number | null>(null);
  // Magic Layers holati
  const [activeMagicVariant, setActiveMagicVariant] = useState<number | null>(null);
  // Muharrir ochilgan paytdagi qatlamlar. Job keyinroq yangilansa ham muharrir o'zgarmaydi.
  const [magicSource, setMagicSource] = useState<MagicLayersSource | null>(null);
  const [loadingLayersVariant, setLoadingLayersVariant] = useState<number | null>(null);

  const running = job.status === "submitting" || job.status === "queued" || job.status === "processing";
  const isVideo = contentType === "video";
  const isPhoto = contentType === "photo";
  const resultWordByType: Partial<Record<ContentMode, string>> = { video: "video", photo: "foto", fashion: "surat", copyStyle: "karta", marketplacePackage: "slayd" };
  const resultWord = resultWordByType[contentType] ?? "karta";

  // Real-time dynamic smooth progress pacing with elapsed time
  const [smoothProgress, setSmoothProgress] = useState(job.progress || 5);

  useEffect(() => {
    if (!running) {
      if (job.status === "success") setSmoothProgress(100);
      return;
    }
    setSmoothProgress((prev) => Math.max(prev, job.progress, 5));
    const start = Date.now();
    const interval = window.setInterval(() => {
      const elapsedSec = (Date.now() - start) / 1000;
      setSmoothProgress((current) => {
        if (job.progress > current) return job.progress;
        let target = current;
        if (elapsedSec < 3) {
          target = 6 + elapsedSec * 4.5; // ~6% -> ~20%
        } else if (elapsedSec < 8) {
          target = 20 + (elapsedSec - 3) * 5.2; // ~20% -> ~46%
        } else if (elapsedSec < 16) {
          target = 46 + (elapsedSec - 8) * 3.5; // ~46% -> ~74%
        } else if (elapsedSec < 26) {
          target = 74 + (elapsedSec - 16) * 1.5; // ~74% -> ~89%
        } else {
          target = Math.min(94, 89 + (elapsedSec - 26) * 0.25);
        }
        return Math.max(current, Math.min(94, Math.round(target)));
      });
    }, 400);

    return () => window.clearInterval(interval);
  }, [running, job.status, job.progress]);

  // Stage message that dynamically reflects progress
  const getDynamicMessage = () => {
    if (job.message && !job.message.includes("Token balansi tekshirilib") && !job.message.includes("Проверка токенов")) {
      return job.message;
    }
    if (smoothProgress < 20) return t("results.progressStage1");
    if (smoothProgress < 48) return t("results.progressStage2");
    if (smoothProgress < 75) return t("results.progressStage3");
    if (smoothProgress < 90) return t("results.progressStage4");
    return t("results.progressStage5");
  };

  const displayMessage = getDynamicMessage();

  const rate = (resultId: string, value: number) => {
    setRatings((current) => ({ ...current, [resultId]: value }));
    onRate?.(value);
  };

  const openMagic = (variant: number, source: MagicLayersSource) => {
    setMagicSource(source);
    setActiveMagicVariant(variant);
  };

  const closeMagic = () => {
    setActiveMagicVariant(null);
    setMagicSource(null);
  };

  const handleOpenLayers = async (variant: number) => {
    const targetResult = job.results[variant - 1];
    if (!targetResult) return;
    // v4 formatidagi natija — darhol ochamiz (obyekt/matn bo'lmasa ham: fon + "Matn qo'shish").
    if (targetResult.layersVersion === LAYERS_VERSION && targetResult.backgroundUrl) {
      openMagic(variant, toMagicSource(targetResult));
      return;
    }
    const fallback = toMagicSource(targetResult, { elements: [], textLayers: [], backgroundUrl: targetResult.baseUrl || targetResult.previewUrl || targetResult.downloadUrl, textRemoved: false, objectsRemoved: false });
    if (!onSeparateLayers) {
      openMagic(variant, fallback);
      return;
    }
    // Hali ajratilmagan yoki boshqa versiya — qayta ajratamiz (force'siz).
    try {
      setLoadingLayersVariant(variant);
      const res = await onSeparateLayers(variant);
      openMagic(variant, toMagicSource(targetResult, res));
    } catch {
      // Xato createFlow notice orqali ko'rsatiladi; asl rasm bilan baribir ochamiz (matn qo'shish mumkin).
      openMagic(variant, fallback);
    } finally {
      setLoadingLayersVariant(null);
    }
  };

  return <section className="flow-section results" aria-labelledby="results-step">
    <div className="section-heading"><span>03</span><div><h2 id="results-step">{t("results.title")}</h2><p>{t("results.subtitle")}</p></div></div>
    {job.status === "analyzing" ? <AnalysisProgress /> : null}
    {job.status === "idle" || job.status === "ready" ? <div className="empty-result"><div className="result-mark">✦</div><h3>{t("results.emptyTitle", { word: resultWord })}</h3><p>{t("results.emptyHint")}</p></div> : null}
    {running ? <div className="job-card" aria-busy="true">{/* Mini o'yin vaqtincha o'chirilgan (variant 6) — qaytarish uchun izohdan chiqaring:
      <WaitingArea progress={smoothProgress} contentType={contentType} imageUrl={productImageUrl} aspectRatio={stageAspectRatio} />
    */}<Showcase3D progress={smoothProgress} contentType={contentType} productImageUrl={productImageUrl} stageAspectRatio={stageAspectRatio} /><div className="job-top"><span className="pulse-dot"/><b>{displayMessage}</b><span>{smoothProgress}%</span></div><div className="progress"><span style={{ width: `${smoothProgress}%` }} /></div><WaitTimer startMs={job.elapsedMs ?? 0} /><p>{t("results.jobSavedNote")}</p>{onCancel ? <button type="button" className="button ghost job-cancel" onClick={onCancel} disabled={cancelling}>{cancelling ? t("results.cancelling") : t("results.cancel")}</button> : null}</div> : null}
    {job.status === "failed" ? <div className="error-card"><b>{t("results.failedTitle")}</b><p>{job.error}</p><div className="result-actions"><button type="button" className="button secondary" onClick={onGenerate}>{t("results.retry")}</button><button type="button" className="button secondary" onClick={onEditSettings}>{t("results.editSettings")}</button></div></div> : null}
    {job.regenerateError ? <p className="reference-warning" role="status">{job.regenerateError}</p> : null}
    {job.status === "success" && job.results.length ? <div className="result-variants">{job.results.map((result, index) => <article className={`result-card ${isVideo ? "video-result" : isPhoto ? "photo-result" : ""}`} key={result.id}><img src={result.previewUrl} alt={isVideo ? "Yaratilgan mahsulot videosi prevyusi" : isPhoto ? "Yaratilgan mahsulot fotosi" : "Yaratilgan mahsulot kartasi"} /><div><span className="success-pill">{t("results.readyPill")}</span><h3>{result.title}</h3><p>{result.width}×{result.height} · yuklangan mahsulot asosida yaratildi</p>{hasReference === true && result.referenceUsed === false && <p className="reference-warning">{t("results.referenceDropped")}</p>}{hasReference === true && result.referenceUsed === "partial" && <p className="reference-warning">{t("results.referencePartial")}</p>}<div className="result-quality"><b>{t("results.qualityTitle")}</b><span>86/100</span><small>{t("results.qualityHint")}</small></div><div className="result-actions"><button className="button primary" type="button" onClick={() => onDownload(result.downloadUrl)}>{isVideo ? "Prevyu yuklash" : isPhoto ? "Foto yuklash" : "Kartani yuklash"}</button>{!isVideo && onSeparateLayers && onComposeSlide ? <button type="button" className="magic-layers-trigger-btn" title={t("magicLayers.buttonTitle")} disabled={loadingLayersVariant === index + 1} onClick={() => handleOpenLayers(index + 1)}><span className="sparkle">✨</span>{loadingLayersVariant === index + 1 ? t("magicLayers.loadingBtn") : t("magicLayers.button")}<span className="magic-beta-badge">{t("magicLayers.betaBadge")}</span></button> : null}<button className="button secondary" type="button" onClick={onGenerate}>{t("results.regenerate")}</button><button className="button secondary" type="button" onClick={onNewProject}>{t("results.newProject")}</button></div>{job.textMode === "own" && onComposeSlide && result.slide ? <div className="slide-text-actions">
      <button type="button" className="button secondary" onClick={() => setEditing(editing === index + 1 ? null : index + 1)}>
        {editing === index + 1 ? t("textLayer.close") : result.composed ? t("textLayer.editAgain") : t("textLayer.open")}
      </button>
      {!result.composed ? <small>{t("textLayer.pending")}</small> : null}
    </div> : null}{onRegenerateSlide && !isVideo ? <SlideFix
      variant={index + 1}
      count={result.regenerateCount ?? 0}
      note={result.note ?? ""}
      busy={Boolean(result.regenerating)}
      disabled={Boolean(job.regenerating)}
      onSubmit={(note) => onRegenerateSlide(index + 1, note)}
    /> : null}{editing === index + 1 && result.slide && onComposeSlide ? <TextLayerEditor
      plateUrl={`/api/generations/${job.id}/results/${index + 1}/plate.png`}
      slide={result.slide}
      saving={savingVariant === index + 1}
      onSave={(dataUrl) => {
        setSavingVariant(index + 1);
        void Promise.resolve(onComposeSlide(index + 1, dataUrl)).finally(() => setSavingVariant(null));
      }}
    /> : null}<Rating value={ratings[result.id] ?? null} onRate={(value) => rate(result.id, value)} /></div></article>)}</div> : null}
    {job.status === "success" ? <ListingSection job={job} onRetry={onRetryListing} /> : null}
    {/* Mini o'yin vaqtincha o'chirilgan (variant 6) — qaytarish uchun izohdan chiqaring:
    {job.status === "success" ? <GameDoneToast /> : null}
    */}

    {/* Magic Layers Editor Modal */}
    {activeMagicVariant !== null && magicSource && onComposeSlide && job.results[activeMagicVariant - 1] && (
      <MagicLayersEditor
        key={`${job.id}-${activeMagicVariant}`}
        jobId={job.id}
        variant={activeMagicVariant}
        source={magicSource}
        onClose={closeMagic}
        onBack={() => {
          closeMagic();
          onBack?.();
        }}
        onSave={(dataUrl) => {
          setSavingVariant(activeMagicVariant);
          return Promise.resolve(onComposeSlide(activeMagicVariant, dataUrl)).finally(() => {
            setSavingVariant(null);
          });
        }}
        onReseparate={
          onSeparateLayers
            ? () => onSeparateLayers(activeMagicVariant, { force: true }).then((res) => toMagicSource(job.results[activeMagicVariant - 1], res))
            : undefined
        }
      />
    )}
  </section>;
}
