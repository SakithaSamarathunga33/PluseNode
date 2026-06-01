FROM golang:1.25-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pulsenode ./cmd/pulsenode

FROM alpine:3.20
ARG NIXPACKS_VERSION=1.41.0
RUN apk add --no-cache ca-certificates git docker-cli docker-cli-buildx docker-cli-compose curl \
    && mkdir -p /data /var/lib/pulsenode \
    && curl -sSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
       | tar -xz -C /usr/local/bin nixpacks \
    && chmod +x /usr/local/bin/nixpacks
WORKDIR /app
ENV GO_PORT=4002
ENV PULSENODE_DATA_DIR=/var/lib/pulsenode
ENV DATABASE_PATH=/data/pulsenode.db
COPY --from=builder /out/pulsenode /usr/local/bin/pulsenode
EXPOSE 4002
CMD ["pulsenode"]
