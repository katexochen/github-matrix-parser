{
  description = "GitHub Actions Matrix Parser Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.callPackage (
          {
            lib,
            stdenv,
            nodejs,
            pnpm_9,
            pnpmConfigHook,
            fetchPnpmDeps,
            makeWrapper,
          }:
          stdenv.mkDerivation (finalAttrs: {
            pname = "github-matrix-parser";
            version = "unstable-2025-12-22";

            src = lib.cleanSource ./.;

            nativeBuildInputs = [
              nodejs
              pnpm_9
              pnpmConfigHook
              makeWrapper
            ];

            pnpmDeps = fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              pnpm = pnpm_9;
              fetcherVersion = 3;
              hash = "sha256-mQysvhSwfjrVSbUnCNFgW4k25YZmuFtxaKtYqP+17nk=";
            };

            dontBuild = true;

            installPhase = ''
              runHook preInstall

              mkdir -p $out/bin $out/lib
              cp -r . $out/lib/github-matrix-parser
              makeWrapper ${nodejs}/bin/node $out/bin/github-matrix-parser \
                --add-flags "$out/lib/github-matrix-parser/cli.js"

              runHook postInstall
            '';
          })
        ) { };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            nodePackages.pnpm
          ];
        };
      }
    );
}
