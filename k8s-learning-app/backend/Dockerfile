# syntax=docker/dockerfile:1

# ---------- build stage ----------
# The build stage carries the TypeScript compiler and every devDependency.
# None of it ships. That is the whole point of a multi-stage build: the image you
# run should contain the artifact, not the toolchain that produced it.
FROM node:20-alpine AS build
WORKDIR /app

# package files first, source second. Docker caches layers, so dependencies are
# only reinstalled when package.json actually changes — not on every code edit.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Reinstall with production deps only, so node_modules can be copied forward clean.
RUN npm ci --omit=dev

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Run as a non-root user. The node image ships one (uid 1000) already.
# Kubernetes can enforce this with runAsNonRoot, but an image that only works as
# root will simply fail to start under that policy — better to fix it here.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node src/db/migrations ./dist/db/migrations
COPY --chown=node:node content ./content
COPY --chown=node:node package.json ./

USER node
EXPOSE 4000

# dumb-init style signal handling matters: PID 1 in a container does not get the
# default SIGTERM handler. Node handles its own signals correctly when it is the
# entrypoint process, so exec form (not shell form) is required here — shell form
# would put /bin/sh at PID 1 and swallow SIGTERM, breaking graceful shutdown.
CMD ["node", "dist/index.js"]
