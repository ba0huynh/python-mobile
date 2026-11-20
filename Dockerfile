# GoXe web app image, built by Dokploy (build type "Dockerfile", build path "mobile").
# Stage 1 exports the Expo app for web; stage 2 serves the static files with nginx.
# TLS is handled by Dokploy's proxy; this container only speaks plain HTTP on port 80.
FROM node:24-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Expo inlines EXPO_PUBLIC_* values at build time: set it as a Build Arg in Dokploy,
# e.g. EXPO_PUBLIC_API_URL=https://api.example.com (the backend, no trailing slash).
ARG EXPO_PUBLIC_API_URL
ENV EXPO_NO_TELEMETRY=1 CI=1
RUN test -n "$EXPO_PUBLIC_API_URL" || (echo "Build Arg EXPO_PUBLIC_API_URL is required" && exit 1)
RUN npx expo export --platform web --max-workers 1

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
