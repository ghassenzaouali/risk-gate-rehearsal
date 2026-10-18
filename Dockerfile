# Official Node.js 22 image on Alpine Linux (small), in production mode
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Dependencies first: Docker reuses this step while package files do not change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

# Start the server on port 3000 as the unprivileged "node" user, not root
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
