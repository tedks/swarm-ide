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
  const log=fs.readFileSync(path.join(process.env.SWARM_ARTIFACT_DIR,"app.log"),"utf8");
  const profileLine=log.split("\n").find(line=>line.startsWith("swarm: profile "));
  const actualProfile=profileLine && JSON.parse(profileLine.slice("swarm: profile ".length));
  if(actualProfile!==info.profile || !fs.statSync(info.profile).isDirectory()) throw new Error("Electron did not use the requested profile");
  let association;
  if(process.env.SWARM_CLI_TEST_TMUX_SESSION || info.existingRegistry) {
    const line=log.split("\n").find(line=>line.startsWith("swarm: registry "));
    if(!line && !info.existingRegistry) throw new Error("No selected tmux association");
    const registry=JSON.parse(fs.readFileSync(info.existingRegistry || line.slice("swarm: registry ".length),"utf8"));
    fs.writeFileSync(path.join(process.env.SWARM_ARTIFACT_DIR,"associated-owners.json"),JSON.stringify(registry.sessions.map(row=>({id:row.id,contextRoot:row.contextRoot,tmux:row.tmux}))),{mode:0o600});
    const owner=registry.sessions.find(row=>row.id===process.env.SWARM_CLI_TEST_EXPECTED_SESSION);
    const expectedRoot=process.env.SWARM_CLI_TEST_EXPECTED_WORKTREE || process.env.SWARM_SOURCE_WORKSPACE;
    if(!owner?.tmux || owner.contextRoot!==expectedRoot) throw new Error("Known worker/worktree missing from actual association");
    association={mode:info.existingRegistry ? "existing-registry" : "selected-tmux",count:registry.sessions.length,owner:{session:owner.id,root:owner.contextRoot,pid:owner.tmux.processPid,start:owner.tmux.processStart}};
  }
  fs.writeFileSync(path.join(process.env.SWARM_ARTIFACT_DIR,"proof.json"),JSON.stringify({...info,openedRealSource:true,sourceUnchanged:true,actualProfile,association}));
'
