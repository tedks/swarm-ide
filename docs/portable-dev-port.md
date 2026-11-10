# Portable dev port contract

Run `nix develop --command bazel test //tools:dev-port-contract-test` for a focused test of `tools/dev-port.mjs`. The Bazel target declares and stages only the helper and contract cases, then runs Node's built-in test runner. It inherits the local Nix PATH and is marked no-remote. It checks the loopback endpoint, port bounds, marker prefix and CLI error path without starting Vite, Electron, a server, or a desktop.

The existing `tests/dev-port.test.mjs` Vitest suite is the full helper coverage, including symlinked and unusual entry paths. The focused target is a dependency-free subset. Full app quality and desktop targets remain separate. This focused target does not materialize package dependencies or produce an application bundle.
