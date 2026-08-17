import { requestUrl } from "obsidian";
import { ProviderError } from "./Provider";

/**
 * HTTP helper shared by providers. All network requests go through Obsidian's `requestUrl`, which
 * bypasses CORS, works on mobile, and lets Obsidian's tooling analyse the plugin's network calls.
 * Responses are buffered (returned once the request completes); we do not stream.
 */

export interface HttpRequest {
	url: string;
	headers: Record<string, string>;
	body: unknown;
}

/** POST JSON via Obsidian requestUrl and return the parsed response. Throws {@link ProviderError}. */
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

interface ErrorBody {
	error?: { message?: string } | string;
	message?: string;
}

/** Best-effort extraction of a human message from an error body. */
function extractError(text: string | undefined): string | undefined {
	if (!text) return undefined;
	try {
		const j = JSON.parse(text) as ErrorBody;
		const err = typeof j.error === "string" ? j.error : j.error?.message;
		return err ?? j.message ?? undefined;
	} catch {
		return text.slice(0, 300);
	}
}
