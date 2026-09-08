{ lib, stdenv, buildBazelPackage, nodejs_22, pnpm, pnpmConfigHook, fetchPnpmDeps
, writableTmpDirAsHomeHook, autoPatchelfHook, makeWrapper
, bazel_7, jdk21_headless, electron, git, tmux, util-linux, src
}:
let
  pnpmDeps = fetchPnpmDeps {
    pname = "swarm-ide";
    src = lib.fileset.toSource {
      root = ../.;
      fileset = lib.fileset.unions [
        ../package.json
        ../pnpm-lock.yaml
        ../pnpm-workspace.yaml
      ];
    };
    inherit pnpm;
    fetcherVersion = 4;
    hash = "sha256-oh+iXosMIvEV646mijCH8uuC4CHFJnNJh1napnaOke8=";
  };
  bazelBinary = "${bazel_7}/bin/bazel-${bazel_7.version}-linux-${if stdenv.hostPlatform.isAarch64 then "aarch64" else "x86_64"}";
in buildBazelPackage {
  pname = "swarm-ide";
  version = "0.1.0";
  inherit src;
  bazel = bazel_7;
  bazelTargets = [ "//:desktop-bundle" "//tools/cli:registration-bundle" ];
  removeRulesCC = false;
  # The package has no external MODULE dependencies. Use Bazel's supported
  # legacy workspace here so buildBazelPackage captures all downloads; its
  # external-repository archive does not carry Bzlmod's registry cache.
  bazelFlags = [ "--jobs=3" "--enable_bzlmod=false" "--enable_workspace=true" ];
  fetchAttrs.hash = "sha256-RzX8Shr8It9EahXDd3KotcZ2CjFcuzZVyK5aQutLPA4=";

  buildAttrs = {
  inherit pnpmDeps;
  nativeBuildInputs = [ nodejs_22 pnpm pnpmConfigHook
    writableTmpDirAsHomeHook autoPatchelfHook makeWrapper ];
  buildInputs = [ stdenv.cc.cc.lib ];
  ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
  dontAutoPatchelf = true;
  dontUseCmakeConfigure = true;

  postPatch = ''
    patchShebangs tools/build-app.sh
  '';
  preBuild = ''
    # Vite's pinned native modules need the Nix C++ runtime before the build.
    # The Electron npm installer ships foreign libc/architecture variants in
    # one package. Patch only this platform's GNU bindings, not unused musl.
    mapfile -d "" nativeModules < <(find node_modules -type f \
      -name '*linux-${if stdenv.hostPlatform.isAarch64 then "arm64" else "x64"}-gnu.node' -print0)
    autoPatchelf "''${nativeModules[@]}"
  '';
  bazelBuildFlags = [ "--repository_disable_download"
    "--action_env=PATH" "--action_env=pnpm_config_pm_on_fail=ignore"
    "--action_env=ELECTRON_SKIP_BINARY_DOWNLOAD=1" ];

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/share/swarm-ide/cli" "$out/bin"
    tar -xzf bazel-bin/swarm-ide-foundation.tar.gz -C "$out/share/swarm-ide"
    cp tools/cli/{launcher,main,tmux}.mjs "$out/share/swarm-ide/cli/"
    cp tools/cli/electron-main.cjs "$out/share/swarm-ide/cli/"
    cp bazel-bin/tools/cli/registration.cjs "$out/share/swarm-ide/cli/"
    substituteInPlace "$out/share/swarm-ide/cli/main.mjs" \
      --replace-fail '@electron@' '${electron}/bin/electron'
    # Give Electron a stable application name and its own userData directory.
    cp ${builtins.toFile "swarm-ide-runtime-package.json" (builtins.toJSON {
      name = "swarm-ide"; version = "0.1.0"; main = "cli/electron-main.cjs";
    })} "$out/share/swarm-ide/package.json"
    makeWrapper ${nodejs_22}/bin/node "$out/bin/swarm" \
      --add-flags "$out/share/swarm-ide/cli/main.mjs" \
      --prefix PATH : ${lib.makeBinPath [ nodejs_22 git tmux util-linux bazel_7 ]} \
      --set-default SWARM_BAZEL_BIN '${bazelBinary}' \
      --set-default SWARM_BAZEL_JAVA_HOME '${jdk21_headless}'
    runHook postInstall
  '';

  passthru = { inherit pnpmDeps; };
  };
  meta = {
    description = "Local development cockpit for navigating software and steering agent swarms";
    mainProgram = "swarm";
    license = lib.licenses.agpl3Only;
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
