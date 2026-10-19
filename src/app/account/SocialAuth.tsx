import { useEffect, useRef, useState } from "react";
import { accountApi, type AuthProviders } from "./accountApi";
import { useAccount } from "./AccountContext";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Kirish: Google va Telegram.
 *
 * Nima uchun kerak: email+parol bilan istalgan odam o'nta soxta pochta
 * ochib, har safar bepul tokenlarni olardi. Google va Telegram akkaunti
 * telefonga bog'langan — soxta akkaunt endi tekin emas.
 *
 * Ikkala skript ham TASHQI. Ular sahifa ochilganda emas, faqat server
 * shu usulni yoqqan bo'lsa yuklanadi: sozlanmagan provayder uchun begona
 * skriptni tortib o'tirishning ma'nosi yo'q.
 */

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: Record<string, unknown>) => void; renderButton: (el: HTMLElement, options: Record<string, unknown>) => void } } };
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

function loadScript(src: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Skript yuklanmadi: ${src}`));
    document.head.appendChild(script);
  });
}

export function SocialAuth({ onError, divider = true }: { onError: (message: string) => void; divider?: boolean }) {
  const { t, language } = useLanguage();
  const { loginWithGoogle, loginWithTelegram } = useAccount();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const telegramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    accountApi.authProviders().then(setProviders).catch(() => setProviders(null));
  }, []);

  // --- Google ---
  useEffect(() => {
    if (!providers?.google || !providers.googleClientId || !googleRef.current) return;
    let cancelled = false;
    loadScript("https://accounts.google.com/gsi/client", "google-gsi")
      .then(() => {
        if (cancelled || !googleRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: providers.googleClientId,
          callback: (payload: { credential?: string }) => {
            if (!payload.credential) { onError(t("auth.social.failed")); return; }
            void loginWithGoogle(payload.credential).catch((reason) => {
              onError(reason instanceof Error ? reason.message : t("auth.social.failed"));
            });
          },
        });
        window.google.accounts.id.renderButton(googleRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          width: 320,
          locale: language === "ru" ? "ru" : "uz",
        });
      })
      .catch(() => onError(t("auth.social.scriptFailed")));
    return () => { cancelled = true; };
  }, [providers, language, loginWithGoogle, onError, t]);

  // --- Telegram ---
  useEffect(() => {
    if (!providers?.telegram || !providers.telegramBot || !telegramRef.current) return;
    const mount = telegramRef.current;
    // Telegram widget natijani global funksiya orqali qaytaradi — boshqa
    // yo'li yo'q, shuning uchun uni vaqtincha window ga qo'yamiz.
    window.onTelegramAuth = (user) => {
      void loginWithTelegram(user).catch((reason) => {
        onError(reason instanceof Error ? reason.message : t("auth.social.failed"));
      });
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", providers.telegramBot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "20");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    mount.appendChild(script);
    return () => {
      mount.innerHTML = "";
      delete window.onTelegramAuth;
    };
  }, [providers, loginWithTelegram, onError, t]);

  if (!providers || (!providers.google && !providers.telegram)) return null;

  return <div className="social-auth">
    {divider && <div className="social-auth-divider"><span>{t("auth.social.or")}</span></div>}
    <div className="social-auth-buttons">
      {providers.google && <div ref={googleRef} className="social-auth-google" />}
      {providers.telegram && <div ref={telegramRef} className="social-auth-telegram" />}
    </div>
    <p className="social-auth-note">{t("auth.social.note")}</p>
  </div>;
}
