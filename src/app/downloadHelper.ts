/**
 * Cross-origin xavfsiz fayl yuklab olish yordamchisi.
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
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    const cleanName = url.split("?")[0].split("/").pop();
    link.download = cleanName && cleanName.includes(".") ? cleanName : defaultFilename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
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
