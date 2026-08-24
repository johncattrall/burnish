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

/**
 * Optional request fields that some models reject. Each maps a top-level body key to a matcher for
 * the error message a model returns when it doesn't support that field. When a request 400/422s and
 * the message names a present field here, we drop it and retry.
 *   - temperature: Claude 5 family / Opus 4.8, GPT-5 / o-series reject a custom value.
 *   - thinking: Fable 5 / Mythos 5 can't disable thinking (type:"disabled" rejected).
 *   - output_config: models without adaptive effort (e.g. Haiku 4.5) reject it.
 *   - reasoning_effort: non-reasoning OpenAI models (e.g. gpt-4o) reject it.
 */
const DROPPABLE: { key: string; match: RegExp }[] = [
	{ key: "temperature", match: /temperature|top_p|top_k/i },
	{ key: "thinking", match: /thinking/i },
	{ key: "output_config", match: /output_config|effort/i },
	{ key: "reasoning_effort", match: /reasoning_effort|reasoning/i },
];

/** Per-model set of body keys to omit up front, learned from earlier rejections this session. */
const droppedByModel = new Map<string, Set<string>>();

function omit(body: unknown, keys: Set<string>): unknown {
	if (!body || typeof body !== "object" || keys.size === 0) return body;
	const b = { ...(body as Record<string, unknown>) };
	for (const k of keys) delete b[k];
	return b;
}

/**
 * Like {@link requestJson}, but tolerant of models that reject optional fields ({@link DROPPABLE}) -
 * temperature, thinking, output_config/effort, reasoning_effort. On a 400/422 that names a present
 * optional field, it drops that field and retries, remembering per model so later calls this session
 * skip the field up front. This lets us send the faithful-cleanup config to every model without a
 * brittle model-capability table.
 */
export async function requestJsonTolerant(req: HttpRequest): Promise<unknown> {
	const model =
		req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).model : undefined;
	const key = typeof model === "string" ? model : "";
	const bodyObj = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
	const dropped = new Set(key ? (droppedByModel.get(key) ?? []) : []);

	// One attempt per droppable field, plus one; each catch drops a field and retries.
	for (let attempt = 0; attempt <= DROPPABLE.length; attempt++) {
		try {
			return await requestJson({ ...req, body: omit(req.body, dropped) });
		} catch (e) {
			if (!(e instanceof ProviderError) || (e.status !== 400 && e.status !== 422)) throw e;
			const hit = DROPPABLE.find((d) => d.key in bodyObj && !dropped.has(d.key) && d.match.test(e.message));
			if (!hit) throw e;
			dropped.add(hit.key);
			if (key) droppedByModel.set(key, new Set(dropped));
		}
	}
	// Exhausted droppable fields; surface the real error from a final attempt.
	return await requestJson({ ...req, body: omit(req.body, dropped) });
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
