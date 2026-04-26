import type { Page } from "playwright";

import type { ProductData, ScrapeResult, SkuEntry } from "../types.js";
import {
  collectText,
  combineReviewsAndRating,
  detectBlockedPage,
  firstVisibleText,
} from "../utils.js";

export function buildAmazonUrl(sku: string): string {
  return `https://www.amazon.com/dp/${encodeURIComponent(sku)}`;
}

export async function scrapeAmazonProduct(page: Page, skuEntry: SkuEntry, timeoutMs: number): Promise<ScrapeResult> {
  const url = buildAmazonUrl(skuEntry.SKU);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const blockedCode = await detectBlockedPage(page);
    if (blockedCode) {
      return {
        success: false,
        error: "Amazon presented an anti-bot challenge instead of a product page.",
        errorCode: blockedCode,
        url,
      };
    }

    const pageTitle = await page.title().catch(() => "");
    const notFoundText = await page.locator("body").innerText().catch(() => "");
    if (/page not found|dogs of amazon|looking for something/i.test(`${pageTitle} ${notFoundText}`)) {
      return {
        success: false,
        error: "Amazon product page not found.",
        errorCode: "NOT_FOUND",
        url,
      };
    }

    const title = await firstVisibleText(page, [
      "#productTitle",
      "h1#title span",
      "[data-cy='title-recipe-title']",
    ]);

    if (!title) {
      const bodySnippet = await page.locator("body").innerText().then((text) => text.replace(/\s+/g, " ").trim().slice(0, 240)).catch(() => "");

      return {
        success: false,
        error: `Amazon page loaded but no title selector matched. pageTitle=${pageTitle || "N/A"} bodySnippet=${bodySnippet || "N/A"}`,
        errorCode: "SELECTOR_MISSING",
        url,
      };
    }

    const price = await firstVisibleText(page, [
      ".priceToPay span.a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#corePrice_feature_div .a-offscreen",
      "#tp_price_block_total_price_ww span.a-offscreen",
      ".a-price.aok-align-center .a-offscreen",
    ]);

    const description = await collectText(page, [
      "#feature-bullets ul li span.a-list-item",
      "#bookDescription_feature_div .a-expander-content",
      "#productDescription p",
      "#productDescription span",
    ]);

    const reviewCount = await firstVisibleText(page, [
      "#acrCustomerReviewText",
      "[data-hook='total-review-count']",
    ]);

    const rating = await firstVisibleText(page, [
      "i[data-hook='average-star-rating'] span",
      "#acrPopover",
      "[data-hook='rating-out-of-text']",
    ]);

    const data: ProductData = {
      sku: skuEntry.SKU,
      source: "Amazon",
      title,
      description,
      price,
      reviewsAndRating: combineReviewsAndRating(reviewCount, rating),
    };

    return { success: true, data, url };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Amazon scrape error.",
      errorCode: "UNKNOWN",
      url,
    };
  }
}
