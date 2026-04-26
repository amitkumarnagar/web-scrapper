import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createObjectCsvWriter } from "csv-writer";
import type { BrowserContext, Locator, Page } from "playwright";

import { INPUT_JSON_PATH, OUTPUTS_ROOT_PATH, OUTPUT_FILE_NAMES } from "./config.js";
import type {
  BlockedSkuEntry,
  ProductData,
  RunOutputPaths,
  SkuEntry,
  SkuInput,
} from "./types.js";

const CSV_HEADERS = [
  { id: "sku", title: "SKU" },
  { id: "source", title: "Source" },
  { id: "title", title: "Title" },
  { id: "description", title: "Description" },
  { id: "price", title: "Price" },
  { id: "reviewsAndRating", title: "Number of Reviews and rating" },
];

let currentOutputPaths: RunOutputPaths | null = null;

export async function loadSkus(filePath = INPUT_JSON_PATH): Promise<SkuEntry[]> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SkuInput>;

  if (!parsed.skus || !Array.isArray(parsed.skus)) {
    throw new Error("Invalid skus.json: expected a top-level 'skus' array.");
  }

  return parsed.skus.map((entry, index) => {
    if (!entry || typeof entry.SKU !== "string" || (entry.Type !== "Amazon" && entry.Type !== "Walmart")) {
      throw new Error(`Invalid SKU entry at index ${index}.`);
    }

    return {
      Type: entry.Type,
      SKU: entry.SKU.trim(),
    };
  });
}

export async function ensureOutputFiles(): Promise<RunOutputPaths> {
  const runId = createRunId();
  const runDirectory = path.join(OUTPUTS_ROOT_PATH, runId);
  const outputPaths: RunOutputPaths = {
    runId,
    runDirectory,
    appLogPath: path.join(runDirectory, OUTPUT_FILE_NAMES.appLog),
    productCsvPath: path.join(runDirectory, OUTPUT_FILE_NAMES.productCsv),
    errorsLogPath: path.join(runDirectory, OUTPUT_FILE_NAMES.errorsLog),
    blockedSkusPath: path.join(runDirectory, OUTPUT_FILE_NAMES.blockedSkus),
  };

  await mkdir(runDirectory, { recursive: true });

  try {
    await stat(outputPaths.productCsvPath);
  } catch {
    const csvWriter = createObjectCsvWriter({
      path: outputPaths.productCsvPath,
      header: CSV_HEADERS,
      append: false,
    });
    await csvWriter.writeRecords([]);
  }

  try {
    await stat(outputPaths.appLogPath);
  } catch {
    await writeFile(outputPaths.appLogPath, "", "utf8");
  }

  try {
    await stat(outputPaths.errorsLogPath);
  } catch {
    await writeFile(outputPaths.errorsLogPath, "", "utf8");
  }

  try {
    await stat(outputPaths.blockedSkusPath);
  } catch {
    await writeFile(outputPaths.blockedSkusPath, JSON.stringify({ blocked: [] }, null, 2), "utf8");
  }

  currentOutputPaths = outputPaths;
  return outputPaths;
}

export async function appendProducts(records: ProductData[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const csvWriter = createObjectCsvWriter({
    path: getOutputPaths().productCsvPath,
    header: CSV_HEADERS,
    append: true,
  });

  await csvWriter.writeRecords(records);
}

export async function appendBlockedSku(entry: BlockedSkuEntry): Promise<void> {
  const blockedSkusPath = getOutputPaths().blockedSkusPath;
  const raw = await readFile(blockedSkusPath, "utf8");
  const parsed = JSON.parse(raw) as { blocked?: BlockedSkuEntry[] };
  const blocked = Array.isArray(parsed.blocked) ? parsed.blocked : [];

  blocked.push(entry);

  await writeFile(blockedSkusPath, JSON.stringify({ blocked }, null, 2), "utf8");
}

export function getOutputPaths(): RunOutputPaths {
  if (!currentOutputPaths) {
    throw new Error("Output files have not been initialized.");
  }

  return currentOutputPaths;
}

export async function firstVisibleText(page: Page, selectors: string[], timeoutMs = 5_000): Promise<string> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const text = await getLocatorText(locator, timeoutMs);
    if (text) {
      return normalizeWhitespace(text);
    }
  }

  return "";
}

export async function collectText(page: Page, selectors: string[], timeoutMs = 3_000): Promise<string> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      continue;
    }

    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const text = await getLocatorText(locator.nth(index), timeoutMs);
      if (text) {
        parts.push(normalizeWhitespace(text));
      }
    }

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return "";
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function combineReviewsAndRating(reviewCount: string, rating: string): string {
  if (reviewCount && rating) {
    return `${reviewCount} | ${rating}`;
  }

  return reviewCount || rating;
}

export async function detectBlockedPage(page: Page): Promise<string | null> {
  const bodyText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));

  if (!bodyText) {
    return null;
  }

  const normalizedBody = bodyText.toLowerCase();
  const blockIndicators = [
    { code: "CAPTCHA", pattern: "enter the characters you see below" },
    { code: "CAPTCHA", pattern: "sorry, we just need to make sure you're not a robot" },
    { code: "CAPTCHA", pattern: "captcha" },
    { code: "CAPTCHA", pattern: "verify you are a human" },
    { code: "CAPTCHA", pattern: "access denied" },
    { code: "CAPTCHA", pattern: "robot or human" },
    { code: "ANTI_BOT", pattern: "click the button below to continue shopping" },
    { code: "ANTI_BOT", pattern: "continue shopping conditions of use privacy policy" },
  ];

  const match = blockIndicators.find((indicator) => normalizedBody.includes(indicator.pattern));
  return match?.code ?? null;
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function createRunId(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export async function prepareBrowserContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });
}

async function getLocatorText(locator: Locator, timeoutMs: number): Promise<string> {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    return await locator.innerText({ timeout: timeoutMs });
  } catch {
    return "";
  }
}
