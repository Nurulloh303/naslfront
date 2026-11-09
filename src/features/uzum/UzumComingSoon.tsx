import { useAccount } from "../../app/account/AccountContext";
import { CabinetFooter, CabinetHeader } from "../../app/cabinet/CabinetHeader";
import type { CabinetRoute } from "../../app/routes";
import { useLanguage } from "../../i18n/LanguageContext";
import { XlsmGlyph } from "./fields";
import "./uzum.css";

/** «Uzum uchun Excel» yopiq paytdagi sahifa (flags.ts → UZUM_EXPORT_ENABLED). */
export function UzumComingSoon({ onNavigate, onLogout }: { onNavigate: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { account } = useAccount();
  const { t } = useLanguage();
  if (!account) return null;
  return <main className="reference-app cabinet-page uz-page">
    <CabinetHeader route="uzum" balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content">
      <div className="uz-soon-card">
        <XlsmGlyph />
        <span className="uz-soon-badge">{t("uzum.soonBadge")}</span>
        <h1>{t("uzum.soonTitle")}</h1>
        <p>{t("uzum.soonText")}</p>
        <button type="button" className="button primary" onClick={() => onNavigate("create")}>{t("uzum.soonBack")}</button>
      </div>
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}
