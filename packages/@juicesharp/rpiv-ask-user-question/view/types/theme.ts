/**
 * Minimal Theme interface for the questionnaire UI layer.
 *
 * Mirrors the subset of @earendil-works/pi-coding-agent's Theme class
 * actually used by the view/state files. Defined locally to avoid the
 * import of pi-coding-agent whose module graph (chalk, cli-highlight,
 * global theme singleton) breaks resolution during dynamic imports.
 */
export interface QuestionnaireTheme {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
	bold(text: string): string;
	italic(text: string): string;
	underline(text: string): string;
}
