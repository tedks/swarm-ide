# syntax=docker/dockerfile:1
FROM nixos/nix:2.31.2 AS build
ENV NIX_CONFIG="experimental-features = nix-command flakes"
WORKDIR /source
COPY . .
# Nix builds run inside Docker's build sandbox; application sandboxing is separate.
RUN nix develop --option sandbox false --option filter-syscalls false --command pnpm install --frozen-lockfile
RUN nix develop --option sandbox false --option filter-syscalls false --command bash -c 'bazel --batch build --jobs=3 --action_env=HOME=/root --action_env=CI=true --action_env=pnpm_config_pm_on_fail=ignore //:desktop-bundle && mkdir -p /opt/swarm && tar -xzf bazel-bin/swarm-ide-foundation.tar.gz -C /opt/swarm'
RUN nix build --option sandbox false --option filter-syscalls false --impure --file tools/container/runtime.nix --out-link /opt/runtime && \
    mkdir /runtime-store && cp -a $(nix-store --query --requisites /opt/runtime) /runtime-store/ && \
    cp -aL /opt/runtime/share/webapps/novnc /opt/novnc

FROM debian:bookworm-slim AS demo
COPY --from=build /runtime-store /nix/store
COPY --from=build /opt/runtime /opt/runtime
COPY --from=build /opt/novnc /opt/novnc
COPY --from=build /opt/swarm /opt/swarm
COPY tools/container/entrypoint.sh /opt/container/entrypoint.sh
COPY tools/container/demo /opt/demo
RUN groupadd --gid 1000 swarm && useradd --uid 1000 --gid 1000 --create-home swarm && \
    mkdir /data && chown 1000:1000 /data && chmod 755 /opt/container/entrypoint.sh
ENV PATH="/opt/runtime/bin:/usr/bin:/bin" \
    HOME="/home/swarm" DISPLAY=":99" XDG_RUNTIME_DIR="/tmp/swarm-runtime" \
    XDG_CONFIG_HOME="/data/config" XDG_CACHE_HOME="/data/cache" \
    FONTCONFIG_FILE="/opt/runtime/etc/fonts/fonts.conf" \
    SSL_CERT_FILE="/opt/runtime/etc/ssl/certs/ca-bundle.crt"
USER 1000:1000
WORKDIR /data
EXPOSE 6080
ENTRYPOINT ["/opt/runtime/bin/bash", "/opt/container/entrypoint.sh"]
