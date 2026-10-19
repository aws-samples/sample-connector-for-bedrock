# Use Node.js Trixie as base image
FROM node:trixie-slim

# Add uv to PATH
ENV PATH="/root/.local/bin:${PATH}"

RUN apt update && \
    apt install -y curl git git-lfs wget gh vim && \
    npm install -g @anthropic-ai/claude-code && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    echo "export VIRTUAL_ENV_DISABLE_PROMPT=1" >> /root/.bashrc && \
    echo "source /app/.venv/bin/activate" >> /root/.bashrc && \
    mkdir /workspace

COPY . /app/

# Set working directory
WORKDIR /app

# Expose port 8080
EXPOSE 8080

# Run the server on port 8080
CMD ["/app/serve"]
