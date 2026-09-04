import { useEffect, useState } from "react";
import { apiUrl } from "../../../app/apiClient";

/**
 * По одному примеру-фото на каждый стиль пресета — для плиток в галерее
 * стилей (`CardSettings`). Раньше там были только абстрактные цветные
 * превью: честно, но продавцу трудно понять, что реально получится.
 *
 * Берём первый шаблон подходящей категории из той же галереи, что и
 * "Ko'chirish" (см. `StyleTemplateGallery`, `scripts/classify-style-
 * templates.mjs`). Если разметка ещё не запускалась — манифест пуст,
 * и плитки просто остаются с прежним цветовым превью: ничего не ломается.
 */
export function useStyleTemplateSamples(): Record<string, string> {
  const [samples, setSamples] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    fetch(apiUrl("/api/style-templates"))
      .then((res) => res.json())
      .then((payload: { templates: { category: string; url: string }[] }) => {
        if (!active) return;
        const byCategory: Record<string, string> = {};
        for (const item of payload.templates ?? []) {
          if (!byCategory[item.category]) byCategory[item.category] = apiUrl(item.url);
        }
        setSamples(byCategory);
      })
      .catch(() => { /* нет сети или манифеста — плитки останутся цветными */ });
    return () => { active = false; };
  }, []);

  return samples;
}
