import type { CompletionRequest, Provider } from "./Provider";
import { ProviderError } from "./Provider";
import { requestJson, streamSSE } from "./http";

export interface OpenAIConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	streaming?: boolean;
}

/**
 * OpenAI-compatible Chat Completions provider. Covers OpenAI, OpenRouter, Groq, Ollama,
 * LM Studio, vLLM, etc. by varying baseUrl + key + model.
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
			stream: this.cfg.streaming !== false,
		};

		if (this.cfg.streaming === false) {
			yield* this.buffered(url, headers, body);
			return;
		}

		try {
			for await (const data of streamSSE({ url, headers, body, signal: req.signal })) {
				if (data === "[DONE]") break;
				const evt = safeJson<OpenAIEvent>(data);
				const delta = evt?.choices?.[0]?.delta?.content;
				if (typeof delta === "string" && delta.length) yield delta;
			}
		} catch (e) {
			if (isAbort(e)) return;
			if (e instanceof ProviderError && e.status) throw e;
			yield* this.buffered(url, headers, { ...body, stream: false });
		}
	}

	private async *buffered(url: string, headers: Record<string, string>, body: unknown) {
		const json = (await requestJson({ url, headers, body })) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		yield json.choices?.[0]?.message?.content ?? "";
	}
}

interface OpenAIEvent {
	choices?: Array<{ delta?: { content?: string } }>;
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
