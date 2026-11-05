# Web de NORTE con un índice de demostración (datos ficticios). Se construye desde la raíz del repositorio:
#   docker build -f web/Dockerfile .
FROM node:26.13.0-alpine3.24 AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY ingest/package.json ingest/
COPY web/package.json web/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages ./packages
COPY ingest ./ingest
COPY web ./web
COPY data ./data
RUN npm run ingest:demo && npm run web:build

FROM nginxinc/nginx-unprivileged:1.31.7-alpine
COPY --chown=nginx:nginx web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build --chown=nginx:nginx /repo/web/dist/norte/browser /usr/share/nginx/html
COPY --from=build --chown=nginx:nginx /repo/site/data /usr/share/nginx/html/data
ENV NORTE_API_URL=""
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/data/v1/index.json > /dev/null || exit 1
