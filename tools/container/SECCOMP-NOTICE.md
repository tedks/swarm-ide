# Chromium namespace allowance

`seccomp.json` is derived from Moby profiles at
https://github.com/moby/profiles/blob/61eaf32614c7c71b60bd8927d3e6a4ffc8ff1f31/seccomp/default.json
under the Apache License 2.0, reproduced in `LICENSE.seccomp`.

Modification: one leading rule permits `clone`, `setns`, and `unshare` for
Chromium's user-namespace sandbox, plus `chroot` for its filesystem restriction.
The latter is otherwise denied when the upstream capability-conditional rule is
combined with dropping all outer capabilities. This adds no outer capability or
mount permission. All other upstream syscall rules are retained.
Compose drops all capabilities and enables no-new-privileges. This is deliberately
not described as Docker's unchanged default profile. Update the upstream policy
when supporting newer container engines; do not replace it with allow-all.
