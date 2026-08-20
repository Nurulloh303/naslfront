import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANGUAGE_STORAGE_KEY, translations, type Language, type TranslationDict } from "./translations";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  dict: TranslationDict;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "uz";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "ru" ? "ru" : "uz";
}

function resolvePath(dict: TranslationDict, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((next: Language) => { setLanguageState(next); window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next); }, []);
  const dict = translations[language];
  const t = useCallback((path: string, vars?: Record<string, string | number>) => {
    const value = resolvePath(dict, path);
    return typeof value === "string" ? interpolate(value, vars) : path;
  }, [dict]);
  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage, dict, t }), [language, setLanguage, dict, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
}
