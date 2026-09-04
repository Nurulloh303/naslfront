import { apiFetch } from "../../../app/apiClient";
import type { GenerationJob, GenerationSettings, ProductAsset, ProductBrief, ProductListing, Quote, SlidePlan } from "../domain/types";

type StartResponse = { job: GenerationJob; balance: number; idempotentReplay: boolean };
export type CancelResponse = { job: GenerationJob; balance: number; refunded: number; delivered: number };

export type CreateApi = {
  analyze(asset: ProductAsset, marketplace: GenerationSettings["marketplace"], language: GenerationSettings["language"]): Promise<ProductBrief>;
  quote(settings: GenerationSettings): Promise<Quote>;
  start(input: { asset: ProductAsset; brief: ProductBrief; settings: GenerationSettings; idempotencyKey: string }): Promise<StartResponse>;
  watch(jobId: string, onUpdate: (job: GenerationJob, balance?: number) => void, onConnectionError: (message: string) => void): () => void;
  cancel(jobId: string): Promise<CancelResponse>;
  /** Matn rejasi: brif bo'yicha, bepul va mgnovenno (modelsiz). */
  plan(input: { brief: ProductBrief; settings: GenerationSettings }): Promise<SlidePlan[]>;
  /** Bitta slaydni qayta chizish. 1 token, qolgan rasmlar tegilmaydi. */
  regenerateSlide(jobId: string, variant: number, note: string): Promise<{ job: GenerationJob; balance: number }>;
  /** Brauzerda yig'ilgan (o'z matni bilan) slaydni saqlash. Bepul. */
  compose(jobId: string, variant: number, imageDataUrl: string): Promise<{ job: GenerationJob }>;
  /** Slayd qayta chizilishini kuzatish: umumiy vazifa holati o'zgarmaydi. */
  watchRegeneration(jobId: string, onUpdate: (job: GenerationJob, balance?: number) => void, onConnectionError: (message: string) => void): () => void;
  /** Uzum uchun bepul tavsif — tayyor loyihaning o'z rasmidan. */
  listing(jobId: string): Promise<ProductListing>;
  download(url: string): void;
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const payload = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message ?? "Xizmat vaqtincha ishlamayapti");
  if (!payload) throw new Error("Serverdan bo‘sh javob keldi");
  return payload;
}

async function analyzeWithOpenAi(
  asset: ProductAsset,
  marketplace: GenerationSettings["marketplace"],
  language: GenerationSettings["language"],
): Promise<ProductBrief> {
  if (!asset.sourceDataUrl) throw new Error("Rasmni AI tahlili uchun tayyorlab bo‘lmadi");
  // Til ham ketadi: brif kartaning tilida yozilishi kerak.
  const payload = await jsonRequest<ProductBrief>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl: asset.sourceDataUrl, marketplace, language }),
  });
  return { title: payload.title, subtitle: payload.subtitle ?? "", category: payload.category, sku: "", benefits: payload.benefits, aiNotice: payload.aiNotice };
}

export function createP0Api(): CreateApi {
  return {
    analyze: analyzeWithOpenAi,
    async quote(settings) {
      return jsonRequest<Quote>("/api/quote", { method: "POST", body: JSON.stringify({ settings }) });
    },
    async start({ asset, brief, settings, idempotencyKey }) {
      if (!asset.sourceDataUrl) throw new Error("Asl rasm topilmadi. Rasmni yana yuklang.");
      return jsonRequest<StartResponse>("/api/generations", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({ assetDataUrl: asset.sourceDataUrl, brief, settings }),
      });
    },
    async plan({ brief, settings }) {
      // Bepul va mgnovenno: server rejani brif bo'yicha hisoblaydi, modelga murojaat qilinmaydi.
      const payload = await jsonRequest<{ plan: SlidePlan[] }>("/api/plan", {
        method: "POST",
        body: JSON.stringify({ brief, settings }),
      });
      return payload.plan;
    },
    async cancel(jobId) {
      return jsonRequest<CancelResponse>(`/api/generations/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    },
    async listing(jobId) {
      const payload = await jsonRequest<{ listing: ProductListing }>(`/api/projects/${encodeURIComponent(jobId)}/listing`, { method: "POST", body: "{}" });
      return payload.listing;
    },
    async compose(jobId, variant, imageDataUrl) {
      return jsonRequest<{ job: GenerationJob }>(
        `/api/generations/${encodeURIComponent(jobId)}/results/${variant}/compose`,
        { method: "PUT", body: JSON.stringify({ imageDataUrl }) },
      );
    },
    async regenerateSlide(jobId, variant, note) {
      return jsonRequest<{ job: GenerationJob; balance: number }>(
        `/api/generations/${encodeURIComponent(jobId)}/results/${variant}/regenerate`,
        { method: "POST", body: JSON.stringify({ note }) },
      );
    },
    // Alohida so'rov: `watch` "success" holatida to'xtaydi, qayta chizish
    // paytida esa vazifa aynan shu holatda qoladi — faqat `regenerating`
    // maydoni o'zgaradi.
    watchRegeneration(jobId, onUpdate, onConnectionError) {
      let stopped = false;
      let timer = 0;
      let failures = 0;
      const poll = async () => {
        if (stopped) return;
        try {
          const payload = await jsonRequest<{ job: GenerationJob; balance: number }>(`/api/generations/${encodeURIComponent(jobId)}`);
          failures = 0;
          onUpdate(payload.job, payload.balance);
          if (!payload.job.regenerating) return;
          timer = window.setTimeout(() => void poll(), 900);
        } catch (reason) {
          failures += 1;
          const message = reason instanceof Error ? reason.message : "Server bilan aloqa uzildi";
          onConnectionError(failures >= 3 ? `${message}. Slayd saqlandi — qayta ulanmoqdamiz.` : "Ulanish tekshirilmoqda…");
          if (failures > 10) return;
          timer = window.setTimeout(() => void poll(), Math.min(4_000, 800 * failures));
        }
      };
      void poll();
      return () => { stopped = true; window.clearTimeout(timer); };
    },
    watch(jobId, onUpdate, onConnectionError) {
      let stopped = false;
      let timer = 0;
      let failures = 0;
      const poll = async () => {
        if (stopped) return;
        try {
          const payload = await jsonRequest<{ job: GenerationJob; balance: number }>(`/api/generations/${encodeURIComponent(jobId)}`);
          failures = 0;
          onUpdate(payload.job, payload.balance);
          if (payload.job.status === "success" || payload.job.status === "failed") return;
          timer = window.setTimeout(() => void poll(), 650);
        } catch (reason) {
          failures += 1;
          const message = reason instanceof Error ? reason.message : "Server bilan aloqa uzildi";
          onConnectionError(failures >= 3 ? `${message}. Vazifa saqlandi — qayta ulanmoqdamiz.` : "Ulanish tekshirilmoqda…");
          timer = window.setTimeout(() => void poll(), Math.min(4_000, 800 * failures));
        }
      };
      void poll();
      return () => { stopped = true; window.clearTimeout(timer); };
    },
    download(url) {
      const link = document.createElement("a");
      link.href = url;
      link.download = "";
      document.body.append(link);
      link.click();
      link.remove();
    },
  };
}
