FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

FROM deps AS build

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run prisma:generate:postgres
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 8000
CMD ["npm", "run", "start"]
