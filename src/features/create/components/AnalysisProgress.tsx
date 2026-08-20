import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";

/**
 * AI brief tahlili davomida ko'rsatiladigan bosqichli indikator.
 *
 * Server tahlil foizini qaytarmaydi, shuning uchun bu yerda "optimistik"
 * shkala ishlatiladi: progress 92% gacha sekinlashib boradi va tahlil
 * tugamaguncha shu yerda turadi — foydalanuvchi sayt qotib qolgan deb
 * o'ylamasligi uchun. Haqiqiy tugash `isAnalyzing` false bo'lishi bilan
 * komponentni umuman olib tashlaydi.
 */

const STEP_KEYS = ["s1", "s2", "s3", "s4", "s5"] as const;
const STEP_AT = [0, 14, 34, 60, 82];

export function AnalysisProgress({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const seconds = (now - started) / 1000;
      // Асимптота к 92%: быстро в начале, почти стоп в конце.
      setPercent(Math.min(92, Math.round(92 * (1 - Math.exp(-seconds / 3.2)))));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const activeIndex = STEP_AT.reduce((last, at, index) => (percent >= at ? index : last), 0);

  if (compact) {
    return <p className="analysis-inline" role="status" aria-live="polite">
      <span className="analysis-dot" aria-hidden="true" />
      {t(`results.analysisSteps.${STEP_KEYS[activeIndex]}`)}…
    </p>;
  }

  return <div className="analysis-progress" role="status" aria-live="polite">
    <div className="analysis-head">
      <b>{t("results.analyzingTitle")}</b>
      <em>{percent}%</em>
    </div>
    <div className="analysis-bar"><i style={{ width: `${percent}%` }} /></div>
    <ol className="analysis-steps">
      {STEP_KEYS.map((key, index) => <li
        key={key}
        className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""}
      >
        <span aria-hidden="true">{index < activeIndex ? "✓" : "•"}</span>
        {t(`results.analysisSteps.${key}`)}
      </li>)}
    </ol>
    <p className="analysis-note">{t("results.analysisNote")}</p>
  </div>;
}
