FROM node:22.20 AS builder

WORKDIR /build

COPY web/package.json .
COPY web/yarn.lock .

RUN yarn config set registry https://registry.npmjs.org && \
    yarn install --frozen-lockfile --network-timeout 600000

COPY ./web .
COPY ./VERSION .
RUN DISABLE_ESLINT_PLUGIN='true' VITE_APP_VERSION=$(cat VERSION) npm run build

FROM node:22.20 AS nextchat-builder

ARG NEXTCHAT_VERSION=v2.16.1
ENV NEXTCHAT_VERSION=$NEXTCHAT_VERSION

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY scripts ./scripts
RUN NEXTCHAT_KEEP_WORKTREE=true node scripts/build-nextchat.mjs --mode standalone
RUN mv /tmp/done-hub-nextchat-${NEXTCHAT_VERSION:-v2.16.1} /opt/nextchat

FROM node:22.20 AS mjchat-builder

ARG MJCHAT_VERSION=v2.26.5
ENV MJCHAT_VERSION=$MJCHAT_VERSION

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY scripts ./scripts
RUN MJCHAT_KEEP_WORKTREE=true node scripts/build-midjourney-proxy.mjs
RUN mv /tmp/done-hub-mjchat-${MJCHAT_VERSION:-v2.26.5} /opt/mjchat

FROM golang:1.25.0 AS builder2

ENV GO111MODULE=on \
    CGO_ENABLED=1 \
    GOOS=linux \
    GOPROXY=https://proxy.golang.org,direct

WORKDIR /build
ADD go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=builder /build/build ./web/build
RUN go build -ldflags "-s -w -X 'done-hub/common.Version=$(cat VERSION)' -extldflags '-static'" -o done-hub

FROM node:22.20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates tzdata wget && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates 2>/dev/null || true && \
    corepack enable

COPY --from=builder2 /build/done-hub /
COPY --from=nextchat-builder /opt/nextchat /opt/nextchat
COPY --from=mjchat-builder /opt/mjchat /opt/mjchat
COPY scripts/start-nextchat.mjs scripts/start-midjourney-proxy.mjs scripts/docker-entrypoint.sh /app/scripts/

EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
