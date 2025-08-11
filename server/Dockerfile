FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /app
COPY server ./
RUN npm ci && npm run build   # adjust if your server builds TS->JS

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app ./
EXPOSE 3000                    # adjust if your server listens elsewhere
CMD ["npm","run","start"]      # or ["node","dist/index.js"] etc.
