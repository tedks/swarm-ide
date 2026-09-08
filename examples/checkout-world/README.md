# Checkout service example

This small architecture is ordinary repository data for Swarm's generic Services
graph. It is not built into the IDE and is never supplied to another project as
a fallback. The TypeScript functions are local illustrations, not running services.

## Explore it

Open this Swarm IDE repository, for example with `swarm --workspace "$PWD"` from
the repository root. The Services graph automatically discovers the nested
`service.swarm.json` files. Choose **Services** in the topology pane if Builds is
selected. Other declarations in this repository, such as its Compose demo, may
appear alongside the example. No build or Docker startup is needed.

FraudCheck provides **Assess** and declares a requirement for **Payments.Authorize**.
Payments provides **Authorize** and has no declared requirements. Click an interface
to inspect its protobuf contract, or a service to open its manifest. Context also
links the sample implementation. The requirement and provider share the
Payments contract, but their graph nodes describe each service's own role. They
are authored design relationships, not observed network calls. The sample
`assess()` does not actually invoke `authorize()`.

Manifest paths are relative to the Swarm repository root, including the
`examples/checkout-world/` prefix. To reuse the files as a standalone project,
adjust those explicit paths and Bazel labels to that project's root.

From this repository, inspect declarations without launching the UI:

```sh
nix develop --command bazel run //tools/services:inspect -- "$PWD"
```

The example's Bazel rules are only source/contract filegroups. They describe
FraudCheck's source dependency on the Payments contract without generating a
topology artifact or compiling a service:

```sh
nix develop --command bazel build --jobs=3 //examples/checkout-world:all_sources
nix develop --command bazel test --jobs=3 //tools/services:example-checks
```

Edit either manifest and save to update the graph through normal declaration
discovery. Keep source associations and explicit target labels aligned with the
files. See [the generic declaration format](../../docs/service-declarations.md).
