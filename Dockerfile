FROM node:22.15.0-bookworm-slim@sha256:557e52a0fcb928ee113df7e1fb5d4f60c1341dbda53f55e3d815ca10807efdce AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder

COPY . .
RUN npm run build

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 portal \
  && useradd --system --uid 1001 --gid portal portal

COPY --from=builder --chown=portal:portal /app/public ./public
COPY --from=builder --chown=portal:portal /app/.next/standalone ./
COPY --from=builder --chown=portal:portal /app/.next/static ./.next/static
COPY --from=builder --chown=portal:portal /app/package.json ./package.json
COPY --from=builder --chown=portal:portal /app/deploy/verify-mongodb-transactions.mjs ./deploy/verify-mongodb-transactions.mjs
COPY --from=builder --chown=portal:portal /app/scripts ./scripts

USER portal
EXPOSE 3000

CMD ["node", "server.js"]
