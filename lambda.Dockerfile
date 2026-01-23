FROM public.ecr.aws/docker/library/node:22-slim

RUN apt update

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV AWS_LWA_PORT=8866
ENV AWS_LWA_INVOKE_MODE=response_stream

COPY ./dist /app
WORKDIR /app

RUN npm install --omit=dev

EXPOSE 8866

CMD ["node", "server/index.js"]
