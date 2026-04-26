import { appendFileSync } from "node:fs";

import { getOutputPaths } from "./utils.js";

type LogLevel = "INFO" | "WARN" | "ERROR";

function formatLogLine(level: LogLevel, message: string, context?: Record<string, string | number | boolean | undefined>): string {
  const parts = [`[${new Date().toISOString()}]`, level, message];

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) {
        parts.push(`${key}=${String(value).replace(/\s+/g, " ").trim()}`);
      }
    }
  }

  return parts.join(" ");
}

export function logInfo(message: string, context?: Record<string, string | number | boolean | undefined>): void {
  writeLog("INFO", message, context);
}

export function logWarn(message: string, context?: Record<string, string | number | boolean | undefined>): void {
  writeLog("WARN", message, context);
}

export function logRuntimeError(message: string, context?: Record<string, string | number | boolean | undefined>): void {
  writeLog("ERROR", message, context);
}

export async function logError(details: {
  source: string;
  sku: string;
  url?: string;
  errorCode?: string;
  message: string;
}): Promise<void> {
  const line = formatLogLine("ERROR", "Scrape failed", {
    source: details.source,
    sku: details.sku,
    code: details.errorCode ?? "UNKNOWN",
    url: details.url ?? "N/A",
    message: details.message,
  });

  appendFileSync(getOutputPaths().errorsLogPath, `${line}\n`, "utf8");
  appendToAppLog(line);
}

function writeLog(
  level: LogLevel,
  message: string,
  context?: Record<string, string | number | boolean | undefined>,
): void {
  const line = formatLogLine(level, message, context);

  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }

  appendToAppLog(line);
}

function appendToAppLog(line: string): void {
  try {
    appendFileSync(getOutputPaths().appLogPath, `${line}\n`, "utf8");
  } catch {
    // Startup logs can occur before the run output directory exists.
  }
}
