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
          npmDepsHash = "sha256-jJMUyak7HVZoNKN7X8dvRUmtkDGxTA4wz7WjIw0wXoA=";

          # Plugins are pi extensions; build artifacts are committed to repo.
          dontNpmBuild = true;

          # Some plugins peer-depend on @earendil-works/pi-* which isn't on registry;
          # skip peer enforcement at install time.
          npmFlags = [ "--legacy-peer-deps" "--ignore-scripts" ];

          # Output the resolved node_modules tree — pi reads this at runtime.
          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/node_modules
            # Copy external deps
            cp -r node_modules/. $out/lib/node_modules/
            # Replace workspace symlinks with real copies so pi autoload follows them
            for link in $(find $out/lib/node_modules -maxdepth 2 -type l); do
              target=$(readlink "$link")
              # workspace links point to ../../packages/<name> relative to node_modules
              real=$(cd "$(dirname "$link")" && realpath "$target" 2>/dev/null || true)
              if [ -d "$real" ]; then
                rm "$link"
                cp -r "$real" "$link"
              fi
            done
            # Provided by the pi runtime; avoid version drift and singleton state breakage.
            rm -rf $out/lib/node_modules/@earendil-works
            # Clean broken .bin symlinks that pointed into @earendil-works.
            find $out/lib/node_modules/.bin -type l -exec sh -c 'test -e "$1" || rm "$1"' _ {} \;
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
