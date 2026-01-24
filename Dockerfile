FROM public.ecr.aws/docker/library/node:22-slim

RUN apt update

# Copy the dist
COPY ./dist /app
WORKDIR /app

RUN npm install --omit=dev

HEALTHCHECK --interval=5s --timeout=3s \
  CMD curl -fs http://localhost:8866/ || exit 1

EXPOSE 8866

CMD ["node", "server/index.js"]
