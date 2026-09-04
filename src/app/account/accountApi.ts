import { apiFetch } from "../apiClient";

export type AccountUser = {
  id: string;
  supportCode: string;
  name: string;
  email: string;
  language: "uz";
};

export type AccountLedgerEntry = {
  id: string;
  operationId: string;
  label: string;
  amount: number;
  type: "credit" | "debit";
  balanceAfter: number;
  createdAt: string;
};

/** Ikki tilli matn: Uzum'da ikkala maydon ham to'ldiriladi. */
export type Bilingual = { uz: string; ru: string };

export type ProductListing = {
  title: Bilingual;
  utp: Bilingual;
  shortDescription: Bilingual;
  fullDescription: Bilingual;
  characteristics: Array<{ name: Bilingual; value: Bilingual }>;
  keywords: { uz: string[]; ru: string[] };
  notice: string;
};

export type AccountProject = {
  id: string;
  name: string;
  status: "draft" | "ready";
  createdAt: string;
  marketplace: "WB" | "Uzum" | "Ozon" | "Foto" | "Video";
  /** Prevyu. Vazifa siqib chiqarilgan bo'lsa — null, ya'ni rasm yo'q. */
  previewUrl?: string | null;
  resultCount?: number;
  available?: boolean;
};

/**
 * Loyiha butunligicha: karta nimadan yig'ilgani va marketplace kartochkasiga
 * qo'yiladigan matn.
 */
export type ProjectFolder = AccountProject & {
  summary?: string;
  contentType?: string;
  sourceUrl: string | null;
  archiveUrl: string;
  brief: { title: string; subtitle: string; category: string; benefits: string[] } | null;
  plan: { id: string; type: string; headline: string; subtitle: string; lines: string[] }[];
  listing: ProductListing | null;
  results: { id: string; title: string; previewUrl: string; downloadUrl: string; width: number; height: number }[];
};

export type AccountApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
};

export type TokenPack = {
  id: string;
  tokens: number;
  priceUzs: number;
  popular: boolean;
  perToken: number;
  /** Скидка за токен относительно самого маленького пакета, в процентах. */
  discount: number;
};

export type TokenOrder = {
  id: string;
  packId: string;
  tokens: number;
  priceUzs: number;
  provider: "click" | "payme";
  status: "pending" | "paid" | "unavailable" | "failed";
  createdAt: string;
};

export type AuditQuestion = { id: string; type: "text" | "choice"; options?: string[]; required: boolean };

export type AuditProblem = {
  ruleId: string;
  severity: "critical" | "major" | "minor";
  title: string;
  why: string;
  fix: string;
  /** Rasmiy Uzum talabimi yoki bizning tavsiyamiz. Serverda belgilanadi. */
  source?: "uzum" | "practice";
  ruleTitle?: string | null;
  ruleDetail?: string | null;
  /** Manba havolasi. Faqat rasmiy talablarda bo'ladi. */
  ruleUrl?: string | null;
};

export type AuditReport = {
  score: number;
  verdict: string;
  problems: AuditProblem[];
  /** Причины, которые к карточке не относятся — показываем честно. */
  likelyNotTheCard?: string[];
  suggested?: { title?: string; category?: string; benefits?: string[] };
  mock?: boolean;
  meta: {
    link: string | null;
    productId: string | null;
    productFetched: boolean;
    productFetchReason: string | null;
    /** Kalitlar, matn emas: hisobot sayt tilida ko'rsatiladi. */
    notChecked: string[];
    rulesSource: string;
    rulesReviewedAt: string;
  };
};

export type AccountSnapshot = {
  isAdmin?: boolean;
  /** Сколько API-ключей разрешено держать одновременно. */
  apiKeyLimit?: number;
  user: AccountUser;
  balance: number;
  ledger: AccountLedgerEntry[];
  projects: AccountProject[];
  apiKeys: AccountApiKey[];
  referrals: { invited: number; credited: number; level: number; code: string };
  /** 1 токен = 1 сгенерированная картинка. Все цены — производные от этого. */
  pricing: {
    perImage: number;
    marketplacePackage: { perSlide: number; min: number; max: number };
    video: Record<"5" | "10", number>;
    tokenPriceUzs: number;
  };
  packs: TokenPack[];
  payments: { enabled: boolean; providers: Array<"click" | "payme"> };
  orders: TokenOrder[];
};

/** Какие способы входа включены на сервере. */
export type AuthProviders = {
  google: boolean;
  googleClientId: string | null;
  telegram: boolean;
  telegramBot: string | null;
};


/** Admin panel uchun turlar. */
export type AdminOverview = {
  users: { total: number; withGoogle: number; withTelegram: number; withBalance: number };
  tokens: { inCirculation: number; spent: number };
  jobs: { total: number; lastDay: number; failed: number };
  promos: { total: number; active: number; redemptions: number };
  orders: number;
  costs: { perImageUzs: number; tokenPriceUzs: number };
};
export type AdminUser = { id: string; email: string; name: string; balance: number; providers: string[]; jobs: number; orders: number; supportCode: string };
export type AdminPromo = { code: string; kind: string; value: number; used: number; maxUses: number; active: boolean; owner: string; note: string; expiresAt: string | null; createdAt: string; lastUsedAt: string | null };
export type AdminGeneration = { id: string; email: string; status: string; tokens: number; title: string; contentType: string; createdAt: string; error: string | null };
export type AdminOrder = { id: string; email: string; tokens: number; priceUzs: number; status: string; provider: string; createdAt: string };

type ApiErrorPayload = { message?: string; error?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const payload = await response.json().catch(() => null) as (T & ApiErrorPayload) | null;
  if (!response.ok) throw new Error(payload?.message ?? "So‘rovni bajarib bo‘lmadi");
  // Bo'sh javob (204) xato emas: masalan chiqish so'rovi shunday qaytishi mumkin.
  return (payload ?? ({} as T));
}

export const accountApi = {
  session: () => request<{ authenticated: boolean; account: AccountSnapshot | null }>("/api/auth/session"),
  register: (input: { name: string; email: string; password: string }) => request<{ account: AccountSnapshot }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) => request<{ account: AccountSnapshot }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: "{}" }),
  authProviders: () => request<AuthProviders>("/api/auth/providers"),
  redeemPromo: (code: string) => request<{ ok: boolean; kind: string; granted: number; percent: number; account: AccountSnapshot }>("/api/promo/redeem", { method: "POST", body: JSON.stringify({ code }) }),
  admin: {
    overview: () => request<AdminOverview>("/api/admin/overview"),
    users: (q = "") => request<{ users: AdminUser[]; total: number }>(`/api/admin/users?q=${encodeURIComponent(q)}`),
    setBalance: (id: string, amount: number, reason: string) => request<{ ok: boolean; balance: number; applied: number }>(`/api/admin/users/${encodeURIComponent(id)}/balance`, { method: "POST", body: JSON.stringify({ amount, reason }) }),
    promos: () => request<{ promos: AdminPromo[] }>("/api/admin/promos"),
    createPromo: (input: Record<string, unknown>) => request<{ promo: AdminPromo }>("/api/admin/promos", { method: "POST", body: JSON.stringify(input) }),
    updatePromo: (code: string, patch: Record<string, unknown>) => request<{ promo: AdminPromo }>(`/api/admin/promos/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deletePromo: (code: string) => request<{ ok: boolean; disabledInsteadOfDeleted: boolean }>(`/api/admin/promos/${encodeURIComponent(code)}`, { method: "DELETE" }),
    generations: () => request<{ generations: AdminGeneration[] }>("/api/admin/generations"),
    orders: () => request<{ orders: AdminOrder[] }>("/api/admin/orders"),
  },
  loginWithGoogle: (credential: string) => request<{ account: AccountSnapshot }>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  loginWithTelegram: (payload: Record<string, unknown>) => request<{ account: AccountSnapshot }>("/api/auth/telegram", { method: "POST", body: JSON.stringify(payload) }),
  get: () => request<AccountSnapshot>("/api/account"),
  updateProfile: (input: Pick<AccountUser, "name" | "email" | "language">) => request<AccountSnapshot>("/api/profile", { method: "PATCH", body: JSON.stringify(input) }),
  createApiKey: () => request<{ key: AccountApiKey; secret: string }>("/api/api-keys", { method: "POST", body: "{}" }),
  /** Uzum uchun bepul tavsif — istalgan rasmdan, loyihasiz. */
  generateListing: (input: { imageDataUrl: string; marketplace: string; hint: string }) =>
    request<{ listing: ProductListing }>("/api/listing", { method: "POST", body: JSON.stringify(input) }),
  project: (id: string) => request<{ project: ProjectFolder }>(`/api/projects/${encodeURIComponent(id)}`),
  projectListing: (id: string) => request<{ listing: ProductListing }>(`/api/projects/${encodeURIComponent(id)}/listing`, { method: "POST", body: "{}" }),
  deleteProject: (id: string) => request<{ ok: boolean; projects: AccountProject[] }>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  revokeApiKey: (id: string) => request<{ ok: boolean }>(`/api/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createOrder: (packId: string, provider: "click" | "payme") =>
    request<{ order: TokenOrder; checkoutUrl: string | null; message?: string }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({ packId, provider }),
    }),
  cancelOrder: (id: string) => request<{ ok: boolean }>(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" }),
  auditQuestions: () => request<{ questions: AuditQuestion[]; remainingToday: number; lastReport: AuditReport | null; lastReportAt: string | null }>("/api/audit/questions"),
  runAudit: (input: { images: string[]; link: string; answers: Record<string, string>; language: string }) =>
    request<{ report: AuditReport; remainingToday: number }>("/api/audit", { method: "POST", body: JSON.stringify(input) }),
};
