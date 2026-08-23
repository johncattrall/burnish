import { requestUrl } from "obsidian";

/**
 * Small client for the Burnish Plus gateway's account endpoints (signup + status). The
 * completion path lives in HostedProvider; this is just for the settings UI.
 */

export interface HostedAccount {
	hostedKey: string;
	tier: "free" | "pro";
	creditsRemaining: number | null;
	resetsAt: string;
	upgradeUrl?: string;
}

export interface HostedStatus {
	tier: "free" | "pro";
	creditsRemaining: number | null;
	resetsAt: string;
	upgradeUrl?: string;
}

function base(url: string): string {
	return url.replace(/\/$/, "");
}

/** Create (or return the existing) free hosted account for an email. */
export async function signup(baseUrl: string, email: string): Promise<HostedAccount> {
	const res = await requestUrl({
		url: `${base(baseUrl)}/signup`,
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email }),
		throw: false,
	});
	const j = res.json as (HostedAccount & { error?: string }) | null;
	if (res.status < 200 || res.status >= 300 || !j?.hostedKey) {
		throw new Error(j?.error === "invalid_email" ? "That email looks invalid." : `Signup failed (${res.status}).`);
	}
	return j;
}

/** Read current tier + remaining credits for a hosted key. */
export async function fetchStatus(baseUrl: string, hostedKey: string): Promise<HostedStatus> {
	const res = await requestUrl({
		url: `${base(baseUrl)}/v1/status`,
		method: "GET",
		headers: { Authorization: `Bearer ${hostedKey}` },
		throw: false,
	});
	const j = res.json as (HostedStatus & { error?: string }) | null;
	if (res.status < 200 || res.status >= 300 || !j) {
		throw new Error(`Could not fetch status (${res.status}).`);
	}
	return j;
}
