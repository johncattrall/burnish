import { requestUrl } from "obsidian";
import { ProviderError } from "./Provider";

/**
 * HTTP helpers shared by providers.
 *
 * Streaming uses the platform `fetch` (works in Obsidian's Electron renderer on desktop and
 * supports incremental reads + AbortSignal). When `fetch` fails for CORS/network reasons
 * (notably on mobile), callers fall back to {@link requestJson}, which uses Obsidian's
 * `requestUrl` to bypass CORS but cannot stream — the whole body is returned at once.
 */

export interface HttpRequest {
	url: string;
	headers: Record<string, string>;
	body: unknown;
	signal?: AbortSignal;
}

/** Buffered POST via Obsidian requestUrl (no streaming, but CORS-safe / mobile-safe). */
export async function requestJson(req: HttpRequest): Promise<unknown> {
	const res = await requestUrl({
		url: req.url,
		method: "POST",
		headers: { "Content-Type": "application/json", ...req.headers },
		body: JSON.stringify(req.body),
		throw: false,
	});
	if (res.status < 200 || res.status >= 300) {
		throw new ProviderError(extractError(res.text) ?? `HTTP ${res.status}`, res.status);
	}
	return res.json;
}

/**
 * Stream a Server-Sent-Events POST via `fetch`. Yields raw `data:` payload strings (one per
 * SSE event); the caller parses provider-specific JSON. Throws {@link ProviderError} on a
 * non-2xx status so callers can fall back to buffered mode.
 */
export async function* streamSSE(req: HttpRequest): AsyncGenerator<string> {
	let res: Response;
	res = await fetch(req.url, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...req.headers },
		body: JSON.stringify(req.body),
		signal: req.signal,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new ProviderError(extractError(text) ?? `HTTP ${res.status}`, res.status);
	}
	if (!res.body) throw new ProviderError("No response body for stream");

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let nl: number;
			// SSE events are separated by blank lines; data may span multiple `data:` lines.
			while ((nl = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, nl).replace(/\r$/, "");
				buffer = buffer.slice(nl + 1);
				if (line.startsWith("data:")) {
					yield line.slice(5).trimStart();
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/** Best-effort extraction of a human message from an error body. */
function extractError(text: string | undefined): string | undefined {
	if (!text) return undefined;
	try {
		const j = JSON.parse(text);
		return j?.error?.message ?? j?.message ?? j?.error ?? undefined;
	} catch {
		return text.slice(0, 300);
	}
}
