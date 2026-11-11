ARG BASE_IMAGE=ubuntu:latest
ARG NODE_IMAGE=node:latest
FROM ${NODE_IMAGE} AS node
FROM ${BASE_IMAGE} AS base
ENV DEBIAN_FRONTEND=noninteractive
# Python is required by the upstream Emscripten SDK, not by project build scripts.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates curl wget python3 autoconf automake libtool bison flex bzip2 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY toolchains.json /opt/build-config/toolchains.json
COPY shared/setup.mts shared/policy.mts shared/utils.mts /opt/build-config/
FROM base AS standard
ARG CHANNEL=main
RUN node /opt/build-config/setup.mts standard "$CHANNEL"
WORKDIR /work
# Even a direct Docker build defaults to the standard toolchain.
FROM standard AS default
