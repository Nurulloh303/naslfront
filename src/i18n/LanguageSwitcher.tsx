import { useLanguage } from "./LanguageContext";
import type { Language } from "./translations";

const OPTIONS: Array<{ value: Language; label: string }> = [{ value: "uz", label: "UZ" }, { value: "ru", label: "RU" }];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  return <div className={`language-switcher ${className}`.trim()} role="group" aria-label="Interfeys tili / Язык интерфейса">
    {OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={language === option.value} onClick={() => setLanguage(option.value)}>{option.label}</button>)}
  </div>;
}
