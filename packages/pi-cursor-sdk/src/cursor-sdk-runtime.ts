import type { CursorSdkModule } from "./cursor-sdk-runtime-types.js";

export type { CursorSdkModule };

const CURSOR_HOSTS = new Set(["api2.cursor.sh", "api.cursor.com"]);
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;

let cursorSdkPromise: Promise<CursorSdkModule> | undefined;
let uncaughtFilterInstalled = false;

/**
 * Recognize the Bun-vs-Cloudflare TLS race signature.
 * Symptom: socket 'error' emitted with code ECONNRESET while host is a Cursor API endpoint.
 * Patch made by ooo-mmm fork — pidev/packages/pi-cursor-sdk.
 */
function isCursorTlsRaceError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { code?: unknown; host?: unknown; message?: unknown };
	if (candidate.code !== "ECONNRESET") return false;
	if (typeof candidate.host === "string" && CURSOR_HOSTS.has(candidate.host)) return true;
	if (typeof candidate.message === "string") {
		for (const host of CURSOR_HOSTS) if (candidate.message.includes(host)) return true;
	}
	return false;
}

/**
 * Bun emits TLS handshake failures as bare 'error' events on the socket — they
 * escape the awaited try/catch in model-discovery.ts and become uncaughtException
 * which kills pi. Filter out only the Cursor-host TLS race; rethrow everything else.
 */
function installUncaughtFilter(): void {
	if (uncaughtFilterInstalled) return;
	uncaughtFilterInstalled = true;
	const handler = (error: unknown): void => {
		if (isCursorTlsRaceError(error)) {
			// Discovery layer will fall back to cached/bundled catalog; no need to crash.
			return;
		}
		// Re-emit so any other listeners (or default handler) see it.
		process.nextTick(() => {
			throw error;
		});
	};
	process.on("uncaughtException", handler);
	process.on("unhandledRejection", (reason) => {
		if (isCursorTlsRaceError(reason)) return;
		// Don't rethrow — let other unhandledRejection handlers see it.
	});
}

async function withCursorRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (!isCursorTlsRaceError(error) || attempt === RETRY_ATTEMPTS) throw error;
			const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
			await new Promise((resolve) => setTimeout(resolve, backoff));
		}
	}
	throw lastError;
}

function wrapCursorSdk(sdk: CursorSdkModule): CursorSdkModule {
	const originalList = sdk.Cursor.models.list;
	sdk.Cursor.models.list = (options) => withCursorRetry(() => originalList(options), "Cursor.models.list");
	return sdk;
}

export async function loadCursorSdk(): Promise<CursorSdkModule> {
	if (!cursorSdkPromise) {
		installUncaughtFilter();
		cursorSdkPromise = import("@cursor/sdk").then(wrapCursorSdk);
	}
	return cursorSdkPromise;
}
