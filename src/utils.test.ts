import test from "node:test";
import assert from "node:assert/strict";

import { combineReviewsAndRating, normalizeWhitespace } from "./utils.js";

test("normalizeWhitespace collapses whitespace", () => {
  assert.equal(normalizeWhitespace("  hello   world\nline "), "hello world line");
});

test("combineReviewsAndRating joins values", () => {
  assert.equal(combineReviewsAndRating("123 reviews", "4.5 out of 5 stars"), "123 reviews | 4.5 out of 5 stars");
  assert.equal(combineReviewsAndRating("123 reviews", ""), "123 reviews");
  assert.equal(combineReviewsAndRating("", "4.5 out of 5 stars"), "4.5 out of 5 stars");
});
