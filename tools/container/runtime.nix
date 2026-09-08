# Same pinned package set as the desktop build, independently of the host OS.
let
  lock = builtins.fromJSON (builtins.readFile ../../flake.lock);
  pkgs = import (builtins.fetchTree lock.nodes.nixpkgs.locked) { };
in pkgs.buildEnv {
  name = "swarm-container-runtime";
  paths = with pkgs; [
    bash coreutils findutils gnugrep procps util-linux git nodejs_22
    electron xorg-server xauth xdpyinfo xdotool x11vnc openbox
    novnc python3Packages.websockify dbus cacert fontconfig dejavu_fonts
    bazel_7 jdk21_headless
  ];
  postBuild = ''
    mkdir -p $out/etc/swarm
    cat > $out/etc/swarm/runtime.env <<'ENV'
    export SWARM_BAZEL_BIN=${pkgs.bazel_7}/bin/bazel-${pkgs.bazel_7.version}-linux-${if pkgs.stdenv.hostPlatform.isAarch64 then "aarch64" else "x86_64"}
    export SWARM_BAZEL_JAVA_HOME=${pkgs.jdk21_headless}
    export FONTCONFIG_FILE=${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; }}
    ENV
  '';
}
