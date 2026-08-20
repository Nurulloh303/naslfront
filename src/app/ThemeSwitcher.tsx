import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * Yorug'/qorong'i mavzu almashtirgichi.
 *
 * Mavzu <html data-theme="dark"> atributi orqali ishlaydi — barcha ranglar
 * tokens.css dagi CSS o'zgaruvchilardan olinadi, shuning uchun birorta ham
 * komponentni o'zgartirish shart emas.
 *
 * Tanlov localStorage'da saqlanadi; birinchi kirishda tizim sozlamasi
 * (prefers-color-scheme) hisobga olinadi.
 */

const STORAGE_KEY = "naslai:theme";
export type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* приватный режим — читаем системную настройку */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyStoredTheme() {
  document.documentElement.dataset.theme = readInitialTheme();
}

export function ThemeSwitcher() {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* не критично */ }
  }, [theme]);

  const options: Array<[Theme, string, string]> = [
    ["light", "☀", t("theme.light")],
    ["dark", "☾", t("theme.dark")],
  ];

  return <div className="theme-switcher" role="group" aria-label={t("theme.label")}>
    {options.map(([value, icon, label]) => <button
      key={value}
      type="button"
      aria-pressed={theme === value}
      title={label}
      onClick={() => setTheme(value)}
    >
      <span aria-hidden="true">{icon}</span>
      <b>{label}</b>
    </button>)}
  </div>;
}
