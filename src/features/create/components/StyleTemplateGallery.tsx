import { useEffect, useState } from "react";
import { apiUrl } from "../../../app/apiClient";
import { useLanguage } from "../../../i18n/LanguageContext";
import { prepareImageDataUrl } from "../domain/prepareImage";

type Template = { id: string; category: string; url: string };

/**
 * Галерея готовых шаблонов дизайна.
 *
 * Раньше единственный способ получить референс для "Ko'chirish" —
 * самому найти и загрузить чужую карточку. Теперь можно выбрать из ~130
 * готовых примеров, размеченных по тем же 8 стилям, что и обычные
 * пресеты (см. scripts/classify-style-templates.mjs). Клик по превью
 * подставляет его как обычный референс — дальше всё идёт тем же путём,
 * что и при ручной загрузке.
 */
export function StyleTemplateGallery({
  disabled,
  onSelect,
  open: controlledOpen,
  onOpenChange,
}: {
  disabled: boolean;
  onSelect: (payload: { url: string; name: string; dataUrl: string }) => void;
  /** Berilsa, panel tashqi tugma bilan boshqariladi — o'z ochish tugmasi chizilmaydi. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (updater: boolean | ((value: boolean) => boolean)) => {
    const next = typeof updater === "function" ? (updater as (value: boolean) => boolean)(open) : updater;
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");

  // Список грузим лениво: он один на всех и не меняется во время сессии,
  // повторный fetch при закрытии/открытии панели ни к чему.
  useEffect(() => {
    if (!open || templates !== null) return;
    fetch(apiUrl("/api/style-templates"))
      .then((res) => res.json())
      .then((payload: { templates: Template[] }) =>
        setTemplates((payload.templates ?? []).map((item) => ({ ...item, url: apiUrl(item.url) }))))
      .catch(() => setLoadError(true));
  }, [open, templates]);

  const categories = ["all", ...Array.from(new Set((templates ?? []).map((item) => item.category)))
    .filter((id) => id !== "other")];
  const shown = category === "all" ? templates ?? [] : (templates ?? []).filter((item) => item.category === category);

  const pick = async (item: Template) => {
    setPickingId(item.id);
    setPickError("");
    try {
      const blob = await fetch(item.url).then((res) => res.blob());
      const file = new File([blob], item.id, { type: blob.type });
      const dataUrl = await prepareImageDataUrl(file);
      onSelect({ url: item.url, name: `${t("settings.copyStyle.templateGallery.namePrefix")} — ${t(`settings.styles.${item.category}`)}`, dataUrl });
      setOpen(false);
    } catch {
      setPickError(t("settings.copyStyle.templateGallery.pickFailed"));
    } finally {
      setPickingId(null);
    }
  };

  return <div className="template-gallery">
    {!isControlled && <button type="button" className="button secondary template-gallery-toggle" disabled={disabled} onClick={() => setOpen((value) => !value)}>
      {open ? t("settings.copyStyle.templateGallery.close") : t("settings.copyStyle.templateGallery.open")}
    </button>}

    {open && <div className="template-gallery-panel">
      {loadError ? <p className="field-error" role="alert">{t("settings.copyStyle.templateGallery.loadFailed")}</p> : null}
      {templates === null && !loadError ? <p className="template-gallery-loading">{t("settings.copyStyle.templateGallery.loading")}</p> : null}

      {templates !== null && templates.length === 0 ? <p className="template-gallery-loading">{t("settings.copyStyle.templateGallery.empty")}</p> : null}

      {templates !== null && templates.length > 0 && <>
        {categories.length > 2 && <div className="template-gallery-filters" role="tablist">
          {categories.map((id) => <button
            key={id}
            type="button"
            role="tab"
            aria-selected={category === id}
            onClick={() => setCategory(id)}
          >
            {id === "all" ? t("settings.copyStyle.templateGallery.allCategories") : t(`settings.styles.${id}`)}
          </button>)}
        </div>}

        <div className="template-gallery-grid">
          {shown.map((item) => <button
            key={item.id}
            type="button"
            className="template-gallery-tile"
            disabled={disabled || pickingId !== null}
            aria-busy={pickingId === item.id}
            onClick={() => void pick(item)}
          >
            <img src={item.url} alt={t(`settings.styles.${item.category}`)} loading="lazy" />
            {pickingId === item.id ? <span className="template-gallery-tile-spinner" aria-hidden="true" /> : null}
          </button>)}
        </div>
      </>}

      {pickError && <p className="field-error" role="alert">{pickError}</p>}
    </div>}
  </div>;
}
