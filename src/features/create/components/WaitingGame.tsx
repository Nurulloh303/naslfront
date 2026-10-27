import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { AspectRatio, ContentMode } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { CARD_TIPS, GenerationStage, VIDEO_TIPS, stageStepFor, stepLabels, useRotatingTip } from "./GenerationStage";
import "./WaitingGame.css";

/**
 * Kutish paytidagi mini-o'yin: mahsulot fotosidan boshqotirma.
 *
 * Rasm (3:4) N×N bo'lakka bo'linadi va aralashtiriladi. Ikki bo'lakni
 * ketma-ket bosish (yoki birini ikkinchisining ustiga sudrab tashlash) ularni
 * almashtiradi — telefon uchun eng qulay mexanika. Har qanday joylashuvni
 * almashtirishlar bilan yig'ish mumkin, shuning uchun "yechilmaydigan" holat yo'q.
 *
 * Bo'laklar CSS background bilan chiziladi (canvas emas): blob:/data:/https
 * rasmlarda "tainted canvas" muammosi bo'lmaydi.
 *
 * WaitingArea — "O'yin / Jarayon" almashtirgichi. Ikkala ko'rinish ham
 * montaj qilingan bo'lib turadi (biri yashirin), shuning uchun "Jarayon"ga
 * o'tib qaytganda o'yin holati yo'qolmaydi.
 */

type Size = 3 | 4;
type Mode = "game" | "process";
type Best = Partial<Record<Size, { moves: number; ms: number }>>;

const MODE_KEY = "naslai:wait-mode";
const BEST_KEY = "naslai:puzzle-best";
const DRAG_THRESHOLD = 8;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeStorage(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим — не критично */ }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** order[slot] = piece. Hech qachon yig'ilgan holatda bo'lmaydi, joyidagi bo'laklar ≤ 1. */
export function shuffledOrder(size: Size): number[] {
  const count = size * size;
  const order = Array.from({ length: count }, (_, i) => i);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (let i = count - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.filter((piece, slot) => piece === slot).length <= 1) return order;
  }
  // amalda yetib kelmaydi; baribir yig'ilmagan holatni kafolatlaymiz
  if (order.every((piece, slot) => piece === slot)) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Rasm bo'lmasa — rangli naqsh (har bo'lak o'zgacha, shuning uchun yig'ish mumkin). */
function makePatternImage(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const bg = ctx.createLinearGradient(0, 0, 600, 800);
    bg.addColorStop(0, "#ff4d1c");
    bg.addColorStop(0.45, "#ffb020");
    bg.addColorStop(1, "#00b8c4");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 600, 800);
    const rings: Array<[number, number, number, string]> = [[150, 210, 190, "#1c1a40"], [470, 560, 230, "#f4f0e8"], [420, 160, 110, "#00f6ff"], [140, 650, 140, "#ff4d1c"]];
    rings.forEach(([x, y, r, color]) => {
      for (let k = 0; k < 4; k += 1) {
        ctx.beginPath();
        ctx.arc(x, y, r - k * (r / 4.2), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = k % 2 === 0 ? 0.88 : 0.35;
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(20, 17, 16, .22)";
    ctx.lineWidth = 3;
    for (let i = -800; i < 600; i += 90) { ctx.beginPath(); ctx.moveTo(i, 800); ctx.lineTo(i + 800, 0); ctx.stroke(); }
    ctx.fillStyle = "#141110";
    ctx.font = "700 260px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 300, 410);
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

/** Rasm ochiladimi — aks holda naqsh. */
function usePuzzleImage(url?: string) {
  const [failed, setFailed] = useState(false);
  const pattern = useMemo(() => (url && !failed ? "" : makePatternImage()), [url, failed]);
  useEffect(() => {
    setFailed(false);
    if (!url) return;
    let alive = true;
    const probe = new Image();
    probe.onerror = () => { if (alive) setFailed(true); };
    probe.src = url;
    return () => { alive = false; probe.onerror = null; };
  }, [url]);
  return url && !failed ? url : pattern;
}

/* ---------------- конфетти (canvas, без зависимостей) ---------------- */

function Confetti({ burst }: { burst: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!burst || prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.scale(dpr, dpr);
    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#ff4d1c";
    const colors = [accent, accent, "#f4f0e8", "#ffc53d", "#7c6cff", "#38d996"];
    const parts = Array.from({ length: 150 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = 6 + Math.random() * 9;
      return {
        x: rect.width / 2 + (Math.random() - 0.5) * 40,
        y: rect.height * 0.55,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 6,
        h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const age = now - started;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1800) / 900);
      parts.forEach((p) => {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)) + 1);
        ctx.restore();
      });
      if (age < 2700) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [burst]);
  return <canvas ref={canvasRef} className="wg-confetti" data-burst={burst} aria-hidden="true" />;
}

/* ---------------- «Rasmingiz tayyor» — показываем, если ушли из игры на середине ---------------- */

let interruptedAt = 0;

/** ResultPanel natijalarni ko'rsatganda chaqiriladi: o'yin o'rtasida tugagan bo'lsa — qisqa xabar. */
export function GameDoneToast() {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!interruptedAt || Date.now() - interruptedAt > 5000) return;
    interruptedAt = 0;
    setShow(true);
    const timer = window.setTimeout(() => setShow(false), 3600);
    return () => window.clearTimeout(timer);
  }, []);
  if (!show) return null;
  return <div className="wg-toast" role="status">{t("results.game.ready")}</div>;
}

/* ---------------- сама игра ---------------- */

type Drag = { slot: number; pointerId: number; x0: number; y0: number; dx: number; dy: number; active: boolean; over: number | null };

function Icon({ name }: { name: "shuffle" | "eye" | "replay" }) {
  const paths = {
    shuffle: "M3 5h3.2c1.4 0 2.6.7 3.4 1.8l3.8 5.4c.8 1.1 2 1.8 3.4 1.8H18M15.5 11.5 18 14l-2.5 2.5M3 15h3.2c1.4 0 2.6-.7 3.4-1.8M12.4 6.8c.8-1.1 2-1.8 3.4-1.8H18M15.5 2.5 18 5l-2.5 2.5",
    eye: "M1.8 10S5 4 10 4s8.2 6 8.2 6-3.2 6-8.2 6-8.2-6-8.2-6Zm8.2 2.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
    replay: "M3.5 10a6.5 6.5 0 1 0 2-4.7M3.2 2.8v3.4h3.4",
  } as const;
  return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

type GameProps = { imageUrl?: string; progress: number; contentType: ContentMode; visible: boolean; size: Size };

export function WaitingGame({ imageUrl, progress, contentType, visible, size: sizeProp }: GameProps) {
  const { t } = useLanguage();
  const image = usePuzzleImage(imageUrl);
  const [size, setSize] = useState<Size>(sizeProp);
  const [order, setOrder] = useState<number[]>(() => shuffledOrder(sizeProp));
  const [selected, setSelected] = useState<number | null>(null);
  const [focusSlot, setFocusSlot] = useState(0);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalMs, setFinalMs] = useState<number | null>(null);
  const [best, setBest] = useState<Best>(() => readStorage<Best>(BEST_KEY, {}));
  const [record, setRecord] = useState(false);
  const [burst, setBurst] = useState(0);
  const [peek, setPeek] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const suppressClick = useRef(false);

  const solved = order.length === size * size && order.every((piece, slot) => piece === slot);

  // Тайм: идёт только между первым ходом и сборкой.
  useEffect(() => {
    if (startedAt === null || solved) return;
    setElapsed(Date.now() - startedAt);
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(timer);
  }, [startedAt, solved]);

  // Если работа закончилась посреди партии — ResultPanel покажет «Rasmingiz tayyor».
  const live = useRef({ moves, solved, visible });
  live.current = { moves, solved, visible };
  useEffect(() => () => {
    if (live.current.visible && live.current.moves > 0 && !live.current.solved) interruptedAt = Date.now();
  }, []);

  const reset = useCallback((nextSize: Size) => {
    setSize(nextSize);
    setOrder(shuffledOrder(nextSize));
    setSelected(null);
    setFocusSlot(0);
    setMoves(0);
    setStartedAt(null);
    setElapsed(0);
    setFinalMs(null);
    setRecord(false);
    setDrag(null);
  }, []);

  // Размер переключается снаружи (в строке режима) — новая партия.
  useEffect(() => { if (sizeProp !== size) reset(sizeProp); }, [sizeProp, size, reset]);

  const swap = useCallback((a: number, b: number) => {
    if (a === b || solved) return;
    const next = order.slice();
    [next[a], next[b]] = [next[b], next[a]];
    const nextMoves = moves + 1;
    const start = startedAt ?? Date.now();
    setOrder(next);
    setMoves(nextMoves);
    if (startedAt === null) setStartedAt(start);
    if (next.every((piece, slot) => piece === slot)) {
      const ms = Date.now() - start;
      setFinalMs(ms);
      setElapsed(ms);
      const prev = best[size];
      const isRecord = !prev || nextMoves < prev.moves || (nextMoves === prev.moves && ms < prev.ms);
      if (isRecord) {
        const nextBest = { ...best, [size]: { moves: nextMoves, ms } };
        setBest(nextBest);
        writeStorage(BEST_KEY, nextBest);
      }
      setRecord(isRecord);
      setBurst((value) => value + 1);
    }
  }, [order, moves, startedAt, solved, best, size]);

  const pick = (slot: number) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (solved) return;
    setFocusSlot(slot);
    if (selected === null) setSelected(slot);
    else if (selected === slot) setSelected(null);
    else { swap(selected, slot); setSelected(null); }
  };

  const slotAt = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * size);
    const row = Math.floor(((clientY - rect.top) / rect.height) * size);
    if (col < 0 || row < 0 || col >= size || row >= size) return null;
    return row * size + col;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, slot: number) => {
    if (solved || (event.pointerType === "mouse" && event.button !== 0)) return;
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ slot, pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, dy: 0, active: false, over: null });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    const active = drag.active || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    if (!active) return;
    const over = slotAt(event.clientX, event.clientY);
    setDrag({ ...drag, dx, dy, active, over });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active) {
      suppressClick.current = true;
      // click после pointerup может не прийти (отпустили над другим тайлом) — сбрасываем флаг сами
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const target = slotAt(event.clientX, event.clientY);
      if (target !== null && target !== drag.slot) { swap(drag.slot, target); setFocusSlot(target); }
      setSelected(null);
    }
    setDrag(null);
  };

  const onTileKey = (event: ReactKeyboardEvent<HTMLButtonElement>, slot: number) => {
    const row = Math.floor(slot / size);
    const col = slot % size;
    const moves2: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const delta = moves2[event.key];
    if (event.key === "Escape") { setSelected(null); return; }
    if (!delta) return;
    event.preventDefault();
    const r = Math.min(size - 1, Math.max(0, row + delta[0]));
    const c = Math.min(size - 1, Math.max(0, col + delta[1]));
    const next = r * size + c;
    setFocusSlot(next);
    tileRefs.current[order[next]]?.focus();
  };

  const peekOn = () => setPeek(true);
  const peekOff = () => setPeek(false);

  // Шаги и подсказка — компактно, чтобы прогресс был виден и во время игры.
  const step = stageStepFor(progress);
  const steps = stepLabels(t, contentType);
  const tips = contentType === "video" ? VIDEO_TIPS : CARD_TIPS;
  const tip = useRotatingTip(tips.length);

  const bestHere = best[size];
  const shownMs = finalMs ?? elapsed;
  const boardStyle = { "--n": size, "--wg-img": image ? `url("${image.replace(/"/g, "%22")}")` : "none" } as CSSProperties;

  return <div className={`wg${solved ? " is-solved" : ""}`}>
    <div className="wg-hud">
      <dl className="wg-stats">
        <div><dt>{t("results.game.moves")}</dt><dd data-testid="wg-moves">{moves}</dd></div>
        <div><dt>{t("results.game.time")}</dt><dd>{formatTime(shownMs)}</dd></div>
        <div><dt>{t("results.game.best")}</dt><dd>{bestHere ? bestHere.moves : t("results.game.noBest")}</dd></div>
      </dl>
      <div className="wg-controls">
        <button
          type="button"
          className="wg-btn wg-peek"
          aria-pressed={peek}
          title={t("results.game.peekHint")}
          onPointerDown={(event) => { event.preventDefault(); peekOn(); }}
          onPointerUp={peekOff}
          onPointerLeave={peekOff}
          onPointerCancel={peekOff}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); peekOn(); } }}
          onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") peekOff(); }}
          onBlur={peekOff}
        ><Icon name="eye" /><span>{t("results.game.peek")}</span></button>
        <button type="button" className="wg-btn" onClick={() => reset(size)}><Icon name="shuffle" /><span>{t("results.game.shuffle")}</span></button>
      </div>
    </div>

    <div className="wg-stage">
      <div
        ref={boardRef}
        className={`wg-board${peek ? " is-peek" : ""}${drag?.active ? " is-dragging" : ""}`}
        style={boardStyle}
        role="group"
        aria-label={t("results.game.boardLabel")}
        aria-describedby="wg-hint"
        data-size={size}
      >
        {order.map((_, piece) => {
          const slot = order.indexOf(piece);
          const placed = slot === piece;
          const dragging = drag?.active && drag.slot === slot;
          const style = {
            "--x": slot % size,
            "--y": Math.floor(slot / size),
            "--px": piece % size,
            "--py": Math.floor(piece / size),
            ...(dragging ? { "--dx": `${drag.dx}px`, "--dy": `${drag.dy}px` } : null),
          } as CSSProperties;
          const cls = ["wg-tile", placed ? "is-placed" : "", selected === slot ? "is-selected" : "", dragging ? "is-drag" : "", drag?.active && drag.over === slot && drag.slot !== slot ? "is-target" : ""].filter(Boolean).join(" ");
          return <button
            key={piece}
            ref={(node) => { tileRefs.current[piece] = node; }}
            type="button"
            className={cls}
            style={style}
            tabIndex={slot === focusSlot ? 0 : -1}
            aria-label={t(placed ? "results.game.tilePlaced" : "results.game.tile", { n: piece + 1 })}
            aria-pressed={selected === slot}
            data-slot={slot}
            data-piece={piece}
            onClick={() => pick(slot)}
            onFocus={() => setFocusSlot(slot)}
            onKeyDown={(event) => onTileKey(event, slot)}
            onPointerDown={(event) => onPointerDown(event, slot)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
          ><span className="wg-tile-img" /></button>;
        })}
        <div className="wg-peek-layer" aria-hidden="true" />
        <span className="wg-corner tl" /><span className="wg-corner tr" /><span className="wg-corner bl" /><span className="wg-corner br" />
      </div>
      <Confetti burst={burst} />
      {solved ? <div className="wg-win" role="status">
        <b>{t("results.game.solved", { moves })}</b>
        <span>{t("results.game.solvedTime", { time: formatTime(shownMs) })}{record ? <em>{t("results.game.record")}</em> : null}</span>
        <button type="button" className="wg-btn wg-again" onClick={() => reset(size)}><Icon name="replay" /><span>{t("results.game.again")}</span></button>
      </div> : null}
    </div>

    <p id="wg-hint" className="wg-hint">{t("results.game.hint")}</p>

    <div className="wg-progress">
      <ol aria-label={t("results.stage.stepsLabel")}>
        {steps.map((label, index) => <li key={index} className={index < step ? "is-done" : index === step ? "is-active" : ""} aria-current={index === step ? "step" : undefined}><span className="wg-sr">{label}</span></li>)}
      </ol>
      <p><span>{t("results.game.step", { n: step + 1 })}</span><b>{steps[step]}</b></p>
    </div>

    <p className={`wg-tip${tip.leaving ? " is-leaving" : ""}`}>
      <b>{t("results.stage.tipLabel")}</b>
      <span key={tip.index}>{t(`results.stage.tips.${tips[tip.index]}`)}</span>
    </p>
  </div>;
}

/* ---------------- переключатель «O'yin / Jarayon» ---------------- */

type AreaProps = { progress: number; contentType: ContentMode; imageUrl?: string; aspectRatio?: AspectRatio };

export function WaitingArea({ progress, contentType, imageUrl, aspectRatio }: AreaProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>(() => (readStorage<Mode>(MODE_KEY, "game") === "process" ? "process" : "game"));
  const [size, setSize] = useState<Size>(3);
  const choose = (next: Mode) => { setMode(next); writeStorage(MODE_KEY, next); };

  return <div className="wait-area">
    <div className="wait-top">
      <div className="wg-seg wait-mode" role="group" aria-label={t("results.game.modeLabel")}>
        <button type="button" aria-pressed={mode === "game"} onClick={() => choose("game")}><span aria-hidden="true">🎮</span>{t("results.game.modeGame")}</button>
        <button type="button" aria-pressed={mode === "process"} onClick={() => choose("process")}><span aria-hidden="true">✨</span>{t("results.game.modeProcess")}</button>
      </div>
      {mode === "game" ? <div className="wg-seg wg-size" role="group" aria-label={t("results.game.size")}>
        {([3, 4] as Size[]).map((value) => <button key={value} type="button" aria-pressed={size === value} onClick={() => setSize(value)}>{value}×{value}</button>)}
      </div> : null}
    </div>
    <div hidden={mode !== "game"}><WaitingGame imageUrl={imageUrl} progress={progress} contentType={contentType} visible={mode === "game"} size={size} /></div>
    <div hidden={mode !== "process"}><GenerationStage progress={progress} contentType={contentType} imageUrl={imageUrl} aspectRatio={aspectRatio} /></div>
  </div>;
}
