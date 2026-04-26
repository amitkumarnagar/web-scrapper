export type Source = "Amazon" | "Walmart";

export interface SkuEntry {
  Type: Source;
  SKU: string;
}

export interface SkuInput {
  skus: SkuEntry[];
}

export interface ProductData {
  sku: string;
  source: Source;
  title: string;
  description: string;
  price: string;
  reviewsAndRating: string;
}

export interface ScrapeResult {
  success: boolean;
  data?: ProductData;
  error?: string;
  errorCode?: string;
  url?: string;
}

export interface RunOutputPaths {
  runId: string;
  runDirectory: string;
  appLogPath: string;
  productCsvPath: string;
  errorsLogPath: string;
  blockedSkusPath: string;
}

export interface BlockedSkuEntry {
  Type: Source;
  SKU: string;
  errorCode: string;
  url?: string;
  blockedAt: string;
}
