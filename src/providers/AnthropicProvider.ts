import type { CompletionRequest, Provider } from "./Provider";
import { ProviderSetupError } from "./Provider";
import { requestJsonTolerant } from "./http";

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
		if (!this.cfg.apiKey)
			throw new ProviderSetupError("Add your Anthropic API key in settings, or switch to Burnish (no key needed).");

		const url = `${this.cfg.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
		const headers = {
			"x-api-key": this.cfg.apiKey,
			"anthropic-version": API_VERSION,
			// Allow the request from Obsidian's renderer.
			"anthropic-dangerous-direct-browser-access": "true",
		};
		const body: Record<string, unknown> = {
			model: req.model ?? this.cfg.model,
			max_tokens: req.maxTokens ?? 4096,
			system: req.system,
			messages: [{ role: "user", content: req.user }],
		};
		// Only send temperature when one is set. Some models (Opus 5 / the Claude 5 family) reject a
		// custom temperature; omitting it uses the model default. requestJsonTolerant also drops it
		// on demand if a model rejects it despite being sent.
		if (typeof req.temperature === "number") body.temperature = req.temperature;

		const json = (await requestJsonTolerant({ url, headers, body })) as {
			content?: Array<{ type: string; text?: string }>;
		};
		const text = (json.content ?? [])
			.filter((b) => b.type === "text")
			.map((b) => b.text ?? "")
			.join("");
		yield text;
	}
}
