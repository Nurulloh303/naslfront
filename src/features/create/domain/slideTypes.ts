/**
 * Типы слайдов пакета для маркетплейса.
 *
 * Раньше пакет был жёсткой пятёркой: hero, преимущества, контекст,
 * характеристики, доверие. Для футболки слайд «технические
 * характеристики» пустой, для дрели «контекст использования» — самый
 * важный. Теперь состав выбирает продавец.
 *
 * Идентификаторы обязаны совпадать с `SLIDE_TYPES` в `server/plan.mjs`:
 * сервер по ним подставляет фокус слайда в промпт. Здесь — только то,
 * что нужно интерфейсу.
 */
export const SLIDE_TYPE_IDS = [
  "main",
  "benefits",
  "sizes",
  "materials",
  "usage",
  "kit",
  "care",
  "beforeAfter",
] as const;

export type SlideTypeId = (typeof SLIDE_TYPE_IDS)[number];

/** Границы для числа слайдов — те же, что на сервере. */
export const MIN_PACKAGE_SLIDES = 3;
export const MAX_PACKAGE_SLIDES = 8;

/**
 * Подгоняет список тем под нужное число слайдов.
 *
 * Когда слайдов становится больше, добираем темы, которых ещё нет:
 * повторять «преимущества» дважды подряд бессмысленно.
 */
export function fitSlideTypes(current: string[], count: number): string[] {
  const valid = current.filter((id) => (SLIDE_TYPE_IDS as readonly string[]).includes(id));
  const next = valid.slice(0, count);
  for (const id of SLIDE_TYPE_IDS) {
    if (next.length >= count) break;
    if (!next.includes(id)) next.push(id);
  }
  // Тем всего восемь, но если вдруг попросят больше — дозаполним по кругу.
  while (next.length < count) next.push(SLIDE_TYPE_IDS[next.length % SLIDE_TYPE_IDS.length]);
  return next;
}
