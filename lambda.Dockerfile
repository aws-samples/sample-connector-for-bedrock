FROM --platform=$BUILDPLATFORM public.ecr.aws/docker/library/node:22 AS brclient
WORKDIR /build
COPY scripts/fetch-brclient.sh scripts/brclient.source scripts/
RUN bash scripts/fetch-brclient.sh /brclient

FROM public.ecr.aws/docker/library/node:22-slim

RUN apt update

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV AWS_LWA_PORT=8866
ENV AWS_LWA_INVOKE_MODE=response_stream

COPY ./dist /app
# Built once on the build machine, so every platform of a multi-platform build gets the same BRClient files.
COPY --from=brclient /brclient /app/brclient
WORKDIR /app

RUN npm install --omit=dev

EXPOSE 8866

# Lambda runs the function as its own least-privileged user. Outside Lambda, this keeps the image off root as well.
USER node

CMD ["node", "server/index.js"]
