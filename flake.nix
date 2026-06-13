{
  description = "pidev — vendored pi-coding-agent extensions monorepo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs @ { flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];

      perSystem = { pkgs, ... }: rec {
        packages.src = pkgs.runCommand "pidev-src" { } ''
          mkdir -p $out
          cp -r ${./packages} $out/packages
        '';

        # Built node_modules tree: full transitive dep resolution from package-lock.json.
        packages.node-modules = pkgs.buildNpmPackage {
          pname = "pidev-node-modules";
          version = "0.1.0";
          src = ./.;
          npmDepsFetcherVersion = 2;

          # Updated by `nix run nixpkgs#prefetch-npm-deps -- ./package-lock.json`
          npmDepsHash = "sha256-HO7w1pYTp0Bshng7pCkynWXQnCAT14YEY4b/b8wCjp0=";

          # Plugins are pi extensions; no build step required. Skip TS compile / tests.
          dontNpmBuild = true;

          # Some plugins peer-depend on @earendil-works/pi-* which isn't on registry;
          # skip peer enforcement at install time.
          npmFlags = [ "--legacy-peer-deps" "--ignore-scripts" ];

          # Output the resolved node_modules tree — pi reads this at runtime.
          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib
            cp -r node_modules $out/lib/node_modules
            # Workspace symlinks in node_modules point to ../../packages/<name>
            # so packages must live alongside node_modules under $out/lib/.
            cp -r packages $out/lib/packages
            # Also expose at top-level for easy settings.json registration.
            ln -s lib/packages $out/packages
            runHook postInstall
          '';

          meta = {
            description = "Resolved node_modules tree for all pidev plugins";
            platforms = pkgs.lib.platforms.unix;
          };
        };

        packages.default = packages.node-modules;

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [ nodejs_22 biome ];
        };
      };
    };
}
