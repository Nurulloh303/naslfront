import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext";
import { BrandMark } from "../BrandMark";
import type { CabinetRoute } from "../routes";
import { useLanguage } from "../../i18n/LanguageContext";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { ThemeSwitcher } from "../ThemeSwitcher";

/** Ijtimoiy tarmoqlar — bitta joyda, o'zgartirish oson. */
const SOCIALS: Array<{ label: string; handle: string; url: string }> = [
  { label: "Instagram", handle: "@naslai.uz", url: "https://www.instagram.com/naslai.uz/" },
  { label: "Telegram", handle: "@naslaiuz", url: "https://t.me/naslaiuz" },
  { label: "Telegram", handle: "@naslaiadmin", url: "https://t.me/naslaiadmin" },
];

type Props = { route: CabinetRoute; balance: number; onNavigate: (route: CabinetRoute) => void; onLogout?: () => void };

type ProfileMenuProps = {
  route?: CabinetRoute;
  balance: number;
  onNavigate: (route: CabinetRoute) => void;
  onLogout?: () => void;
};

export function ProfileMenu({ route, balance, onNavigate, onLogout }: ProfileMenuProps) {
  const { account } = useAccount();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const go = (target: CabinetRoute) => {
    setOpen(false);
    onNavigate(target);
  };

  return <div className="profile-wrap" ref={wrapRef}>
    <button ref={triggerRef} className="reference-profile" type="button" aria-label={t("nav.profileAria")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="profile-spark">✦</span><b>{balance}</b><i>{account?.user.name.trim().charAt(0).toUpperCase() || "A"}</i>
    </button>
    {open && <div className="profile-popover profile-menu" role="menu" aria-label={t("nav.profileAria")}>
      <button className="profile-menu-action" type="button" role="menuitem" onClick={() => go("billing")}><b>{t("profileMenu.topUp")}</b><span>+</span></button>
      <button type="button" role="menuitem" aria-current={route === "profile" ? "page" : undefined} onClick={() => go("profile")}><b>{t("profileMenu.profile")}</b><span>♙</span></button>
      {account?.isAdmin && <button type="button" role="menuitem" onClick={() => go("admin")}><b>Админка</b><span>⚙</span></button>}
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout?.(); }}><b>{t("profileMenu.logout")}</b><span>↪</span></button>
    </div>}
  </div>;
}

export function CabinetHeader({ route, balance, onNavigate, onLogout }: Props) {
  const { t } = useLanguage();
  return <header className="reference-header">
    <button className="reference-brand brand-button" type="button" onClick={() => onNavigate("create")}><BrandMark size={24} /> {t("common.brand")}</button>
    <div className="reference-header-nav">
      <button type="button" aria-current={route === "create" ? "page" : undefined} onClick={() => onNavigate("create")}>{t("nav.createCard")}</button>
      <button type="button" className="header-create" onClick={() => onNavigate("create")}>{t("nav.newProject")}</button>
      <button type="button" aria-current={route === "projects" ? "page" : undefined} onClick={() => onNavigate("projects")}>{t("nav.allProjects")}</button>
      <button type="button" className="nav-listing" aria-current={route === "listing" ? "page" : undefined} onClick={() => onNavigate("listing")}>{t("listing.nav")}</button>
      <button type="button" className="nav-audit" aria-current={route === "audit" ? "page" : undefined} onClick={() => onNavigate("audit")}>{t("audit.nav")}</button>
    </div>
    <ProfileMenu route={route} balance={balance} onNavigate={onNavigate} onLogout={onLogout} />
  </header>;
}

export function CabinetFooter({ onNavigate }: { onNavigate?: (route: CabinetRoute) => void }) {
  const { t } = useLanguage();
  const openTelegram = (path: string) => window.open(`https://t.me/${path}`, "_blank", "noopener,noreferrer");

  return <footer className="reference-footer">
    <div className="footer-brand">
      <b><BrandMark size={24} /> {t("common.brand")}</b>
      <p>{t("footer.tagline")}</p>
      <div className="footer-socials">
        {SOCIALS.map((social) => <a key={social.url} href={social.url} target="_blank" rel="noopener noreferrer" title={`${social.label} ${social.handle}`}>{social.handle}</a>)}
      </div>
    </div>

    <div>
      <span>{t("footer.product")}</span>
      <button type="button" onClick={() => onNavigate?.("create")}>{t("footer.home")}</button>
      <button type="button" onClick={() => openTelegram("naslaiuz")}>{t("footer.telegramChannel")}</button>
    </div>

    <div>
      <span>{t("footer.help")}</span>
      <button type="button" onClick={() => openTelegram("naslaiadmin")}>{t("footer.telegramHelp")}</button>
      <button type="button" onClick={() => openTelegram("naslaiadmin")}>{t("footer.helpChat")}</button>
    </div>

    <div>
      <span>{t("footer.docs")}</span>
      <button type="button" onClick={() => onNavigate?.("privacy")}>{t("footer.privacy")}</button>
      <button type="button" onClick={() => onNavigate?.("terms")}>{t("footer.terms")}</button>
      <button type="button" onClick={() => onNavigate?.("offer")}>{t("footer.offer")}</button>
    </div>

    <small>{t("footer.copyright")}</small>
    <div className="footer-language"><ThemeSwitcher /><small>{t("footer.languageLabel")}:</small><LanguageSwitcher /></div>
  </footer>;
}
