import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAccount } from "../../app/account/AccountContext";
import { CabinetFooter, CabinetHeader } from "../../app/cabinet/CabinetHeader";
import { downloadFile } from "../../app/downloadHelper";
import type { CabinetRoute } from "../../app/routes";
import { useLanguage } from "../../i18n/LanguageContext";
import { ResizeError, resizeApi, resolveMediaUrl, type ResizeJob, type ResizeMode } from "./resizeApi";
import { TARGET_H, TARGET_RATIO, TARGET_W, clamp01, coverRect, dominantEdgeColor, drawPreview, emptyEdges, isThreeByFour, prepareResizeUpload, shapeOf } from "./resizeCanvas";
import "./resize.css";

/**
 * «O'lchamni moslash» — bitta rasmni Uzum formatiga (1080×1440, 3:4) keltirish.
 *
 * Ketma-ketlik: rasm → usul (jonli prevyu bilan) → 1 token → natija.
 * Prevyular brauzerda chiziladi va taxminiy: ular usulni tanlashga yordam
 * beradi, yakuniy rasmni esa server chizadi.
 */

const COST = 1;
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MODES: ResizeMode[] = ["ai", "blur", "color", "crop"];
const SWATCHES: Array<{ key: "white" | "black" | "grey"; value: string }> = [
  { key: "white", value: "#ffffff" },
  { key: "black", value: "#000000" },
  { key: "grey", value: "#eeeeee" },
];

type Source = { file: File; url: string; image: HTMLImageElement; width: number; height: number };
type Phase = "pick" | "choose" | "processing" | "result" | "failed";
type ErrorState = { message: string; insufficient?: boolean } | null;

function newKey() {
  try { return `resize_${crypto.randomUUID().replaceAll("-", "")}`; }
  catch { return `resize_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode"));
    image.src = url;
  });
}

export function ResizePage({ onNavigate, onLogout }: { onNavigate: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { account, setBalance, refresh } = useAccount();
  const { t } = useLanguage();
  const [source, setSource] = useState<Source | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [mode, setMode] = useState<ResizeMode>("ai");
  const [color, setColor] = useState<string>("#ffffff");
  const [edgeColor, setEdgeColor] = useState("#ffffff");
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 });
  const [job, setJob] = useState<ResizeJob | null>(null);
  const [error, setError] = useState<ErrorState>(null);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stopWatch = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Jarayon va natija sahnada ko'rinadi — telefonda u ekrandan tashqarida qolmasin.
  useEffect(() => {
    if (phase !== "processing" && phase !== "result" && phase !== "failed") return;
    const stage = stageRef.current;
    if (!stage) return;
    const top = stage.getBoundingClientRect().top;
    if (top < 60 || top > window.innerHeight * 0.6) window.scrollTo({ top: Math.max(0, window.scrollY + top - 90), behavior: "smooth" });
  }, [phase]);

  useEffect(() => () => {
    stopWatch.current?.();
  }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);

  const acceptFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) { setError({ message: t("resize.errors.type") }); return; }
    if (file.size > MAX_BYTES) { setError({ message: t("resize.errors.size") }); return; }
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      setSource({ file, url, image, width, height });
      setEdgeColor(dominantEdgeColor(image, width, height));
      setMode(isThreeByFour(width, height) ? "crop" : "ai");
      setFocus({ x: 0.5, y: 0.5 });
      setJob(null);
      setError(null);
      setNotice("");
      setPhase("choose");
    } catch {
      URL.revokeObjectURL(url);
      setError({ message: t("resize.errors.read") });
    }
  }, [t]);

  // Ctrl+V — skrinshot yoki nusxalangan rasm.
  useEffect(() => {
    if (phase !== "pick" && phase !== "choose") return;
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void acceptFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [phase, acceptFile]);

  if (!account) return null;
  const balance = account.balance;
  const enough = balance >= COST;
  const fill = color === "auto" ? edgeColor : color;
  const previewOptions = { mode, fill, edgeColor, focusX: focus.x, focusY: focus.y };

  const settle = (next: ResizeJob, nextBalance?: number) => {
    setJob(next);
    if (typeof nextBalance === "number") setBalance(nextBalance);
    if (next.status === "success" && next.results[0]) { setPhase("result"); setConnection(""); void refresh(); }
    else if (next.status === "success" || next.status === "failed") { setPhase("failed"); setConnection(""); void refresh(); }
  };

  const submit = async () => {
    if (!source || !enough) return;
    setError(null);
    setNotice("");
    setJob(null);
    setPhase("processing");
    try {
      const image = await prepareResizeUpload(source.file, source.image);
      const started = await resizeApi.start({
        image,
        mode,
        ...(mode === "color" ? { color: color === "auto" ? "auto" : color } : {}),
        ...(mode === "crop" ? { focusX: round3(focus.x), focusY: round3(focus.y) } : {}),
        title: source.file.name.replace(/\.[^.]+$/, "").slice(0, 80) || undefined,
        idempotencyKey: newKey(),
      });
      setBalance(started.balance);
      setJob(started.job);
      stopWatch.current?.();
      stopWatch.current = resizeApi.watch(started.job.id, settle, setConnection);
    } catch (reason) {
      setPhase("choose");
      if (reason instanceof ResizeError && (reason.status === 402 || reason.code === "INSUFFICIENT_TOKENS")) {
        setError({ message: reason.message, insufficient: true });
        void refresh();
      } else {
        setError({ message: reason instanceof ResizeError && reason.status ? reason.message : t("resize.errors.generic") });
      }
    }
  };

  const cancel = async () => {
    if (!job || cancelling) return;
    setCancelling(true);
    try {
      const result = await resizeApi.cancel(job.id);
      stopWatch.current?.();
      stopWatch.current = null;
      setBalance(result.balance);
      setJob(null);
      setPhase("choose");
      setNotice(t("resize.cancelled"));
      void refresh();
    } catch (reason) {
      setError({ message: reason instanceof Error ? reason.message : t("resize.errors.generic") });
    } finally {
      setCancelling(false);
    }
  };

  const backToModes = () => { setJob(null); setError(null); setNotice(""); setPhase("choose"); };
  const startOver = () => { setSource(null); setJob(null); setError(null); setNotice(""); setPhase("pick"); };

  const result = job?.results[0];
  const resultUrl = result ? resolveMediaUrl(result.url) : "";
  const shape = source ? shapeOf(source.width, source.height) : "square";
  const isSmall = source ? Math.min(source.width, source.height) < TARGET_W : false;
  const busy = phase === "processing";
  const progress = Math.max(4, Math.min(100, Math.round(job?.progress ?? 0)));
  const statusText = !job ? t("resize.preparing") : connection || job.message || (job.status === "queued" ? t("resize.queued") : t("resize.working"));

  return <main className="reference-app cabinet-page">
    <CabinetHeader route="resize" balance={balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content rz-page">
      <div className="cabinet-page-heading">
        <div>
          <p className="eyebrow">{t("cabinet.eyebrow")}</p>
          <h1>{t("resize.title")}</h1>
          <p className="audit-lead">{t("resize.lead")}</p>
        </div>
      </div>

      {phase === "pick" && <div
        className={`rz-drop ${dragging ? "is-dragging" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void acceptFile(event.dataTransfer.files?.[0]); }}
      >
        <FrameGlyph />
        <div className="rz-drop-text">
          <h2>{dragging ? t("resize.dropHere") : t("resize.uploadTitle")}</h2>
          <p>{t("resize.uploadHint")}</p>
          <span className="button primary rz-drop-button">{t("resize.uploadButton")}</span>
        </div>
      </div>}
      <input ref={inputRef} className="sr-only" type="file" accept={ACCEPT.join(",")} onChange={(event) => { void acceptFile(event.target.files?.[0]); event.target.value = ""; }} />

      {phase === "pick" && error && <p className="rz-error" role="alert">{error.message}</p>}

      {source && phase !== "pick" && <div className={`rz-layout is-${phase}`}>
        <div className="rz-stage-col" ref={stageRef}>
          <div className="rz-stage">
            <div className="rz-ruler rz-ruler-x" aria-hidden="true"><span>1080</span></div>
            <div className="rz-ruler rz-ruler-y" aria-hidden="true"><span>1440</span></div>
            {phase === "result" && result
              ? <BeforeAfter before={source.url} after={resultUrl} />
              : <BigPreview source={source} options={previewOptions} busy={busy} onFocus={setFocus} />}
            {busy && <div className="rz-scan" aria-hidden="true"><i /></div>}
          </div>
          {phase === "choose" && mode === "crop" && !isThreeByFour(source.width, source.height) && <p className="rz-hint">{t("resize.cropHint")}</p>}
        </div>

        <div className="rz-side">
          <div className="rz-source">
            <img src={source.url} alt="" />
            <div>
              <small>{t("resize.sourceLabel")}</small>
              <b>{t("resize.sizeLabel", { w: source.width, h: source.height, shape: t(`resize.shape.${shape}`) })}</b>
            </div>
            {(phase === "choose" || phase === "failed") && <button type="button" className="rz-link" onClick={() => inputRef.current?.click()}>{t("resize.replace")}</button>}
          </div>
          {(phase === "choose") && <>
            {shape === "target" && <p className="rz-note">{t("resize.already")}</p>}
            {isSmall && <p className="rz-note is-accent">✦ {t("resize.small")}</p>}
          </>}

          {phase === "choose" && <>
            <h2 className="rz-title">{t("resize.modeTitle")}</h2>
            <div className="rz-modes" role="radiogroup" aria-label={t("resize.modeTitle")}>
              {MODES.map((item) => <button
                key={item}
                type="button"
                role="radio"
                aria-checked={mode === item}
                className="rz-mode"
                onClick={() => {
                  setMode(item);
                  // Telefonda sahna kartalar ustida: kesish joyini surish uchun uni ko'rsatamiz.
                  if (item === "crop" && window.matchMedia("(max-width: 720px)").matches) stageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                }}
              >
                <span className="rz-mode-canvas"><PreviewCanvas source={source} options={{ ...previewOptions, mode: item }} />{item === "ai" && <AiOverlay source={source} small />}</span>
                <span className="rz-mode-text">
                  <b>{t(`resize.modes.${item}.title`)}</b>
                  {item === "ai" && <em>{t("resize.modes.ai.badge")}</em>}
                </span>
              </button>)}
            </div>
            <p className="rz-mode-desc">{t(`resize.modes.${mode}.text`)}</p>

            {mode === "color" && <div className="rz-colors">
              <span className="rz-label">{t("resize.colorLabel")}</span>
              <div className="rz-swatches">
                {SWATCHES.map((swatch) => <button key={swatch.key} type="button" className="rz-swatch" aria-pressed={color === swatch.value} onClick={() => setColor(swatch.value)}>
                  <i style={{ background: swatch.value }} />{t(`resize.colors.${swatch.key}`)}
                </button>)}
                <button type="button" className="rz-swatch" aria-pressed={color === "auto"} title={t("resize.autoHint")} onClick={() => setColor("auto")}>
                  <i style={{ background: edgeColor }} className="is-auto" />{t("resize.colors.auto")}
                </button>
                <label className="rz-swatch is-custom" aria-pressed={color !== "auto" && !SWATCHES.some((swatch) => swatch.value === color)}>
                  <i style={{ background: color !== "auto" && !SWATCHES.some((swatch) => swatch.value === color) ? color : undefined }} className="is-rainbow" />
                  {t("resize.colors.custom")}
                  <input type="color" value={color === "auto" ? edgeColor : color} onChange={(event) => setColor(event.target.value)} aria-label={t("resize.colors.custom")} />
                </label>
              </div>
              {color === "auto" && <small className="rz-muted">{t("resize.autoHint")}</small>}
            </div>}

            {notice && <p className="rz-success" role="status">{notice}</p>}
            {error && <div className="rz-error" role="alert">
              <span>{error.message}</span>
              {error.insufficient && <button type="button" className="button secondary" onClick={() => onNavigate("billing")}>{t("resize.buy")}</button>}
            </div>}

            <div className="rz-cta">
              {enough
                ? <button type="button" className="rz-submit" onClick={() => void submit()}>{t("resize.submit")} · <b>{t("resize.cost", { n: COST })}</b></button>
                : <>
                  <p className="rz-warn">{t("resize.noTokens")}</p>
                  <button type="button" className="rz-submit" onClick={() => onNavigate("billing")}>{t("resize.buy")}</button>
                </>}
              <small>{t("resize.balance", { n: balance })}</small>
            </div>
          </>}

          {phase === "processing" && <div className="rz-progress" role="status" aria-live="polite">
            <h2 className="rz-title">{t("resize.processingTitle")}</h2>
            <div className="rz-bar"><i style={{ width: `${progress}%` }} /></div>
            <p><span>{statusText}</span><b>{job ? `${progress}%` : ""}</b></p>
            <button type="button" className="button secondary" disabled={!job || cancelling} onClick={() => void cancel()}>{cancelling ? t("resize.cancelling") : t("resize.cancel")}</button>
          </div>}

          {phase === "result" && result && <div className="rz-result">
            <h2 className="rz-title">{t("resize.resultTitle")}</h2>
            <div className="rz-badges">
              <span>{result.width}×{result.height}</span>
              <span>{t(`resize.modes.${MODES.includes(result.mode) ? result.mode : mode}.title`)}</span>
              {result.upscaled && <span className="is-accent">✦ {t("resize.upscaled")}</span>}
            </div>
            <button type="button" className="rz-submit" onClick={() => void downloadFile(resultUrl, `naslai-uzum-${result.width}x${result.height}.${extOf(result.url)}`)}>{t("resize.download")}</button>
            <div className="rz-result-actions">
              <button type="button" className="button secondary" onClick={backToModes}>{t("resize.otherMode")}<small>{t("resize.otherModeHint")}</small></button>
              <button type="button" className="button secondary" onClick={startOver}>{t("resize.newImage")}</button>
            </div>
            <p className="rz-muted">{t("resize.savedNote")}</p>
          </div>}

          {phase === "failed" && <div className="rz-failed" role="alert">
            <h2 className="rz-title">{t("resize.failedTitle")}</h2>
            <p>{job?.error || job?.message || t("resize.errors.generic")}</p>
            <p className="rz-muted">{t("resize.refundNote")}</p>
            <div className="rz-result-actions">
              <button type="button" className="button primary" onClick={backToModes}>{t("resize.retry")}</button>
              <button type="button" className="button secondary" onClick={startOver}>{t("resize.newImage")}</button>
            </div>
          </div>}
        </div>
      </div>}
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}

function round3(value: number) { return Math.round(clamp01(value) * 1000) / 1000; }

function extOf(url: string) {
  const match = /\.(png|jpe?g|webp)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

type PreviewProps = { source: Source; options: { mode: ResizeMode; fill: string; edgeColor: string; focusX: number; focusY: number } };

/** O'z kengligiga moslanuvchi 3:4 canvas. */
function PreviewCanvas({ source, options }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(canvas);
    setWidth(Math.round(canvas.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (canvasRef.current && width) drawPreview(canvasRef.current, source.image, width, options);
  }, [source, width, options.mode, options.fill, options.edgeColor, options.focusX, options.focusY]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={canvasRef} className="rz-canvas" style={{ aspectRatio: `${TARGET_W} / ${TARGET_H}` }} />;
}

function AiOverlay({ source, small }: { source: Source; small?: boolean }) {
  const { t } = useLanguage();
  const edges = emptyEdges(source.width, source.height);
  if (!edges.length) return null;
  return <span className={`rz-ai ${small ? "is-small" : ""}`} aria-hidden="true">
    {edges.map((edge, index) => <i key={index} style={{ left: `${edge.x}%`, top: `${edge.y}%`, width: `${edge.w}%`, height: `${edge.h}%` }}>{index === 0 && !small ? <em>{t("resize.aiFill")}</em> : null}</i>)}
  </span>;
}

/** Katta prevyu. "Kesish" rejimida rasmni sichqoncha/barmoq bilan surish mumkin. */
function BigPreview({ source, options, busy, onFocus }: PreviewProps & { busy: boolean; onFocus: (focus: { x: number; y: number }) => void }) {
  const { t } = useLanguage();
  const drag = useRef<{ id: number; startX: number; startY: number; fx: number; fy: number; rangeX: number; rangeY: number } | null>(null);
  const croppable = options.mode === "crop" && !busy && !isThreeByFour(source.width, source.height);

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!croppable) return;
    const box = event.currentTarget.getBoundingClientRect();
    const r = coverRect(source.width, source.height, box.width, box.width / TARGET_RATIO);
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, fx: options.focusX, fy: options.focusY, rangeX: r.w - box.width, rangeY: r.h - box.width / TARGET_RATIO };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    onFocus({
      x: state.rangeX > 1 ? clamp01(state.fx - dx / state.rangeX) : 0.5,
      y: state.rangeY > 1 ? clamp01(state.fy - dy / state.rangeY) : 0.5,
    });
  };
  const up = () => { drag.current = null; };
  const key = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!croppable) return;
    const step = event.shiftKey ? 0.1 : 0.03;
    const delta: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    onFocus({ x: clamp01(options.focusX + d[0]), y: clamp01(options.focusY + d[1]) });
  };

  return <div
    className={`rz-big ${croppable ? "is-croppable" : ""}`}
    role={croppable ? "slider" : "img"}
    aria-label={croppable ? t("resize.cropAria") : t("resize.previewAria")}
    aria-valuenow={croppable ? Math.round((source.width > source.height * TARGET_RATIO ? options.focusX : options.focusY) * 100) : undefined}
    aria-valuemin={croppable ? 0 : undefined}
    aria-valuemax={croppable ? 100 : undefined}
    tabIndex={croppable ? 0 : undefined}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    onPointerCancel={up}
    onKeyDown={key}
  >
    <PreviewCanvas source={source} options={options} />
    {options.mode === "ai" && <AiOverlay source={source} />}
    {croppable && <span className="rz-grab" aria-hidden="true">{source.width > source.height * TARGET_RATIO ? "⟷" : "↕"}</span>}
  </div>;
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const { t } = useLanguage();
  const [split, setSplit] = useState(50);
  return <div className="rz-compare" style={{ ["--split" as string]: `${split}%` }}>
    <div className="rz-compare-before"><img src={before} alt={t("resize.before")} /></div>
    <img className="rz-compare-after" src={after} alt={t("resize.after")} />
    <span className="rz-compare-line" aria-hidden="true"><i>⟷</i></span>
    <span className="rz-tag is-before">{t("resize.before")}</span>
    <span className="rz-tag is-after">{t("resize.after")}</span>
    <input type="range" min={0} max={100} value={split} aria-label={t("resize.sliderAria")} onChange={(event) => setSplit(Number(event.target.value))} />
  </div>;
}

function FrameGlyph() {
  return <svg className="rz-glyph" viewBox="0 0 96 120" aria-hidden="true">
    <rect x="4" y="30" width="64" height="64" rx="6" className="rz-glyph-src" />
    <rect x="22" y="8" width="70" height="93.3" rx="6" className="rz-glyph-dst" />
    <text x="57" y="117" textAnchor="middle">3:4</text>
  </svg>;
}
