import type { Component } from "@earendil-works/pi-tui";

/**
 * Minimal border component that renders a single horizontal line of box-drawing
 * characters. Replacement for DynamicBorder from @earendil-works/pi-coding-agent,
 * avoiding the transitive resolution of chalk / cli-highlight / theme.js
 * that fails during dynamic imports inside jiti-compiled extension tool execute.
 */
export class Border implements Component {
	private color: (str: string) => string;

	constructor(color: (str: string) => string) {
		this.color = color;
	}

	invalidate(): void {
		// Stateless — no cached layout to invalidate.
	}

	render(width: number): string[] {
		return [this.color("─".repeat(Math.max(1, width)))];
	}
}
