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
	 * Yields the model response as text. Current implementations are buffered and yield a single
	 * chunk; the iterable shape leaves room for future incremental output. Throws on
	 * auth/network/quota errors.
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

/** Collects an async-iterable of chunks into a single string. */
export async function collect(stream: AsyncIterable<string>): Promise<string> {
	let out = "";
	for await (const chunk of stream) out += chunk;
	return out;
}
