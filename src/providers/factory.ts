import type { BurnishSettings } from "../settings/settings";
import type { Provider } from "./Provider";
import { AnthropicProvider } from "./AnthropicProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { HostedProvider } from "./HostedProvider";

/** Build the active provider from settings. */
export function makeProvider(s: BurnishSettings): Provider {
	switch (s.provider) {
		case "openai":
			return new OpenAIProvider({ ...s.openai, streaming: s.streaming });
		case "hosted":
			return new HostedProvider({ ...s.hosted, streaming: s.streaming });
		case "anthropic":
		default:
			return new AnthropicProvider({ ...s.anthropic, streaming: s.streaming });
	}
}

/** Default model for the active provider (used when an action has no override). */
export function defaultModel(s: BurnishSettings): string {
	switch (s.provider) {
		case "openai":
			return s.openai.model;
		case "hosted":
			return s.hosted.model;
		default:
			return s.anthropic.model;
	}
}
