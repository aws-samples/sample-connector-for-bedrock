# Backend image for the Claude Code web workspace (AgentCore Runtime, linux/arm64).
# Pinned base image, tools and non-root user; see UPSTREAM.md for the rationale.
FROM public.ecr.aws/docker/library/node:24.22.0-trixie-slim

# uv from the official image (pinned), not curl | sh
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /uvx /usr/local/bin/

# Base tools users reasonably need in the workspace shell (no gh)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git git-lfs curl ca-certificates vim && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    npm install -g @anthropic-ai/claude-code@2.1.303 && \
    npm cache clean --force && \
    mkdir -p /app /workspace /opt/uv-python && \
    chown node:node /app /workspace /opt/uv-python

# uv: managed Python lives outside HOME so it is readable at runtime;
# runtime `uv run` must not download, re-lock or install dev dependencies.
ENV HOME=/home/node \
    UV_PYTHON=3.12 \
    UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    UV_FROZEN=1 \
    UV_NO_DEV=1

WORKDIR /app
COPY --chown=node:node . /app/

# Build the venv at image build time as the runtime user
USER node
RUN uv sync --frozen --no-dev && \
    echo "export VIRTUAL_ENV_DISABLE_PROMPT=1" >> /home/node/.bashrc && \
    echo "source /app/.venv/bin/activate" >> /home/node/.bashrc

# Runtime must not fetch a Python interpreter
ENV UV_PYTHON_DOWNLOADS=never

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:8080/ping || exit 1

CMD ["/app/serve"]
