# Remote Work Collaboration Suite - Backend

Backend services for the Remote Work Collaboration Suite, including API server, WebSocket signaling server, and Yjs collaboration server.

## Services

- **API Server** (`apps/api`) - Express server with Socket.io for real-time communication
- **Signaling Server** (`apps/signaling`) - WebSocket signaling for WebRTC connections
- **Yjs Server** (`apps/yjs`) - Yjs WebSocket server for document collaboration
- **Shared Package** (`packages/shared`) - Shared types and schemas

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Real-time**: Socket.io, WebRTC
- **Database**: PostgreSQL with Prisma ORM
- **Collaboration**: Yjs (CRDT for real-time editing)
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database

### Installation

```bash
pnpm install
```

### Environment Setup

Create a `.env` file in `apps/api/`:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/remote-collab

# Supabase (for auth)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Redis (for Socket.io scaling)
REDIS_URL=redis://localhost:6379
```

### Database Setup

```bash
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate
```

### Running Services

**Development (all services):**
```bash
pnpm dev
```

**Individual services:**
```bash
cd apps/api && pnpm dev
cd apps/signaling && pnpm dev
cd apps/yjs && pnpm dev
```

### Production

**Using Docker:**
```bash
docker-compose up -d
```

## API Documentation

The API server provides REST endpoints and WebSocket connections for:

- User authentication
- Real-time messaging
- Task management
- Document collaboration
- Video conferencing signaling

Base URL: `http://localhost:3000`

## Project Structure

```
backend-repo/
├── apps/
│   ├── api/           # Main API server
│   ├── signaling/     # WebRTC signaling server
│   └── yjs/          # Yjs collaboration server
├── packages/
│   └── shared/       # Shared types and schemas
├── docker-compose.yml
└── package.json
```

## License

MIT

