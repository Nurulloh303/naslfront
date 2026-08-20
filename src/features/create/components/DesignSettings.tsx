import { marketplacePresets } from "../domain/marketplacePresets";
import type { GenerationSettings, Marketplace } from "../domain/types";
import { useLanguage } from "../../../i18n/LanguageContext";
import { Hint } from "./Hint";

type Props = { settings: GenerationSettings; disabled: boolean; onMarketplace: (value: Marketplace) => void; onChange: (patch: Partial<GenerationSettings>) => void };

export function DesignSettings({ settings, disabled, onMarketplace, onChange }: Props) {
  const { t } = useLanguage();
  const preset = marketplacePresets[settings.marketplace];
  return <div className="design-settings" aria-label={t("create.settingsTitle")}>
    <div className="settings-grid">
      <fieldset disabled={disabled}><legend>{t("settings.marketplace.legend")}<Hint text={t("hints.marketplace")} label={t("hints.aria")} /></legend><div className="segmented three">
        {(Object.keys(marketplacePresets) as Marketplace[]).map((marketplace) => <button type="button" key={marketplace} aria-pressed={settings.marketplace === marketplace} onClick={() => onMarketplace(marketplace)}><b>{marketplacePresets[marketplace].shortLabel}</b><span>{marketplacePresets[marketplace].label}</span></button>)}
      </div></fieldset>
      <div className="safe-zone"><span className="safe-zone-label">{preset.shortLabel} preset</span><p>{preset.safeZone}</p><small>{preset.hint}</small></div>
      <fieldset disabled={disabled}><legend>{t("settings.language.legend")}</legend><div className="segmented three"><button type="button" aria-pressed={settings.language === "uz"} onClick={() => onChange({ language: "uz" })}>UZ</button></div></fieldset>
      <fieldset disabled={disabled}><legend>{t("settings.cardStyle.legend")}<Hint text={t("hints.cardStyle")} label={t("hints.aria")} /></legend><div className="segmented two"><button type="button" aria-pressed={settings.style === "commercial"} onClick={() => onChange({ style: "commercial" })}>{t("settings.cardStyle.commercial")}</button><button type="button" aria-pressed={settings.style === "creative"} onClick={() => onChange({ style: "creative" })}>{t("settings.cardStyle.creative")}</button></div></fieldset>
      <div className="fixed-output-note"><b>{t("settings.outputSize.cardTitle")}</b><span>{t("settings.outputSize.cardNote")}</span></div>
    </div>
  </div>;
}
