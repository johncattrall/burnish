import type { CompletionRequest, Provider } from "./Provider";
import { ProviderError } from "./Provider";
import { requestJson } from "./http";

export interface HostedConfig {
	baseUrl: string;
	licenseKey: string;
	model: string;
}

/**
 * Burnish Plus provider (buffered via requestUrl). Identical in spirit to the others but posts to
 * our proxy with the user's Burnish *license key* (not an LLM key). The proxy validates the
 * license, enforces quota, and forwards to a model provider with our secret key.
 * See "Burnish - Monetization & Hosted API" §4-5.
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
		};

		const json = (await requestJson({ url, headers, body })) as { text?: string };
		yield json.text ?? "";
	}
}
