FROM node:24-alpine AS build
WORKDIR /app/apps/mobile
COPY apps/mobile/package.json apps/mobile/package-lock.json ./
RUN npm ci
COPY apps/mobile/index.html apps/mobile/vite.config.js apps/mobile/astryx-themes.js ./
COPY apps/mobile/src/ ./src/
COPY apps/mobile/public/ ./public/
COPY packages/contracts/ /app/packages/contracts/
RUN npm run build

FROM nginx:stable-alpine
COPY infra/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/apps/mobile/dist/ /usr/share/nginx/html/

USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
