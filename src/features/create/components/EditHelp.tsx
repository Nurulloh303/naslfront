import { useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";

/** Qo'llanma video. ID alohida turadi — almashtirish oson bo'lsin. */
const TUTORIAL_VIDEO_ID = "XLdiA1-OZCA";
const CANVA_URL = "https://www.canva.com/";

/**
 * «O'zingiz tuzatmoqchimisiz?» bloki.
 *
 * Uchta ongli qaror:
 *  1. Kechirim so'ramaymiz. Karta yaratildi, matnni moslash — bu nosozlik
 *     emas, oddiy ish jarayoni. "Uzr" yozsak, mahsulot buzuq ko'rinadi.
 *  2. YouTube pleyeri DARROV yuklanmaydi. iframe har bir sahifa ochilishida
 *     ~700 KB skript va Google kuzatuvchilarini tortadi, hatto video
 *     ochilmasa ham. Shuning uchun avval o'z prevyumiz, iframe esa faqat
 *     bosilgandan keyin (va nocookie domenidan).
 *  3. Blok CHAP ustunda turadi. O'ng ustunda u natijani pastga surib
 *     yuborardi, chap tomonda esa bo'sh joy qolardi.
 */
export function EditHelp({ open, onToggle, onDownload }: { open: boolean; onToggle: () => void; onDownload: () => void }) {
  const { t } = useLanguage();
  const [playing, setPlaying] = useState(false);

  const openCanva = () => {
    onDownload();
    window.open(CANVA_URL, "_blank", "noopener,noreferrer");
  };

  return <div className={`edit-help ${open ? "is-open" : ""}`}>
    <button type="button" className="edit-help-toggle" aria-expanded={open} onClick={onToggle}>
      <span className="edit-help-badge" aria-hidden="true">▶</span>
      <b>{t("results.editHelp.toggle")}</b>
      <i aria-hidden="true">{open ? "⌃" : "⌄"}</i>
    </button>
    {open && <div className="edit-help-body">
      <p className="edit-help-lead">{t("results.editHelp.lead")}</p>
      <div className="edit-help-video">
        {playing
          ? <iframe
              src={`https://www.youtube-nocookie.com/embed/${TUTORIAL_VIDEO_ID}?autoplay=1&rel=0`}
              title={t("results.editHelp.videoTitle")}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          : <button type="button" className="edit-help-play" onClick={() => setPlaying(true)} aria-label={t("results.editHelp.play")}>
              <span className="edit-help-play-icon" aria-hidden="true">▶</span>
              <b>{t("results.editHelp.videoTitle")}</b>
              <small>{t("results.editHelp.videoNote")}</small>
            </button>}
      </div>
      <button type="button" className="button secondary edit-help-canva" onClick={openCanva}>{t("results.editHelp.canva")}</button>
      <small className="edit-help-hint">{t("results.editHelp.canvaHint")}</small>
    </div>}
  </div>;
}
