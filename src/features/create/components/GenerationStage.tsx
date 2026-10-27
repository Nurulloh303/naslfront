import { useEffect, useState, type CSSProperties } from "react";
import type { AspectRatio, ContentMode } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import "./GenerationStage.css";

/**
 * Generatsiya kutilayotganda ko'rsatiladigan "sahna".
 *
 * Kutish 1–3 daqiqa davom etadi. Bo'sh progress-bar o'rniga odam o'z
 * mahsulotini ko'radi: rasm ustida karta "yig'ilayotgandek" — skaner nuri,
 * maket chiziqlari, sarlavha va belgilar ketma-ket paydo bo'ladi. Bosqichlar
 * progress bilan bir xil chegaralarda almashadi (ResultPanel'dagi xabarlar
 * bilan mos), shuning uchun animatsiya va foiz bir-biriga zid gapirmaydi.
 *
 * Faqat transform/opacity animatsiyalari; prefers-reduced-motion'da hammasi
 * to'xtaydi, bosqichlar va maslahatlar qoladi.
 */

const STEP_AT = [0, 20, 48, 75, 90];
export const CARD_TIPS = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;
export const VIDEO_TIPS = ["t3", "t6", "t7"] as const;
const TIP_MS = 6000;
const TIP_FADE_MS = 360;

const RATIO: Record<AspectRatio, [number, number]> = { "9:16": [9, 16], "3:4": [3, 4], "1:1": [1, 1], "4:3": [4, 3], "16:9": [16, 9] };

type Props = {
  /** 0–100, ResultPanel'dagi silliq progress. */
  progress: number;
  contentType: ContentMode;
  /** Yuklangan asosiy mahsulot rasmi. Bo'lmasa — abstrakt skelet. */
  imageUrl?: string;
  /** Natija formati. Karta uchun 3:4. */
  aspectRatio?: AspectRatio;
};

export function stageStepFor(progress: number): number {
  let step = 0;
  STEP_AT.forEach((at, index) => { if (progress >= at) step = index; });
  return step;
}

export function stepLabels(t: (path: string) => string, contentType: ContentMode): string[] {
  const base = ["s1", "s2", "s3", "s4", "s5"].map((key) => t(`results.stage.steps.${key}`));
  if (contentType === "video") return [base[0], t("results.stage.video.s2"), t("results.stage.video.s3"), t("results.stage.video.s4"), base[4]];
  if (contentType === "photo") return [base[0], base[1], base[2], t("results.stage.photoS4"), base[4]];
  return base;
}

export function useRotatingTip(count: number) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * count));
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let swap = 0;
    const timer = window.setInterval(() => {
      setLeaving(true);
      swap = window.setTimeout(() => { setIndex((value) => (value + 1) % count); setLeaving(false); }, TIP_FADE_MS);
    }, TIP_MS);
    return () => { window.clearInterval(timer); window.clearTimeout(swap); };
  }, [count]);
  return { index: index % count, leaving };
}

export function GenerationStage({ progress, contentType, imageUrl, aspectRatio = "3:4" }: Props) {
  const { t } = useLanguage();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [imageUrl]);

  const step = stageStepFor(progress);
  const steps = stepLabels(t, contentType);
  const isVideo = contentType === "video";
  const tips = isVideo ? VIDEO_TIPS : CARD_TIPS;
  const tip = useRotatingTip(tips.length);

  const [w, h] = RATIO[aspectRatio] ?? RATIO["3:4"];
  const landscape = w > h;
  const showImage = Boolean(imageUrl) && !broken;
  // Kenglik 3:4 kartaga nisbatan: 9:16 torroq, 1:1 sal kengroq (ustun buzilmasin).
  const frameStyle = { "--stage-ar": `${w} / ${h}`, "--stage-k": Math.min(1.06, (w / h) / 0.75).toFixed(3) } as CSSProperties;

  return <div className={`gen-stage${landscape ? " is-landscape" : ""}`} data-step={step}>
    <div className="gen-stage-visual" style={frameStyle} aria-hidden="true">
      <div className="gen-glow" />
      <div className={`gen-frame${showImage ? "" : " is-empty"}`}>
        {showImage
          ? <img className="gen-photo" src={imageUrl} alt="" onError={() => setBroken(true)} />
          : <div className="gen-skeleton"><span className="gen-skel-product" /><span className="gen-skel-shadow" /></div>}
        <div className="gen-tint" />
        <div className="gen-grid" />
        {isVideo ? <div className="gen-timeline"><i /><i /><i /><i /><i /></div> : <div className="gen-layout">
          <div className="gen-headline"><i /><i /></div>
          <div className="gen-badges"><i /><i /><i /></div>
        </div>}
        <div className="gen-scan" />
        <div className="gen-sparks"><i /><i /><i /><i /><i /><i /></div>
      </div>
      <span className="gen-corner tl" /><span className="gen-corner tr" /><span className="gen-corner bl" /><span className="gen-corner br" />
    </div>

    <ol className="gen-steps" aria-label={t("results.stage.stepsLabel")}>
      {steps.map((label, index) => {
        const state = index < step ? "done" : index === step ? "active" : "todo";
        return <li key={index} className={`is-${state}`} aria-current={state === "active" ? "step" : undefined}>
          <span className="gen-step-mark">{state === "done" ? <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span>
          <span className="gen-step-text">{label}</span>
        </li>;
      })}
    </ol>

    <p className={`gen-tip${tip.leaving ? " is-leaving" : ""}`}>
      <b>{t("results.stage.tipLabel")}</b>
      <span key={tip.index}>{t(`results.stage.tips.${tips[tip.index]}`)}</span>
    </p>
  </div>;
}
