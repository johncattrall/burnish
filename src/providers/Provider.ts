/**
 * Provider abstraction. Every backend (Anthropic, OpenAI-compatible, hosted proxy)
 * implements `complete`, which streams text chunks. Implementations that cannot stream
 * may yield a single chunk containing the whole response.
 */

export interface CompletionRequest {
	system: string;
	user: string;
	model?: string;
	temperature?: number;
	/** Soft cap on output tokens. */
	maxTokens?: number;
	/** Aborts an in-flight request (e.g. user cancels the diff). */
	signal?: AbortSignal;
}

export interface Provider {
	/** Human-readable id, e.g. "anthropic". */
	readonly id: string;
	/**
	 * Streams text chunks of the model response. Implementations may yield once
	 * if streaming is unavailable. Throws on auth/network/quota errors.
	 */
	complete(req: CompletionRequest): AsyncIterable<string>;
}

/** Thrown by providers so the UI can show a clean message instead of a stack trace. */
export class ProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "ProviderError";
	}
}

/** Collects a stream into a single string (used by tests and non-streaming callers). */
export async function collect(stream: AsyncIterable<string>): Promise<string> {
	let out = "";
	for await (const chunk of stream) out += chunk;
	return out;
}
