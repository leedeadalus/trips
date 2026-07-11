# Multi-stage build for trips-app (CLI + MCP stdio server)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Test stage: keeps devDependencies (vitest) and test sources so
# `docker compose run --rm test` can run the suite in-container.
FROM build AS test
COPY tests ./tests
CMD ["npm", "test"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY .node-pg-migraterc.json ./
COPY scripts ./scripts

# Default command runs the CLI; the mcp service in docker-compose overrides
# the command to run the MCP stdio server instead. No ENTRYPOINT is set so
# `docker compose run --rm app node dist/cli.js <args>` works directly.
CMD ["node", "dist/cli.js", "--help"]
