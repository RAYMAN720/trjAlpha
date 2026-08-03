FROM node:22-alpine

RUN apk add --no-cache docker-cli

WORKDIR /app
COPY lean-gateway/package*.json ./lean-gateway/
RUN cd lean-gateway && npm ci --omit=dev

COPY lean-gateway ./lean-gateway
COPY lean-engine/config ./lean-engine/config

WORKDIR /app/lean-gateway
EXPOSE 8090
CMD ["npm", "run", "start"]
