# Remote Work Collaboration Suite - Frontend

Frontend applications for the Remote Work Collaboration Suite, featuring real-time collaboration tools and user interfaces.

## Applications

- **Main Web App** (`apps/web`) - Main collaboration platform with real-time editing, chat, tasks, and video
- **Collab Suite** (`apps/collab-suite`) - Alternative UI with Chakra UI components

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **UI Components**: Tailwind CSS, Chakra UI
- **Real-time**: Socket.io Client, Yjs
- **Collaboration**: TipTap, Quill, Excalidraw
- **State Management**: Zustand, React Query
- **Video**: WebRTC, Simple Peer
- **Testing**: Playwright

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
pnpm install
```

### Environment Setup

Create a `.env` file in each app:

**apps/web/.env:**
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**apps/collab-suite/.env:**
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### Development

**Start all apps:**
```bash
pnpm dev
```

**Start individual app:**
```bash
cd apps/web && pnpm dev
# or
cd apps/collab-suite && pnpm dev
```

### Build

**Build all apps:**
```bash
pnpm build
```

**Preview production builds:**
```bash
pnpm preview
```

## Features

### Real-time Collaboration
- Document editing with TipTap or Quill
- Collaborative whiteboard with Excalidraw
- Real-time chat with Socket.io
- User presence indicators

### Task Management
- Drag-and-drop Kanban board
- Task creation and assignment
- Progress tracking

### Video Conferencing
- WebRTC mesh networking
- Screen sharing
- Audio/video controls

### User Interface
- Responsive design
- Dark mode support
- Real-time notifications
- Authentication with Supabase

## Project Structure

```
frontend-repo/
├── apps/
│   ├── web/              # Main web application
│   └── collab-suite/     # Alternative UI with Chakra
└── package.json
```

## License

MIT

