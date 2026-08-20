import { useEffect, useId, useState } from "react";
import { AnalysisProgress } from "./AnalysisProgress";
import type { ContentMode, GenerationJob } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";

type Props = {
  job: GenerationJob;
  contentType: ContentMode;
  onGenerate: () => void;
  onDownload: (url: string) => void;
  onEditSettings: () => void;
  onNewProject: () => void;
  /** Past baho — chap ustundagi yordam blokini ochish signali. */
  onRate?: (value: number) => void;
  /** Ishlab turgan generatsiyani bekor qilish. */
  onCancel?: () => void;
  cancelling?: boolean;
};

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

export function ResultPanel({ job, contentType, onGenerate, onDownload, onEditSettings, onNewProject, onRate, onCancel, cancelling }: Props) {
  const { t } = useLanguage();
  // Оценка хранится ПО ВАРИАНТАМ. Раньше состояние было одно на всю
  // панель, и оценка одного варианта подсвечивала звёзды у всех.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const running = job.status === "submitting" || job.status === "queued" || job.status === "processing";
  const isVideo = contentType === "video";
  const isPhoto = contentType === "photo";
  const resultWordByType: Partial<Record<ContentMode, string>> = { video: "video", photo: "foto", fashion: "surat", copyStyle: "karta", marketplacePackage: "slayd" };
  const resultWord = resultWordByType[contentType] ?? "karta";
  const rate = (resultId: string, value: number) => {
    setRatings((current) => ({ ...current, [resultId]: value }));
    onRate?.(value);
  };
  return <section className="flow-section results" aria-labelledby="results-step">
    <div className="section-heading"><span>03</span><div><h2 id="results-step">{t("results.title")}</h2><p>{t("results.subtitle")}</p></div></div>
    {job.status === "analyzing" ? <AnalysisProgress /> : null}
    {job.status === "idle" || job.status === "ready" ? <div className="empty-result"><div className="result-mark">✦</div><h3>{t("results.emptyTitle", { word: resultWord })}</h3><p>{t("results.emptyHint")}</p></div> : null}
    {running ? <div className="job-card" aria-busy="true"><div className="job-top"><span className="pulse-dot"/><b>{job.message}</b><span>{job.progress}%</span></div><div className="progress"><span style={{ width: `${job.progress}%` }} /></div><WaitTimer startMs={job.elapsedMs ?? 0} /><p>{t("results.jobSavedNote")}</p>{onCancel ? <button type="button" className="button ghost job-cancel" onClick={onCancel} disabled={cancelling}>{cancelling ? t("results.cancelling") : t("results.cancel")}</button> : null}</div> : null}
    {job.status === "failed" ? <div className="error-card"><b>{t("results.failedTitle")}</b><p>{job.error}</p><div className="result-actions"><button type="button" className="button secondary" onClick={onGenerate}>{t("results.retry")}</button><button type="button" className="button secondary" onClick={onEditSettings}>{t("results.editSettings")}</button></div></div> : null}
    {job.status === "success" && job.results.length ? <div className="result-variants">{job.results.map((result) => <article className={`result-card ${isVideo ? "video-result" : isPhoto ? "photo-result" : ""}`} key={result.id}><img src={result.previewUrl} alt={isVideo ? "Yaratilgan mahsulot videosi prevyusi" : isPhoto ? "Yaratilgan mahsulot fotosi" : "Yaratilgan mahsulot kartasi"} /><div><span className="success-pill">{t("results.readyPill")}</span><h3>{result.title}</h3><p>{result.width}×{result.height} · yuklangan mahsulot asosida yaratildi</p>{result.referenceUsed === false && <p className="reference-warning">{t("results.referenceDropped")}</p>}{result.referenceUsed === "partial" && <p className="reference-warning">{t("results.referencePartial")}</p>}<div className="result-quality"><b>{t("results.qualityTitle")}</b><span>86/100</span><small>{t("results.qualityHint")}</small></div><div className="result-actions"><button className="button primary" type="button" onClick={() => onDownload(result.downloadUrl)}>{isVideo ? "Prevyu yuklash" : isPhoto ? "Foto yuklash" : "Kartani yuklash"}</button><button className="button secondary" type="button" onClick={onGenerate}>{t("results.regenerate")}</button><button className="button secondary" type="button" onClick={onNewProject}>{t("results.newProject")}</button></div><Rating value={ratings[result.id] ?? null} onRate={(value) => rate(result.id, value)} /></div></article>)}</div> : null}
  </section>;
}
