import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { blobToFile, canShareFile, saveBlobAsFile, shareFile } from "../../../../app/downloadHelper";

type ConfirmProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Kichik ilova ichidagi tasdiqlash oynasi (window.confirm o'rniga). */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="magic-dialog-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="magic-dialog" role="alertdialog" aria-modal="true" aria-labelledby="magic-confirm-title" aria-describedby="magic-confirm-text">
        <h3 id="magic-confirm-title">{title}</h3>
        <p id="magic-confirm-text">{message}</p>
        <div className="magic-dialog-actions">
          <button ref={cancelRef} type="button" className="magic-btn magic-btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="magic-btn magic-btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

type DownloadSheetProps = {
  blob: Blob;
  filename: string;
  onClose: () => void;
};

/**
 * Avtomatik saqlab bo'lmaganda (iOS Safari, ilova ichidagi brauzerlar):
 * rasmni ko'rsatamiz — uni bosib turib "Rasmni saqlash" mumkin — va har bir
 * tugma foydalanuvchining bevosita bosishi bilan ishlaydi.
 */
export function DownloadReadySheet({ blob, filename, onClose }: DownloadSheetProps) {
  const { t } = useLanguage();
  const objectUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  const file = useMemo(() => blobToFile(blob, filename), [blob, filename]);
  const [shareError, setShareError] = useState(false);
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const share = async () => {
    const outcome = await shareFile(file);
    if (outcome === "shared") onClose();
    else if (outcome === "blocked" || outcome === "unsupported") setShareError(true);
  };

  return (
    <div className="magic-dialog-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="magic-dialog magic-download-sheet" role="dialog" aria-modal="true" aria-labelledby="magic-download-title">
        <h3 id="magic-download-title">{t("magicLayers.downloadReadyTitle")}</h3>
        <p>{t("magicLayers.downloadReadyText")}</p>
        <img src={objectUrl} alt={filename} className="magic-download-preview" />
        {shareError ? <p className="magic-inline-error">{t("magicLayers.shareFailed")}</p> : null}
        <div className="magic-dialog-actions is-stacked">
          {canShareFile(file) ? (
            <button type="button" className="magic-btn magic-btn-primary" onClick={() => void share()}>
              📲 {t("magicLayers.shareSave")}
            </button>
          ) : null}
          <button type="button" className="magic-btn magic-btn-secondary" onClick={() => saveBlobAsFile(blob, filename)}>
            ⬇ {t("magicLayers.downloadFile")}
          </button>
          <a className="magic-btn magic-btn-secondary" href={objectUrl} target="_blank" rel="noopener">
            ↗ {t("magicLayers.openNewTab")}
          </a>
          <button type="button" className="magic-btn magic-btn-ghost" onClick={onClose}>{t("magicLayers.close")}</button>
        </div>
      </div>
    </div>
  );
}
