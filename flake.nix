{
  description = "Linux development environment for swarm-ide";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bazel_7
              electron
              git
              imagemagick
              jq
              nodejs_22
              openbox
              pnpm
              procps
              tmux
              util-linux
              wmctrl
              xauth
              xdpyinfo
              xdotool
              xmessage
              xorg-server
              xwininfo
            ];

            ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
            SWARM_ELECTRON_BIN = "${pkgs.electron}/bin/electron";
            SWARM_BAZEL_BIN = "${pkgs.bazel_7}/bin/bazel-${pkgs.bazel_7.version}-linux-${if system == "aarch64-linux" then "aarch64" else "x86_64"}";
            SWARM_BAZEL_JAVA_HOME = "${pkgs.jdk21_headless}";

            shellHook = ''
              echo "swarm-ide dev shell: node $(node --version), pnpm $(pnpm --version), bazel $(bazel --version | head -1)"
            '';
          };
        });
    };
}
