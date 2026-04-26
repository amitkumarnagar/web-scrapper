import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { getScraperConfig, type ScraperConfig } from "./config.js";
import { logError, logInfo, logWarn } from "./logger.js";
import { scrapeAmazonProduct } from "./sites/amazon.js";
import { scrapeWalmartProduct } from "./sites/walmart.js";
import type { ProductData, ScrapeResult, SkuEntry } from "./types.js";
import {
  appendProducts,
  appendBlockedSku,
  delay,
  prepareBrowserContext,
  randomBetween,
} from "./utils.js";

async function scrapeOneSku(
  page: Page,
  skuEntry: SkuEntry,
  options: { timeoutMs: number },
): Promise<ScrapeResult> {
  logInfo("Starting page scrape", {
    source: skuEntry.Type,
    sku: skuEntry.SKU,
    timeoutMs: options.timeoutMs,
  });

  if (skuEntry.Type === "Amazon") {
    return await scrapeAmazonProduct(page, skuEntry, options.timeoutMs);
  }

  return await scrapeWalmartProduct(page, skuEntry, options.timeoutMs);
}

async function createWorkerSession(
  browser: Browser,
  config: ScraperConfig,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: config.viewport,
    locale: config.locale,
  });
  await prepareBrowserContext(context);

  return {
    context,
    page: await context.newPage(),
  };
}

export async function runScraper(skus: SkuEntry[]): Promise<void> {
  const config = getScraperConfig();

  const successfulRecords: ProductData[] = [];
  let failedCount = 0;
  let currentIndex = 0;
  let walmartChain = Promise.resolve();
  const browser = await chromium.launch({ headless: config.headless });

  logInfo("Starting scraper run", {
    totalSkus: skus.length,
    concurrency: config.concurrency,
    walmartConcurrency: config.walmartConcurrency,
    retries: config.retries,
    timeoutMs: config.timeoutMs,
    headless: config.headless,
    delayMinMs: config.delayMinMs,
    delayMaxMs: config.delayMaxMs,
    walmartDelayMinMs: config.walmartDelayMinMs,
    walmartDelayMaxMs: config.walmartDelayMaxMs,
  });

  async function processSku(workerId: number, skuEntry: SkuEntry, queueIndex: number, page: Page): Promise<void> {
    const isWalmart = skuEntry.Type === "Walmart";
    const initialDelayMs = isWalmart
      ? randomBetween(config.walmartDelayMinMs, config.walmartDelayMaxMs)
      : randomBetween(config.delayMinMs, config.delayMaxMs);

    logInfo("Worker picked SKU", {
      workerId,
      queueIndex,
      source: skuEntry.Type,
      sku: skuEntry.SKU,
    });
    logInfo("Applying pre-scrape delay", {
      workerId,
      source: skuEntry.Type,
      sku: skuEntry.SKU,
      delayMs: initialDelayMs,
    });
    await delay(initialDelayMs);

    let result: ScrapeResult | null = null;

    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      logInfo("Scrape attempt started", {
        workerId,
        source: skuEntry.Type,
        sku: skuEntry.SKU,
        attempt: attempt + 1,
        maxAttempts: config.retries + 1,
      });

      result = await scrapeOneSku(page, skuEntry, { timeoutMs: config.timeoutMs });
      if (result.success) {
        logInfo("Scrape attempt succeeded", {
          workerId,
          source: skuEntry.Type,
          sku: skuEntry.SKU,
          attempt: attempt + 1,
        });
        break;
      }

      if (attempt < config.retries) {
        const retryDelayMs = isWalmart
          ? randomBetween(config.walmartDelayMinMs, config.walmartDelayMaxMs)
          : 1_000 * (attempt + 1);
        logWarn("Scrape attempt failed, retrying", {
          workerId,
          source: skuEntry.Type,
          sku: skuEntry.SKU,
          attempt: attempt + 1,
          maxAttempts: config.retries + 1,
          errorCode: result.errorCode ?? "UNKNOWN",
          error: result.error ?? "Unknown scraping failure.",
          retryDelayMs,
        });
        await delay(retryDelayMs);
      }
    }

    if (result?.success && result.data) {
      successfulRecords.push(result.data);
      logInfo("Stored scrape result in memory", {
        workerId,
        source: result.data.source,
        sku: result.data.sku,
        successfulCount: successfulRecords.length,
      });
      return;
    }

    failedCount += 1;
    logWarn("SKU failed after all retries", {
      workerId,
      source: skuEntry.Type,
      sku: skuEntry.SKU,
      errorCode: result?.errorCode ?? "UNKNOWN",
      error: result?.error ?? "Unknown scraping failure.",
    });

    if (result?.errorCode === "CAPTCHA" || result?.errorCode === "ANTI_BOT") {
      await appendBlockedSku({
        Type: skuEntry.Type,
        SKU: skuEntry.SKU,
        errorCode: result.errorCode,
        url: result.url,
        blockedAt: new Date().toISOString(),
      });
      logWarn("Added SKU to blocked retry list", {
        workerId,
        source: skuEntry.Type,
        sku: skuEntry.SKU,
      });
    }

    await logError({
      source: skuEntry.Type,
      sku: skuEntry.SKU,
      url: result?.url,
      errorCode: result?.errorCode,
      message: result?.error ?? "Unknown scraping failure.",
    });
  }

  async function worker(workerId: number): Promise<void> {
    const { context, page } = await createWorkerSession(browser, config);

    try {
      logInfo("Worker started", { workerId });

      while (currentIndex < skus.length) {
        const nextIndex = currentIndex;
        currentIndex += 1;

        const skuEntry = skus[nextIndex];
        if (!skuEntry) {
          continue;
        }

        if (skuEntry.Type === "Walmart") {
          walmartChain = walmartChain.then(() => processSku(workerId, skuEntry, nextIndex, page));
          await walmartChain;
          continue;
        }

        await processSku(workerId, skuEntry, nextIndex, page);
      }
    } finally {
      await context.close();
      logInfo("Worker completed", { workerId });
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(config.concurrency, skus.length) }, (_, index) => worker(index + 1)));
    logInfo("Writing successful records to CSV", {
      records: successfulRecords.length,
    });
    await appendProducts(successfulRecords);
    logInfo("Scraper run finished", {
      totalSkus: skus.length,
      succeeded: successfulRecords.length,
      failed: failedCount,
    });
  } finally {
    await browser.close();
  }
}
