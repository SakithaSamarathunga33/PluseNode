FROM golang:1.25-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pulsenode ./cmd/pulsenode

FROM alpine:3.20
RUN apk add --no-cache ca-certificates git docker-cli && mkdir -p /data /var/lib/pulsenode
WORKDIR /app
ENV GO_PORT=4002
ENV PULSENODE_DATA_DIR=/var/lib/pulsenode
ENV DATABASE_PATH=/data/pulsenode.db
COPY --from=builder /out/pulsenode /usr/local/bin/pulsenode
EXPOSE 4002
CMD ["pulsenode"]
