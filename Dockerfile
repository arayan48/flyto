# Frontend assets are platform independent: build them once on the native
# build platform instead of under QEMU for every target architecture
FROM --platform=$BUILDPLATFORM node:26-alpine AS frontend

WORKDIR /build/app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app ./
RUN npm run build


FROM node:26-alpine

ENV FLYTO_UPLOAD_DIR=/data \
    NODE_ENV=production

LABEL maintainer="arayan48 <arabirayanma@gmail.com>"

RUN apk add --no-cache tzdata su-exec

WORKDIR /app

# Backend deps include native prebuilds (argon2), install for the target platform
COPY package.json package-lock.json ./
RUN npm ci && \
    npm cache clean --force && \
    mkdir /data && \
    chown node /data

COPY *.js README.md ./
COPY lib lib
COPY lang lang
COPY plugins plugins
COPY public public
COPY --from=frontend /build/public/app public/app
COPY docker-entrypoint.sh /usr/local/bin/flyto-entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]

# Starts as root only to fix the ownership of /data, the app runs as node
ENTRYPOINT ["flyto-entrypoint.sh"]

HEALTHCHECK --start-period=20s CMD wget -q -O /dev/null "http://127.0.0.1:${FLYTO_PORT:-3000}${FLYTO_BASE_URL%/}/robots.txt" || exit 1

CMD ["node", "app.js"]
