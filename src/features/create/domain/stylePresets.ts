/**
 * Стили карточки для галереи выбора.
 *
 * Идентификаторы должны совпадать с `server/styles.mjs`: сервер по ним
 * подставляет описание оформления в промпт. Здесь хранится только то, что
 * нужно интерфейсу — название и палитра для превью.
 *
 * Превью рисуется цветами, а не картинкой-примером. Показать «готовый
 * результат» было бы честно только если бы он был сгенерирован этим же
 * стилем на этом же товаре, а это невозможно до генерации.
 */
export type StylePreset = {
  id: string;
  /** Ключ перевода: settings.styles.<id>. */
  labelKey: string;
  /** Фон, акцент, подложка — в этом порядке. */
  palette: [string, string, string];
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: "minimal", labelKey: "minimal", palette: ["#f5f3ef", "#1c1c1c", "#c9c4bb"] },
  { id: "premium", labelKey: "premium", palette: ["#12100e", "#c8a250", "#efe7d8"] },
  { id: "bright", labelKey: "bright", palette: ["#ff7a1a", "#fff4e6", "#1c1c1c"] },
  { id: "lifestyle", labelKey: "lifestyle", palette: ["#d8c7b3", "#6d5c48", "#fdfaf6"] },
  { id: "tech", labelKey: "tech", palette: ["#0b1520", "#2ee6d6", "#e8f4ff"] },
  { id: "nature", labelKey: "nature", palette: ["#eaf1e4", "#3f6b3a", "#f7f5ee"] },
  { id: "bold", labelKey: "bold", palette: ["#111111", "#ff3b30", "#f2f2f2"] },
];
