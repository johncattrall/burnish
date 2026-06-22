import { FuzzySuggestModal, type App } from "obsidian";
import type { PromptAction } from "../settings/settings";

const CUSTOM: PromptAction = {
	id: "__custom__",
	name: "Custom instruction…",
	prompt: "",
	output: "replace",
	enabled: true,
};

/** Fuzzy picker over enabled actions, with a trailing "Custom instruction…" entry. */
export class ActionPicker extends FuzzySuggestModal<PromptAction> {
	constructor(
		app: App,
		private actions: PromptAction[],
		private onChoose: (action: PromptAction, isCustom: boolean) => void,
	) {
		super(app);
		this.setPlaceholder("Burnish: pick an action");
	}

	getItems(): PromptAction[] {
		return [...this.actions, CUSTOM];
	}

	getItemText(item: PromptAction): string {
		return item.name;
	}

	onChooseItem(item: PromptAction): void {
		this.onChoose(item, item.id === CUSTOM.id);
	}
}
