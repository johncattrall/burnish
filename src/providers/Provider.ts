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
	/**
	 * Action identifier (e.g. "tidy", "merge", "mermaid", "custom"). Sent to the hosted gateway
	 * for per-tier feature gating; ignored by the BYO-key providers.
	 */
	action?: string;
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

/**
 * Thrown when the active provider isn't set up yet (no Burnish email, no API key). This is a
 * setup prompt, not a failure - the UI renders it gently rather than as an error.
 */
export class ProviderSetupError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderSetupError";
	}
}

/**
 * Thrown by the hosted provider when the gateway declines on tier limits: either the action is
 * Pro-only ("feature_locked") or the monthly free credits are used up ("quota_exceeded"). Carries
 * an upgrade URL so the UI can prompt the user to subscribe.
 */
export class HostedLimitError extends Error {
	constructor(
		readonly reason: "feature_locked" | "quota_exceeded",
		readonly upgradeUrl: string | undefined,
		message: string,
	) {
		super(message);
		this.name = "HostedLimitError";
	}
}

/** Collects an async-iterable of chunks into a single string. */
export async function collect(stream: AsyncIterable<string>): Promise<string> {
	let out = "";
	for await (const chunk of stream) out += chunk;
	return out;
}
