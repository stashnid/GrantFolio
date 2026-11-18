FROM node:24.18.1-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
RUN npm run build && npm prune --omit=dev
FROM node:24.18.1-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-calc-nogui fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/migrations ./backend/migrations
COPY --from=build --chown=node:node /app/backend/assets ./backend/assets
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
USER node
EXPOSE 8080
CMD ["npm", "start"]
