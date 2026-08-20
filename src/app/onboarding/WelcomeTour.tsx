import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { BrandMark } from "../BrandMark";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Kirishdan keyingi salomlashuv + interfeys bo'ylab qisqa ekskursiya.
 *
 * Ikki bosqich:
 *   1) "greeting" — to'liq ekranli "Assalomu alaykum, {ism}" animatsiyasi;
 *   2) "tour"     — kerakli bloklarni navbat bilan yoritib, nima uchun
 *                   kerakligini tushuntiradi.
 *
 * Har bir foydalanuvchi uchun bir marta ko'rsatiladi (localStorage).
 * Agar bosqich uchun element topilmasa (masalan, sozlamalar hali ochilmagan),
 * qadam markazda, yoritishsiz ko'rsatiladi — tur uzilib qolmaydi.
 */

const STORAGE_PREFIX = "naslai:welcomed:";

type Rect = { top: number; left: number; width: number; height: number };

type TourStep = {
  /** CSS-selektor. Bo'sh bo'lsa — qadam markazda ko'rsatiladi. */
  selector: string;
  titleKey: string;
  textKey: string;
};

const TOUR_STEPS: TourStep[] = [
  { selector: ".stepper", titleKey: "tour.steps.stepper.title", textKey: "tour.steps.stepper.text" },
  { selector: ".dropzone, .asset-strip", titleKey: "tour.steps.upload.title", textKey: "tour.steps.upload.text" },
  { selector: ".content-tabs", titleKey: "tour.steps.mode.title", textKey: "tour.steps.mode.text" },
  { selector: ".reference-header-nav button:first-child", titleKey: "tour.steps.features.title", textKey: "tour.steps.features.text" },
  { selector: ".reference-primary-group", titleKey: "tour.steps.generate.title", textKey: "tour.steps.generate.text" },
  { selector: ".reference-results", titleKey: "tour.steps.results.title", textKey: "tour.steps.results.text" },
  { selector: ".reference-profile", titleKey: "tour.steps.tokens.title", textKey: "tour.steps.tokens.text" },
];

function readRect(selector: string): Rect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

export function WelcomeTour({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useLanguage();
  const storageKey = `${STORAGE_PREFIX}${userId}`;
  const [phase, setPhase] = useState<"idle" | "greeting" | "tour" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Faqat birinchi kirishda ishga tushadi.
  //
  // Отметку ставим СРАЗУ при показе приветствия, а не в конце тура.
  // Иначе достаточно было обновить страницу или перейти в другой раздел —
  // и «Assalomu alaykum» здоровалось второй раз.
  useEffect(() => {
    if (!userId) return;
    let seen = false;
    try { seen = window.localStorage.getItem(storageKey) === "1"; } catch { seen = false; }
    if (seen) { setPhase("done"); return; }
    try { window.localStorage.setItem(storageKey, "1"); } catch { /* приватный режим */ }
    setPhase("greeting");
  }, [userId, storageKey]);

  const finish = useCallback(() => {
    try { window.localStorage.setItem(storageKey, "1"); } catch { /* приватный режим — просто не сохраняем */ }
    setPhase("done");
  }, [storageKey]);

  // Salomlashuv o'zi yopiladi.
  useEffect(() => {
    if (phase !== "greeting") return;
    // 5,5 секунды: человек должен успеть прочитать своё имя и подпись под ним.
    // Прежние 2,8 секунды пролетали раньше, чем взгляд доходил до текста.
    // Ждать не заставляем — под приветствием есть кнопка «Davom etish».
    const timer = window.setTimeout(() => setPhase("tour"), 5_500);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Joriy qadam elementini o'lchash: scroll/resize'da ham yangilanadi.
  useLayoutEffect(() => {
    if (phase !== "tour") return;
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;
    const target = document.querySelector(step.selector);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(readRect(step.selector));
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [phase, stepIndex]);

  // Esc — yopish, strelkalar — navigatsiya.
  useEffect(() => {
    if (phase !== "tour") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") setStepIndex((index) => Math.min(index + 1, TOUR_STEPS.length - 1));
      if (event.key === "ArrowLeft") setStepIndex((index) => Math.max(index - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, finish]);

  if (phase === "idle" || phase === "done") return null;

  if (phase === "greeting") {
    const first = userName.trim().split(/\s+/)[0] || t("tour.friend");
    return <div className="welcome-greeting" role="status" aria-live="polite">
      <span className="welcome-orb" aria-hidden="true" />
      <BrandMark size={44} className="welcome-mark" />
      <p className="welcome-salam">{t("tour.salam")}</p>
      <h1 className="welcome-name">{first}!</h1>
      <p className="welcome-sub">{t("tour.greetingSub")}</p>
      <button className="welcome-skip" type="button" onClick={() => setPhase("tour")}>{t("tour.continue")} →</button>
    </div>;
  }

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const pad = 8;
  // Tooltip'ni yoritilgan blokning ostiga, joy bo'lmasa — ustiga qo'yamiz.
  const below = rect ? rect.top + rect.height + 16 : 0;
  const placeAbove = rect ? below + 210 > window.innerHeight : false;

  return <div className="tour-layer" role="dialog" aria-modal="true" aria-label={t("tour.ariaLabel")}>
    {rect
      ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      : <div className="tour-dim" />}

    <div
      className={`tour-tip ${rect ? (placeAbove ? "above" : "below") : "centered"}`}
      style={rect ? {
        top: placeAbove ? Math.max(16, rect.top - pad - 16) : below,
        left: Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - 356)),
      } : undefined}
    >
      <span className="tour-count">{stepIndex + 1} / {TOUR_STEPS.length}</span>
      <h3>{t(step.titleKey)}</h3>
      <p>{t(step.textKey)}</p>
      <div className="tour-actions">
        <button type="button" className="tour-skip" onClick={finish}>{t("tour.skip")}</button>
        <div className="tour-nav">
          {stepIndex > 0 && <button type="button" className="button secondary" onClick={() => setStepIndex((index) => index - 1)}>{t("tour.back")}</button>}
          <button type="button" className="button primary" onClick={() => (isLast ? finish() : setStepIndex((index) => index + 1))}>{isLast ? t("tour.finish") : t("tour.next")}</button>
        </div>
      </div>
    </div>
  </div>;
}
