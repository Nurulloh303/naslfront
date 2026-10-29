import { useEffect, useMemo, useReducer, useRef } from "react";
import { marketplacePresets } from "../domain/marketplacePresets";
import { defaultBrief, defaultSettings, type CreateFlowState, type ExtractLayerPoint, type ExtractLayerResponse, type GenerationSettings, type ProductAsset, type ProductBrief, type Quote } from "../domain/types";
import { createP0Api, type SeparateLayersOptions } from "../services/createApi";

type Action =
  | { type: "ASSETS_SET"; assets: ProductAsset[] }
  | { type: "ANALYSIS_START" }
  | { type: "ANALYSIS_READY"; brief: ProductBrief }
  | { type: "BRIEF_CHANGE"; brief: ProductBrief }
  | { type: "SETTINGS_CHANGE"; settings: GenerationSettings }
  | { type: "QUOTE_READY"; quote: Quote | null }
  | { type: "BALANCE_SET"; balance: number }
  | { type: "JOB_UPDATE"; job: CreateFlowState["job"] }
  | { type: "JOB_LISTING"; listing: CreateFlowState["job"]["listing"]; listingStatus: NonNullable<CreateFlowState["job"]["listingStatus"]> }
  | { type: "NOTICE"; notice: string | null }
  | { type: "RESET"; balance: number };

const idleJob: CreateFlowState["job"] = { id: "", status: "idle", progress: 0, message: "Mahsulot fotosini yuklang", quote: null, results: [], error: null };

function makeInitialState(balance: number): CreateFlowState {
  return { assets: [], brief: defaultBrief, settings: defaultSettings, job: idleJob, balance, analysisWarning: null, notice: null };
}

function fallbackBrief(asset: ProductAsset, reason?: string): ProductBrief {
  const cleanName = asset.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return {
    title: cleanName && !/^(img|image|photo|original)/i.test(cleanName) ? cleanName : "",
    subtitle: "",
    category: "",
    sku: "",
    benefits: ["", "", ""],
    aiNotice: reason ? `AI tahlil ishlamadi: ${reason}. Iltimos, nom, kategoriya va aniq afzalliklarni qo‘lda kiriting.` : "AI birinchi variantni tayyorladi. Generatsiyadan oldin nomi, kategoriyasi va aniq afzalliklarini tekshiring.",
  };
}

function initialStateForPreview(balance: number): CreateFlowState {
  const initialState = makeInitialState(balance);
  const previewMode = new URLSearchParams(window.location.search).get("demo");
  if (!import.meta.env.DEV || !previewMode) return initialState;
  const preview = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560"><rect width="100%" height="100%" fill="#f4f3f0"/><path d="M95 445 L108 250 Q112 198 158 198 L242 198 Q288 198 292 250 L305 445 Z" fill="#1E2934"/><path d="M158 198 Q162 112 200 112 Q238 112 242 198" fill="none" stroke="#1E2934" stroke-width="18"/></svg>')}`;
  const previewBrief: ProductBrief = { title: "Shopper sumka", subtitle: "xarid uchun", category: "Aksessuarlar", sku: "", benefits: ["Keng asosiy bo‘lim", "Uzun tutqichlar", "Mustahkam material"], aiNotice: "Bu matnni AI foto asosida yozdi. Generatsiyadan oldin mahsulot xususiyatlarini tekshiring." };
  const previewResult = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071014"/><stop offset="1" stop-color="#12343a"/></linearGradient></defs><rect width="1080" height="1440" fill="url(#g)"/><text x="72" y="150" fill="#00F6FF" font-family="Arial" font-size="44" font-weight="700">MARKETPLACE UCHUN</text><text x="72" y="270" fill="white" font-family="Arial" font-size="112" font-weight="900">SHOPPER</text><text x="72" y="350" fill="white" font-family="Arial" font-size="64" font-weight="700">Kundalik sumka</text><path d="M290 1150 L330 630 Q340 500 500 500 L720 500 Q880 500 890 630 L930 1150 Z" fill="#1E2934" stroke="#00F6FF" stroke-width="8"/><path d="M500 500 Q510 280 610 280 Q710 280 720 500" fill="none" stroke="#1E2934" stroke-width="46"/><g fill="#00F6FF"><circle cx="110" cy="520" r="18"/><circle cx="110" cy="650" r="18"/><circle cx="110" cy="780" r="18"/></g><g fill="white" font-family="Arial" font-size="38" font-weight="700"><text x="150" y="535">Keng asosiy bo‘lim</text><text x="150" y="665">Uzun tutqichlar</text><text x="150" y="795">Mustahkam material</text></g></svg>')}`;
  const basePreview: CreateFlowState = { ...initialState, assets: [{ id: "demo-asset", name: "sumka-shopper.jpg", url: preview, sourceDataUrl: preview, isPrimary: true }], brief: previewBrief, job: { ...idleJob, status: "ready", message: "AI tavsiyalarini tekshiring" } };
  if (previewMode !== "result") return basePreview;
  return {
    ...basePreview,
    job: {
      id: "demo-result",
      status: "success",
      progress: 100,
      message: "Tayyor",
      quote: { tokens: 4, label: "1 variant", breakdown: "Karta · 1080×1440" },
      error: null,
      results: [{ id: "demo-result-1", title: "1-variant", previewUrl: previewResult, downloadUrl: previewResult, width: 1080, height: 1440 }],
      context: { title: previewBrief.title, category: previewBrief.category, summary: "Karta · Uzum · 1080×1440", contentType: "card" },
    },
  };
}

function reducer(state: CreateFlowState, action: Action): CreateFlowState {
  switch (action.type) {
    case "ASSETS_SET": return { ...state, assets: action.assets };
    case "ANALYSIS_START": return { ...state, job: { ...idleJob, status: "analyzing", message: "AI mahsulotni tahlil qilmoqda" } };
    case "ANALYSIS_READY": return { ...state, brief: action.brief, analysisWarning: action.brief.aiNotice ?? null, job: { ...idleJob, status: "ready", message: "AI tavsiyalarini tekshiring" } };
    case "BRIEF_CHANGE": return { ...state, brief: action.brief };
    case "SETTINGS_CHANGE": return { ...state, settings: action.settings };
    case "QUOTE_READY": return { ...state, job: { ...state.job, quote: action.quote } };
    case "BALANCE_SET": return { ...state, balance: action.balance };
    case "JOB_UPDATE": return { ...state, job: action.job };
    case "JOB_LISTING": return { ...state, job: { ...state.job, listing: action.listing, listingStatus: action.listingStatus } };
    case "NOTICE": return { ...state, notice: action.notice };
    case "RESET": return makeInitialState(action.balance);
  }
}

type Options = { initialBalance: number; onBalanceChange?: (balance: number) => void; onJobSettled?: () => void };

export function useCreateFlow({ initialBalance, onBalanceChange, onJobSettled }: Options) {
  const [state, dispatch] = useReducer(reducer, initialBalance, initialStateForPreview);
  const api = useMemo(() => createP0Api(), []);
  const generationInFlight = useRef(false);
  const stopWatch = useRef<null | (() => void)>(null);
  /** Uzoq so'rovlar (bosib ajratish) tugaganda eng so'nggi vazifa holatini yangilash uchun. */
  const latestJob = useRef(state.job);
  latestJob.current = state.job;
  const callbacks = useRef({ onBalanceChange, onJobSettled });
  callbacks.current = { onBalanceChange, onJobSettled };
  // Решение "нужен ли тавсиф" принимается на шаге настроек, а не в момент,
  // когда задача уже досчиталась — поэтому держим его в ref, а не читаем
  // устаревший `state` из замыкания watch().
  const includeListingRef = useRef(state.settings.includeListing);
  includeListingRef.current = state.settings.includeListing;

  /**
   * Тавсиф для Uzum по готовой карточке.
   *
   * Бесплатно, поэтому не блокирует и не задерживает саму генерацию:
   * запускается отдельным запросом ровно один раз, когда задача уже
   * досчиталась и стоит галочка в настройках.
   */
  const fetchListing = async (jobId: string) => {
    dispatch({ type: "JOB_LISTING", listing: null, listingStatus: "loading" });
    try {
      const listing = await api.listing(jobId);
      dispatch({ type: "JOB_LISTING", listing, listingStatus: "ready" });
    } catch (error) {
      dispatch({ type: "JOB_LISTING", listing: null, listingStatus: "failed" });
      dispatch({ type: "NOTICE", notice: error instanceof Error ? error.message : "Tavsifni yozib bo‘lmadi" });
    }
  };

  const watch = (jobId: string) => {
    stopWatch.current?.();
    stopWatch.current = api.watch(jobId, (job, balance) => {
      dispatch({ type: "JOB_UPDATE", job });
      if (typeof balance === "number") {
        dispatch({ type: "BALANCE_SET", balance });
        callbacks.current.onBalanceChange?.(balance);
      }
      if (job.status === "success" || job.status === "failed") {
        generationInFlight.current = false;
        sessionStorage.removeItem("naslai.activeJob");
        callbacks.current.onJobSettled?.();
        if (job.status === "success" && includeListingRef.current) void fetchListing(jobId);
      }
    }, (message) => dispatch({ type: "NOTICE", notice: message }));
  };

  useEffect(() => {
    const activeJob = sessionStorage.getItem("naslai.activeJob");
    if (activeJob) {
      generationInFlight.current = true;
      watch(activeJob);
    }
    return () => stopWatch.current?.();
  }, []); // the API instance is stable for the lifetime of this hook

  /**
   * Отмена запущенной генерации.
   *
   * Сервер останавливает работу между картинками: запрос, уже ушедший в
   * OpenAI, прервать нельзя. Поэтому готовые картинки человек получает,
   * а токены возвращаются только за неотрисованные.
   */
  const cancel = async () => {
    const jobId = state.job.id;
    if (!jobId || !generationInFlight.current) return false;
    try {
      const result = await api.cancel(jobId);
      stopWatch.current?.();
      stopWatch.current = null;
      generationInFlight.current = false;
      sessionStorage.removeItem("naslai.activeJob");
      dispatch({ type: "JOB_UPDATE", job: result.job });
      dispatch({ type: "BALANCE_SET", balance: result.balance });
      callbacks.current.onBalanceChange?.(result.balance);
      callbacks.current.onJobSettled?.();
      return result;
    } catch (error) {
      dispatch({ type: "NOTICE", notice: error instanceof Error ? error.message : "Bekor qilib bo‘lmadi" });
      return false;
    }
  };

  const setAssets = async (assets: ProductAsset[]) => {
    const samePrimary = assets[0]?.id && assets[0]?.id === state.assets[0]?.id;
    dispatch({ type: "ASSETS_SET", assets });
    if (!assets[0] || samePrimary) return;
    dispatch({ type: "ANALYSIS_START" });
    try {
      const brief = await api.analyze(assets[0], state.settings.marketplace, state.settings.language);
      dispatch({ type: "ANALYSIS_READY", brief });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "server javob bermadi";
      dispatch({ type: "NOTICE", notice: reason });
      dispatch({ type: "ANALYSIS_READY", brief: fallbackBrief(assets[0], reason) });
    }
  };

  /**
   * Сменить фото-основу без повторного AI-анализа.
   *
   * setAssets перезапускает анализ, когда меняется первое фото, — и это
   * правильно при загрузке. Но на шаге 02 человек уже проверил и, скорее
   * всего, поправил преимущества руками. Повторный анализ стоил бы
   * платного запроса и молча стёр бы его правки.
   */
  const setPrimaryAsset = (assetId: string) => {
    const chosen = state.assets.find((asset) => asset.id === assetId);
    if (!chosen) return;
    const reordered = [chosen, ...state.assets.filter((asset) => asset.id !== assetId)]
      .map((asset, index) => ({ ...asset, isPrimary: index === 0 }));
    dispatch({ type: "ASSETS_SET", assets: reordered });
  };

  /**
   * Пересобрать план текста по текущему брифу.
   *
   * Не трогаем существующий план сам по себе: правки человека важнее
   * автоматики, перезапись делается только по его кнопке.
   */
  const rebuildPlan = async () => {
    try {
      const plan = await api.plan({ brief: state.brief, settings: state.settings });
      dispatch({ type: "SETTINGS_CHANGE", settings: { ...state.settings, plan } });
      return plan;
    } catch (error) {
      dispatch({ type: "NOTICE", notice: error instanceof Error ? error.message : "Rejani tuzib bo‘lmadi" });
      return null;
    }
  };

  const setMarketplace = (marketplace: GenerationSettings["marketplace"]) => {
    dispatch({ type: "SETTINGS_CHANGE", settings: { ...state.settings, marketplace, aspectRatio: marketplacePresets[marketplace].defaultAspectRatio } });
  };

  const updateSettings = (patch: Partial<GenerationSettings>) => dispatch({ type: "SETTINGS_CHANGE", settings: { ...state.settings, ...patch } });
  const updateBrief = (patch: Partial<ProductBrief>) => dispatch({ type: "BRIEF_CHANGE", brief: { ...state.brief, ...patch } });

  useEffect(() => {
    if (!state.assets.length || state.job.status === "analyzing" || state.job.status === "submitting") return;
    let active = true;
    void api.quote(state.settings).then((quote) => { if (active) dispatch({ type: "QUOTE_READY", quote }); }).catch(() => { if (active) { dispatch({ type: "QUOTE_READY", quote: null }); dispatch({ type: "NOTICE", notice: "Narxni hisoblab bo‘lmadi. Ulanishni tekshiring." }); } });
    return () => { active = false; };
  }, [api, state.assets.length, state.job.status, state.settings]);

  const generate = async () => {
    if (generationInFlight.current) return false;
    const asset = state.assets.find((item) => item.isPrimary) ?? state.assets[0];
    const quote = state.job.quote;
    if (!asset || !quote) return false;
    const needsVerifiedBrief = state.settings.contentType === "card" || state.settings.contentType === "copyStyle" || state.settings.contentType === "marketplacePackage";
    const verifiedBenefits = state.brief.benefits.map((benefit) => benefit.trim()).filter(Boolean);
    if (needsVerifiedBrief && (!state.brief.title.trim() || !state.brief.category.trim())) {
      dispatch({ type: "NOTICE", notice: "Generatsiyadan oldin mahsulot nomi va kategoriyasini kiriting." });
      return false;
    }
    if (needsVerifiedBrief && verifiedBenefits.length < 2) {
      dispatch({ type: "NOTICE", notice: "Generatsiyadan oldin AI bergan yoki o‘zingiz tekshirgan kamida 2 ta aniq afzallikni kiriting." });
      return false;
    }
    if (state.settings.contentType === "video" && !state.settings.video.prompt.trim()) {
      dispatch({ type: "NOTICE", notice: "Video ssenariysini yozing yoki AI g‘oyasidan foydalaning." });
      return false;
    }
    if (state.settings.contentType === "copyStyle" && !state.settings.designReferenceDataUrl) {
      dispatch({ type: "NOTICE", notice: "Uslub namunasi rasmini yuklang." });
      return false;
    }
    generationInFlight.current = true;
    const idempotencyKey = `gen_${crypto.randomUUID().replaceAll("-", "")}`;
    dispatch({ type: "JOB_UPDATE", job: { ...state.job, status: "submitting", progress: 6, message: "Token balansi tekshirilib, vazifa yaratilmoqda", error: null } });
    try {
      const started = await api.start({ asset, brief: state.brief, settings: state.settings, idempotencyKey });
      dispatch({ type: "BALANCE_SET", balance: started.balance });
      callbacks.current.onBalanceChange?.(started.balance);
      dispatch({ type: "JOB_UPDATE", job: started.job });
      sessionStorage.setItem("naslai.activeJob", started.job.id);
      watch(started.job.id);
      return true;
    } catch (error) {
      generationInFlight.current = false;
      dispatch({ type: "JOB_UPDATE", job: { ...state.job, status: "failed", results: [], error: error instanceof Error ? error.message : "Generatsiyada xatolik", message: "Generatsiya boshlanmadi" } });
      return false;
    }
  };

  /**
   * Переделать один кадр.
   *
   * Раньше исправить один неудачный слайд можно было только перезапуском
   * всей задачи: в пакете из восьми слайдов это восемь токенов ради
   * одной картинки. Здесь списывается один, остальные остаются на месте.
   *
   * Пока кадр рисуется, задача остаётся "success": человек продолжает
   * видеть и скачивать готовые слайды.
   */
  const regenerateSlide = async (variant: number, note: string) => {
    const jobId = state.job.id;
    if (!jobId || state.job.status !== "success" || state.job.regenerating) return false;
    try {
      const result = await api.regenerateSlide(jobId, variant, note);
      dispatch({ type: "JOB_UPDATE", job: result.job });
      dispatch({ type: "BALANCE_SET", balance: result.balance });
      callbacks.current.onBalanceChange?.(result.balance);
      // Дальше следим за задачей обычным опросом: он сам остановится,
      // когда `regenerating` опустеет.
      watchRegeneration(jobId);
      return true;
    } catch (error) {
      dispatch({ type: "NOTICE", notice: error instanceof Error ? error.message : "Slaydni qayta chizib bo‘lmadi" });
      return false;
    }
  };

  /**
   * Сохранить картинку, собранную браузером.
   *
   * В режиме своего текста модель рисует только фон. Пока композиция не
   * сохранена, в проекте и в архиве лежал бы кадр без единой надписи.
   */
  const composeSlide = async (variant: number, imageDataUrl: string) => {
    const jobId = state.job.id;
    if (!jobId) return false;
    try {
      const result = await api.compose(jobId, variant, imageDataUrl);
      dispatch({ type: "JOB_UPDATE", job: result.job });
      callbacks.current.onJobSettled?.();
      return true;
    } catch (error) {
      dispatch({ type: "NOTICE", notice: error instanceof Error ? error.message : "Saqlab bo‘lmadi" });
      return false;
    }
  };

  /** Опрос до конца перерисовки. Отдельный от watch: статус задачи не меняется. */
  const watchRegeneration = (jobId: string) => {
    stopWatch.current?.();
    stopWatch.current = api.watchRegeneration(jobId, (job, balance) => {
      dispatch({ type: "JOB_UPDATE", job });
      if (typeof balance === "number") {
        dispatch({ type: "BALANCE_SET", balance });
        callbacks.current.onBalanceChange?.(balance);
      }
      if (!job.regenerating) {
        stopWatch.current?.();
        stopWatch.current = null;
        callbacks.current.onJobSettled?.();
      }
    }, (message) => dispatch({ type: "NOTICE", notice: message }));
  };

  /**
   * AI yordamida rasmni qatlamlarga (fon, mahsulot, matn) ajratish (Magic Layers).
   */
  const separateLayers = async (variant: number, options?: SeparateLayersOptions) => {
    const jobId = state.job.id;
    if (!jobId) throw new Error("Loyiha topilmadi");
    try {
      const result = await api.separateLayers(jobId, variant, options);
      if (result.job) {
        dispatch({ type: "JOB_UPDATE", job: result.job });
      } else if (result.elements || result.layers || result.textLayers) {
        const updatedResults = state.job.results.map((r, idx) => {
          if (idx + 1 === variant) {
            return {
              ...r,
              layers: result.layers ?? [],
              textLayers: result.textLayers ?? [],
              textRemoved: result.textRemoved,
              layersVersion: result.layersVersion,
              baseUrl: result.baseUrl,
              cleanUrl: result.cleanUrl ?? null,
              backgroundUrl: result.backgroundUrl,
              elements: result.elements ?? [],
              objectsRemoved: result.objectsRemoved,
            };
          }
          return r;
        });
        dispatch({ type: "JOB_UPDATE", job: { ...state.job, results: updatedResults } });
      }
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Qatlamlarga ajratib bo‘lmadi";
      dispatch({ type: "NOTICE", notice: msg });
      throw error;
    }
  };

  /**
   * Magic Layers v5 "Bosib ajratish". Xatolar muharrirning o'zida (toast) ko'rsatiladi —
   * bu yerda notice chiqarilmaydi. Muvaffaqiyatda natijadagi qatlamlar ham yangilanadi
   * (muharrir qayta ochilganda yangi obyekt va fon ko'rinsin — server ham shu holatni saqlaydi).
   */
  const extractLayer = async (variant: number, point: ExtractLayerPoint): Promise<ExtractLayerResponse> => {
    const jobId = state.job.id;
    if (!jobId) throw new Error("Loyiha topilmadi");
    const result = await api.extractLayer(jobId, variant, point);
    const job = latestJob.current;
    if (job.id !== jobId) return result;
    const updatedResults = job.results.map((r, idx) => (idx + 1 === variant
      ? { ...r, backgroundUrl: result.backgroundUrl, elements: [...(r.elements ?? []).filter((e) => e.id !== result.element.id), result.element] }
      : r));
    dispatch({ type: "JOB_UPDATE", job: { ...job, results: updatedResults } });
    return result;
  };

  return {
    state,
    extractLayer,
    setAssets,
    setPrimaryAsset,
    setMarketplace,
    updateSettings,
    updateBrief,
    generate,
    rebuildPlan,
    cancel,
    regenerateSlide,
    separateLayers,
    composeSlide,
    /** Заново запросить тавсиф, если предыдущая попытка упала. */
    retryListing: () => { const jobId = state.job.id; if (jobId) void fetchListing(jobId); },
    download: (url: string) => api.download(url),
    reset: () => { stopWatch.current?.(); sessionStorage.removeItem("naslai.activeJob"); generationInFlight.current = false; dispatch({ type: "RESET", balance: state.balance }); },
    setNotice: (notice: string | null) => dispatch({ type: "NOTICE", notice }),
    dismissNotice: () => dispatch({ type: "NOTICE", notice: null }),
  };
}
