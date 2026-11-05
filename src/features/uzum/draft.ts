import type { UzumCategory, UzumDraft, UzumImage, UzumIssue, UzumSku } from "./uzumApi";

/** Ustoz-qadamlar tartibi. Xatolarni qadamga bog'lash ham shu indekslarga tayanadi. */
export const STEPS = ["category", "product", "skus", "photos", "filters", "review"] as const;
export type StepKey = typeof STEPS[number];

export const MAX_SKUS = 50;
export const NO_BRAND = "Отсутствует бренд";

/** Brauzerda saqlanadigan holat: qoralama + ustoz uchun kerakli yordamchi ma'lumotlar. */
export type WizardState = {
  v: 1;
  step: number;
  draft: UzumDraft;
  category: UzumCategory | null;
  /** Prefill qaytargan AI matnlari: qiymat o'zgarmaguncha "AI yozgan" belgisi ko'rinadi. */
  ai: Record<string, string>;
  consent: boolean;
  images: UzumImage[];
  /** Prefill bir marta olinadi — keyin sotuvchining o'zgarishlari ustun. */
  prefilled: boolean;
};

export function emptySku(): UzumSku {
  return { price: null, oldPrice: null, weightG: null, heightMm: null, widthMm: null, lengthMm: null };
}

function randomId(): string {
  try { return crypto.randomUUID().replaceAll("-", "").slice(0, 12); }
  catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
}

export function newKey(prefix: string): string {
  return `${prefix}_${randomId()}${randomId()}`;
}

export function emptyDraft(projectId?: string): UzumDraft {
  return {
    ...(projectId ? { projectId } : {}),
    categoryId: null,
    brand: "", model: "", country: "",
    titleRu: "", titleUz: "", descriptionRu: "", descriptionUz: "", shortRu: "", shortUz: "",
    compositionRu: "", compositionUz: "", careRu: "", careUz: "", sizeChartRu: "", sizeChartUz: "",
    ikpu: "",
    groupKey: `naslai-${(projectId ?? randomId()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}`,
    photos: [],
    filters: {},
    skus: [emptySku()],
  };
}

export function emptyState(projectId?: string): WizardState {
  return { v: 1, step: 0, draft: emptyDraft(projectId), category: null, ai: {}, consent: false, images: [], prefilled: false };
}

const storageKey = (projectId?: string) => `naslai:uzum:draft:${projectId || "new"}`;

export function loadState(projectId?: string): WizardState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardState;
    if (parsed?.v !== 1 || !parsed.draft || !Array.isArray(parsed.draft.skus)) return null;
    return { ...emptyState(projectId), ...parsed, draft: { ...emptyDraft(projectId), ...parsed.draft } };
  } catch {
    return null;
  }
}

export function saveState(projectId: string | undefined, state: WizardState): void {
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // Qurilmadan qo'shilgan rasmlar (data URL) joyni to'ldirib qo'yishi mumkin — ularsiz saqlab ko'ramiz.
    try {
      const light = { ...state, draft: { ...state.draft, photos: state.draft.photos.filter((photo) => !("dataUrl" in photo)) } };
      window.localStorage.setItem(storageKey(projectId), JSON.stringify(light));
    } catch { /* xususiy rejim — saqlamaymiz, ustoz baribir ishlaydi */ }
  }
}

export function clearState(projectId?: string): void {
  try { window.localStorage.removeItem(storageKey(projectId)); } catch { /* e'tiborsiz */ }
}

/* ---------- xatolarni maydonga bog'lash ---------- */

const PRODUCT_FIELDS = new Set([
  "brand", "model", "country", "ikpu",
  "titleRu", "titleUz", "descriptionRu", "descriptionUz", "shortRu", "shortUz",
  "compositionRu", "compositionUz", "careRu", "careUz", "sizeChartRu", "sizeChartUz",
]);
const SKU_FIELDS = new Set(["sellerId", "barcode", "color", "size", "price", "oldPrice", "weightG", "heightMm", "widthMm", "lengthMm"]);

/** `skus.1.price` yoki `skus[1].price` ko'rinishini ham tushunamiz. */
export function normalizeIssue(issue: UzumIssue): UzumIssue {
  const match = /^skus?(?:\.|\[)(\d+)\]?\.?([A-Za-z]+)?$/.exec(issue.field);
  if (match) return { ...issue, sku: Number(match[1]), field: match[2] ?? "skus" };
  return issue;
}

export function stepForIssue(issue: UzumIssue): number {
  const field = issue.field;
  if (field === "categoryId" || field === "category") return 0;
  if (typeof issue.sku === "number" || SKU_FIELDS.has(field) || field === "skus" || field === "groupKey") return 2;
  if (field.startsWith("photos")) return 3;
  if (field.startsWith("filters")) return 4;
  if (PRODUCT_FIELDS.has(field)) return 1;
  return 5;
}

export function fieldDomId(field: string, sku?: number): string {
  const safe = field.replace(/[^A-Za-z0-9_-]/g, "-");
  return typeof sku === "number" ? `uzf-sku${sku}-${safe}` : `uzf-${safe}`;
}

export function sameIssue(issue: UzumIssue, field: string, sku?: number): boolean {
  return issue.field === field && (typeof sku === "number" ? issue.sku === sku : typeof issue.sku !== "number");
}

/* ---------- sonlar ---------- */

export function parseNumber(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatSom(value: number | null): string {
  if (value === null) return "";
  return value.toLocaleString("ru-RU").replace(/ /g, " ");
}

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

export function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  if (language === "ru") return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  // Brauzerlarda uz-UZ oy nomlari ko'pincha yo'q ("2026 M10 20") — o'zimiz yozamiz.
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}, ${date.getFullYear()}`;
}
