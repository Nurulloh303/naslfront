import { useRef, useState, type ChangeEvent } from "react";
import { useAccount } from "../account/AccountContext";
import { accountApi, type ProductListing } from "../account/accountApi";
import type { CabinetRoute } from "../routes";
import { CabinetFooter, CabinetHeader } from "./CabinetHeader";
import { useLanguage } from "../../i18n/LanguageContext";
import { prepareImageDataUrl } from "../../features/create/domain/prepareImage";
import { MAX_UPLOAD_BYTES } from "../../features/create/domain/uploadLimits";
import { ListingResult } from "../../features/create/components/ListingBlocks";

/**
 * «Tavsif yozish» — текст карточки для Uzum по фотографии товара.
 *
 * Бесплатно и без списания токенов: это вход в продукт. Человек получает
 * пользу раньше, чем платит, и по качеству текста решает, доверять ли нам
 * картинку.
 *
 * Всё выдаётся сразу на двух языках двумя колонками. На Uzum продавец
 * обязан заполнить и узбекское, и русское поле — иначе он пошёл бы
 * переводить руками.
 */

export function ListingPage({ onNavigate, onLogout }: { onNavigate: (route: CabinetRoute) => void; onLogout?: () => void }) {
  const { account } = useAccount();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listing, setListing] = useState<ProductListing | null>(null);

  if (!account) return null;

  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(t("listing.invalidType")); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError(t("listing.maxSize")); return; }
    try {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      setImageDataUrl(await prepareImageDataUrl(file));
      setError("");
    } catch { setError(t("listing.readFailed")); }
  };

  const run = async () => {
    if (!imageDataUrl) { setError(t("listing.needImage")); return; }
    setBusy(true);
    setError("");
    try {
      const data = await accountApi.generateListing({ imageDataUrl, marketplace: "uzum", hint: hint.trim() });
      setListing(data.listing);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("listing.failed"));
    } finally {
      setBusy(false);
    }
  };

  return <main className="reference-app cabinet-page">
    <CabinetHeader route="listing" balance={account.balance} onNavigate={onNavigate} onLogout={onLogout} />
    <section className="cabinet-content">
      <div className="cabinet-page-heading">
        <div>
          <p className="eyebrow">{t("cabinet.eyebrow")}</p>
          <h1>{t("listing.title")}</h1>
          <p className="audit-lead">{t("listing.lead")}</p>
        </div>
        <span className="route-chip">{t("listing.free")}</span>
      </div>

      <section className="cabinet-panel listing-form">
        <div className="listing-upload">
          <button type="button" className={`design-ref-tile ${preview ? "has-image" : ""}`} onClick={() => inputRef.current?.click()} disabled={busy}>
            {preview ? <img src={preview} alt="" /> : <span>+</span>}
          </button>
          <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pickFile(event)} />
          <div>
            <b>{t("listing.uploadTitle")}</b>
            <small>{t("listing.uploadHint")}</small>
          </div>
        </div>

        <label className="audit-field">
          <span>{t("listing.hintLabel")}</span>
          <input value={hint} onChange={(event) => setHint(event.target.value)} maxLength={200} placeholder={t("listing.hintPlaceholder")} />
        </label>

        {error && <p className="field-error" role="alert">{error}</p>}

        <button className="button primary" type="button" disabled={busy || !imageDataUrl} onClick={() => void run()}>
          {busy ? t("listing.working") : t("listing.action")}
        </button>
      </section>

      {listing && <>
        <ListingResult listing={listing} labels={{
          title: t("listing.blockTitle"),
          utp: t("listing.blockUtp"),
          short: t("listing.blockShort"),
          full: t("listing.blockFull"),
          characteristics: t("listing.blockCharacteristics"),
          keywords: t("listing.blockKeywords"),
          copy: t("listing.copy"),
        }} />
        <div className="audit-actions">
          <button className="button primary" type="button" onClick={() => onNavigate("create")}>{t("listing.toCard")}</button>
          <button className="button secondary" type="button" onClick={() => { setListing(null); setError(""); }}>{t("listing.again")}</button>
        </div>
      </>}
    </section>
    <CabinetFooter onNavigate={onNavigate} />
  </main>;
}
