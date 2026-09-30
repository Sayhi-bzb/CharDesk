FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --ignore-scripts --include-workspace-root=false \
  --workspace @chardesk/collaboration-protocol \
  --workspace @chardesk/sync-server
RUN npm run build --workspace @chardesk/collaboration-protocol && npm run build --workspace @chardesk/sync-server
RUN npm ci --omit=dev --ignore-scripts --include-workspace-root=false \
  --workspace @chardesk/collaboration-protocol \
  --workspace @chardesk/sync-server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/sync-server/dist ./dist
COPY --from=build /app/apps/sync-server/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/collaboration-protocol/package.json ./packages/collaboration-protocol/package.json
COPY --from=build /app/packages/collaboration-protocol/dist ./packages/collaboration-protocol/dist
EXPOSE 1234
CMD ["node", "dist/main.js"]
