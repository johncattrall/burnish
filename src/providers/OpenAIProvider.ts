import type { CompletionRequest, Provider } from "./Provider";
import { requestJsonTolerant } from "./http";

export interface OpenAIConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	/** Reasoning depth for reasoning models (low/medium/high). Dropped for non-reasoning models. */
	effort?: string;
}

/**
 * OpenAI-compatible Chat Completions provider (buffered via requestUrl). Covers OpenAI,
 * OpenRouter, Groq, Ollama, LM Studio, vLLM, etc. by varying baseUrl + key + model.
 */
export class OpenAIProvider implements Provider {
	readonly id = "openai";

	constructor(private cfg: OpenAIConfig) {}

	async *complete(req: CompletionRequest): AsyncIterable<string> {
		const base = this.cfg.baseUrl.replace(/\/$/, "");
		const url = `${base}/chat/completions`;
		const headers: Record<string, string> = {};
		// Local servers (Ollama/LM Studio) often need no key; only send when present.
		if (this.cfg.apiKey) headers["Authorization"] = `Bearer ${this.cfg.apiKey}`;

		const body: Record<string, unknown> = {
			model: req.model ?? this.cfg.model,
			max_tokens: req.maxTokens ?? 4096,
			messages: [
				{ role: "system", content: req.system },
				{ role: "user", content: req.user },
			],
			// Keep reasoning low for faithful cleanup. requestJsonTolerant drops reasoning_effort for
			// non-reasoning models (e.g. gpt-4o) that reject it, remembering per model.
			reasoning_effort: this.cfg.effort ?? "low",
		};
		// Only send temperature when one is set. Newer models (GPT-5 / o-series) reject a custom
		// temperature; omitting it uses the model default. requestJsonTolerant also drops it on
		// demand if a model rejects it despite being sent.
		if (typeof req.temperature === "number") body.temperature = req.temperature;

		const json = (await requestJsonTolerant({ url, headers, body })) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		yield json.choices?.[0]?.message?.content ?? "";
	}
}
