FROM --platform=$BUILDPLATFORM public.ecr.aws/docker/library/node:22 AS brclient
WORKDIR /build
COPY scripts/fetch-brclient.sh scripts/brclient.source scripts/
RUN bash scripts/fetch-brclient.sh /brclient

FROM public.ecr.aws/docker/library/node:22-slim

RUN apt update

# Copy the dist
COPY ./dist /app
# Built once on the build machine, so every platform of a multi-platform build gets the same BRClient files.
COPY --from=brclient /brclient /app/brclient
WORKDIR /app

RUN npm install --omit=dev

# Run as the image's unprivileged node user. The app only reads /app; temporary files go to the system temp directory.
USER node

# node:22-slim has no curl, so the check uses Node's own fetch.
HEALTHCHECK --interval=5s --timeout=3s \
  CMD node -e "fetch('http://localhost:8866/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

EXPOSE 8866

CMD ["node", "server/index.js"]
