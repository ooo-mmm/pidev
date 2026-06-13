# pidev

Vendored monorepo of 18 pi-coding-agent extensions consumed as a Nix flake input by [ooo-mmm/os](https://github.com/ooo-mmm/os).

## Layout

```
packages/                  # npm workspaces
  @juicesharp/             # rpiv-todo, rpiv-ask-user-question (from ooo-mmm/rpiv-mono fork)
  @apmantza/               # greedysearch-pi
  @vanillagreen/           # pi-tool-renderer
  context-mode/
  pi-rtk-optimizer/
  ...                      # 16+ unscoped packages
flake.nix                  # flake-parts: exports packages/ as store path
```

## Adding a package

1. Vendor source into `packages/<name>/` (clone from npm registry `repository.url` or user fork)
2. Strip `.git/`, `node_modules/`, lockfiles
3. Update `packages/MANIFEST.md`
4. Commit

## Consumption

Consumed by `/home/v/os` via Nix flake input. Individual package dirs symlinked into `~/.pi/agent/npm/node_modules/`.
