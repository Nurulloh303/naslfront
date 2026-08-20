/**
 * Подготовка фото перед отправкой на сервер.
 *
 * Зачем это появилось: телефон снимает 4000×3000, файл 5–8 МБ. В base64 он
 * распухает ещё на треть, и такой запрос:
 *  - рвётся на прокси dev-сервера (в логе `http proxy error … write EPIPE`);
 *  - долго грузится в хранилище поставщика;
 *  - заставляет модель разбора ждать минуту и упираться в таймаут.
 *
 * Карточка всё равно рендерится 1080×1440, поэтому сторона больше 1600 px
 * не нужна никому: ни модели, ни человеку. Уменьшаем в браузере — сервер
 * получает 300–600 КБ вместо 8 МБ.
 */

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.86;
/** Меньше этого не трогаем: пережимать маленький файл смысла нет. */
const SKIP_BELOW_BYTES = 400 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read")));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode"));
    image.src = dataUrl;
  });
}

/**
 * Возвращает data-url: уменьшённый, если фото большое, и исходный, если
 * оно и так небольшое. При любой ошибке отдаём исходник — потеря веса не
 * стоит того, чтобы человек не смог загрузить фото вообще.
 */
export async function prepareImageDataUrl(file: File, maxSide = MAX_SIDE): Promise<string> {
  const original = await readAsDataUrl(file);
  if (file.size <= SKIP_BELOW_BYTES) return original;

  try {
    const image = await loadImage(original);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (longest <= maxSide) return original;

    const scale = maxSide / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return original;
    // Сглаживание важно: без него мелкие надписи на упаковке рассыпаются,
    // а их читает модель разбора.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const resized = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return resized.length < original.length ? resized : original;
  } catch {
    return original;
  }
}
