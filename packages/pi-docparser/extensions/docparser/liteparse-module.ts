let liteParseModulePromise: Promise<typeof import("@llamaindex/liteparse")> | undefined;

export async function loadLiteParseModule(): Promise<typeof import("@llamaindex/liteparse")> {
  liteParseModulePromise ??= import("@llamaindex/liteparse");
  return liteParseModulePromise;
}
