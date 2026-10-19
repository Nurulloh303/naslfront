export type Marketplace = "uzum" | "wb" | "ozon";
export type Resolution = "1k" | "2k" | "4k";
export type ContentMode = "photo" | "card" | "video" | "fashion" | "copyStyle" | "marketplacePackage";
export type AspectRatio = "9:16" | "3:4" | "1:1" | "4:3" | "16:9";
export type PhotoStyle = "commercial" | "home";
export type PhotoShot = "person" | "detail" | "lifestyle" | "catalog";
export type ReferenceMode = "copy" | "inspire";
export type InfographicLanguage = "uz" | "ru" | "tg";
export type JobStatus = "idle" | "analyzing" | "ready" | "submitting" | "queued" | "processing" | "success" | "failed";
export type FashionGender = "female" | "male" | "none";
export type FashionPose = "front" | "side" | "dynamic" | "sitting";
export type FashionStyle = "studio" | "street" | "lookbook" | "cinematic";
export type FashionEnv = "minimal" | "urban" | "interior" | "nature";

export type ProductAsset = {
  id: string;
  name: string;
  url: string;
  sourceDataUrl?: string;
  isPrimary: boolean;
  width?: number;
  height?: number;
};

export type ProductBrief = {
  title: string;
  /** Sarlavha ostidagi qisqa aniqlovchi. AI fotoni ko'rib yozadi. */
  subtitle: string;
  category: string;
  sku: string;
  benefits: string[];
  aiNotice?: string;
};

/** Reja: kartada nima yozilishini oldindan ko'rsatadigan matn. */
export type SlidePlan = {
  id: string;
  type: string;
  headline: string;
  subtitle: string;
  lines: string[];
};

export type GenerationSettings = {
  contentType: ContentMode;
  marketplace: Marketplace;
  language: InfographicLanguage;
  style: "commercial" | "creative";
  photoStyle: PhotoStyle;
  photoShot: PhotoShot;
  photoPrompt: string;
  cardPrompt: string;
  /** Sahna tilagi: fon, muhit, rekvizit. Kartaga MATN bo'lib chiqmaydi. */
  sceneWish: string;
  /** Odam tekshirgan matn rejasi. Bo'sh bo'lsa — server o'zi hisoblaydi. */
  plan: SlidePlan[];
  /** Galereyadan tanlangan uslub. O'z referensi bo'lsa — ishlatilmaydi. */
  stylePreset: string;
  /** Paketda nechta slayd bo'ladi: 3 dan 8 gacha. Har biri 1 token. */
  packageSlides: number;
  /** Har bir slaydning mavzusi. Bo'sh bo'lsa — server standart tartibni oladi. */
  slideTypes: string[];
  /** Matnni kim yozadi: "ai" — model, "own" — biz o'zimiz shrift bilan. */
  textMode: "ai" | "own";
  /** Karta tayyor bo'lgach, Uzum uchun tavsif ham yozilsinmi. Bepul, token yemaydi. */
  includeListing: boolean;
  referenceMode: ReferenceMode;
  designReferenceUrl: string;
  designReferenceName: string;
  designReferenceDataUrl: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  variants: 1 | 2 | 4 | 5 | 3 | 6 | 7 | 8;
  /** Nechta HAR XIL sahifa (slayd) generatsiya qilinadi. Variant bilan aralashtirmang:
   *  variant = bir xil sahifaning boshqa ko'rinishi, sahifa = boshqa kadr/mavzu. */
  pages: 1 | 2 | 3 | 4 | 5;
  /** Har bir sahifa uchun "nimaga urg'u berish" — indeks 0 = 1-sahifa. */
  pageFocus: string[];
  video: VideoSettings;
  fashion: FashionSettings;
  copyStyle: CopyStyleSettings;
  marketplacePackage: MarketplacePackageSettings;
};

export type FashionSettings = {
  gender: FashionGender;
  pose: FashionPose;
  style: FashionStyle;
  env: FashionEnv;
  customPrompt: string;
};

/** Как показывать товар: так же, как в референсе / на живой модели / только товар. */
export type CopyStylePresentation = "auto" | "model" | "product";

export type CopyStyleSettings = {
  extraNotes: string;
  presentation: CopyStylePresentation;
};

export type MarketplacePackageSettings = {
  productDescription: string;
  styleNotes: string;
};

export type VideoSettings = {
  prompt: string;
  duration: 5 | 10;
  cardMode: boolean;
  loop: boolean;
  finalFrameUrl: string;
  finalFrameName: string;
};

export type Quote = {
  tokens: number;
  label: string;
  breakdown: string;
};

type Bilingual = { uz: string; ru: string };

/**
 * Тавсиф для маркетплейса — заголовок, УТП, описания, характеристики и
 * ключевые слова сразу на двух языках. Бесплатно, без списания токенов:
 * та же логика, что и в отдельном разделе "Tavsif yozish", просто
 * прицепленная к результату генерации, если продавец включил галочку.
 */
export type ProductListing = {
  title: Bilingual;
  utp: Bilingual;
  shortDescription: Bilingual;
  fullDescription: Bilingual;
  characteristics: Array<{ name: Bilingual; value: Bilingual }>;
  keywords: { uz: string[]; ru: string[] };
  notice: string;
};

export type GenerationLayer = {
  id: string;
  name: string;
  url: string;
  order: number;
  width?: number;
  height?: number;
};

export type GenerationResult = {
  id: string;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  /** Был ли реально применён загруженный референс стиля.
   *  "partial" — из референса взяли только текстовое описание (фолбэк). */
  referenceUsed?: boolean | "partial" | null;
  /** На каком уровне промпта получена картинка: primary / retry-same /
   *  compact / style-descriptor / safe-minimal. */
  promptTier?: string | null;
  /** Именно этот кадр сейчас перерисовывается. */
  regenerating?: boolean;
  /** Сколько раз кадр уже переделывали. */
  regenerateCount?: number;
  /** Пожелание, с которым его переделывали в прошлый раз. */
  note?: string;
  /** Текст для этого кадра, когда надписи рисуем мы, а не модель. */
  slide?: { headline: string; subtitle: string; lines: string[] } | null;
  /** Композиция с текстом уже сохранена в проект. */
  composed?: boolean;
  /** AI ajratgan qatlamlar (Magic Layers). */
  layers?: GenerationLayer[];
};

export type GenerationJob = {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  quote: Quote | null;
  results: GenerationResult[];
  error: string | null;
  /** Номер слайда, который сейчас перерисовывается. */
  regenerating?: number | null;
  /** Ошибка последней перерисовки. Вся задача при этом остаётся готовой. */
  regenerateError?: string | null;
  /** Кто пишет буквы на карточке. */
  textMode?: "ai" | "own";
  /** Тавсиф, если продавец включил галочку. Приходит отдельным запросом
   *  уже после того, как карточка готова — сама генерация её не ждёт. */
  listing?: ProductListing | null;
  listingStatus?: "idle" | "loading" | "ready" | "failed";
  /** Сколько миллисекунд уже идёт генерация. Нужен для таймера ожидания. */
  elapsedMs?: number;
  context?: { title: string; category: string; summary: string; contentType: ContentMode };
};

export type LedgerEntry = {
  id: string;
  type: "reserve" | "capture" | "refund";
  amount: number;
  balanceAfter: number;
  createdAt: string;
};

export type CreateFlowState = {
  assets: ProductAsset[];
  brief: ProductBrief;
  settings: GenerationSettings;
  job: GenerationJob;
  balance: number;
  analysisWarning: string | null;
  notice: string | null;
};

export const defaultBrief: ProductBrief = {
  title: "",
  subtitle: "",
  category: "",
  sku: "",
  benefits: ["", "", ""],
};

export const defaultSettings: GenerationSettings = {
  contentType: "card",
  marketplace: "uzum",
  language: "uz",
  style: "commercial",
  photoStyle: "commercial",
  photoShot: "person",
  photoPrompt: "",
  cardPrompt: "",
  sceneWish: "",
  plan: [],
  stylePreset: "",
  packageSlides: 5,
  slideTypes: ["main", "benefits", "usage", "sizes", "materials"],
  textMode: "ai",
  includeListing: false,
  referenceMode: "copy",
  designReferenceUrl: "",
  designReferenceName: "",
  designReferenceDataUrl: "",
  aspectRatio: "3:4",
  resolution: "1k",
  variants: 1,
  pages: 1,
  pageFocus: ["", "", "", "", ""],
  video: {
    prompt: "",
    duration: 5,
    cardMode: true,
    loop: false,
    finalFrameUrl: "",
    finalFrameName: "",
  },
  fashion: {
    gender: "female",
    pose: "front",
    style: "studio",
    env: "minimal",
    customPrompt: "",
  },
  copyStyle: {
    extraNotes: "",
    presentation: "auto",
  },
  marketplacePackage: {
    productDescription: "",
    styleNotes: "",
  },
};
