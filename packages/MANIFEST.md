# pidev Package Manifest

Vendored monorepo of pi-coding-agent extensions. Each entry records the source provenance, version, and description. See root `flake.nix` for Nix consumption.

## Packages

| # | Package | Version | Source | Type | Description |
|---|---------|---------|--------|------|-------------|
| 1 | `context-mode` | 1.0.162 | mksglu/context-mode | npm clone | OpenClaw plugin: sandboxed code execution (11 languages), FTS5 knowledge base, intent-driven search. Saves ~98% context. |
| 2 | `pi-rtk-optimizer` | 0.8.2 | MasuRii/pi-rtk-optimizer | npm clone | RTK command rewriting and tool output compaction for coding agent. |
| 3 | `pi-caveman` | 1.0.7 | jonjonrankin/pi-caveman | npm clone | Caveman mode: ~75% token reduction while preserving technical accuracy. |
| 4 | `pi-subagents` | 0.26.0 | nicobailon/pi-subagents | npm clone | Subagent delegation with chains, parallel execution, and TUI clarification. |
| 5 | `pi-hermes-memory` | 0.7.15 | chandra447/pi-hermes-memory | npm clone | Persistent memory, session search (SQLite FTS5), secret scanning. 368 tests. |
| 6 | `pi-intercom` | 0.6.0 | **ooo-mmm/pi-intercom** | fork | User fork. Inter-agent communication broker for pi. |
| 7 | `pi-lens` | 3.8.50 | apmantza/pi-lens | npm clone | Real-time LSP/linter/formatter/type-checking feedback for pi. |
| 8 | `@juicesharp/rpiv-todo` | 1.19.1 | **ooo-mmm/rpiv-mono** (subdir: packages/rpiv-todo) | fork | Live todo list overlay surviving /reload and compaction. |
| 9 | `@juicesharp/rpiv-ask-user-question` | 1.19.2 | **ooo-mmm/rpiv-mono** (subdir: packages/rpiv-ask-user-question) | fork | Structured questionnaire with typed options instead of free-form replies. |
| 10 | `pi-docparser` | 3.0.1 | maxedapps/pi-docparser | npm clone | Document parse/search/screenshot with LiteParse v2. |
| 11 | `pi-markdown-preview` | 0.10.0 | omaclaren/pi-markdown-preview | npm clone | Rendered markdown + LaTeX preview (terminal, browser, PDF). |
| 12 | `pi-cursor-sdk` | 0.1.42 | fitchmultz/pi-cursor-sdk | npm clone | Provider extension backed by @cursor/sdk local agents. (Will be patched in next phase.) |
| 13 | `@apmantza/greedysearch-pi` | 2.0.0 | apmantza/GreedySearch-pi | npm clone | Headless multi-engine AI search (Perplexity, Google AI, ChatGPT, Gemini) via browser automation. No API keys needed. |
| 14 | `pi-smart-fetch` | 0.3.11 | Thinkscape/agent-smart-fetch | npm clone | Smart web_fetch with desktop-browser TLS impersonation and defuddle extraction. |
| 15 | `pi-ollama-cloud` | 0.6.0 | fgrehm/pi-ollama-cloud | npm clone | Ollama integration for pi. |
| 16 | `pi-zentui` | 0.2.6 | lmilojevicc/pi-zentui | npm clone | Starship-inspired statusline and Opencode-style TUI for Pi. |
| 17 | `@vanillagreen/pi-tool-renderer` | 1.6.1 | vanillagreencom/vstack | npm clone (monorepo subdir) | Compact Claude/opencode-style renderers for Pi tools with rich diffs, apply_patch, and MCP rendering. |
| 18 | `pi-finish-notification` | 1.0.4 | npm tarball (no public repo) | npm tarball | Native macOS/terminal notifications when pi finishes and terminal isn't active. |
| 19 | `gentle-pi` | 0.4.5 | **ooo-mmm/gentle-pi** | fork | SDD/OpenSpec development harness with subagents, TDD evidence, review guardrails, and skill discovery. |

## Source Types

- **npm clone**: Cloned from `repository.url` in npm registry metadata. Corresponds to the `dist-tags.latest` tag at time of vendoring.
- **fork**: User's fork at github.com/ooo-mmm. May diverge from upstream.
- **npm tarball**: Downloaded directly from npm tarball (no public repository).
- **monorepo subdir**: Extracted from a subdirectory of the cloned monorepo.

## Stripped Files

Per vendoring convention, the following are removed from each package:
- `.git/` directories
- `node_modules/` directories
- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`)

## Adding a Package

1. Vendor source into `packages/<name>/` using the appropriate source type.
2. Strip `.git/`, `node_modules/`, lockfiles.
3. Add an entry to this manifest.
4. Commit.
