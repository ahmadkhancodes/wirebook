import type { MeterId } from "@/config/product";

/** Product-facing names for each meter. A new product edits this map. */
export const METER_LABELS: Record<MeterId, { singular: string; plural: string; period: string }> = {
  files: { singular: "active company file", plural: "active company files", period: "this month" },
};

export const METERS_SHOWN: MeterId[] = ["files"];
export const fmt = (n: number) => new Intl.NumberFormat("en").format(n);
