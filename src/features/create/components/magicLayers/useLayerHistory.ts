import { useCallback, useRef, useState } from "react";

type HistoryState<T> = { past: T[]; present: T; future: T[]; baseline: T };

export type UpdateOptions = {
  /** Tarixga yozmasdan o'zgartirish (masalan, sudrash davomida). */
  transient?: boolean;
  /** Bir xil kalitli ketma-ket o'zgarishlar (slayder, matn yozish) bitta qadamga birlashadi. */
  coalesce?: string;
};

const MAX_HISTORY = 80;
const COALESCE_MS = 900;

/**
 * Oddiy undo/redo steki.
 *
 * Updater funksiyalar sof bo'lib qoladi (StrictMode ikki marta chaqiradi):
 * tarixga yozish-yozmaslik qarori `setState` dan oldin qabul qilinadi.
 */
export function useLayerHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [], baseline: initial });
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);

  const update = useCallback((fn: (prev: T) => T, options: UpdateOptions = {}) => {
    const now = Date.now();
    let record = !options.transient;
    if (record && options.coalesce) {
      const last = lastCoalesce.current;
      if (last && last.key === options.coalesce && now - last.at < COALESCE_MS) record = false;
      lastCoalesce.current = { key: options.coalesce, at: now };
    } else if (record) {
      lastCoalesce.current = null;
    }
    setState((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      if (!record) return { ...s, present: next };
      return { ...s, past: [...s.past.slice(-(MAX_HISTORY - 1)), s.present], present: next, future: [] };
    });
  }, []);

  /** Sudrash tugaganda: boshlang'ich holatni bitta qadam sifatida tarixga qo'shadi. */
  const commitFrom = useCallback((snapshot: T) => {
    lastCoalesce.current = null;
    setState((s) => (snapshot === s.present ? s : { ...s, past: [...s.past.slice(-(MAX_HISTORY - 1)), snapshot], future: [] }));
  }, []);

  const undo = useCallback(() => {
    lastCoalesce.current = null;
    setState((s) => {
      if (!s.past.length) return s;
      const previous = s.past[s.past.length - 1];
      return { ...s, past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastCoalesce.current = null;
    setState((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { ...s, past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  /** Yangi boshlang'ich holat: tarix tozalanadi, "saqlanmagan o'zgarish" yo'q. */
  const reset = useCallback((value: T) => {
    lastCoalesce.current = null;
    setState({ past: [], present: value, future: [], baseline: value });
  }, []);

  /** Joriy holatni "saqlangan" deb belgilash. */
  const markSaved = useCallback(() => {
    setState((s) => ({ ...s, baseline: s.present }));
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty: state.present !== state.baseline,
    update,
    commitFrom,
    undo,
    redo,
    reset,
    markSaved,
  };
}
