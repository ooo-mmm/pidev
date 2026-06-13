import { DEFAULT_DPI, DEFAULT_MAX_PAGES, DEFAULT_NUM_WORKERS } from "./constants.ts";
import { resolveScreenshotSelection } from "./input.ts";
import type { DocumentParseParams, DocumentParsePlan, LiteParseToolConfig } from "./types.ts";

export const REMOVED_V1_OPTIONS = [
  "preciseBoundingBox",
  "preserveLayoutAlignmentAcrossPages",
] as const;

export function getRemovedV1OptionsMessage(optionNames: string[]): string {
  const options = optionNames.map((name) => `\`${name}\``).join(", ");
  return [
    `Unsupported LiteParse v1 option${optionNames.length === 1 ? "" : "s"}: ${options}.`,
    "This package now uses LiteParse v2, which no longer exposes those options.",
    "Alternative routes for agents: use JSON output for text item bounding boxes, use document_search to locate phrases with bounding boxes, use document_screenshot for visual layout checks, or narrow work with targetPages.",
  ].join(" ");
}

export function getProvidedRemovedV1Options(rawParams: unknown): string[] {
  if (!rawParams || typeof rawParams !== "object") {
    return [];
  }

  return REMOVED_V1_OPTIONS.filter((optionName) => optionName in rawParams);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveOcrLanguage(
  params: Pick<DocumentParseParams, "ocrLanguage" | "ocrLanguages">,
  ocrServerUrl: string | undefined,
  warnings: string[],
): LiteParseToolConfig["ocrLanguage"] | undefined {
  const singleOcrLanguage = normalizeOptionalString(params.ocrLanguage);
  const ocrLanguages = (params.ocrLanguages ?? [])
    .map((language) => language.trim())
    .filter(Boolean);

  if (singleOcrLanguage && ocrLanguages.length > 0) {
    warnings.push("Both ocrLanguage and ocrLanguages were provided. Using ocrLanguages.");
  }

  if (ocrLanguages.length === 0) {
    return singleOcrLanguage;
  }

  if (ocrServerUrl) {
    if (ocrLanguages.length > 1) {
      warnings.push(
        "Multiple OCR languages were provided, but HTTP OCR servers currently receive only the first language code.",
      );
    }

    return ocrLanguages[0];
  }

  return ocrLanguages.join("+");
}

export function buildLiteParseConfig(
  params: Pick<
    DocumentParseParams,
    | "format"
    | "ocr"
    | "ocrLanguage"
    | "ocrLanguages"
    | "ocrServerUrl"
    | "numWorkers"
    | "maxPages"
    | "targetPages"
    | "dpi"
    | "preserveSmallText"
    | "password"
    | "tessdataPath"
  >,
  warnings: string[],
): LiteParseToolConfig {
  const ocrServerUrl = normalizeOptionalString(params.ocrServerUrl);
  const ocrLanguage = resolveOcrLanguage(params, ocrServerUrl, warnings);

  return {
    outputFormat: params.format ?? "text",
    ocrEnabled: (params.ocr ?? "auto") !== "off",
    ocrLanguage,
    ocrServerUrl,
    numWorkers: params.numWorkers ?? DEFAULT_NUM_WORKERS,
    maxPages: params.maxPages ?? DEFAULT_MAX_PAGES,
    targetPages: normalizeOptionalString(params.targetPages),
    dpi: params.dpi ?? DEFAULT_DPI,
    preserveVerySmallText: params.preserveSmallText ?? false,
    password: normalizeOptionalString(params.password),
    tessdataPath: normalizeOptionalString(params.tessdataPath),
    quiet: true,
  };
}

export function buildDocumentParsePlan(params: DocumentParseParams): DocumentParsePlan {
  const warnings: string[] = [];
  const parserConfig = buildLiteParseConfig(params, warnings);

  return {
    parserConfig,
    screenshotSelection: params.screenshotPages
      ? resolveScreenshotSelection(params.screenshotPages)
      : undefined,
    warnings,
  };
}
