/**
 * Fayl yuklab olish yordamchilari (kompyuter va telefon uchun).
 *
 * - `downloadFile(url)` — server URL'idagi faylni blob qilib yuklab beradi
 *   (cross-origin URL'larda `download` atributi e'tiborsiz qoldiriladi).
 * - `downloadBlob(blob, filename)` — brauzerda yig'ilgan rasmni (canvas) saqlaydi.
 *   Telefonda avval tizim "Ulashish" oynasini ochadi (u yerda "Rasmni saqlash"
 *   → galereya), bo'lmasa oddiy `<a download>`. iOS'da esa foydalanuvchi
 *   bosishi kerak bo'lgan holatni qaytaradi (`needs-gesture`) — UI rasmni
 *   ko'rsatib, "bosib turing va saqlang" deb yozadi.
 */

export type DownloadOutcome =
  /** Tizim ulashish oynasi orqali saqlandi/ulashildi. */
  | "shared"
  /** Foydalanuvchi ulashish oynasini yopdi. */
  | "cancelled"
  /** `<a download>` orqali fayl yuklab olindi. */
  | "downloaded"
  /** Avtomatik saqlab bo'lmadi: foydalanuvchi o'zi bosishi kerak (iOS). */
  | "needs-gesture";

export type ShareOutcome = "shared" | "cancelled" | "blocked" | "unsupported";

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ o'zini "Macintosh" deb tanishtiradi — sensorli ekran bo'yicha ajratamiz.
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIOSDevice() || /Android|Mobi|Mobile/i.test(navigator.userAgent || "");
}

export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/png", lastModified: Date.now() });
}

/** Brauzer fayllarni ulasha oladimi (Web Share API Level 2). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Tizim "Ulashish" oynasini ochadi. Foydalanuvchi bosgan zahoti chaqirilishi
 * kerak — aks holda brauzer `NotAllowedError` bilan rad etadi (`blocked`).
 */
export async function shareFile(file: File, title?: string): Promise<ShareOutcome> {
  if (!canShareFile(file)) return "unsupported";
  try {
    await navigator.share({ files: [file], title: title ?? file.name });
    return "shared";
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : "";
    if (name === "AbortError") return "cancelled";
    return "blocked";
  }
}

/** Blob'ni oddiy `<a download>` orqali saqlaydi (kompyuter, Android). */
export function saveBlobAsFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari yuklashni biroz kechiktirib boshlaydi — URL'ni darhol bekor qilmaymiz.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Blob'ni yangi tabda ochadi (iOS: "bosib turing → Rasmni saqlash"). */
export function openBlobInNewTab(blob: Blob): boolean {
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  return Boolean(opened);
}

/**
 * Brauzerda tayyorlangan rasmni saqlaydi.
 *
 * Telefon: ulashish oynasi (galereyaga saqlash) → Android'da `<a download>` →
 * iOS'da `needs-gesture` (UI rasmni ko'rsatadi). Kompyuter: `<a download>`.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<DownloadOutcome> {
  if (isMobileDevice()) {
    const outcome = await shareFile(blobToFile(blob, filename));
    if (outcome === "shared") return "shared";
    if (outcome === "cancelled") return "cancelled";
    // iOS'da `<a download>` rasmni "Fayllar"ga tashlaydi, galereyaga emas, va
    // ba'zi brauzerlarda (Telegram, Instagram ichidagi) umuman ishlamaydi.
    if (isIOSDevice()) return "needs-gesture";
  }
  saveBlobAsFile(blob, filename);
  return "downloaded";
}

/**
 * Cross-origin xavfsiz fayl yuklab olish.
 *
 * Brauzerlar 'download' atributini cross-origin URL'lar (masalan: api.naslai.uz)
 * uchun e'tiborsiz qoldirib, yangi tabda yoki joriy oynada ochib yuboradi.
 * Ushbu funksiya faylni blob qilib oladi va brauzer orqali haqiqiy fayl sifatida yuklab beradi.
 */
export async function downloadFile(url: string, defaultFilename = "naslai-karta.png"): Promise<void> {
  if (!url) return;
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Tarmoq xatosi");
    const blob = await response.blob();
    const cleanName = url.split("?")[0].split("/").pop();
    saveBlobAsFile(blob, cleanName && cleanName.includes(".") ? cleanName : defaultFilename);
  } catch {
    // Agar CORS yoki fetch bloklansa, to'g'ridan-to'g'ri havolani bosish
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultFilename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.append(link);
    link.click();
    link.remove();
  }
}
