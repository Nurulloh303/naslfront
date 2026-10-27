import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AspectRatio, ContentMode } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { CARD_TIPS, VIDEO_TIPS, stageStepFor, stepLabels, useRotatingTip } from "./GenerationStage";
import "./Showcase3D.css";

/**
 * Variant 4 — "3D vitrina": kutish paytida mahsulot fotosi 3:4 kartada
 * havoda suzib, sekin aylanadi. Progress oshgani sari karta UI qatlamlari
 * (sarlavha, belgilar, narx) turli 3D chuqurlikda uchib kelib joylashadi.
 *
 * Burchaklar React render'siz, requestAnimationFrame ichida CSS
 * o'zgaruvchilar (--rx, --ry, --fy) orqali yoziladi: faqat transform/opacity.
 * Kompyuterda karta sichqonchaga qarab egiladi, telefonda — deviceorientation
 * (iOS'da faqat tugma bosilgandan keyin ruxsat so'raladi). Harakat bo'lmasa
 * avto-aylanish qaytadi. prefers-reduced-motion'da karta qimirlamaydi.
 *
 * Aylanish ±25° ichida — old tomoni doim ko'rinib turadi, orqa tomon kerak emas.
 */

const RATIO: Record<AspectRatio, [number, number]> = { "9:16": [9, 16], "3:4": [3, 4], "1:1": [1, 1], "4:3": [4, 3], "16:9": [16, 9] };
const MAX_RY = 25;
const MAX_RX = 12;
const IDLE_MS = 1600;

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

type Props = {
  /** 0–100, ResultPanel'dagi silliq progress. */
  progress: number;
  contentType: ContentMode;
  /** Yuklangan asosiy mahsulot rasmi. Bo'lmasa — abstrakt gradient karta. */
  productImageUrl?: string;
  /** Natija formati. Karta uchun 3:4. */
  stageAspectRatio?: AspectRatio;
};

function reducedMotionQuery() {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Boolean(reducedMotionQuery()?.matches));
  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function Showcase3D({ progress, contentType, productImageUrl, stageAspectRatio = "3:4" }: Props) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [productImageUrl]);

  // iOS: deviceorientation faqat foydalanuvchi bosganidan keyin ruxsat bilan ishlaydi.
  const [needsPermission, setNeedsPermission] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const orientationRef = useRef<{ beta: number; gamma: number; at: number; base: { beta: number; gamma: number } | null }>({ beta: 0, gamma: 0, at: 0, base: null });

  const step = stageStepFor(progress);
  const steps = stepLabels(t, contentType);
  const isVideo = contentType === "video";
  const tips = isVideo ? VIDEO_TIPS : CARD_TIPS;
  const tip = useRotatingTip(tips.length);

  const [w, h] = RATIO[stageAspectRatio] ?? RATIO["3:4"];
  const landscape = w > h;
  const showImage = Boolean(productImageUrl) && !broken;
  const ratioK = Math.min(1.12, (w / h) / 0.75);
  const style = { "--s3d-ar": `${w} / ${h}`, "--s3d-k": ratioK.toFixed(3) } as CSSProperties;

  // Orientatsiya tinglovchisi (Android — darhol, iOS — ruxsatdan keyin).
  const attachOrientation = () => {
    const onOrient = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      const state = orientationRef.current;
      if (!state.base) state.base = { beta: event.beta, gamma: event.gamma };
      state.beta = event.beta;
      state.gamma = event.gamma;
      state.at = performance.now();
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  };

  useEffect(() => {
    if (reduced || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse) return;
    const ctor = window.DeviceOrientationEvent as OrientationCtor;
    // Tinglovchi darhol ulanadi: Android'da hodisalar ruxsatsiz keladi,
    // iOS'da esa tugma orqali ruxsat berilguncha hech narsa kelmaydi.
    const detach = attachOrientation();
    let probe = 0;
    if (typeof ctor.requestPermission === "function" && !tiltOn) {
      setNeedsPermission(true);
      // hodisa kelib qolsa (ruxsat kerak emas ekan) — tugmani yashiramiz
      probe = window.setInterval(() => { if (orientationRef.current.at) { setNeedsPermission(false); window.clearInterval(probe); } }, 500);
    }
    return () => { detach(); window.clearInterval(probe); };
  }, [reduced, tiltOn]);

  const requestTilt = async () => {
    const ctor = window.DeviceOrientationEvent as OrientationCtor;
    try {
      const answer = await ctor.requestPermission?.();
      if (answer === "granted") {
        orientationRef.current.base = null;
        setTiltOn(true);
        setNeedsPermission(false);
        return;
      }
    } catch { /* ruxsat berilmadi — avto-aylanish davom etadi */ }
    setNeedsPermission(false);
  };

  // Asosiy harakat sikli.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const write = (rx: number, ry: number, fy: number) => {
      root.style.setProperty("--rx", rx.toFixed(2));
      root.style.setProperty("--ry", ry.toFixed(2));
      root.style.setProperty("--fy", fy.toFixed(2));
    };
    if (reduced) { write(4, -14, 0); return; }

    const pointer = { x: 0, y: 0, at: 0 };
    const current = { rx: 0, ry: 0 };
    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let visible = true;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = root.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      // sahnadan uzoqda yurgan sichqoncha kartani "ushlab" turmaydi
      if (Math.abs(x) > 1.8 || Math.abs(y) > 1.8) { pointer.at = 0; return; }
      pointer.x = clamp(x, -1, 1);
      pointer.y = clamp(y, -1, 1);
      pointer.at = performance.now();
    };
    const onLeave = () => { pointer.at = 0; };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      let tx: number;
      let ty: number;
      let ease = 3.2;
      const orient = orientationRef.current;
      if (pointer.at && now - pointer.at < IDLE_MS) {
        ty = pointer.x * MAX_RY;
        tx = -pointer.y * MAX_RX;
        ease = 7;
      } else if (orient.base && now - orient.at < IDLE_MS) {
        ty = clamp((orient.gamma - orient.base.gamma) * 1.1, -MAX_RY, MAX_RY);
        tx = clamp(-(orient.beta - orient.base.beta) * 0.7, -MAX_RX, MAX_RX);
        ease = 6;
      } else {
        // avto: ikki xil davrli tebranish — takrorlanishi sezilmaydi
        ty = Math.sin(clock * (Math.PI * 2) / 9) * 22 + Math.sin(clock * 0.9) * 3;
        tx = Math.sin(clock * (Math.PI * 2) / 6.4) * 6 + 2;
      }
      const k = 1 - Math.exp(-dt * ease);
      current.rx += (tx - current.rx) * k;
      current.ry += (ty - current.ry) * k;
      const fy = Math.sin(clock * (Math.PI * 2) / 5.2) * -7;
      write(current.rx, current.ry, fy);
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame || !visible || document.hidden) return;
      last = performance.now();
      frame = window.requestAnimationFrame(tick);
    };
    const stop = () => { window.cancelAnimationFrame(frame); frame = 0; };
    const onVisibility = () => (document.hidden ? stop() : start());

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); })
      : null;
    observer?.observe(root);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      observer?.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  const face = showImage
    ? <img className="s3d-photo" src={productImageUrl} alt="" draggable={false} onError={() => setBroken(true)} />
    : <div className="s3d-abstract"><span className="s3d-abstract-orb" /><span className="s3d-abstract-mark">✦</span></div>;

  return <div ref={rootRef} className={`s3d${landscape ? " is-landscape" : ""}${reduced ? " is-still" : ""}`} data-step={step} style={style}>
    <div className="s3d-stage" aria-hidden="true">
      <div className="s3d-aurora"><i /><i /><i /></div>
      <div className="s3d-floor"><span className="s3d-shadow" /></div>

      <div className="s3d-reflect">
        <div className="s3d-reflect-face">{face}</div>
      </div>

      <div className="s3d-card">
        <div className="s3d-slab" />
        <div className="s3d-face">
          {face}
          <span className="s3d-sheen" />
          <span className="s3d-polish" />
        </div>
        <div className="s3d-layer s3d-focus"><i /><i /><i /><i /></div>
        <div className="s3d-layer s3d-headline"><i /><i /></div>
        {isVideo ? <>
          <div className="s3d-layer s3d-play"><span /></div>
          <div className="s3d-layer s3d-timeline"><i /><i /><i /><i /><i /></div>
        </> : <div className="s3d-layer s3d-badges"><span><i /><b /></span><span><i /><b /></span><span><i /><b /></span></div>}
        {isVideo ? null : <div className="s3d-layer s3d-price"><b /><i /></div>}
        <div className="s3d-layer s3d-seal">✦</div>
      </div>
    </div>

    <div className="s3d-caption" aria-live="polite">
      <div className="s3d-steps" role="progressbar" aria-label={t("results.showcase.label")} aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}>
        {steps.map((_, index) => <i key={index} className={index < step ? "is-done" : index === step ? "is-active" : ""} />)}
      </div>
      <p className="s3d-step"><span>{t("results.showcase.step", { n: step + 1 })}</span><b key={step}>{steps[step]}</b></p>
    </div>

    {needsPermission ? <button type="button" className="s3d-tilt" onClick={requestTilt}>{t("results.showcase.tilt")}</button> : null}
    {tiltOn ? <p className="s3d-tilt-on">{t("results.showcase.tiltOn")}</p> : null}

    <p className={`gen-tip s3d-tip${tip.leaving ? " is-leaving" : ""}`}>
      <b>{t("results.stage.tipLabel")}</b>
      <span key={tip.index}>{t(`results.stage.tips.${tips[tip.index]}`)}</span>
    </p>
  </div>;
}
