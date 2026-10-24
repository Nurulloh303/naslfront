/**
 * Отрисовка текста поверх сгенерированного фона.
 *
 * Зачем это существует. Когда буквы рисует модель, они получаются
 * кривыми: «ЖЖ» слипается, «ў» и «қ» превращаются в мусор, в слове
 * появляется лишняя буква. Исправить можно было только новой генерацией
 * за токен — и с тем же шансом на брак.
 *
 * Здесь модель даёт только фон с товаром (см. cleanBackgroundPrompt на
 * сервере), а надписи кладёт браузер настоящим шрифтом. Буквы всегда
 * правильные, правка мгновенная и бесплатная.
 *
 * Модуль намеренно без зависимостей и без React: чистая функция от
 * (фон, текст, оформление) к картинке. Её же можно вызвать при
 * пакетной обработке, не открывая экран.
 */

export type TextLayerSlide = {
  headline: string;
  subtitle: string;
  lines: string[];
};

export type TextLayerStyle = {
  /** Куда положить заголовок. */
  placement: "top" | "bottom";
  /** Цвет текста. Плашки берут его же как заливку или как обводку. */
  color: string;
  /** Цвет плашек-фактов. */
  accent: string;
  /** Подложка под заголовком: помогает на пёстром фоне, мешает на чистом. */
  scrim: boolean;
  /** Множитель кегля: 1 — как задумано, ниже/выше — на вкус. */
  scale: number;
};

export const DEFAULT_TEXT_STYLE: TextLayerStyle = {
  placement: "top",
  color: "#ffffff",
  accent: "#ff5c2e",
  scrim: true,
  scale: 1,
};

/** Размер карточки маркетплейса. Тот же, что и у генерации. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440;

/**
 * Шрифт.
 *
 * Берём системный гротеск: он есть на любой машине, поддерживает
 * кириллицу и узбекскую латиницу с апострофами, и не требует загрузки
 * файла шрифта — иначе первая отрисовка шла бы по подменному шрифту и
 * буквы «прыгали» бы после загрузки.
 */
export const FONT_STACK = '"Inter", "Helvetica Neue", Arial, "Noto Sans", sans-serif';

/** Разбивает строку по словам так, чтобы каждая часть влезла в ширину. */
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (context.measureText(candidate).width <= maxWidth) current = candidate;
    else { lines.push(current); current = word; }
  }
  lines.push(current);
  return lines;
}

/**
 * Подбирает кегль так, чтобы заголовок занял отведённое место.
 *
 * Длина названия у продавцов гуляет от «СУМКА» до «Термокружка для авто
 * 510 мл»: фиксированный кегль либо теряется на карточке, либо вылезает
 * за край. Поэтому уменьшаем, пока не влезет в две строки.
 */
function fitHeadline(context: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number) {
  let size = startSize;
  for (let guard = 0; guard < 40; guard += 1) {
    context.font = `800 ${size}px ${FONT_STACK}`;
    const lines = wrap(context, text, maxWidth);
    if (lines.length <= 2 && lines.every((line) => context.measureText(line).width <= maxWidth)) {
      return { size, lines };
    }
    size -= 6;
    if (size < 36) {
      context.font = `800 ${size}px ${FONT_STACK}`;
      return { size, lines: wrap(context, text, maxWidth).slice(0, 3) };
    }
  }
  return { size, lines: [text] };
}

/** Плашка факта: скруглённый прямоугольник с текстом внутри. */
function drawPill(context: CanvasRenderingContext2D, text: string, x: number, y: number, height: number, style: TextLayerStyle) {
  const paddingX = height * 0.55;
  context.font = `600 ${Math.round(height * 0.42)}px ${FONT_STACK}`;
  const width = context.measureText(text).width + paddingX * 2;
  const radius = height / 2;

  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = style.accent;
  context.fill();

  context.fillStyle = readableOn(style.accent);
  context.textBaseline = "middle";
  context.fillText(text, x + paddingX, y + height / 2);
  return width;
}

/**
 * Чёрные буквы на светлой плашке, белые на тёмной.
 *
 * Без этой проверки оранжевая плашка с белым текстом читается, а жёлтая
 * с белым — нет.
 */
export function readableOn(hex: string): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  // Формула яркости из рекомендаций по контрасту: глаз видит зелёный
  // сильнее красного и намного сильнее синего.
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111111" : "#ffffff";
}

/**
 * Рисует текст поверх фона.
 *
 * @param canvas куда рисуем — размер выставляется здесь же
 * @param plate  фон от модели, уже загруженный
 */
export function drawTextLayer(
  canvas: HTMLCanvasElement,
  plate: CanvasImageSource | null,
  slide: TextLayerSlide,
  style: TextLayerStyle = DEFAULT_TEXT_STYLE,
): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  if (plate) context.drawImage(plate, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  else { context.fillStyle = "#1b1c20"; context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT); }

  const margin = 72;
  const maxWidth = CARD_WIDTH - margin * 2;
  const top = style.placement === "top";

  const headline = (slide.headline ?? "").trim();
  const subtitle = (slide.subtitle ?? "").trim();
  // trim до фильтра: строка из одних пробелов проходила проверку на
  // «непустая» и превращалась в пустую оранжевую плашку.
  const lines = (slide.lines ?? []).map((line) => String(line ?? "").trim()).filter(Boolean).slice(0, 3);

  const { size, lines: headlineLines } = fitHeadline(context, headline, maxWidth, Math.round(132 * style.scale));
  const lineHeight = size * 1.06;
  const subtitleSize = Math.round(size * 0.3);
  const blockHeight = headlineLines.length * lineHeight + (subtitle ? subtitleSize * 1.9 : 0);
  const blockTop = top ? margin : CARD_HEIGHT - margin - blockHeight - 150;

  // Подложка — мягкий градиент, а не плашка: на фото она незаметна, но
  // белые буквы на светлом небе перестают пропадать.
  if (style.scrim) {
    const gradient = top
      ? context.createLinearGradient(0, 0, 0, blockTop + blockHeight + 120)
      : context.createLinearGradient(0, CARD_HEIGHT, 0, blockTop - 120);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, top ? 0 : blockTop - 120, CARD_WIDTH, blockHeight + 240);
  }

  context.textBaseline = "top";
  context.fillStyle = style.color;
  context.font = `800 ${size}px ${FONT_STACK}`;
  headlineLines.forEach((line, index) => {
    context.fillText(line, margin, blockTop + index * lineHeight);
  });

  if (subtitle) {
    context.font = `500 ${subtitleSize}px ${FONT_STACK}`;
    context.globalAlpha = 0.92;
    context.fillText(subtitle, margin, blockTop + headlineLines.length * lineHeight + subtitleSize * 0.3);
    context.globalAlpha = 1;
  }

  // Факты — внизу в одну колонку. Больше трёх не ставим: на превью в
  // ленте маркетплейса они всё равно сливаются в серую массу.
  const pillHeight = Math.round(66 * style.scale);
  let pillY = CARD_HEIGHT - margin - lines.length * (pillHeight + 16) + 16;
  for (const line of lines) {
    drawPill(context, line, margin, pillY, pillHeight, style);
    pillY += pillHeight + 16;
  }
}

/** Загружает картинку из адреса. Нужен для фона перед отрисовкой. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Фон лежит на нашем же домене, но без этого canvas пометится как
    // «испорченный» и toDataURL бросит ошибку безопасности.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("PLATE_LOAD_FAILED"));
    image.src = src;
  });
}
