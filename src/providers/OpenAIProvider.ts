import type { CompletionRequest, Provider } from "./Provider";
import { requestJson } from "./http";

export interface OpenAIConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
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

		const body = {
			model: req.model ?? this.cfg.model,
			temperature: req.temperature ?? 0.3,
			max_tokens: req.maxTokens ?? 4096,
			messages: [
				{ role: "system", content: req.system },
				{ role: "user", content: req.user },
			],
		};

		const json = (await requestJson({ url, headers, body })) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		yield json.choices?.[0]?.message?.content ?? "";
	}
}
