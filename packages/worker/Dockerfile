FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Create a non-root user for running the worker
# (required: claude --dangerously-skip-permissions refuses to run as root)
RUN useradd -m -s /bin/bash worker

# Install AI coding CLIs
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Copy repo and build
WORKDIR /app
COPY . .
RUN npm install -g pnpm && CI=true pnpm install --frozen-lockfile && CI=true pnpm -r build

# Set correct ownership so the worker user can read app files
RUN chown -R worker:worker /app

COPY packages/worker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch to non-root user before running
USER worker

ENV DATABRICKS_WAREHOUSE_ID=dd7165b90dbdd269

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
