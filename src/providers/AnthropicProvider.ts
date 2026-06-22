import type { CompletionRequest, Provider } from "./Provider";
import { ProviderError } from "./Provider";
import { requestJson, streamSSE } from "./http";

const API_VERSION = "2023-06-01";

export interface AnthropicConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
	streaming?: boolean;
}

/** Anthropic Messages API provider. */
export class AnthropicProvider implements Provider {
	readonly id = "anthropic";

	constructor(private cfg: AnthropicConfig) {}

	async *complete(req: CompletionRequest): AsyncIterable<string> {
		if (!this.cfg.apiKey) throw new ProviderError("No Anthropic API key set in Burnish settings.");

		const url = `${this.cfg.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
		const headers = {
			"x-api-key": this.cfg.apiKey,
			"anthropic-version": API_VERSION,
			// Allow the request from Obsidian's renderer.
			"anthropic-dangerous-direct-browser-access": "true",
		};
		const body = {
			model: req.model ?? this.cfg.model,
			max_tokens: req.maxTokens ?? 4096,
			temperature: req.temperature ?? 0.3,
			system: req.system,
			messages: [{ role: "user", content: req.user }],
			stream: this.cfg.streaming !== false,
		};

		if (this.cfg.streaming === false) {
			yield* this.buffered(url, headers, body);
			return;
		}

		try {
			for await (const data of streamSSE({ url, headers, body, signal: req.signal })) {
				if (data === "[DONE]") break;
				const evt = safeJson(data);
				if (!evt) continue;
				if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
					yield evt.delta.text as string;
				} else if (evt.type === "error") {
					throw new ProviderError(evt.error?.message ?? "Anthropic stream error");
				}
			}
		} catch (e) {
			if (isAbort(e)) return;
			if (e instanceof ProviderError && e.status) throw e;
			// Network/CORS failure: fall back to buffered requestUrl.
			yield* this.buffered(url, headers, { ...body, stream: false });
		}
	}

	private async *buffered(url: string, headers: Record<string, string>, body: unknown) {
		const json = (await requestJson({ url, headers, body })) as {
			content?: Array<{ type: string; text?: string }>;
		};
		const text = (json.content ?? [])
			.filter((b) => b.type === "text")
			.map((b) => b.text ?? "")
			.join("");
		yield text;
	}
}

function safeJson(s: string): any {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function isAbort(e: unknown): boolean {
	return e instanceof Error && (e.name === "AbortError" || e.message.includes("aborted"));
}
