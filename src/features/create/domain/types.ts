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
  referenceMode: ReferenceMode;
  designReferenceUrl: string;
  designReferenceName: string;
  designReferenceDataUrl: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  variants: 1 | 2 | 4 | 5;
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
};

export type GenerationJob = {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  quote: Quote | null;
  results: GenerationResult[];
  error: string | null;
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
