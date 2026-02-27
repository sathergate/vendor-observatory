FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install AI coding CLIs at image build time
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Copy monorepo and build
WORKDIR /app
COPY . .
RUN npm install -g pnpm && CI=true pnpm install --frozen-lockfile && CI=true pnpm -r build

COPY packages/worker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
