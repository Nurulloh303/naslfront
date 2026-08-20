import type { AspectRatio, Marketplace } from "./types";

export const marketplacePresets: Record<Marketplace, {
  label: string;
  shortLabel: string;
  defaultAspectRatio: AspectRatio;
  safeZone: string;
  hint: string;
}> = {
  wb: {
    label: "Wildberries",
    shortLabel: "WB",
    defaultAspectRatio: "3:4",
    safeZone: "Asosiy matnni kadrning markaziy qismida saqlang.",
    hint: "Marketplace kartalari uchun yagona 1080x1440 format.",
  },
  uzum: {
    label: "Uzum Market",
    shortLabel: "Uzum",
    defaultAspectRatio: "3:4",
    safeZone: "Asosiy matnni kadrning markaziy qismida saqlang.",
    hint: "Uzum, WB va Ozon uchun yagona 1080x1440 format.",
  },
  ozon: {
    label: "Ozon",
    shortLabel: "Ozon",
    defaultAspectRatio: "3:4",
    safeZone: "Asosiy matnni kadrning markaziy qismida saqlang.",
    hint: "Ozon kartalari uchun 1080x1440 format ishlatiladi.",
  },
};
