import { copyFile } from "node:fs/promises";
import path from "node:path";

import { logInfo, logRuntimeError } from "./logger.js";
import { runScraper } from "./scraper.js";
import { ensureOutputFiles, loadSkus } from "./utils.js";

async function main(): Promise<void> {
  const outputPaths = await ensureOutputFiles();
  logInfo("Initializing scraper", {
    runId: outputPaths.runId,
    runDirectory: outputPaths.runDirectory,
  });

  const skus = await loadSkus();
  logInfo("Loaded SKU input", { totalSkus: skus.length });

  await runScraper(skus);
  logInfo("Scraper run completed");

  // Copy latest results to root for deliverables compatibility
  await copyFile(outputPaths.productCsvPath, path.join(process.cwd(), "product_data.csv"));
  await copyFile(outputPaths.errorsLogPath, path.join(process.cwd(), "errors.log"));
  logInfo("Copied latest results to root directory");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown fatal error";
    logRuntimeError("Scraper failed", { message });
    process.exit(1);
  });
