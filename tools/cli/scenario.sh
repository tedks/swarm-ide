#!/usr/bin/env bash
set -euo pipefail
source "${SWARM_X11_DRIVER_PATH:?}"
swarm_x11_assert_owned
swarm_window_assert_selected
swarm_window_activate
swarm_window_wait_title ' — Graphs' present 20000
swarm_window_key ctrl+k
swarm_window_wait_title 'Palette open'
swarm_window_type 'Open repository path' 10
swarm_window_key Return
swarm_window_wait_title 'Palette open · exact path'
swarm_window_key ctrl+a
swarm_window_type 'install-proof.txt' 10
swarm_window_key Return
swarm_window_wait_title 'Source install-proof.txt:saved' present 10000
swarm_window_capture "${SWARM_ARTIFACT_DIR:?}/installed-workspace.png"
swarm_window_title
node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  const file=path.join(process.env.SWARM_ARTIFACT_DIR,"launch.json");
  const info=JSON.parse(fs.readFileSync(file,"utf8"));
  if(fs.readFileSync(path.join(info.workspace,"install-proof.txt"),"utf8")!==info.sourceText) throw new Error("source changed");
  fs.writeFileSync(path.join(process.env.SWARM_ARTIFACT_DIR,"proof.json"),JSON.stringify({...info,openedRealSource:true,sourceUnchanged:true}));
'
