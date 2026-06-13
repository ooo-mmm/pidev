# pidev

Vendored monorepo of pi-coding-agent extensions, consumed as a Nix flake by
[ooo-mmm/os](https://github.com/ooo-mmm/os). Single source of truth for plugin
patches (e.g. pi-cursor-sdk Bun TLS race fix).

## Layout

```
packages/                              npm workspaces — 18 plugins
  @apmantza/greedysearch-pi/
  @juicesharp/rpiv-ask-user-question/  (from ooo-mmm/rpiv-mono)
  @juicesharp/rpiv-todo/               (from ooo-mmm/rpiv-mono)
  @vanillagreen/pi-tool-renderer/
  context-mode/
  gentle-pi/                           (from ooo-mmm/gentle-pi)
  pi-caveman/
  pi-cursor-sdk/                       (PATCHED — Bun TLS race fix)
  pi-docparser/
  pi-finish-notification/
  pi-hermes-memory/
  pi-intercom/                         (from ooo-mmm/pi-intercom)
  pi-lens/
  pi-markdown-preview/
  pi-ollama-cloud/
  pi-rtk-optimizer/
  pi-smart-fetch/
  pi-subagents/
  pi-zentui/
  MANIFEST.md                          source provenance per package
package.json                           root workspace
package-lock.json                      reproducible dep resolution (1450+ resolved)
flake.nix                              flake-parts; .#node-modules output
```

## Flake outputs

| Output | What it is |
|---|---|
| `.#src` | Just the `packages/` source tree copied into the Nix store. |
| `.#node-modules` | Full resolved `node_modules/` from `package-lock.json` via `pkgs.buildNpmPackage`. Contains `lib/node_modules/` (drop-in replacement for `~/.pi/agent/npm/node_modules/`) and `packages/` (raw sources). |
| `.#default` | Alias for `.#node-modules`. |

Workspace plugins (the 18 in `packages/`) appear in the resolved `lib/node_modules/`
as **symlinks** into `../packages/<name>` — this is the standard npm workspaces
layout and means any patch in `packages/<name>` is immediately reachable through
the resolved tree without rebuild.

## Adding a new plugin

1. **Vendor source** into `packages/<name>/`. Source priority:
   1. ooo-mmm fork repo if you maintain one.
   2. npm registry → `repository.url` → clone matching tag.
   3. If no public repo: download tarball via
      `curl -L $(npm view <name> dist.tarball) | tar xz`.
2. **Strip cruft**: remove `.git/`, `node_modules/`, `bun.lockb`,
   `pnpm-lock.yaml`, `package-lock.json` from the vendored package
   (root `package-lock.json` is the only lockfile we keep).
3. **Verify it's not a monorepo** before committing:
   ```bash
   ls packages/<name>/{packages,apps,crates} 2>/dev/null  # should error — none of these
   grep -E '"workspaces"' packages/<name>/package.json    # should be empty
   ```
   If you see workspace dirs/fields, the upstream is a monorepo —
   re-vendor only the relevant subdirectory.
4. **Add to MANIFEST.md** with source URL + version.
5. **Regenerate the lockfile + Nix hash** (next section).
6. Commit and push.

## Regenerating the lockfile (after any package change)

The `package-lock.json` and `npmDepsHash` in `flake.nix` must stay in sync with
`packages/*/package.json`. If you add, remove, or update any plugin's
`dependencies`, you MUST regenerate both, otherwise consumer's
`nix build .#node-modules` will fail with a hash mismatch.

```bash
cd /path/to/pidev

# 1. Regenerate package-lock.json from current workspaces
rm -f package-lock.json
npm install --package-lock-only --workspaces --include-workspace-root \
  --legacy-peer-deps

# 2. Compute the new npmDepsHash
nix run nixpkgs#prefetch-npm-deps -- ./package-lock.json
# Output: sha256-<NEW_HASH>=

# 3. Update flake.nix — replace the npmDepsHash literal with the new value
sed -i 's|npmDepsHash = "sha256-[^"]*"|npmDepsHash = "sha256-<NEW_HASH>="|' \
  flake.nix

# 4. Verify
nix build .#node-modules --no-link 2>&1 | tail -5

# 5. Commit
git add package-lock.json flake.nix packages/<name>/
git commit -m "chore: add <name>, refresh lockfile + npmDepsHash"
```

The `--legacy-peer-deps` flag is required: several plugins peer-depend on
`@earendil-works/pi-coding-agent`, which ships only inside the
`lukasl-dev/pi.nix` flake (not the npm registry). The consumer (ooo-mmm/os)
provides those peers at runtime.

## Patching an upstream plugin

To carry a fix that upstream hasn't merged:

1. Edit `packages/<name>/` directly. Keep the patch minimal.
2. Bump that package's `version` to a fork-tagged form
   (e.g. `0.1.42` → `0.1.42-ooo.1`).
3. Add a CHANGELOG entry inside the package describing the patch and reason.
4. Regenerate the lockfile and `npmDepsHash` (above).
5. Commit. Reference the upstream issue/PR in the commit message if any.

Workspace symlink semantics mean the patch is live in the resolved
`node_modules/` immediately after the next `nix build`.

## Consumption from ooo-mmm/os

```nix
# flake.nix
inputs.pidev = {
  url = "github:ooo-mmm/pidev";
  inputs.nixpkgs.follows = "nixpkgs";
};

# pi.nix
home.file.".pi/agent/npm/node_modules".source =
  "${inputs.pidev.packages.${pkgs.system}.default}/lib/node_modules";
```

That single line replaces the entire previous activation-script symlink loop +
`pi install npm:*` extension installer. pi never touches the npm registry for
plugin install at runtime — pidev is the source of truth.
