import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import {
	detectActiveDomainCollisions,
	detectLegacyFlatSpec,
	type DomainCollision,
} from "./openspec-guardrails.ts";

export type SddArtifactStore = "openspec";
export type ArtifactState = "missing" | "done" | "partial";
export type DependencyState = "blocked" | "ready" | "all_done" | "not_applicable";
export type ApplyState = "blocked" | "ready" | "all_done";
export type SddPhase = "apply" | "verify" | "sync" | "archive";

export interface SddArtifactPaths {
	proposal: string[];
	specs: string[];
	design: string[];
	tasks: string[];
	applyProgress: string[];
	verifyReport: string[];
	syncReport: string[];
}

export interface SddTaskProgress {
	total: number;
	complete: number;
	remaining: number;
	unchecked: string[];
}

export interface SddActionContext {
	mode: "repo-local";
	workspaceRoot: string;
	allowedEditRoots: string[];
	warnings: string[];
}

export interface SddDomainCollisionReport {
	domain: string;
	changes: DomainCollision[];
}

export interface SddPhaseInstructions {
	apply: string[];
	verify: string[];
	sync: string[];
	archive: string[];
}

export interface SddRelationships {
	dependsOn: string[];
	supersedes: string[];
	amends: string[];
	conflictsWith: string[];
	sameDomainActiveChanges: SddDomainCollisionReport[];
}

export interface SddStatus {
	schemaName: "gentle-pi.sdd-status";
	schemaVersion: 1;
	changeName: string | null;
	artifactStore: SddArtifactStore;
	planningHome: { root: string; changesDir: string };
	changeRoot: string | null;
	artifactPaths: SddArtifactPaths;
	contextFiles: SddArtifactPaths;
	artifacts: Record<keyof SddArtifactPaths, ArtifactState>;
	taskProgress: SddTaskProgress;
	applyState: ApplyState;
	dependencies: Record<SddPhase, DependencyState>;
	actionContext: SddActionContext;
	relationships: SddRelationships;
	collisions: SddDomainCollisionReport[];
	legacyFlatSpec?: { path: string; hasDomainSpecs: boolean };
	nextRecommended: string;
	instructions?: SddPhaseInstructions;
	blockedReasons: string[];
}

export interface ResolveSddStatusOptions {
	cwd: string;
	changeName?: string;
	includeInstructions?: boolean;
	workspaceRoot?: string;
}

const EMPTY_PATHS: SddArtifactPaths = {
	proposal: [],
	specs: [],
	design: [],
	tasks: [],
	applyProgress: [],
	verifyReport: [],
	syncReport: [],
};

function safeDirectories(path: string): string[] {
	try {
		return readdirSync(path)
			.filter((entry) => {
				try {
					return statSync(join(path, entry)).isDirectory();
				} catch {
					return false;
				}
			})
			.sort();
	} catch {
		return [];
	}
}

function safeRead(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function hasContent(path: string): boolean {
	return existsSync(path) && safeRead(path).trim().length > 0;
}

function singleFileState(paths: string[]): ArtifactState {
	if (paths.length === 0) return "missing";
	return paths.some((path) => !hasContent(path)) ? "partial" : "done";
}

function multiFileState(paths: string[], partial = false): ArtifactState {
	if (paths.length === 0) return partial ? "partial" : "missing";
	return paths.some((path) => !hasContent(path)) || partial ? "partial" : "done";
}

function findSpecFiles(specsDir: string): string[] {
	const files: string[] = [];
	function walk(dir: string): void {
		for (const entry of safeDirectories(dir)) {
			const path = join(dir, entry);
			const specPath = join(path, "spec.md");
			if (existsSync(specPath)) files.push(specPath);
			walk(path);
		}
	}
	walk(specsDir);
	return files.sort();
}

function domainFromSpecPath(changeRoot: string, specPath: string): string | undefined {
	const rel = relative(join(changeRoot, "specs"), specPath).split(/[\\/]/);
	return rel.length >= 2 && rel.at(-1) === "spec.md" ? rel.slice(0, -1).join("/") : undefined;
}

function countTasks(tasksPath: string | undefined): SddTaskProgress {
	if (!tasksPath || !existsSync(tasksPath)) {
		return { total: 0, complete: 0, remaining: 0, unchecked: [] };
	}
	const unchecked: string[] = [];
	let complete = 0;
	for (const rawLine of safeRead(tasksPath).split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (/^\s*- \[[xX]\]/.test(line)) complete += 1;
		if (/^\s*- \[ \]/.test(line)) unchecked.push(line.trim());
	}
	return {
		total: complete + unchecked.length,
		complete,
		remaining: unchecked.length,
		unchecked,
	};
}

function reportIsClearlyPassing(path: string | undefined): boolean {
	if (!path || !hasContent(path)) return false;
	const text = safeRead(path);
	const hasBlocker = /(^|\b)(FAIL|FAILED|BLOCKED|CRITICAL|PENDING|TODO)(\b|:)|verification blockers?|not\s+(?:pass|passed|passing|successful|complete|completed)|(?:pass|passed|success|successful|complete|completed)\s*:\s*no\b/i.test(text);
	const hasPassSignal = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.some((line) =>
			/^(?:(?:status|verdict|result|verification|sync|final(?:\s+verdict)?)\s*:\s*)?(?:PASS|PASSED|SUCCESS|SUCCESSFUL)$/i.test(line) ||
			/^all checks passed\.?$/i.test(line) ||
			/^ready for archive\.?$/i.test(line) ||
			/^sync completed?\.?$/i.test(line),
		);
	return hasPassSignal && !hasBlocker;
}

function emptyStatus(cwd: string, changeName: string | null, blockedReasons: string[]): SddStatus {
	const root = resolve(cwd);
	const changesDir = join(root, "openspec", "changes");
	const actionContext: SddActionContext = {
		mode: "repo-local",
		workspaceRoot: root,
		allowedEditRoots: [root],
		warnings: [],
	};
	return {
		schemaName: "gentle-pi.sdd-status",
		schemaVersion: 1,
		changeName,
		artifactStore: "openspec",
		planningHome: { root, changesDir },
		changeRoot: null,
		artifactPaths: { ...EMPTY_PATHS },
		contextFiles: { ...EMPTY_PATHS },
		artifacts: {
			proposal: "missing",
			specs: "missing",
			design: "missing",
			tasks: "missing",
			applyProgress: "missing",
			verifyReport: "missing",
			syncReport: "missing",
		},
		taskProgress: { total: 0, complete: 0, remaining: 0, unchecked: [] },
		applyState: "blocked",
		dependencies: { apply: "blocked", verify: "blocked", sync: "blocked", archive: "blocked" },
		actionContext,
		relationships: {
			dependsOn: [],
			supersedes: [],
			amends: [],
			conflictsWith: [],
			sameDomainActiveChanges: [],
		},
		collisions: [],
		nextRecommended: blockedReasons[0] ?? "Start an SDD change.",
		blockedReasons,
	};
}

export function listActiveOpenSpecChanges(cwd: string): string[] {
	return safeDirectories(join(cwd, "openspec", "changes")).filter(
		(change) => change !== "archive",
	);
}

export function renderPhaseInstructions(status: SddStatus): SddPhaseInstructions {
	const change = status.changeName ?? "<unresolved>";
	return {
		apply: [
			`Change: ${change}`,
			`State: ${status.dependencies.apply}`,
			status.applyState === "all_done"
				? "All tasks are already checked complete; do not edit."
				: "Implement only unchecked tasks from the tasks artifact.",
			`Tasks: ${status.taskProgress.complete}/${status.taskProgress.total} complete`,
			"Update persisted task checkboxes immediately after completing each task.",
			...status.taskProgress.unchecked.map((line) => `Remaining: ${line}`),
		],
		verify: [
			`Change: ${change}`,
			`State: ${status.dependencies.verify}`,
			"Verify task completion, spec coverage, implementation correctness, design coherence, and tests when available.",
			"Unchecked implementation tasks are CRITICAL archive blockers.",
			...status.taskProgress.unchecked.map((line) => `Unchecked blocker: ${line}`),
		],
		sync: [
			`Change: ${change}`,
			`State: ${status.dependencies.sync}`,
			"Sync delta specs into openspec/specs only after verification is clean.",
			...status.artifactPaths.specs.map((path) => `Delta spec: ${path}`),
			...status.collisions.flatMap((collision) =>
				collision.changes.map((item) =>
					`Same-domain collision: ${collision.domain} also touched by ${item.change} (${item.path})`,
				),
			),
		],
		archive: [
			`Change: ${change}`,
			`State: ${status.dependencies.archive}`,
			"Archive only after clean verify, completed sync, and zero unchecked implementation tasks.",
			"CRITICAL verification issues have no override.",
			status.changeRoot
				? `Archive target: ${join(status.planningHome.changesDir, "archive", `YYYY-MM-DD-${change}`)}`
				: "Archive target unavailable until change is resolved.",
		],
	};
}

export function resolveSddStatus(options: ResolveSddStatusOptions): SddStatus {
	const root = resolve(options.cwd);
	const changesDir = join(root, "openspec", "changes");
	const activeChanges = listActiveOpenSpecChanges(root);
	let changeName = options.changeName?.trim() || "";
	const blockedReasons: string[] = [];

	if (!changeName) {
		if (activeChanges.length === 1) {
			changeName = activeChanges[0];
		} else if (activeChanges.length === 0) {
			return emptyStatus(root, null, ["No active SDD changes found."]);
		} else {
			return emptyStatus(root, null, [
				`Change selection is ambiguous: ${activeChanges.join(", ")}.`,
			]);
		}
	}

	if (!activeChanges.includes(changeName)) {
		return emptyStatus(root, changeName, [`Active change not found: ${changeName}.`]);
	}

	const changeRoot = join(changesDir, changeName);
	const proposal = join(changeRoot, "proposal.md");
	const design = join(changeRoot, "design.md");
	const tasks = join(changeRoot, "tasks.md");
	const applyProgress = join(changeRoot, "apply-progress.md");
	const verifyReport = join(changeRoot, "verify-report.md");
	const syncReport = join(changeRoot, "sync-report.md");
	const specFiles = findSpecFiles(join(changeRoot, "specs"));
	const legacyFlatSpec = detectLegacyFlatSpec(root, changeName);
	const flatOnly = Boolean(legacyFlatSpec && specFiles.length === 0);

	const artifactPaths: SddArtifactPaths = {
		proposal: existsSync(proposal) ? [proposal] : [],
		specs: specFiles,
		design: existsSync(design) ? [design] : [],
		tasks: existsSync(tasks) ? [tasks] : [],
		applyProgress: existsSync(applyProgress) ? [applyProgress] : [],
		verifyReport: existsSync(verifyReport) ? [verifyReport] : [],
		syncReport: existsSync(syncReport) ? [syncReport] : [],
	};
	const artifacts = {
		proposal: singleFileState(artifactPaths.proposal),
		specs: multiFileState(artifactPaths.specs, flatOnly),
		design: singleFileState(artifactPaths.design),
		tasks: singleFileState(artifactPaths.tasks),
		applyProgress: singleFileState(artifactPaths.applyProgress),
		verifyReport: singleFileState(artifactPaths.verifyReport),
		syncReport: singleFileState(artifactPaths.syncReport),
	} satisfies SddStatus["artifacts"];
	const taskProgress = countTasks(artifactPaths.tasks[0]);
	const actionContext: SddActionContext = {
		mode: "repo-local",
		workspaceRoot: options.workspaceRoot ? resolve(options.workspaceRoot) : root,
		allowedEditRoots: [options.workspaceRoot ? resolve(options.workspaceRoot) : root],
		warnings: [],
	};

	const collisions = specFiles
		.map((path) => domainFromSpecPath(changeRoot, path))
		.filter((domain): domain is string => Boolean(domain))
		.map((domain) => ({
			domain,
			changes: detectActiveDomainCollisions(root, changeName, domain).sort((a, b) =>
				a.change.localeCompare(b.change),
			),
		}))
		.filter((collision) => collision.changes.length > 0);

	if (artifacts.proposal === "missing") blockedReasons.push("proposal.md is missing.");
	if (artifacts.proposal === "partial") blockedReasons.push("proposal.md is empty or partial.");
	if (artifacts.specs !== "done") blockedReasons.push("domain specs are missing or partial.");
	if (artifacts.design === "missing") blockedReasons.push("design.md is missing.");
	if (artifacts.design === "partial") blockedReasons.push("design.md is empty or partial.");
	if (artifacts.tasks === "missing") blockedReasons.push("tasks.md is missing.");
	if (artifacts.tasks === "partial") blockedReasons.push("tasks.md is empty or partial.");
	if (artifacts.tasks === "done" && taskProgress.total === 0) {
		blockedReasons.push("tasks.md has no implementation task checkboxes.");
	}
	if (flatOnly && legacyFlatSpec) {
		blockedReasons.push(`Legacy flat spec is present without domain specs: ${legacyFlatSpec.path}.`);
	}

	const coreArtifactsReady = artifacts.proposal === "done" && artifacts.specs === "done" && artifacts.design === "done" && artifacts.tasks === "done" && taskProgress.total > 0 && !flatOnly;
	const applyState: ApplyState = !coreArtifactsReady
		? "blocked"
		: taskProgress.remaining === 0
			? "all_done"
			: "ready";
	const verifyClean = reportIsClearlyPassing(artifactPaths.verifyReport[0]);
	const syncClean = reportIsClearlyPassing(artifactPaths.syncReport[0]);
	const syncPrerequisitesReady = coreArtifactsReady && verifyClean && collisions.length === 0 && !flatOnly;
	const syncState: DependencyState = syncPrerequisitesReady
		? syncClean
			? "all_done"
			: "ready"
		: "blocked";
	const verifyState: DependencyState = verifyClean
		? "all_done"
		: artifacts.tasks === "done" && taskProgress.total > 0 && (artifacts.applyProgress === "done" || applyState === "all_done")
			? "ready"
			: "blocked";
	const dependencies: SddStatus["dependencies"] = {
		apply: applyState === "blocked" ? "blocked" : applyState,
		verify: verifyState,
		sync: syncState,
		archive: coreArtifactsReady && verifyClean && syncClean && taskProgress.remaining === 0 ? "ready" : "blocked",
	};
	const archiveReady = dependencies.archive === "ready";
	const nextRecommended = dependencies.apply === "ready"
		? "sdd-apply"
		: dependencies.verify === "ready"
			? "sdd-verify"
			: dependencies.sync === "ready"
				? "sdd-sync"
				: archiveReady
					? "sdd-archive"
					: blockedReasons[0] ?? "Resolve blockers.";

	const status: SddStatus = {
		schemaName: "gentle-pi.sdd-status",
		schemaVersion: 1,
		changeName,
		artifactStore: "openspec",
		planningHome: { root, changesDir },
		changeRoot,
		artifactPaths,
		contextFiles: artifactPaths,
		artifacts,
		taskProgress,
		applyState,
		dependencies,
		actionContext,
		relationships: {
			dependsOn: [],
			supersedes: [],
			amends: [],
			conflictsWith: [],
			sameDomainActiveChanges: collisions,
		},
		collisions,
		legacyFlatSpec: legacyFlatSpec
			? { path: legacyFlatSpec.path, hasDomainSpecs: specFiles.length > 0 }
			: undefined,
		nextRecommended,
		blockedReasons,
	};
	if (options.includeInstructions) status.instructions = renderPhaseInstructions(status);
	return status;
}

export function renderNativeSddPhasePrompt(status: SddStatus, phase?: SddPhase): string {
	const selectedInstructions = phase ? status.instructions?.[phase] : undefined;
	return [
		"## Native SDD Status Engine",
		"The parent/orchestrator resolved this status deterministically. Treat it as authoritative over prompt inference.",
		"Do not run phase work when this status marks the phase blocked; return the blockers instead.",
		...(phase && selectedInstructions
			? ["", `### ${phase} instructions`, ...selectedInstructions.map((line) => `- ${line}`)]
			: []),
		"",
		"```json",
		JSON.stringify(status, null, 2),
		"```",
	].join("\n");
}

export function renderSddDispatcherMarkdown(status: SddStatus): string {
	return [
		`## Native SDD Dispatcher: ${status.changeName ?? "unresolved"}`,
		"",
		`nextPhase: ${status.nextRecommended}`,
		`apply: ${status.dependencies.apply}`,
		`verify: ${status.dependencies.verify}`,
		`sync: ${status.dependencies.sync}`,
		`archive: ${status.dependencies.archive}`,
		"",
		status.blockedReasons.length > 0
			? ["### Blocked", ...status.blockedReasons.map((reason) => `- ${reason}`)].join("\n")
			: "### Ready\nThe next phase may be delegated with the attached status JSON and phase instructions.",
		"",
		"### Instructions for next phase",
		...((status.instructions?.[status.nextRecommended.replace(/^sdd-/, "") as SddPhase] ?? [])
			.map((line) => `- ${line}`)),
		"",
		"### Status JSON",
		"```json",
		JSON.stringify(status, null, 2),
		"```",
	].join("\n");
}

export function renderSddStatusMarkdown(status: SddStatus): string {
	const title = status.changeName ?? "unresolved";
	const lines = [
		`## SDD Status: ${title}`,
		"",
		`schema: ${status.schemaName}@${status.schemaVersion}`,
		`store: ${status.artifactStore}`,
		`root: ${status.planningHome.root}`,
		`next: ${status.nextRecommended}`,
		"",
		"### Tasks",
		`- complete: ${status.taskProgress.complete}/${status.taskProgress.total}`,
		`- remaining: ${status.taskProgress.remaining}`,
		...status.taskProgress.unchecked.map((line) => `- unchecked: ${line}`),
		"",
		"### Dependencies",
		...Object.entries(status.dependencies).map(([phase, state]) => `- ${phase}: ${state}`),
	];
	if (status.collisions.length > 0) {
		lines.push("", "### Same-domain active changes");
		for (const collision of status.collisions) {
			lines.push(
				`- ${collision.domain}: ${collision.changes.map((item) => item.change).join(", ")}`,
			);
		}
	}
	if (status.blockedReasons.length > 0) {
		lines.push("", "### Blockers", ...status.blockedReasons.map((reason) => `- ${reason}`));
	}
	lines.push("", "### JSON", "```json", JSON.stringify(status, null, 2), "```");
	return lines.join("\n");
}

export function parseSddStatusCommandArgs(args: string): { changeName?: string; json: boolean } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const json = parts.includes("--json");
	const changeName = parts.find((part) => part !== "--json");
	return { changeName, json };
}

export function sddStatusSeverity(status: SddStatus): "info" | "warning" {
	return status.blockedReasons.length > 0 || Object.values(status.dependencies).includes("blocked")
		? "warning"
		: "info";
}

export function summarizeSddStatusForTitle(status: SddStatus): string {
	return `${status.changeName ?? "unresolved"}: ${status.nextRecommended} (${status.taskProgress.complete}/${status.taskProgress.total} tasks)`;
}

export function activeChangeLabel(cwd: string): string {
	return basename(resolve(cwd));
}
