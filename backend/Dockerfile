# ─────────────────────────────────────────────────────────────
# Solar for Bid — backend
# 🔴 better-sqlite3는 네이티브 모듈이다. prebuild가 없는 플랫폼을 대비해
#    builder 단계에만 빌드 도구를 넣고, 런타임 이미지에는 넣지 않는다.
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 헬스체크용
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY fixtures ./fixtures

# SQLite 파일이 사는 곳. compose에서 볼륨으로 잡는다
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
