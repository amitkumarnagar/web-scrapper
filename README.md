# Web Scraper Assessment

This project implements a product scraper for Amazon and Walmart using TypeScript and Playwright. It reads SKU definitions from `skus.json`, scrapes product details, and writes each run's outputs into a timestamped folder under `outputs/`.

## Requirements

- Node.js 20+
- npm

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
npm run start
```

If you prefer running the compiled output:

```bash
npm run build
npm run start:compiled
```

Optional environment variables:

- `HEADLESS=false` to see the browser during execution
- `SCRAPER_CONCURRENCY=2` to control the number of parallel scrapes
- `SCRAPER_RETRIES=2` to control retry attempts per SKU
- `SCRAPER_TIMEOUT_MS=30000` to control navigation timeout per SKU
- `SCRAPER_DELAY_MIN_MS=1500` and `SCRAPER_DELAY_MAX_MS=3500` to add jitter between general requests
- `WALMART_DELAY_MIN_MS=5000` and `WALMART_DELAY_MAX_MS=9000` to slow Walmart requests more aggressively

## Input

The scraper reads `skus.json` in the following format:

```json
{
  "skus": [
    { "Type": "Amazon", "SKU": "B0CT4BB651" },
    { "Type": "Walmart", "SKU": "5326288985" }
  ]
}
```

## Output

Each run creates a timestamped output folder:

```text
outputs/
|-- 2026-04-26_14-30-15/
|   |-- app.log
|   |-- product_data.csv
|   |-- errors.log
|   |-- blocked_skus.json
```

- `app.log`: full application logs for that run
- `product_data.csv`: successful scrape rows for that run
- `errors.log`: timestamped scrape failures for that run
- `blocked_skus.json`: CAPTCHA or anti-bot blocked SKUs that should be retried later

For deliverables compatibility, `product_data.csv` and `errors.log` from the latest run are also copied to the root directory (overwriting any previous versions).

## Assumptions

- Amazon SKUs are ASINs and Walmart SKUs are item IDs.
- Products can be opened directly by deterministic product URLs.
- Missing fields should not fail the entire row if other fields are available.

## Limitations

- Amazon and Walmart can block automated traffic with bot checks or CAPTCHA pages.
- Selectors can change over time, so fallback selectors may require maintenance.
- Some descriptions, ratings, or review counts are rendered differently across product categories.
- Walmart mitigation reduces CAPTCHA frequency but does not eliminate it.

## Project Structure

```text
/project-root
|-- /src
|   |-- config.ts
|   |-- index.ts
|   |-- scraper.ts
|   |-- utils.ts
|   |-- logger.ts
|   |-- types.ts
|   |-- /sites
|       |-- amazon.ts
|       |-- walmart.ts
|-- skus.json
|-- package.json
|-- tsconfig.json
|-- /outputs
|   |-- /YYYY-MM-DD_HH-mm-ss
|       |-- app.log
|       |-- product_data.csv
|       |-- errors.log
|       |-- blocked_skus.json
|-- README.md
```
