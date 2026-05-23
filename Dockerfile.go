FROM golang:1.23-alpine AS go-builder
WORKDIR /build

# Copy module definition first to cache layer when deps are unchanged
COPY go-api/go.mod ./go.mod

# Copy source then resolve deps (tidy generates go.sum)
COPY go-api/ ./
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o pulsenode-api .

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
RUN mkdir -p /app/data

COPY --from=go-builder /build/pulsenode-api ./pulsenode-api

EXPOSE 4001
CMD ["./pulsenode-api"]
