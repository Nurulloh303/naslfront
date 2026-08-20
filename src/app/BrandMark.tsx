/**
 * Naslai logotipi — kod bilan chizilgan (SVG), rasm fayli kerak emas.
 *
 * Ikkita "yulduz": kattasi va yonidagi kichigi — logotipdagi kabi.
 * Rang `currentColor` orqali oladi, shuning uchun qorong'i joyda ham,
 * yorug' joyda ham to'g'ri ko'rinadi: ota-elementga rang bersangiz kifoya.
 */
export function BrandMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return <svg
    className={`brand-mark ${className}`.trim()}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    {/* Katta yulduz: markaz (26,38), uchlari cho'ziq — logotipdagi proporsiya */}
    <path
      d="M26 4 C27.4 22.2 29.6 25.2 47.6 27.2 C29.6 29.2 27.4 32.2 26 50.4 C24.6 32.2 22.4 29.2 4.4 27.2 C22.4 25.2 24.6 22.2 26 4 Z"
      fill="currentColor"
    />
    {/* Kichik yulduz o'ng yuqorida */}
    <path
      d="M49 12 C49.7 20.4 50.8 21.8 59 22.6 C50.8 23.4 49.7 24.8 49 33.2 C48.3 24.8 47.2 23.4 39 22.6 C47.2 21.8 48.3 20.4 49 12 Z"
      fill="currentColor"
      opacity=".85"
    />
  </svg>;
}
