import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Подсказка «ⓘ» рядом с названием настройки.
 *
 * Раньше это был просто символ в тексте — он выглядел как кнопка, но
 * ничего не делал. Хуже, чем отсутствие подсказки: человек жмёт и решает,
 * что интерфейс сломан.
 *
 * Сделано на клике, а не на наведении: на телефоне наведения нет, а
 * настройки смотрят в основном с телефона.
 *
 * Пузырь рисуется В BODY, а не рядом с иконкой. Карточка настроек имеет
 * overflow: hidden ради скруглённых углов, и подсказка обрезалась ровно
 * по её краю — половина текста была не видна. Позицию считаем сами и
 * прижимаем к экрану, поэтому подсказка не уезжает ни вправо, ни вниз.
 */
const MARGIN = 12;
const GAP = 8;
const MAX_WIDTH = 280;

type Box = { top: number; bottom: number; left: number };
type Screen = { width: number; height: number };

/**
 * Куда поставить пузырь. Вынесено отдельно, чтобы проверять расчёт без
 * браузера: именно здесь ломалось — подсказка уезжала за правый край.
 */
export function placeBubble(anchor: Box, screen: Screen, bubbleHeight: number) {
  const width = Math.min(MAX_WIDTH, screen.width - MARGIN * 2);
  const left = Math.max(MARGIN, Math.min(anchor.left - GAP, screen.width - width - MARGIN));
  const below = anchor.bottom + GAP;
  // Внизу не помещается — показываем над иконкой.
  const top = bubbleHeight && below + bubbleHeight > screen.height - MARGIN
    ? Math.max(MARGIN, anchor.top - GAP - bubbleHeight)
    : below;
  return { top, left, width };
}

export function Hint({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // Считаем ПОСЛЕ вставки в DOM, но ДО отрисовки: иначе видно, как
  // подсказка прыгает из угла на место.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = wrapRef.current;
      if (!trigger) return;
      const anchor = trigger.getBoundingClientRect();
      setPosition(placeBubble(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        bubbleRef.current?.offsetHeight ?? 0,
      ));
    };
    place();
    // Второй проход: на первом высота пузыря ещё не известна.
    const raf = window.requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Пузырь живёт в body, поэтому проверяем и его тоже.
      if (!wrapRef.current?.contains(target) && !bubbleRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <span className="hint" ref={wrapRef}>
    <button
      type="button"
      className="hint-trigger"
      aria-label={label ?? "Nima bu?"}
      aria-expanded={open}
      aria-describedby={open ? id : undefined}
      onClick={(event) => { event.preventDefault(); setOpen((value) => !value); }}
    >
      i
    </button>
    {open && createPortal(
      <span
        ref={bubbleRef}
        className="hint-bubble"
        id={id}
        role="tooltip"
        style={position ? { top: position.top, left: position.left, width: position.width } : { opacity: 0 }}
      >
        {text}
      </span>,
      document.body,
    )}
  </span>;
}
