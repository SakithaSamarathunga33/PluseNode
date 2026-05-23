FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS web-builder
ARG NEXT_PUBLIC_GO_API=http://localhost:4002
ENV NEXT_PUBLIC_GO_API=$NEXT_PUBLIC_GO_API
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
