# Independent test runtime, pinned by the existing repository lock. No global install.
let
  lock = builtins.fromJSON (builtins.readFile ../../flake.lock);
  source = builtins.fetchTree lock.nodes.nixpkgs.locked;
  pkgs = import source { };
in pkgs.buildEnv {
  name = "swarm-offline-policy-runtime";
  paths = [ pkgs.bubblewrap pkgs.nodejs_22 pkgs.bash pkgs.coreutils pkgs.strace ];
}
