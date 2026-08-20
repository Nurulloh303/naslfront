import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAccount } from "../account/AccountContext";
import { accountApi, type AuditReport } from "../account/accountApi";
import type { CabinetRoute } from "../routes";
import { CabinetFooter, CabinetHeader } from "./CabinetHeader";
import { useLanguage } from "../../i18n/LanguageContext";
import { prepareImageDataUrl } from "../../features/create/domain/prepareImage";
import { MAX_UPLOAD_BYTES } from "../../features/create/domain/uploadLimits";

/**
 * «Плохие продажи?» — аудит карточки.
 *
 * Осознанные решения:
 *  1. Ссылка нужна, но НЕ обязательна для работы: страница Uzum рисуется
 *     скриптом, её JSON-API может быть закрыт в любой момент. Если данные
 *     не подтянулись, отчёт всё равно строится по картинкам и ответам.
 *  2. Отчёт всегда показывает, чего мы НЕ проверяли. Плохие продажи редко
 *     объясняются одной карточкой, и скрывать это — вводить в заблуждение.
 *  3. Бесплатно раз в сутки: это воронка, а не платная операция.
 */

const MAX_IMAGES = 4;

/** Ключ передачи исправлений в экран генерации. */
export const AUDIT_FIX_KEY = "naslai:auditFix";

const CHOICES: Record<string, string[]> = {
  reviews: ["none", "few", "many"],
  impressions: ["noImpressions", "impressionsNoOrders", "unknown"],
  fbo: ["fbo", "fbs", "unknown"],
  promo: ["inPromo", "notInPromo", "unknown"],
  boost: ["boostOn", "boostOff", "unknown"],
};
const TEXT_FIELDS = ["price", "competitorPrice", "audience"];
const ORDER = ["price", "competitorPrice", "reviews", "impressions", "audience", "fbo", "promo", "boost"];

/**
 * Перевод по ключу с честным запасным вариантом.
 *
 * t() при отсутствии ключа возвращает САМ ПУТЬ, а не пустую строку,
 * поэтому проверка `t(key) || fallback` не работает — на экране появлялось
 * "audit.notCheckedItem.narxingiz...". Сравниваем результат с ключом.
 */
function translateOrKeep(t: (key: string) => string, key: string, fallback: string) {
  const value = t(key);
  return value === key ? fallback : value;
}

/**
 * Похожа ли ссылка на товар Uzum. Та же логика, что на сервере.
 *
 * Раньше форма молчала, а про неподходящую ссылку человек узнавал одной
 * строчкой в самом отчёте — уже после того, как потратил дневную попытку.
 */
export function looksLikeUzumProductLink(value: string) {
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try { url = new URL(text); } catch { return false; }
  if (!/(^|\.)uzum\.(uz|com)$/i.test(url.hostname)) return false;
  return /\d{3,}/.test(url.pathname);
}

/**
 * Индикатор анализа. Сервер не отдаёт процент, поэтому шкала асимптотически
 * подходит к 92% и там ждёт — так видно, что процесс идёт, но мы не врём,
 * что всё готово. Пропадает, когда отчёт реально пришёл.
 */
const AUDIT_STEPS = ["s1", "s2", "s3", "s4"] as const;
const AUDIT_STEP_AT = [0, 20, 48, 76];

function AuditProgress() {
  const { t } = useLanguage();
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const seconds = (now - started) / 1000;
      setPercent(Math.min(92, Math.round(92 * (1 - Math.exp(-seconds / 4)))));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const active = AUDIT_STEP_AT.reduce((last, at, index) => (percent >= at ? index : last), 0);
  return <section className="cabinet-panel audit-progress" role="status" aria-live="polite">
    <div className="audit-progress-head">
      <b>{t("audit.analyzing")}</b>
      <em>{percent}%</em>
    </div>
    <div className="audit-progress-bar"><i style={{ width: `${percent}%` }} /></div>
    <ol className="audit-progress-steps">
      {AUDIT_STEPS.map((key, index) => <li key={key} className={index < active ? "done" : index === active ? "active" : ""}>
        <span aria-hidden="true">{index < active ? "✓" : "•"}</span>{t(`audit.step.${key}`)}
      </li>)}
    </ol>
    <p className="audit-progress-note">{t("audit.analyzingNote")}</p>
  </section>;
}

export function AuditPage({ onNavigate, onLogout }: { onNavigate: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { account } = useAccount();
  const { t, language } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  // Когда отчёт пришёл с сервера как «прошлый», об этом надо сказать:
  // иначе человек решит, что мы показываем разбор его свежих картинок.
  const [reportAt, setReportAt] = useState<string | null>(null);

  useEffect(() => {
    accountApi.auditQuestions()
      .then((data) => {
        setRemaining(data.remainingToday);
        // Бесплатная проверка одна в сутки. Потерять её из-за обновления
        // страницы — обиднее всего, поэтому последний отчёт возвращаем.
        if (data.lastReport) {
          setReport(data.lastReport);
          setReportAt(data.lastReportAt ?? null);
        }
      })
      .catch(() => setRemaining(null));
  }, []);

  if (!account) return null;

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;
    if (files.some((file) => file.size > MAX_UPLOAD_BYTES)) { setError(t("audit.maxSize")); return; }
    try {
      const next = await Promise.all(files.slice(0, MAX_IMAGES - images.length).map((file) => prepareImageDataUrl(file)));
      setImages((current) => [...current, ...next].slice(0, MAX_IMAGES));
      setError("");
    } catch { setError(t("audit.readFailed")); }
  };

  const submit = async () => {
    if (!images.length) { setError(t("audit.needImage")); return; }
    setBusy(true);
    setError("");
    try {
      const data = await accountApi.runAudit({ images, link: link.trim(), answers, language });
      setReport(data.report);
      setReportAt(null);
      setRemaining(data.remainingToday);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("audit.failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Переносим найденное в генерацию: бриф + акценты по страницам. */
  const applyFix = () => {
    if (!report) return;
    const base = {
      title: report.suggested?.title ?? "",
      category: report.suggested?.category ?? "",
      benefits: (report.suggested?.benefits ?? []).filter(Boolean).slice(0, 5),
      fixes: report.problems.map((problem) => problem.fix),
    };
    // Переносим и само фото, чтобы не заставлять загружать заново.
    // sessionStorage ограничен (~5 МБ), поэтому крупные картинки не кладём
    // и при переполнении молча откатываемся к варианту без фото.
    const image = images[0] ?? "";
    const withImage = image.length < 2_500_000 ? { ...base, image } : base;
    try {
      window.sessionStorage.setItem(AUDIT_FIX_KEY, JSON.stringify(withImage));
    } catch {
      try { window.sessionStorage.setItem(AUDIT_FIX_KEY, JSON.stringify(base)); } catch { /* приватный режим */ }
    }
    onNavigate("create");
  };

  // null — поле пустое, ссылка не обязательна.
  const linkCheck = looksLikeUzumProductLink(link);
  const linkLooksWrong = linkCheck === false;

  const scoreTone = report ? (report.score >= 75 ? "good" : report.score >= 50 ? "mid" : "bad") : "mid";
  // Лимит исчерпан — кнопка не должна выглядеть рабочей.
  const limitReached = remaining === 0;

  return <main className="reference-app cabinet-page">
    <CabinetHeader route="audit" balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content">
      <div className="cabinet-page-heading">
        <div>
          <p className="eyebrow">{t("cabinet.eyebrow")}</p>
          <h1>{t("audit.title")}</h1>
          <p className="audit-lead">{t("audit.lead")}</p>
        </div>
      </div>

      {busy ? <AuditProgress /> : !report ? <div className="audit-form">
        <section className="cabinet-panel">
          <h2>{t("audit.step1")}</h2>
          <label className="audit-field">
            <span>{t("audit.linkLabel")}</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://uzum.uz/ru/product/..."
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
            <small>{t("audit.linkHint")}</small>
            {linkLooksWrong && <small className="audit-link-warning" role="status">{t("audit.linkWrong")}</small>}
          </label>

          <div className="audit-uploads">
            <span className="audit-label">{t("audit.imagesLabel")}</span>
            <div className="asset-strip">
              {images.map((src, index) => <article className="asset-card" key={src.slice(-24) + index}>
                <img src={src} alt="" />
                <button className="icon-button" type="button" aria-label={t("audit.remove")} onClick={() => setImages((c) => c.filter((_, i) => i !== index))}>×</button>
              </article>)}
              {images.length < MAX_IMAGES && <button className="asset-add" type="button" onClick={() => inputRef.current?.click()}>+<span>{t("audit.add")}</span></button>}
            </div>
            <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void addFiles(event)} />
            <small className="field-help">{t("audit.imagesHint")}</small>
          </div>
        </section>

        <section className="cabinet-panel">
          <h2>{t("audit.step2")}</h2>
          <p className="audit-why">{t("audit.step2Why")}</p>
          <div className="audit-questions">
            {ORDER.map((id) => TEXT_FIELDS.includes(id) ? <label className="audit-field" key={id}>
              <span>{t(`audit.q.${id}`)}</span>
              <input value={answers[id] ?? ""} onChange={(event) => setAnswers((c) => ({ ...c, [id]: event.target.value }))} placeholder={t(`audit.ph.${id}`)} />
            </label> : <div className="audit-field" key={id}>
              <span>{t(`audit.q.${id}`)}</span>
              <div className="audit-choices">
                {(CHOICES[id] ?? []).map((option) => <button
                  key={option}
                  type="button"
                  aria-pressed={answers[id] === option}
                  onClick={() => setAnswers((c) => ({ ...c, [id]: option }))}
                >{t(`audit.o.${option}`)}</button>)}
              </div>
            </div>)}
          </div>
        </section>

        {error && !limitReached && <p className="field-error" role="alert">{error}</p>}

        {limitReached && <section className="audit-limit-reached">
          <b>{t("audit.limitTitle")}</b>
          <p>{t("audit.limitText")}</p>
          <div className="audit-limit-actions">
            <button className="button primary" type="button" onClick={() => onNavigate("create")}>{t("audit.limitCreate")}</button>
            <a className="button secondary" href="https://t.me/naslaiadmin" target="_blank" rel="noopener noreferrer">{t("audit.limitAsk")}</a>
          </div>
        </section>}

        <div className="audit-submit">
          <button className="button primary" type="button" disabled={busy || limitReached} onClick={() => void submit()}>
            {busy ? t("audit.analyzing") : limitReached ? t("audit.limitButton") : t("audit.analyze")}
          </button>
          {remaining !== null && !limitReached && <small>{t("audit.remaining", { count: remaining })}</small>}
        </div>
      </div> : <div className="audit-report">
        {reportAt && <p className="audit-previous" role="status">{t("audit.previousReport", { date: new Date(reportAt).toLocaleString() })}</p>}
        <section className={`audit-score is-${scoreTone}`}>
          <div className="audit-score-value"><b>{report.score}</b><span>/100</span></div>
          <p>{report.verdict}</p>
        </section>

        {report.problems.length > 0 && <section className="cabinet-panel">
          <h2>{t("audit.problems")}</h2>
          <div className="audit-problems">
            {report.problems.map((problem, index) => <article className={`audit-problem is-${problem.severity}`} key={problem.ruleId + index}>
              <header>
                <span className="audit-severity">{t(`audit.sev.${problem.severity}`)}</span>
                <h3>{problem.title}</h3>
              </header>
              <p className="audit-problem-why">{problem.why}</p>
              <p className="audit-problem-fix"><b>{t("audit.fixLabel")}</b> {problem.fix}</p>
              {/* Источник ставит сервер. Официальное требование Uzum —
                  со ссылкой на руководство; наша рекомендация — честно
                  помечена, чтобы не выглядеть нарушением правил. */}
              <footer className="audit-problem-source">
                {problem.source === "uzum"
                  ? <><span className="audit-source-badge is-official">{t("audit.sourceUzum")}</span>
                      {problem.ruleUrl && <a href={problem.ruleUrl} target="_blank" rel="noopener noreferrer">{t("audit.openRule")} ↗</a>}</>
                  : <span className="audit-source-badge">{t("audit.sourcePractice")}</span>}
                {problem.ruleDetail && <em>{problem.ruleDetail}</em>}
              </footer>
            </article>)}
          </div>
        </section>}

        {(report.likelyNotTheCard?.length ?? 0) > 0 && <section className="cabinet-panel audit-external">
          <h2>{t("audit.notTheCard")}</h2>
          <ul>{report.likelyNotTheCard?.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>}

        <section className="cabinet-panel audit-limits">
          <h2>{t("audit.notChecked")}</h2>
          {/* Сервер отдаёт ключи, а не текст: отчёт читается на языке
              сайта. Отчёт мог быть сохранён старой версией сервера и
              содержать готовые фразы — их печатаем как есть. */}
          <ul>{report.meta.notChecked.map((item) => <li key={item}>{translateOrKeep(t, `audit.notCheckedItem.${item}`, item)}</li>)}</ul>
          <small>
            {t("audit.rulesFrom")} <a href={report.meta.rulesSource} target="_blank" rel="noopener noreferrer">seller.uzum.uz</a> · {report.meta.rulesReviewedAt}
            {report.meta.link && !report.meta.productFetched && <> · {t("audit.linkNotFetched")}</>}
          </small>
        </section>

        <div className="audit-actions">
          <button className="button primary" type="button" onClick={applyFix}>{t("audit.fixIt")}</button>
          <button className="button secondary" type="button" onClick={() => { setReport(null); setReportAt(null); setError(""); }}>{t("audit.again")}</button>
        </div>
      </div>}
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}
