import { useEffect, useState } from "react";
import { apiUrl } from "../../../app/apiClient";
import { prepareImageDataUrl } from "../domain/prepareImage";

/**
 * Галерея готовых шаблонов (backend: style_templates/manifest.json).
 *
 * Один и тот же список нужен плиткам пресетов (обложка каждого стиля) и
 * галерее «Shablonlar», поэтому запрос один на сессию: промис кэшируется на
 * уровне модуля. Ошибку не кэшируем — следующий монтаж попробует снова.
 */
export type StyleTemplate = {
  id: string;
  category: string;
  /** Asl rasm (≤1080 px) — dizayn referensi sifatida shu yuboriladi. */
  url: string;
  /** Kichik nusxa (~240 px) — faqat setkadagi prevyu uchun, mobilda tez. */
  thumb: string;
  cover: boolean;
};

let templatesPromise: Promise<StyleTemplate[]> | null = null;

export function fetchStyleTemplates(): Promise<StyleTemplate[]> {
  if (!templatesPromise) {
    templatesPromise = fetch(apiUrl("/api/style-templates"))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload: { templates?: Array<Partial<StyleTemplate>> }) => (payload.templates ?? [])
        .filter((item): item is StyleTemplate => Boolean(item.id && item.category && item.url))
        .map((item) => ({ ...item, cover: item.cover === true, url: apiUrl(item.url), thumb: apiUrl(item.thumb || item.url) })))
      .catch((error: unknown) => {
        templatesPromise = null;
        throw error;
      });
  }
  return templatesPromise;
}

/** Шаблон — это наш URL галереи, а не blob: от загрузки продавцом. */
export function isStyleTemplateUrl(url: string): boolean {
  return url.includes("/api/style-templates/");
}

/** Картинка шаблона → data URL тем же путём, что и ручная загрузка референса. */
export async function loadStyleTemplateDataUrl(item: { id: string; url: string }): Promise<string> {
  const blob = await fetch(item.url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  });
  return prepareImageDataUrl(new File([blob], item.id, { type: blob.type || "image/jpeg" }));
}

export function useStyleTemplates(): { templates: StyleTemplate[] | null; failed: boolean } {
  const [templates, setTemplates] = useState<StyleTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetchStyleTemplates()
      .then((list) => { if (active) setTemplates(list); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return { templates, failed };
}

/**
 * Обложка каждого стиля для плиток в `CardSettings`: шаблон с cover: true,
 * а если такого нет — первый в категории. Пустой объект (нет сети или
 * манифеста) — плитки остаются с цветовым превью.
 */
export function useStyleTemplateSamples(): Record<string, StyleTemplate> {
  const { templates } = useStyleTemplates();
  const byCategory: Record<string, StyleTemplate> = {};
  for (const item of templates ?? []) {
    const current = byCategory[item.category];
    if (!current || (item.cover && !current.cover)) byCategory[item.category] = item;
  }
  return byCategory;
}
