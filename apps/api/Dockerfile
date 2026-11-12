FROM node:20-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@11
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @agentvault/api exec prisma generate

FROM node:20-alpine
WORKDIR /app
RUN npm i -g pnpm@11
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./api-dist
COPY apps/api/package.json ./package.json
EXPOSE 3000
CMD ["node", "api-dist/main.js"]
