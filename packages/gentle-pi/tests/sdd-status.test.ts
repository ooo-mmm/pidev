import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	listActiveOpenSpecChanges,
	parseSddStatusCommandArgs,
	renderPhaseInstructions,
	renderSddStatusMarkdown,
	resolveSddStatus,
} from "../lib/sdd-status.ts";

async function workspace(): Promise<string> {
	return mkdtemp(join(tmpdir(), "gentle-pi-sdd-status-"));
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function seedChange(cwd: string, change = "add-auth"): string {
	const root = join(cwd, "openspec", "changes", change);
	write(join(root, "proposal.md"), "# Proposal\n");
	write(join(root, "specs", "auth", "spec.md"), "# Auth Spec\n");
	write(join(root, "design.md"), "# Design\n");
	write(
		join(root, "tasks.md"),
		`# Tasks

- [x] 1.1 Build foundation
- [ ] 1.2 Wire routes
`,
	);
	return root;
}

test("listActiveOpenSpecChanges excludes archive and sorts active changes", async () => {
	const cwd = await workspace();
	mkdirSync(join(cwd, "openspec", "changes", "b-change"), { recursive: true });
	mkdirSync(join(cwd, "openspec", "changes", "a-change"), { recursive: true });
	mkdirSync(join(cwd, "openspec", "changes", "archive", "2026-01-01-old"), { recursive: true });

	assert.deepEqual(listActiveOpenSpecChanges(cwd), ["a-change", "b-change"]);
});

test("resolveSddStatus blocks when there are no active changes", async () => {
	const cwd = await workspace();
	mkdirSync(join(cwd, "openspec", "changes"), { recursive: true });

	const status = resolveSddStatus({ cwd });

	assert.equal(status.changeName, null);
	assert.match(status.blockedReasons[0], /No active SDD changes/);
	assert.equal(status.dependencies.apply, "blocked");
});

test("resolveSddStatus blocks when change selection is ambiguous", async () => {
	const cwd = await workspace();
	mkdirSync(join(cwd, "openspec", "changes", "first"), { recursive: true });
	mkdirSync(join(cwd, "openspec", "changes", "second"), { recursive: true });

	const status = resolveSddStatus({ cwd });

	assert.equal(status.changeName, null);
	assert.match(status.blockedReasons[0], /ambiguous/);
});

test("resolveSddStatus selects the only active change and counts task progress", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);

	const status = resolveSddStatus({ cwd, includeInstructions: true });

	assert.equal(status.changeName, "add-auth");
	assert.equal(status.changeRoot, root);
	assert.equal(status.artifacts.proposal, "done");
	assert.equal(status.artifacts.specs, "done");
	assert.deepEqual(status.taskProgress, {
		total: 2,
		complete: 1,
		remaining: 1,
		unchecked: ["- [ ] 1.2 Wire routes"],
	});
	assert.equal(status.applyState, "ready");
	assert.equal(status.dependencies.apply, "ready");
	assert.match(status.instructions?.apply.join("\n") ?? "", /persisted task checkboxes/);
});

test("resolveSddStatus marks apply all_done and verify ready when tasks are checked", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "tasks.md"), "# Tasks\n\n- [x] 1.1 Build foundation\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.applyState, "all_done");
	assert.equal(status.dependencies.apply, "all_done");
	assert.equal(status.dependencies.verify, "ready");
});

test("resolveSddStatus blocks sync when verify report is not clearly passing", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "apply-progress.md"), "# Apply\n\nSome work completed.\n");
	write(join(root, "verify-report.md"), "# Verify\n\nTODO: tests not run yet\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.dependencies.verify, "ready");
	assert.equal(status.dependencies.sync, "blocked");
	assert.equal(status.dependencies.archive, "blocked");
});

test("resolveSddStatus rejects negated pass and sync-complete phrases", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(root, "verify-report.md"), "# Verify\n\nStatus: not passed\n");
	write(join(root, "sync-report.md"), "# Sync\n\nSync complete: no\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.dependencies.verify, "ready");
	assert.equal(status.dependencies.sync, "blocked");
	assert.equal(status.dependencies.archive, "blocked");
	assert.notEqual(status.nextRecommended, "sdd-archive");
});

test("resolveSddStatus blocks sync when verify report contains critical text", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "verify-report.md"), "# Verify\n\nCRITICAL: missing tests\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.dependencies.sync, "blocked");
	assert.equal(status.dependencies.archive, "blocked");
});

test("resolveSddStatus reports same-domain collisions", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd, "current");
	write(join(root, "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(root, "verify-report.md"), "# Verify\n\nPASS\n");
	write(join(cwd, "openspec", "changes", "other", "specs", "auth", "spec.md"), "# Other\n");

	const status = resolveSddStatus({ cwd, changeName: "current" });

	assert.deepEqual(status.collisions.map((collision) => collision.domain), ["auth"]);
	assert.equal(status.collisions[0].changes[0].change, "other");
	assert.equal(status.dependencies.sync, "blocked");
});

test("resolveSddStatus blocks apply when tasks has no checkboxes", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "tasks.md"), "# Tasks\n\nImplementation notes only.\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.taskProgress.total, 0);
	assert.equal(status.applyState, "blocked");
	assert.equal(status.dependencies.apply, "blocked");
	assert.match(status.blockedReasons.join("\n"), /no implementation task checkboxes/);
});

test("resolveSddStatus marks legacy flat specs partial and blocks sync", async () => {
	const cwd = await workspace();
	write(join(cwd, "openspec", "changes", "legacy", "proposal.md"), "# Proposal\n");
	write(join(cwd, "openspec", "changes", "legacy", "spec.md"), "# Flat\n");
	write(join(cwd, "openspec", "changes", "legacy", "design.md"), "# Design\n");
	write(join(cwd, "openspec", "changes", "legacy", "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(cwd, "openspec", "changes", "legacy", "verify-report.md"), "# Verify\n\nPASS\n");

	const status = resolveSddStatus({ cwd, changeName: "legacy" });

	assert.equal(status.artifacts.specs, "partial");
	assert.match(status.blockedReasons.join("\n"), /Legacy flat spec/);
	assert.equal(status.dependencies.sync, "blocked");
});

test("resolveSddStatus accepts nested domain specs even when a legacy flat spec also exists", async () => {
	const cwd = await workspace();
	write(join(cwd, "openspec", "changes", "mixed", "proposal.md"), "# Proposal\n");
	write(join(cwd, "openspec", "changes", "mixed", "spec.md"), "# Flat\n");
	write(join(cwd, "openspec", "changes", "mixed", "specs", "parent", "child", "spec.md"), "# Nested\n");
	write(join(cwd, "openspec", "changes", "mixed", "design.md"), "# Design\n");
	write(join(cwd, "openspec", "changes", "mixed", "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");

	const status = resolveSddStatus({ cwd, changeName: "mixed" });

	assert.equal(status.artifacts.specs, "done");
	assert.equal(status.legacyFlatSpec?.hasDomainSpecs, true);
	assert.doesNotMatch(status.blockedReasons.join("\n"), /Legacy flat spec/);
});

test("resolveSddStatus blocks sync when core artifacts are missing even with clean verify", async () => {
	const cwd = await workspace();
	write(join(cwd, "openspec", "changes", "thin", "proposal.md"), "# Proposal\n");
	write(join(cwd, "openspec", "changes", "thin", "design.md"), "# Design\n");
	write(join(cwd, "openspec", "changes", "thin", "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(cwd, "openspec", "changes", "thin", "verify-report.md"), "# Verify\n\nPASS\n");

	const status = resolveSddStatus({ cwd, changeName: "thin" });

	assert.match(status.blockedReasons.join("\n"), /domain specs are missing or partial/);
	assert.equal(status.dependencies.sync, "blocked");
	assert.notEqual(status.nextRecommended, "sdd-sync");
});

test("resolveSddStatus blocks stale sync report when current verify is not passing", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(root, "verify-report.md"), "# Verify\n\nStatus: not passed\n");
	write(join(root, "sync-report.md"), "# Sync\n\nPASS\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.dependencies.verify, "ready");
	assert.equal(status.dependencies.sync, "blocked");
	assert.equal(status.dependencies.archive, "blocked");
	assert.notEqual(status.nextRecommended, "sdd-archive");
});

test("resolveSddStatus blocks archive when required artifacts are missing", async () => {
	const cwd = await workspace();
	write(join(cwd, "openspec", "changes", "thin", "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(cwd, "openspec", "changes", "thin", "verify-report.md"), "# Verify\n\nPASS\n");
	write(join(cwd, "openspec", "changes", "thin", "sync-report.md"), "# Sync\n\nPASS\n");

	const status = resolveSddStatus({ cwd, changeName: "thin" });

	assert.match(status.blockedReasons.join("\n"), /proposal\.md is missing/);
	assert.equal(status.dependencies.archive, "blocked");
	assert.notEqual(status.nextRecommended, "sdd-archive");
});

test("resolveSddStatus reports partial core artifacts as blockers", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "proposal.md"), "");
	write(join(root, "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(root, "verify-report.md"), "# Verify\n\nPASS\n");
	write(join(root, "sync-report.md"), "# Sync\n\nPASS\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.artifacts.proposal, "partial");
	assert.match(status.blockedReasons.join("\n"), /proposal\.md is empty or partial/);
	assert.equal(status.dependencies.archive, "blocked");
});

test("resolveSddStatus marks archive ready only after clean verify, sync, and complete tasks", async () => {
	const cwd = await workspace();
	const root = seedChange(cwd);
	write(join(root, "tasks.md"), "# Tasks\n\n- [x] 1.1 Done\n");
	write(join(root, "verify-report.md"), "# Verify\n\nPASS\n");
	write(join(root, "sync-report.md"), "# Sync\n\nPASS\n");

	const status = resolveSddStatus({ cwd, changeName: "add-auth" });

	assert.equal(status.dependencies.archive, "ready");
	assert.equal(status.nextRecommended, "sdd-archive");
	assert.match(renderPhaseInstructions(status).archive.join("\n"), /CRITICAL verification issues have no override/);
});

test("renderSddStatusMarkdown includes structured JSON", async () => {
	const cwd = await workspace();
	seedChange(cwd);

	const markdown = renderSddStatusMarkdown(resolveSddStatus({ cwd }));

	assert.match(markdown, /## SDD Status: add-auth/);
	assert.match(markdown, /```json/);
	assert.match(markdown, /"schemaName": "gentle-pi.sdd-status"/);
});

test("parseSddStatusCommandArgs extracts change and json flag", () => {
	assert.deepEqual(parseSddStatusCommandArgs("add-auth --json"), {
		changeName: "add-auth",
		json: true,
	});
	assert.deepEqual(parseSddStatusCommandArgs("--json"), {
		changeName: undefined,
		json: true,
	});
});
