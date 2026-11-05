import { apiFetch, apiUrl } from "../../app/apiClient";
import { createP0Api, type CancelResponse } from "../create/services/createApi";
import type { GenerationJob } from "../create/domain/types";

/**
 * "O'lchamni moslash" — istalgan rasmni Uzum formatiga (1080×1440, 3:4) keltirish.
 *
 * Kontrakt (backend bilan kelishilgan, o'zgartirmang):
 *   POST /api/resize { image, mode, color?, focusX?, focusY?, title?, idempotencyKey? } → 201 { job, balance }
 *   402 { error: "INSUFFICIENT_TOKENS" }, 400 { error: "BAD_IMAGE" | "BAD_MODE" }
 * Kuzatish va bekor qilish — oddiy generatsiyalar bilan bir xil yo'llar.
 */

export type ResizeMode = "ai" | "blur" | "color" | "crop";

export type ResizeResult = {
  id: string;
  url: string;
  width: number;
  height: number;
  mode: ResizeMode;
  upscaled: boolean;
  originalWidth: number;
  originalHeight: number;
};

export type ResizeJob = Omit<GenerationJob, "results"> & { results: ResizeResult[] };

export type ResizeRequest = {
  image: string;
  mode: ResizeMode;
  color?: string;
  focusX?: number;
  focusY?: number;
  title?: string;
  idempotencyKey?: string;
};

export class ResizeError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ResizeError";
    this.status = status;
    this.code = code;
  }
}

const jobs = createP0Api();

export const resizeApi = {
  async start(input: ResizeRequest): Promise<{ job: ResizeJob; balance: number }> {
    let response: Response;
    try {
      response = await apiFetch("/api/resize", {
        method: "POST",
        headers: input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : undefined,
        body: JSON.stringify(input),
      });
    } catch (reason) {
      throw new ResizeError(reason instanceof Error ? reason.message : "Network error", 0, null);
    }
    const payload = await response.json().catch(() => null) as ({ job?: ResizeJob; balance?: number; error?: string; message?: string }) | null;
    if (!response.ok) throw new ResizeError(payload?.message ?? `HTTP ${response.status}`, response.status, payload?.error ?? null);
    if (!payload?.job) throw new ResizeError("Empty response", response.status, null);
    return { job: payload.job, balance: payload.balance ?? 0 };
  },
  watch(jobId: string, onUpdate: (job: ResizeJob, balance?: number) => void, onConnectionError: (message: string) => void): () => void {
    return jobs.watch(jobId, (job, balance) => onUpdate(job as unknown as ResizeJob, balance), onConnectionError);
  },
  cancel(jobId: string): Promise<CancelResponse> {
    return jobs.cancel(jobId);
  },
};

/** Server `/media/...` kabi nisbiy manzil qaytarishi mumkin — API domeniga bog'laymiz. */
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  return url.startsWith("/") && !url.startsWith("//") ? apiUrl(url) : url;
}
