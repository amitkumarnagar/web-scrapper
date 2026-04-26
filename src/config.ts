import path from "node:path";

export const INPUT_JSON_PATH = path.resolve(process.cwd(), "skus.json");
export const OUTPUTS_ROOT_PATH = path.resolve(process.cwd(), "outputs");

export const OUTPUT_FILE_NAMES = {
  appLog: "app.log",
  blockedSkus: "blocked_skus.json",
  errorsLog: "errors.log",
  productCsv: "product_data.csv",
} as const;

export const DEFAULT_SCRAPER_CONFIG = {
  concurrency: 2,
  delayMaxMs: 3500,
  delayMinMs: 1500,
  headless: true,
  locale: "en-US",
  retries: 2,
  timeoutMs: 30_000,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  viewport: {
    height: 1024,
    width: 1440,
  },
  walmartConcurrency: 1,
  walmartDelayMaxMs: 9000,
  walmartDelayMinMs: 5000,
} as const;

export interface ScraperConfig {
  concurrency: number;
  delayMaxMs: number;
  delayMinMs: number;
  headless: boolean;
  locale: string;
  retries: number;
  timeoutMs: number;
  userAgent: string;
  viewport: {
    height: number;
    width: number;
  };
  walmartConcurrency: number;
  walmartDelayMaxMs: number;
  walmartDelayMinMs: number;
}

export function getScraperConfig(env: NodeJS.ProcessEnv = process.env): ScraperConfig {
  const delayMinMs = readIntegerEnv(env.SCRAPER_DELAY_MIN_MS, DEFAULT_SCRAPER_CONFIG.delayMinMs, { min: 0 });
  const walmartDelayMinMs = readIntegerEnv(env.WALMART_DELAY_MIN_MS, DEFAULT_SCRAPER_CONFIG.walmartDelayMinMs, { min: 0 });

  return {
    concurrency: readIntegerEnv(env.SCRAPER_CONCURRENCY, DEFAULT_SCRAPER_CONFIG.concurrency, { min: 1 }),
    delayMaxMs: readIntegerEnv(env.SCRAPER_DELAY_MAX_MS, DEFAULT_SCRAPER_CONFIG.delayMaxMs, { min: delayMinMs }),
    delayMinMs,
    headless: env.HEADLESS !== "false",
    locale: DEFAULT_SCRAPER_CONFIG.locale,
    retries: readIntegerEnv(env.SCRAPER_RETRIES, DEFAULT_SCRAPER_CONFIG.retries, { min: 0 }),
    timeoutMs: readIntegerEnv(env.SCRAPER_TIMEOUT_MS, DEFAULT_SCRAPER_CONFIG.timeoutMs, { min: 1 }),
    userAgent: DEFAULT_SCRAPER_CONFIG.userAgent,
    viewport: DEFAULT_SCRAPER_CONFIG.viewport,
    walmartConcurrency: DEFAULT_SCRAPER_CONFIG.walmartConcurrency,
    walmartDelayMaxMs: readIntegerEnv(env.WALMART_DELAY_MAX_MS, DEFAULT_SCRAPER_CONFIG.walmartDelayMaxMs, {
      min: walmartDelayMinMs,
    }),
    walmartDelayMinMs,
  };
}

function readIntegerEnv(value: string | undefined, fallback: number, options: { min: number }): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < options.min) {
    return fallback;
  }

  return Math.floor(parsed);
}
