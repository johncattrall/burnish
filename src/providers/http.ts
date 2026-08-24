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

/** Models (this session) known to reject a custom `temperature`, so we skip it up front. */
const tempUnsupportedModels = new Set<string>();

function stripTemperature(body: unknown): unknown {
	if (body && typeof body === "object" && "temperature" in body) {
		const { temperature: _omit, ...rest } = body as Record<string, unknown>;
		return rest;
	}
	return body;
}

/**
 * Like {@link requestJson}, but tolerant of models that reject a custom `temperature` (e.g. Claude
 * Opus 5 / the Claude 5 family, and GPT-5 / o-series). If the model errors on temperature, we retry
 * once without it and remember the model so later calls this session skip temperature up front.
 */
export async function requestJsonTolerant(req: HttpRequest): Promise<unknown> {
	const model =
		req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).model : undefined;
	const key = typeof model === "string" ? model : "";
	const sentTemp = !(key && tempUnsupportedModels.has(key));
	try {
		return await requestJson(sentTemp ? req : { ...req, body: stripTemperature(req.body) });
	} catch (e) {
		const bodyHasTemp = req.body && typeof req.body === "object" && "temperature" in req.body;
		if (
			sentTemp &&
			bodyHasTemp &&
			e instanceof ProviderError &&
			(e.status === 400 || e.status === 422) &&
			/temperature/i.test(e.message)
		) {
			if (key) tempUnsupportedModels.add(key);
			return await requestJson({ ...req, body: stripTemperature(req.body) });
		}
		throw e;
	}
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
