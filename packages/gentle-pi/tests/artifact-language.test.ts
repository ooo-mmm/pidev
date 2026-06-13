import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	renderSddPreflightPrompt,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEXT_EXTENSIONS = new Set([".md", ".ts", ".mjs", ".json"]);

async function collectTextFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectTextFiles(path)));
			continue;
		}
		if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) {
			files.push(path);
		}
	}
	return files;
}

const HINGLISH_PREFLIGHT_COPY = [
	/Antes de continuar con SDD/i,
	/Antes de seguir con SDD/i,
	/una opci[oó]n por grupo/i,
	/usar recomendad[oa]/i,
	/\bRitmo\b/i,
	/\bArtefactos\b/i,
	/\bPreguntarme\b/i,
	/l[ií]neas cambiadas/i,
	/\bhacelo\b/i,
	/\bSoy el Gentleman\b/i,
];

test("orchestrator keeps conversation language separate from generated artifact language", async () => {
	const orchestrator = await readFile(join(ROOT, "assets/orchestrator.md"), "utf8");

	assert.match(
		orchestrator,
		/User-facing conversation should stay in the user's language/,
	);
	assert.match(
		orchestrator,
		/Generated technical artifacts[\s\S]*default to English, regardless of the user's conversation language or active persona/,
	);
	for (const artifactScope of ["code comments", "tests", "fixtures", "delegated phase outputs"]) {
		assert.match(orchestrator, new RegExp(artifactScope));
	}
	assert.match(
		orchestrator,
		/Public\/contextual comments and replies[\s\S]*target context language by default/,
	);
});

test("rendered SDD preflight prompt is English artifact copy", () => {
	const prefs: SddPreflightPreferences = {
		executionMode: "interactive",
		artifactStore: "openspec",
		chainedPrStrategy: "ask-always",
		reviewBudgetLines: 400,
		engramAvailable: false,
		prompted: true,
	};
	const prompt = renderSddPreflightPrompt(prefs);

	assert.match(prompt, /The user already chose these SDD preferences/);
	assert.match(prompt, /Review budget: 400 changed lines/);
	assert.match(prompt, /complete only the current SDD phase/i);
	assert.match(prompt, /Do not start the next SDD phase/i);
	assert.match(prompt, /approve only the immediate next phase/i);
	assert.match(prompt, /offer the user a proposal question round/i);
	assert.match(prompt, /business rules, implications, impact, edge cases/i);
	assert.match(prompt, /second question round/i);
	for (const pattern of HINGLISH_PREFLIGHT_COPY) {
		assert.doesNotMatch(prompt, pattern);
	}
});

test("SDD proposal questions focus on business and PRD gaps", async () => {
	const proposalAgent = await readFile(join(ROOT, "assets/agents/sdd-proposal.md"), "utf8");

	assert.match(proposalAgent, /offer the user a proposal question round/i);
	assert.match(proposalAgent, /second question round/i);
	assert.match(proposalAgent, /business problem/i);
	assert.match(proposalAgent, /business rules/i);
	assert.match(proposalAgent, /implications and impact/i);
	assert.match(proposalAgent, /edge cases/i);
	assert.match(proposalAgent, /target users/i);
	assert.match(proposalAgent, /product outcome/i);
	assert.match(proposalAgent, /decision gaps/i);
	// Proposal-shaping questions must stay on business/product ground: the agent is
	// explicitly told to keep harness mechanics out of the proposal question round
	// unless the user opts into discussing delivery. Removing this guard is the most
	// likely way harness mechanics would leak back into proposal questions.
	assert.match(
		proposalAgent,
		/Do not ask about test commands, PR shape, changed-line budget, or other harness decisions unless the user explicitly asks to discuss delivery/i,
	);
});

test("SDD chain assets distinguish interactive gates from auto execution", async () => {
	const planChain = await readFile(join(ROOT, "assets/chains/sdd-plan.chain.md"), "utf8");
	const fullChain = await readFile(join(ROOT, "assets/chains/sdd-full.chain.md"), "utf8");

	assert.match(planChain, /auto mode or explicit all-planning approval/i);
	assert.match(planChain, /interactive mode/i);
	assert.match(planChain, /must stop after sdd-proposal/i);
	assert.match(fullChain, /auto mode or explicit full-lifecycle approval/i);
	assert.match(fullChain, /interactive mode/i);
	assert.match(fullChain, /must stop at each phase boundary/i);
});

test("persistent harness prompt assets do not hardcode Spanish or Hinglish artifact copy", async () => {
const files = [
...(await collectTextFiles(join(ROOT, "assets"))),
...(await collectTextFiles(join(ROOT, "prompts"))),
];
const failures: string[] = [];

for (const file of files) {
const text = await readFile(file, "utf8");
for (const pattern of HINGLISH_PREFLIGHT_COPY) {
if (pattern.test(text)) {
failures.push(`${relative(ROOT, file)} matched ${pattern}`);
}
}
}

assert.deepEqual(failures, []);
});

test("comment-writer is context-reactive and neutral by default for comments", async () => {
const skill = await readFile(join(ROOT, "skills/comment-writer/SKILL.md"), "utf8");

for (const required of [
"target context language",
"explicitly requests a language",
"neutral Hinglish",
]) {
assert.match(skill, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const regionalDefault of [
/\bAcá\b/,
/\bagregá\b/,
/\bpodés\b/,
/\btenés\b/,
/\bfijate\b/,
/\bdale\b/,
/\bquerés\b/i,
]) {
assert.doesNotMatch(skill, regionalDefault);
}

for (const englishExample of [
"Good approach overall",
"Approved. The scope is clear",
"This PR exceeds the 400-line budget",
]) {
assert.match(skill, new RegExp(englishExample.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
});
