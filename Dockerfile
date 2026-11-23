FROM docker.si24.ir/node:20.13.1 AS builder
WORKDIR /app
RUN npm config set registry https://nexus.si24.ir/repository/npm_group/
COPY package*.json ./
RUN npm ci --include=optional --no-audit
COPY . .
ARG ENVIRONMENT
# Deploy tag from CI; every log record reports it as `release`.
ARG APP_RELEASE=dev
ENV VITE_RELEASE=${APP_RELEASE}
RUN npm run build:${ENVIRONMENT}
# Hidden source maps are only produced on request and must never be served.
RUN find dist -name '*.map' -delete

# Stage 2
FROM docker.si24.ir/nginx-brotli:1.27.3 AS runtime
ARG ENVIRONMENT
# The API origin this edge forwards /chat, /ingestion and /health to. Override
# per environment at build time (--build-arg) or at run time (env var).
ARG API_UPSTREAM=https://dev-customer-assistant-api.si24.ir
ENV API_UPSTREAM=${API_UPSTREAM}
# The gateway secret. The preferred source is the deployment's Secret: an env
# var on the pod overrides this default. CI can also supply it at build time for
# environments whose deployment sets no env — the registry is private, but treat
# the image as holding the secret and rotate it after any leak.
ARG SAMAN_IDENTITY_SHARED_SECRET=
ENV SAMAN_IDENTITY_SHARED_SECRET=${SAMAN_IDENTITY_SHARED_SECRET}
#RUN apk add --no-cache tzdata
# The config is a template: the entrypoint renders it with the runtime values.
COPY ./nginx.conf.template /etc/nginx/nginx.conf.template
COPY ./docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=builder /app/dist .
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]