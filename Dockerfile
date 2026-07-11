FROM node:20-alpine
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace config so pnpm knows the monorepo layout
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY .npmrc ./
COPY backend/package.json ./backend/

# Install backend dependencies only
RUN pnpm install --filter backend --frozen-lockfile

# Copy backend source and build
COPY backend ./backend
RUN pnpm --filter backend build

# Create uploads dir (logos — move to Cloudinary later)
RUN mkdir -p backend/uploads/logos

EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
