FROM public.ecr.aws/docker/library/node:22-slim

RUN apt update

# Copy the dist
COPY ./dist /app
WORKDIR /app

RUN npm install --omit=dev

# node:22-slim has no curl, so the check uses Node's own fetch.
HEALTHCHECK --interval=5s --timeout=3s \
  CMD node -e "fetch('http://localhost:8866/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

EXPOSE 8866

# Run as the image's unprivileged node user. The app only reads /app; temporary files go to the system temp directory.
USER node

CMD ["node", "server/index.js"]
