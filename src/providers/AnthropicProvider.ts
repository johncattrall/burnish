import type { CompletionRequest, Provider } from "./Provider";
import { ProviderError } from "./Provider";
import { requestJson } from "./http";

const API_VERSION = "2023-06-01";

export interface AnthropicConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
}

/** Anthropic Messages API provider (buffered via requestUrl). */
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
		};

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
