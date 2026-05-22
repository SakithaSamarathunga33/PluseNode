FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS web-builder
ARG NEXT_PUBLIC_NODE_API=http://localhost:4001
ARG NEXT_PUBLIC_PYTHON_API=http://localhost:8001
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4001
ENV NEXT_PUBLIC_NODE_API=$NEXT_PUBLIC_NODE_API
ENV NEXT_PUBLIC_PYTHON_API=$NEXT_PUBLIC_PYTHON_API
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=web-builder /app/.next/standalone ./
COPY --from=web-builder /app/.next/static ./.next/static
COPY --from=web-builder /app/public ./public
EXPOSE 3000
CMD ["node", "--max-old-space-size=96", "server.js"]

FROM node:20-alpine AS node-api
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_PORT=4001
ARG  PULSENODE_VERSION=dev
ENV  PULSENODE_VERSION=${PULSENODE_VERSION}
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
EXPOSE 4001
CMD ["node", "--max-old-space-size=128", "server/index.js"]
