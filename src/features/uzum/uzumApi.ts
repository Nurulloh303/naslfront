import { apiFetch, apiUrl } from "../../app/apiClient";

/**
 * "Uzum uchun Excel" — Uzum import fayli (.xlsm) tayyorlash.
 *
 * Kontrakt (backend bilan kelishilgan, o'zgartirmang):
 *   GET  /api/uzum/categories?q=            → { categories: [{ id, title, path }] }
 *   GET  /api/uzum/categories/<id>          → { id, title, path, filters: [...] }
 *   GET  /api/uzum/dictionary?type=&q=      → { values: string[] }
 *   GET  /api/uzum/prefill?projectId=       → { draft } (+ draft.images)
 *   POST /api/uzum/validate { draft }       → { ok, errors }
 *   POST /api/uzum/exports { draft, idempotencyKey? } → 201 { export } | 400 { errors }
 *   GET  /api/uzum/exports                  → { exports }
 *   GET  /api/uzum/exports/<id>             → { export }
 *   GET  /api/uzum/exports/<id>/download    → xlsm
 *
 * Naslai faylni faqat tayyorlaydi — tovarni Uzumga sotuvchi o'zi yuklaydi.
 */

export type UzumCategory = { id: number; title: string; path: string; titleUz?: string; pathUz?: string; commission?: number | null };
export type UzumFilter = { id: string | number; name: string; values: string[]; multiple: boolean; required: boolean };
export type UzumCategoryDetail = UzumCategory & { filters: UzumFilter[]; sizeTypes?: string[] };
export type DictionaryType = "brand" | "color" | "size" | "country";

export type UzumPhoto = { jobId: string; resultIndex: number } | { dataUrl: string };
export type UzumImage = { jobId: string; resultIndex: number; url: string };

export type UzumSku = {
  sellerId?: string;
  barcode?: string;
  color?: string;
  size?: string;
  price: number | null;
  oldPrice: number | null;
  weightG: number | null;
  heightMm: number | null;
  widthMm: number | null;
  lengthMm: number | null;
};

export type UzumDraft = {
  projectId?: string;
  categoryId: number | null;
  brand: string;
  model?: string;
  country: string;
  titleRu: string;
  titleUz: string;
  descriptionRu: string;
  descriptionUz: string;
  shortRu: string;
  shortUz: string;
  compositionRu?: string;
  compositionUz?: string;
  careRu?: string;
  careUz?: string;
  sizeChartRu?: string;
  sizeChartUz?: string;
  ikpu: string;
  groupKey: string;
  photos: UzumPhoto[];
  filters: Record<string, string | string[]>;
  skus: UzumSku[];
};

export type UzumPrefill = Partial<UzumDraft> & { images?: UzumImage[] };
export type UzumIssue = { field: string; sku?: number; message: string };
export type UzumExport = {
  id: string;
  status: string;
  categoryId: number;
  categoryPath: string;
  skuCount: number;
  photoUrls: string[];
  createdAt: string;
  expiresAt: string;
  fileName: string;
};

export class UzumApiError extends Error {
  readonly status: number;
  readonly errors: UzumIssue[];
  constructor(message: string, status: number, errors: UzumIssue[] = []) {
    super(message);
    this.name = "UzumApiError";
    this.status = status;
    this.errors = errors;
  }
}

type ErrorPayload = { message?: string; error?: string; errors?: UzumIssue[] };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new UzumApiError("", 0);
  }
  const payload = await response.json().catch(() => null) as (T & ErrorPayload) | null;
  if (!response.ok) {
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    throw new UzumApiError(payload?.message ?? errors[0]?.message ?? "", response.status, errors);
  }
  return (payload ?? ({} as T));
}

/** Backend son kutadi: bo'sh qiymatlarni 0 emas, null qoldiramiz — server xato beradi. */
function cleanDraft(draft: UzumDraft): UzumDraft {
  const optional = (value?: string) => (value && value.trim() ? value.trim() : undefined);
  return {
    ...draft,
    model: optional(draft.model),
    compositionRu: optional(draft.compositionRu), compositionUz: optional(draft.compositionUz),
    careRu: optional(draft.careRu), careUz: optional(draft.careUz),
    sizeChartRu: optional(draft.sizeChartRu), sizeChartUz: optional(draft.sizeChartUz),
    skus: draft.skus.map((sku) => ({ ...sku, sellerId: optional(sku.sellerId), barcode: optional(sku.barcode), color: optional(sku.color), size: optional(sku.size) })),
  };
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export type UzumIkpu = { code: string; name: string; nameUz?: string; path: string; score?: number };

export const uzumApi = {
  categories: (q: string, signal?: AbortSignal) =>
    call<{ categories: UzumCategory[] }>(`/api/uzum/categories?q=${encodeURIComponent(q)}`, { signal }).then((p) => p.categories ?? []),
  category: (id: number) => call<UzumCategoryDetail>(`/api/uzum/categories/${id}`),
  dictionary: (type: DictionaryType, q: string, signal?: AbortSignal, categoryId?: number | null) =>
    call<{ values: string[] }>(`/api/uzum/dictionary?type=${type}&q=${encodeURIComponent(q)}${categoryId ? `&categoryId=${categoryId}` : ""}`, { signal }).then((p) => p.values ?? []),
  ikpu: (params: { q?: string; title?: string; category?: string; barcode?: string; code?: string }, signal?: AbortSignal) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return call<{ ready: boolean; results: UzumIkpu[] }>(`/api/uzum/ikpu?${query}`, { signal });
  },
  prefill: (projectId: string) => call<{ draft: UzumPrefill }>(`/api/uzum/prefill?projectId=${encodeURIComponent(projectId)}`).then((p) => p.draft ?? {}),
  validate: (draft: UzumDraft) => call<{ ok: boolean; errors: UzumIssue[] }>("/api/uzum/validate", json({ draft: cleanDraft(draft) })),
  createExport: (draft: UzumDraft, idempotencyKey: string) =>
    call<{ export: UzumExport }>("/api/uzum/exports", json({ draft: cleanDraft(draft), idempotencyKey })).then((p) => p.export),
  exports: () => call<{ exports: UzumExport[] }>("/api/uzum/exports").then((p) => p.exports ?? []),
  getExport: (id: string) => call<{ export: UzumExport }>(`/api/uzum/exports/${encodeURIComponent(id)}`).then((p) => p.export),
  /** Fayl faqat egasiga beriladi — shuning uchun apiFetch (cookie/token) orqali blob qilib olamiz. */
  async download(item: UzumExport): Promise<{ blob: Blob; fileName: string }> {
    let response: Response;
    try {
      response = await apiFetch(`/api/uzum/exports/${encodeURIComponent(item.id)}/download`);
    } catch {
      throw new UzumApiError("", 0);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as ErrorPayload | null;
      throw new UzumApiError(payload?.message ?? "", response.status);
    }
    const raw = await response.blob();
    const blob = raw.type ? raw : new Blob([raw], { type: "application/vnd.ms-excel.sheet.macroEnabled.12" });
    return { blob, fileName: fileNameFrom(response.headers.get("content-disposition")) || item.fileName || "uzum-import.xlsm" };
  },
};

function fileNameFrom(header: string | null): string {
  if (!header) return "";
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")); } catch { /* oddiy nomga o'tamiz */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : "";
}

export function mediaUrl(url: string): string {
  if (!url) return url;
  return url.startsWith("/") && !url.startsWith("//") ? apiUrl(url) : url;
}
