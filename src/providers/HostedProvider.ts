import type { CompletionRequest, Provider } from "./Provider";
import { ProviderError } from "./Provider";
import { requestJson, streamSSE } from "./http";

export interface HostedConfig {
	baseUrl: string;
	licenseKey: string;
	model: string;
	streaming?: boolean;
}

/**
 * Burnish Plus provider. Identical in spirit to the others but posts to our proxy with the
 * user's Burnish *license key* (not an LLM key). The proxy validates the license, enforces
 * quota, and forwards to Anthropic with our secret key, streaming the response back.
 * See "Burnish - Monetization & Hosted API" §4-5. The wire format mirrors Anthropic SSE.
 */
export class HostedProvider implements Provider {
	readonly id = "hosted";

	constructor(private cfg: HostedConfig) {}

	async *complete(req: CompletionRequest): AsyncIterable<string> {
		if (!this.cfg.licenseKey) {
			throw new ProviderError("No Burnish Plus license key set in settings.");
		}
		const base = this.cfg.baseUrl.replace(/\/$/, "");
		const url = `${base}/v1/complete`;
		const headers = { Authorization: `Bearer ${this.cfg.licenseKey}` };
		const body = {
			model: req.model ?? this.cfg.model,
			max_tokens: req.maxTokens ?? 4096,
			temperature: req.temperature ?? 0.3,
			system: req.system,
			user: req.user,
			stream: this.cfg.streaming !== false,
		};

		if (this.cfg.streaming === false) {
			yield* this.buffered(url, headers, body);
			return;
		}

		try {
			for await (const data of streamSSE({ url, headers, body, signal: req.signal })) {
				if (data === "[DONE]") break;
				const evt = safeJson<HostedEvent>(data);
				if (!evt) continue;
				// Proxy emits {type:"text", text:"..."} deltas, or {type:"error"}.
				if (evt.type === "text" && typeof evt.text === "string") yield evt.text;
				else if (evt.type === "error") throw new ProviderError(evt.message ?? "Hosted error");
			}
		} catch (e) {
			if (isAbort(e)) return;
			if (e instanceof ProviderError && e.status) throw e;
			yield* this.buffered(url, headers, { ...body, stream: false });
		}
	}

	private async *buffered(url: string, headers: Record<string, string>, body: unknown) {
		const json = (await requestJson({ url, headers, body })) as { text?: string };
		yield json.text ?? "";
	}
}

interface HostedEvent {
	type?: string;
	text?: string;
	message?: string;
}

function safeJson<T>(s: string): T | null {
	try {
		return JSON.parse(s) as T;
	} catch {
		return null;
	}
}

function isAbort(e: unknown): boolean {
	return e instanceof Error && (e.name === "AbortError" || e.message.includes("aborted"));
}
