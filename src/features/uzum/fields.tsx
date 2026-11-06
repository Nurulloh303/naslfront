import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { UzumApiError, uzumApi, type DictionaryType } from "./uzumApi";

type T = (path: string, vars?: Record<string, string | number>) => string;

/** Maydon ramkasi: yorliq, belgi, izoh va xato bir xil joyda turadi. */
export function Field({ id, label, hint, error, optional, badge, counter, children, className = "" }: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  badge?: ReactNode;
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useLanguage();
  return <div className={`uz-field ${error ? "has-error" : ""} ${className}`}>
    <div className="uz-field-head">
      <label htmlFor={id}>{label}{optional && <small>{t("uzum.optional")}</small>}</label>
      {badge}
    </div>
    {children}
    {(error || hint || counter) && <div className="uz-field-foot">
      <div className="uz-field-msgs">{error && <p className="uz-field-error" id={`${id}-error`} role="alert">{error}</p>}{hint && <p id={`${id}-hint`}>{hint}</p>}</div>
      {counter && <span className="uz-counter">{counter}</span>}
    </div>}
  </div>;
}

export function AiBadge() {
  const { t } = useLanguage();
  return <span className="uz-ai">✦ {t("uzum.product.aiBadge")}</span>;
}

/**
 * Ma'lumotnoma qiymatini tanlash (brend, rang, o'lcham, mamlakat).
 *
 * Uzum faqat o'z ro'yxatidagi qiymatni qabul qiladi, shuning uchun erkin matn
 * saqlanmaydi: yozilgan matn — bu qidiruv, qiymat esa ro'yxatdan tanlanganda
 * o'zgaradi. Fokus yo'qolsa, kiritilgan qidiruv bekor bo'ladi.
 */
export function Combobox({ id, type, value, onChange, placeholder, quick, invalid, describedBy, categoryId }: {
  id: string;
  categoryId?: number | null;
  type: DictionaryType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  quick?: { label: string; value: string }[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      uzumApi.dictionary(type, query.trim(), controller.signal, categoryId)
        .then((values) => { setItems(values.slice(0, 40)); setActive(values.length ? 0 : -1); })
        .catch(() => { if (!controller.signal.aborted) setItems([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query, type, categoryId]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return <div className="uz-combo">
    <div className="uz-combo-box">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        className="uz-input"
        placeholder={value || placeholder}
        title={value || undefined}
        value={open ? query : value}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => { setOpen(false); setQuery(""); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(items.length - 1, index + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
          else if (event.key === "Enter" && open && active >= 0 && items[active]) { event.preventDefault(); choose(items[active]); }
          else if (event.key === "Escape") { setOpen(false); setQuery(""); }
        }}
      />
      {value && !open && <button type="button" className="uz-combo-clear" aria-label={t("uzum.combo.clear")} onClick={() => { onChange(""); inputRef.current?.focus(); }}>×</button>}
      <span className="uz-combo-caret" aria-hidden="true" />
    </div>
    {open && <ul className="uz-combo-list" id={listId} role="listbox">
      {loading && !items.length && <li className="uz-combo-note">{t("uzum.combo.searching")}</li>}
      {!loading && !items.length && <li className="uz-combo-note">{t("uzum.combo.empty")}<small>{t("uzum.combo.pick")}</small></li>}
      {items.map((item, index) => <li
        key={item}
        id={`${listId}-${index}`}
        role="option"
        aria-selected={item === value}
        className={index === active ? "is-active" : ""}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(item)}
      >{item}{item === value && <span aria-hidden="true">✓</span>}</li>)}
    </ul>}
    {quick?.length ? <div className="uz-quick">
      {quick.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(value === option.value ? "" : option.value)}>{option.label}</button>)}
    </div> : null}
  </div>;
}

/** Ikki tilli matn maydoni: RU va UZ yonma-yon (telefonda ustma-ust). */
export function BilingualText({ base, label, values, ai, multiline, rows = 3, errors, onChange, optional, hint }: {
  base: string;
  label: string;
  values: { ru: string; uz: string };
  ai: Record<string, string>;
  multiline?: boolean;
  rows?: number;
  errors: { ru?: string; uz?: string };
  onChange: (lang: "ru" | "uz", value: string) => void;
  optional?: boolean;
  hint?: string;
}) {
  const { t } = useLanguage();
  return <div className="uz-bi">
    {(["ru", "uz"] as const).map((lang) => {
      const key = `${base}${lang === "ru" ? "Ru" : "Uz"}`;
      const id = `uzf-${key}`;
      const value = values[lang];
      const fromAi = Boolean(ai[key]) && ai[key] === value;
      const common = {
        id,
        className: "uz-input",
        value,
        "aria-invalid": errors[lang] ? true : undefined,
        "aria-describedby": errors[lang] ? `${id}-error` : undefined,
        lang: lang === "ru" ? "ru" : "uz",
      } as const;
      return <Field
        key={lang}
        id={id}
        label={<>{label} <i className="uz-lang">{lang === "ru" ? t("uzum.ru") : t("uzum.uz")}</i></>}
        optional={optional}
        badge={fromAi ? <AiBadge /> : null}
        error={errors[lang]}
        hint={hint}
        counter={t("uzum.product.chars", { n: value.length })}
        className={fromAi ? "is-ai" : ""}
      >
        {multiline
          ? <textarea {...common} rows={rows} onChange={(event) => onChange(lang, event.target.value)} />
          : <input {...common} onChange={(event) => onChange(lang, event.target.value)} />}
      </Field>;
    })}
  </div>;
}

/** API xabarini (`message`) ko'rsatamiz; tarmoq uzilsa — tushunarli matn. */
export function apiMessage(reason: unknown, t: T, fallback = "uzum.errors.generic"): string {
  if (reason instanceof UzumApiError) {
    if (reason.status === 0) return t("uzum.errors.network");
    if (reason.message) return reason.message;
  }
  return t(fallback);
}

export function XlsmGlyph() {
  return <svg className="uz-xlsm" viewBox="0 0 28 32" width="22" height="25" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M4 2h14l6 6v22H4z" /><path d="M18 2v6h6" /><path d="M9 14h10M9 19h10M9 24h10M14 14v10" />
  </svg>;
}
