# Service declarations

The Services graph is automatic and read-only. It discovers standard Compose
filenames and `service.swarm.json` among Git-tracked and nonignored working
files. It does not run Docker, build a target, evaluate environment variables,
or infer a service from a package name or open port. Runtime container status is
a separate project-context instrument.

Compose services are scoped to their declaration file. `depends_on` draws a
**starts after** edge. Includes/extends and unresolved dependencies have partial
coverage notices; multiple Compose files are not combined into an effective
deployment configuration. Images, environment values and credentials are not
copied into graph metadata.

A native declaration uses the existing `service.swarm.json` convention:

The [checkout example](../examples/checkout-world/README.md) contains two ordinary
manifests with implementation and contract links. It is sample repository data,
not a built-in provider or fallback. Its required and provided interface nodes
show authored roles, not observed calls.

```json
{
  "schemaVersion": 1,
  "service": { "id": "service:search", "displayName": "Search" },
  "implementationPaths": ["src/search.ts"],
  "owningTarget": "//src:search",
  "providedInterfaces": [
    { "id": "interface:search.find", "name": "Find",
      "requestType": "search.Query", "responseType": "search.Results" }
  ],
  "interfaceDeclarationPaths": [
    { "interfaceId": "interface:search.find", "path": "api/search.proto" }
  ]
}
```

Only `schemaVersion` and `service` are required. Paths are relative to the
repository root, including for nested manifests. `requiredInterfaces` has the
same fields plus `serviceId`; it records an authored requirement, not an observed
callsite. Interfaces with no separate source point to the manifest that actually
declares them. Unavailable source links are reported; they do not point outside
the worktree. Bazel targets appear only when explicitly declared.

Discovery currently reads at most 128 declaration files of at most 1 MiB each,
and a graph of 480 combined service/interface nodes. Omitted files and unsupported
declarations make coverage partial. The scan excludes dependency/output and
fixture/test directories. This is a finite local reader, not a complete Compose
deployment engine. No cloud metrics or running-service assertion is implied.

Saved edits trigger the existing working-world observer. The last usable graph
remains while reading or after a malformed edit. Valid deletion clears the old
service, and supported partial declarations keep updating. Source receipts never
advance the IDE's built or deployed revision.

Checks: `nix develop --command bazel test --jobs=3 //tools/services:checks
//tools:service-fixture-test`. Desktop proof:
`nix develop --command bazel run --jobs=3 //tools/services:smoke` (owned virtual
desktop only). For a read-only inspection of another project, use
`nix develop --command bazel run //tools/services:inspect -- /absolute/repository`.
Historical example proofs are not evidence for this new reader.
