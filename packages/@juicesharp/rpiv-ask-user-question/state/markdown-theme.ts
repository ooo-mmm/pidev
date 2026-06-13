import type { QuestionnaireTheme as Theme } from "../view/types/theme.js";
import type { MarkdownTheme } from "@earendil-works/pi-tui";

/**
 * Builds a MarkdownTheme from a pi Theme instance.
 *
 * Local replacement for `getMarkdownTheme()` from @earendil-works/pi-coding-agent.
 * Avoids pulling the global theme singleton + chalk + cli-highlight transitive
 * dependency graph that breaks module resolution during dynamic imports inside
 * jiti-compiled extension tool execute.
 */
export function makeMarkdownTheme(theme: Theme): MarkdownTheme {
	return {
		heading: (text: string) => theme.fg("mdHeading", text),
		link: (text: string) => theme.fg("mdLink", text),
		linkUrl: (text: string) => theme.fg("mdLinkUrl", text),
		code: (text: string) => theme.fg("mdCode", text),
		codeBlock: (text: string) => theme.fg("mdCodeBlock", text),
		codeBlockBorder: (text: string) => theme.fg("mdCodeBlockBorder", text),
		quote: (text: string) => theme.fg("mdQuote", text),
		quoteBorder: (text: string) => theme.fg("mdQuoteBorder", text),
		hr: (text: string) => theme.fg("mdHr", text),
		listBullet: (text: string) => theme.fg("mdListBullet", text),
		bold: (text: string) => theme.bold(text),
		italic: (text: string) => theme.italic(text),
		underline: (text: string) => theme.underline(text),
		// chalk.strikethrough is unavailable without the pi-core theme module.
		// Fall back to dim styling so the strike semantic is still visible.
		strikethrough: (text: string) => theme.fg("dim", text),
		// Skip syntax highlighting in preview to avoid importing cli-highlight.
		highlightCode: undefined,
	};
}
