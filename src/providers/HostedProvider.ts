import { Notice, requestUrl } from "obsidian";
import type { CompletionRequest, Provider } from "./Provider";
import { HostedLimitError, ProviderError } from "./Provider";

export interface HostedConfig {
	baseUrl: string;
	hostedKey: string;
}

/**
 * Burnish Pro provider. Posts to the gateway with the user's hosted key (issued at email
 * signup). The gateway validates the key, enforces tier limits (feature gate + monthly cap),
 * picks the model, and returns `{ text, creditsRemaining, resetsAt }`. On a tier limit it returns
 * 402 with `feature_locked` or `quota_exceeded`, which we surface as {@link HostedLimitError} so
 * the UI can prompt an upgrade. Buffered via requestUrl (no streaming).
 */
export class HostedProvider implements Provider {
	readonly id = "hosted";

	constructor(private cfg: HostedConfig) {}

	async *complete(req: CompletionRequest): AsyncIterable<string> {
		if (!this.cfg.hostedKey) {
			throw new ProviderError("Not signed in to Burnish Hosted. Add your email in settings.");
		}
		const base = this.cfg.baseUrl.replace(/\/$/, "");
		const res = await requestUrl({
			url: `${base}/v1/complete`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.cfg.hostedKey}`,
			},
			body: JSON.stringify({
				action: req.action,
				system: req.system,
				user: req.user,
				max_tokens: req.maxTokens ?? 4096,
				temperature: req.temperature ?? 0.3,
			}),
			throw: false,
		});

		const json = res.json as {
			text?: string;
			error?: string;
			upgradeUrl?: string;
			message?: string;
			preview?: boolean;
			previewsRemaining?: number;
		} | null;

		if (res.status === 402 && (json?.error === "feature_locked" || json?.error === "quota_exceeded")) {
			const fallback =
				json.error === "feature_locked"
					? "That action is a Burnish Pro feature. Upgrade to unlock it."
					: "You've used this month's free Burnish credits. Upgrade for more.";
			// Prefer the gateway's message (e.g. "You've used your 3 free previews...").
			throw new HostedLimitError(json.error, json.upgradeUrl, json.message ?? fallback);
		}
		if (res.status < 200 || res.status >= 300) {
			throw new ProviderError(json?.message ?? json?.error ?? `Hosted error ${res.status}`, res.status);
		}

		// Free-tier taste of a Pro feature: let the user know how many previews remain.
		if (json?.preview) {
			const left = json.previewsRemaining ?? 0;
			new Notice(
				left > 0
					? `Burnish Pro preview (${left} free ${left === 1 ? "preview" : "previews"} left).`
					: "That was your last free Burnish Pro preview. Upgrade to keep using Pro features.",
			);
		}

		yield json?.text ?? "";
	}
}
