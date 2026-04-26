import type { Page } from "playwright";

import type { ProductData, ScrapeResult, SkuEntry } from "../types.js";
import {
  collectText,
  combineReviewsAndRating,
  detectBlockedPage,
  firstVisibleText,
} from "../utils.js";

export function buildWalmartUrl(sku: string): string {
  return `https://www.walmart.com/ip/${encodeURIComponent(sku)}`;
}

export async function scrapeWalmartProduct(page: Page, skuEntry: SkuEntry, timeoutMs: number): Promise<ScrapeResult> {
  const url = buildWalmartUrl(skuEntry.SKU);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const blockedCode = await detectBlockedPage(page);
    if (blockedCode) {
      return {
        success: false,
        error: "Walmart presented a CAPTCHA or anti-bot challenge.",
        errorCode: blockedCode,
        url,
      };
    }

    const notFoundText = await page.locator("body").innerText().catch(() => "");
    if (/we couldn't find this page|page not found|error 404/i.test(notFoundText)) {
      return {
        success: false,
        error: "Walmart product page not found.",
        errorCode: "NOT_FOUND",
        url,
      };
    }

    const title = await firstVisibleText(page, [
      "[itemprop='name']",
      "h1[data-automation-id='product-title']",
      "h1",
    ]);

    const price = await firstVisibleText(page, [
      "[itemprop='price']",
      "[data-automation-id='product-price']",
      "span[itemprop='price']",
    ]);

    const description = await collectText(page, [
      "[data-testid='product-description-content'] p",
      "[data-testid='product-description-content'] li",
      "#product-description p",
      "#product-description li",
    ]);

    const reviewCount = await firstVisibleText(page, [
      "[data-testid='reviews-and-ratings'] [link-identifier='seeAllReviews']",
      "[data-automation-id='review-section-ratings-count']",
      "a[href*='reviews']",
    ]);

    const rating = await firstVisibleText(page, [
      "[data-testid='average-rating']",
      "[itemprop='ratingValue']",
      ".rating-number",
    ]);

    if (!title) {
      return {
        success: false,
        error: "Walmart page loaded but no title selector matched.",
        errorCode: "SELECTOR_MISSING",
        url,
      };
    }

    const data: ProductData = {
      sku: skuEntry.SKU,
      source: "Walmart",
      title,
      description,
      price,
      reviewsAndRating: combineReviewsAndRating(reviewCount, rating),
    };

    return { success: true, data, url };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Walmart scrape error.",
      errorCode: "UNKNOWN",
      url,
    };
  }
}
