# Restore checkout as ordinary service example data

## Purpose / Big Picture

Keep the useful FraudCheck/Payments example in this repository while leaving the IDE completely generic. Opening this repository will discover both service.swarm.json files through the same reader used for other projects. An unrelated repository remains empty. This plan follows .planning/PLANS.md.

## Progress

- [x] (2026-09-08) Verified clean source and created fix/restore-service-example from reviewed 40297932 in the existing worktree; original merged branch preserved.
- [ ] Restore contracts/sample sources and ordinary declarations with valid source filegroups.
- [ ] Run focused actual-example and unrelated-repository checks, obtain native review, push ready PR and hand off.

## Surprises & Discoveries

History c48e5b6 has the two contracts, FraudCheck sample and manifest, but Payments has no native manifest or implementation. The former FraudCheck BUILD contains a removed extractor genrule. Restore the useful source data, add Payments declaration/sample, and replace compilation/extractor rules with plain filegroups.

## Decision Log

On 2026-09-08 the user clarified that removing hardcoded IDE behavior must not remove useful in-repo examples. No production reader, adapter, routing or app change is planned. Paths inside manifests are repository-root-relative, as the existing reader requires. FraudCheck declares a Payments.Authorize requirement; the small sample functions are local illustrations, not observed network calls. Payments provides Authorize and has no required interfaces.

## Context and Orientation

core/service-discovery.ts reads nonignored native declarations, including examples/. core/service-topology.ts converts them to source-backed services and interface nodes. examples/checkout-world will hold both services, protobuf contract source files and sample TypeScript. tools/services/BUILD.bazel will expose a focused test target consuming the actual example filegroups; tests/service-example.test.ts will read these files through the unchanged production reader and adapter.

## Plan of Work

Restore the historical contracts and FraudCheck implementation with accurate sample comments. Add ordinary implementationPaths, interfaceDeclarationPaths and owningTarget declarations for both services. Use filegroups only, with FraudCheck explicitly referencing the Payments contract target. Add an example README with inspection commands, source-link guidance and relationship meaning. Update docs/design/repository.md and its .swarm/plans.json source/target mappings to describe data, not a Swarm production subsystem.

## Concrete Steps

In /home/tedks/Projects/swarm-ide/generic-services, run the new focused check with nix develop --command bazel test --jobs=3 //tools/services:example-checks. Build the example filegroups with nix develop --command bazel build --jobs=3 //examples/checkout-world:all_sources. Use nix develop --command bazel run //tools/services:inspect -- /home/tedks/Projects/swarm-ide/generic-services for actual read-only discovery. Optional owned virtual screenshot only if needed; no physical desktop or model invocation. Start/comment/sync Ditz swarm-service-example-data, push a draft then ready PR. ROOT merges/adopts.

## Validation and Acceptance

The actual restored checkout data yields FraudCheck and Payments plus two provided interfaces and one required interface, with canonical implementation/contract links and only declared relationships. Provider snapshots remain source-backed and have no build jobs/deployment claims. An unrelated disposable Git repository yields no example services. Example Bazel filegroups build without any extractor, protoc or service launch. Review checks that no app/core/protocol files or special routing were restored.

## Idempotence and Recovery

All work stays on the new feature branch. Historical merged topic and original PR130 recap remain unchanged. Tests create and own disposable repositories; no user project mutation. Source/example additions are recoverable through Git; shared app/master remain ROOT-owned.

## Outcomes & Retrospective

Implementation pending. The intended outcome is useful demo data through existing generic behavior, not a return to fixed application assumptions.

## Artifacts and Notes

Current seam, verification and final recap are in /tmp/swarm-ide-service-example.aHZkPP. Local-only, native review and narrow checks are the agreed gate; no broad suite or hosted CI.

## Interfaces and Dependencies

Reuse discoverServices(root), adaptDeclaredServices and RealWorkspaceProvider without modification. Native manifests use schemaVersion 1 with service, providedInterfaces/requiredInterfaces and optional explicit source/target associations. Bazel filegroups are data edges, not evidence of deployed services.

Initial plan records the revised user intent before example implementation.
