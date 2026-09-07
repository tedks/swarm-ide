# Find a repository file from anywhere

Press **Ctrl+K**, type a filename or repository-relative path fragment, use
Up/Down to choose, and Enter to open its actual working source. Full paths
distinguish duplicate basenames. Typing/highlighting do not navigate; Escape
restores the prior focused control. Existing commands, task commands and mock
commands still coexist. **Open repository path** remains an exact-path fallback
when a file is ignored, outside the capture, or search is unavailable.

Search is an advisory, dated filename capture—not content search, symbols,
build evidence or read permission. Explicit opening uses the existing file
broker and N1 parent-directory activation; it revalidates current source,
retains dirty tabs/logical cursors and independent drafts, and keeps the Service
and Build projections mounted. Only the intended repository navigation changes.
Existing captured build-follow behavior is unchanged and is still a CAPTURE,
not a live/general Bazel provider.

## Coverage and bounds

The registered canonical Git root with committed HEAD owns all queries. Fixed
read-only Git plumbing captures tracked and non-ignored untracked names,
including dotfiles. Tracked files remain eligible despite current ignore rules.
Ignored untracked paths are not searched. No contents are read for matching;
binary/oversized source may still fail explicitly when opened.

One names-only stream and one index-only stage stream share a two-second,
two-MiB stdout/stderr budget. Separate streams prevent an untracked tab-containing
stage-looking name becoming an alias, while retaining gitlink exclusions even
if a submodule was replaced by a regular file. Captured names stop at 8,192
entries or one MiB of UTF-8 names. That is an explicitly partial subset, not a
globally complete inventory. Unsupported filename bytes/control characters,
`.git` segments, links, nested repositories, gitlinks and special files cannot
be opened through a search result. Final file authority remains separate.

Queries are literal case-insensitive fragments, maximum 256 characters. Rank is
basename exact, basename prefix, full-path prefix, basename substring, then
full-path substring; full paths break ties in deterministic ordinal order.
At most 40 results are returned after checking at most 160 candidate paths.
Metadata validation has a two-second response deadline. Narrow the query or use
exact Open path when matching/checking is truncated. An empty partial search
does not prove a file is absent.

## Freshness, errors and ownership

Capture occurs on first search or explicit **Refresh filenames**, not every key
or focus change. A 120ms input debounce avoids issuing a request per keystroke.
The capture becomes visibly stale after five seconds or working-world hints;
staleness does not start scans. Refresh failure retains the prior capture with
an explicit stale/failure notice. Initial failure is unavailable and is retried
only explicitly. Current metadata checks omit deleted/unsafe candidates, but a
path can change again; failed activation preserves the previous work.

Query/repository/core generations reject obsolete responses. Core replacement
drops the old capture and creates a new one, retaining the typed query. Disposal
aborts owned Git work and waiting metadata responses. Node cannot cancel an OS
metadata lookup already blocked on a mount: at most one actual chain remains
owned by that local-core process; timed-out or superseded calls cannot start
additional chains/follow-on lookups. Future stronger isolation is tracked as
`repository-search-stalled-metadata`, not claimed implemented.

## Verification and scope

`nix develop --command bazel test --jobs=3 //:quality` covers real Git/filesystem
boundaries and separately identified deterministic fault/race cases. The
existing `//tools/repository-navigation:packaged-navigation-test` exercises
ordinary packaged main/preload/core in Swarm and an unfamiliar committed repo
on owned virtual X11, including exact source/draft/camera retention at 100/150,
literal/duplicate/untracked/dot names, actual deletion, actual core replacement,
and a real 8,192-name cap. Strict renderer-error and process-cleanup gates remain.
Final PR/local evidence identifies the exact passing head; this document alone
is not a test or merge receipt. No product model turn or human-preview adoption.

Project selection, symbol/content search, richer Context, scoped configuration,
live build links, service callsites and tiled documents remain separate work.
