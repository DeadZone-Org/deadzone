# Deadzone gateway — bundles the agent + gateway so it can run on any host (Render/Fly/Railway/VPS).
# Build context must be the repo root: `docker build -f gateway/Dockerfile .`
FROM node:22-slim
WORKDIR /app

# install deps for both packages (the gateway imports ../agent/src)
COPY agent/package*.json ./agent/
COPY gateway/package*.json ./gateway/
RUN cd agent && npm ci --omit=dev || npm i --omit=dev
RUN cd gateway && npm ci || npm i

# source
COPY agent/ ./agent/
COPY gateway/ ./gateway/

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# secrets come from the host's environment (PRIVATE_KEY, ZAI_API_KEY, ANTHROPIC_API_KEY, COURIER_AGENT_ID)
WORKDIR /app/gateway
CMD ["node", "--import", "tsx", "src/server.ts"]
