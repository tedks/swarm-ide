# Browse real local repository tasks

Tasks in the Work panel reads the opened repository's **local**
`refs/heads/ditz-metadata`. It does not fetch or sync that branch. Open means
not closed, not ready for agent dispatch. Search matches title or full ID;
selecting a task shows literal details without retargeting the source or draft.
Use **Show task details** to bring the information panel into view, and
**Return to source information** to return. **Reveal working file** opens only
an explicitly recorded file reference through the existing contained-file
broker. A dirty buffer and its cursor are retained; the metadata line is not
treated as an exact location in unsaved text.

The labelled metadata revision is distinct from working, built and deployed
source. While a task consumer is visible, a cheap check every five seconds (and
on window focus or reopening) detects changes to the local metadata ref. A changed
ref automatically starts one complete read; the existing rows stay visible until
the new revision is ready. No **Refresh tasks** click is needed for normal updates.
If metadata advances again during that read, the next normal check catches up,
without overlapping reads or an immediate read loop.

Malformed, missing or oversized metadata retains the last complete snapshot and
the failure reason. The same failed revision is not repeatedly parsed: a different
ref or **Refresh tasks** can try again. If the initial read fails before any usable
list exists, manual Refresh (or core reconnection) remains the recovery path.
No metadata
branch means unavailable, not an empty backlog. This prototype supports at most
256 issues and the bounds in `docs/repo-task-surface.md`.

Automatic list updates do not rewrite a task opened from a revision-pinned graph
or file backlink, or a task already attached to an agent draft. Those keep the
revision the operator selected; select or reattach deliberately to use newer text.

## Explicit human launch

From a checkout containing this feature, the supported fast developer path is:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel run //:dev --jobs=3

Run that only when you deliberately want to open a new native window on your
desktop. The existing watched application is not updated or restarted by landing
this feature. Use a free `SWARM_DEV_PORT` if another development instance owns
the configured port. The application registers its current working directory;
Tasks reads that directory's local Ditz branch. Graph topology remains the
existing registered prototype projection, not a general Ditz-node graph.

For the actual self-contained production archive, first build
`nix develop --command bazel build //:desktop-bundle --jobs=3`, then enter the Nix
shell, extract `bazel-bin/swarm-ide-foundation.tar.gz` to a new private temporary
directory, and run `$SWARM_ELECTRON_BIN <extracted>/app/electron/main.js
--user-data-dir=<new-private-profile>` from the intended repository. Respect
the existing Nix runtime's explicit `SWARM_ELECTRON_NO_SANDBOX` choice: if it is
exactly `1`, add `--no-sandbox` before the main.js argument; when unset, omit
that flag (other values are invalid). This feature does not change that choice.
The archive contains its parser and relative
`file://` renderer assets; it does not need source `node_modules` at runtime.

## Automated acceptance

The following target creates a private disposable repository with the actual
installed Ditz CLI and opens the actual production archive only on owned Xvfb:

    flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock nix develop --command bazel test //tools/task-integration:packaged-task-test --jobs=3 --nocache_test_results

It requires the already-installed Nix Ditz package (resolved offline), the Nix
desktop tools and the free owned virtual port 55174. It never authors or syncs
the user's metadata. Evidence includes screenshots, exact metadata revisions,
source/draft/graph retention measurements, malformed/missing recovery and a
negative check with the packaged parser temporarily absent. That one deliberate
Git-structure failure is synthetic fault injection; the valid task metadata is
actually CLI-authored. The virtual supervisor reports process cleanup separately.

There are no model turns, automatic task writes, task-to-draft attachments,
agent dispatch, credentials or new live-execution authority in this release.
Production agent launch remains unavailable under the existing policy gate.
