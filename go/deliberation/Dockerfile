# Build mae-deliberation Go binary for Cloud Run.
# Modeled on <venue-monitor-service>/Dockerfile.
FROM golang:1.25 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/mae-deliberation ./cmd

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=builder /out/mae-deliberation /mae-deliberation
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/mae-deliberation"]
