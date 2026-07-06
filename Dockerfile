FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000
CMD ["node", "backend/server.js"]