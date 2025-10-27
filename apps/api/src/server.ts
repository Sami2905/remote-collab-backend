import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import pino from 'pino'
import pinoHttp from 'pino-http'
import http from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient as createRedisClient } from 'redis'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireWorkspaceMember } from './middleware/auth'
import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { GetMessagesQuery, ProfilesQuery } from './schemas'
import { DocStatePost } from '@collab/shared'
import * as Y from 'yjs'

const app = express()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
app.use(pinoHttp({ logger }))
// Helmet with CSP only in production; relaxed in dev
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:8081'
const YJS_WS = process.env.YJS_WS ?? 'ws://localhost:1234'
const SIGNALING_WS = process.env.SIGNALING_WS ?? 'http://localhost:8082'
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"], // serve bundled assets from same origin or add CDN if used
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "https:", "data:"],
      "connect-src": [
        "'self'",
        API_ORIGIN,
        SIGNALING_WS,
        SIGNALING_WS.replace('http', 'ws'),
        YJS_WS,
        YJS_WS.replace('ws', 'http'),
        ...ALLOWED,
        'ws://localhost:*',
        'wss://*',
        'stun:',
        'turn:',
        'turns:'
      ],
      "media-src": ["'self'", "blob:", "data:"],
      "worker-src": ["'self'", "blob:"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
    }
  } : undefined
}))
app.use(compression())
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }))
app.use(express.json())
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: 'http://localhost:5173' } })
const prisma = new PrismaClient()
app.set('prisma', prisma)

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Optional Redis adapter for horizontal scaling
(async () => {
  if (process.env.REDIS_URL) {
    const pub = createRedisClient({ url: process.env.REDIS_URL })
    const sub = pub.duplicate()
    await pub.connect(); await sub.connect()
    io.adapter(createAdapter(pub, sub))
  }
})()

// Socket auth middleware
io.use(async (socket, next) => {
  try {
    const hdr = socket.handshake.auth?.token || socket.handshake.headers?.authorization
    const token = typeof hdr === 'string' && hdr.startsWith('Bearer ') ? hdr.slice(7) : socket.handshake.auth?.token
    if (!token) return next(new Error('Unauthorized'))
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return next(new Error('Unauthorized'))
    socket.data.userId = data.user.id
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
})

async function assertMember(userId: string, workspaceId: string) {
  const m = await prisma.membership.findFirst({ where: { userId, workspaceId }, select: { id: true } })
  return !!m
}

const whiteboardState = new Map<string, { data: { elements: any[]; appState: any; files: any }; ts: number }>()
const WB_TTL_MS = 1000 * 60 * 60

// Helpers: merge update bytes in memory (fast, no Y.Doc needed)
function mergeUpdates(prev: Uint8Array | null, next: Uint8Array): Uint8Array {
  if (!prev) return next
  return Y.mergeUpdates([prev, next])
}

function gcWhiteboard() {
  const now = Date.now()
  for (const [k, v] of whiteboardState.entries()) {
    if (now - v.ts > WB_TTL_MS) whiteboardState.delete(k)
  }
}
setInterval(gcWhiteboard, 60_000)

app.get('/health', (_, res) => res.json({ ok: true }))
app.get('/version', (_, res) => res.json({ sha: process.env.GIT_SHA || 'dev' }))
// Persist a Yjs snapshot (raw update bytes) for a document
// POST /workspaces/:workspaceId/documents/:docId/snapshots
app.post('/workspaces/:workspaceId/documents/:docId/snapshots', requireAuth, requireWorkspaceMember('workspaceId'), async (req, res) => {
  try {
    const { workspaceId, docId } = req.params as { workspaceId: string; docId: string }
    const prisma = req.app.get('prisma') as PrismaClient

    // Validate document belongs to workspace
    const doc = await prisma.document.findUnique({ where: { id: docId }, select: { id: true, workspaceId: true } })
    if (!doc || doc.workspaceId !== workspaceId) return res.status(404).json({ error: 'Document not found' })

    // Expect application/octet-stream body; allow JSON { stateBase64 } as fallback
    let bytes: Buffer | null = null
    if (req.is('application/octet-stream')) {
      bytes = Buffer.from(req.body as any)
    } else if (req.is('application/json') && (req.body?.stateBase64 || req.body?.stateHex)) {
      if (req.body.stateBase64) bytes = Buffer.from(req.body.stateBase64, 'base64')
      else if (req.body.stateHex) bytes = Buffer.from(req.body.stateHex, 'hex')
    }
    if (!bytes) return res.status(400).json({ error: 'Missing snapshot bytes' })
    // Enforce max size (2MB)
    if (bytes.byteLength > 2_000_000) return res.status(413).json({ error: 'Snapshot too large' })

    await prisma.$transaction([
      prisma.documentSnapshot.create({ data: { documentId: docId, state: bytes } }),
      // Keep only latest 10 snapshots per document
      prisma.$executeRawUnsafe(
        `DELETE FROM "DocumentSnapshot" WHERE "documentId" = $1 AND "id" NOT IN (
           SELECT "id" FROM "DocumentSnapshot" WHERE "documentId" = $1 ORDER BY "createdAt" DESC LIMIT 10
         )`,
        docId,
      ),
    ])
    res.status(201).json({ ok: true })
  } catch (e) {
    req.log?.error?.(e, 'snapshot:create failed')
    res.status(500).json({ error: 'Failed to save snapshot' })
  }
})

// GET latest snapshot metadata (and optionally bytes)
// GET /workspaces/:workspaceId/documents/:docId/snapshots/latest?include=bytes
app.get('/workspaces/:workspaceId/documents/:docId/snapshots/latest', requireAuth, requireWorkspaceMember('workspaceId'), async (req, res) => {
  try {
    const { workspaceId, docId } = req.params as { workspaceId: string; docId: string }
    const includeBytes = (req.query.include === 'bytes')
    const prisma = req.app.get('prisma') as PrismaClient

    const doc = await prisma.document.findUnique({ where: { id: docId }, select: { id: true, workspaceId: true } })
    if (!doc || doc.workspaceId !== workspaceId) return res.status(404).json({ error: 'Document not found' })

    const snap = await prisma.documentSnapshot.findFirst({
      where: { documentId: docId },
      orderBy: { createdAt: 'desc' },
      select: includeBytes ? { id: true, createdAt: true, state: true } : { id: true, createdAt: true }
    })
    if (!snap) return res.status(204).end()

    if (includeBytes && 'state' in snap) {
      res.setHeader('Content-Type', 'application/octet-stream')
      return res.send(Buffer.from((snap as any).state))
    }
    res.json(snap)
  } catch (e) {
    req.log?.error?.(e, 'snapshot:latest failed')
    res.status(500).json({ error: 'Failed to fetch snapshot' })
  }
})

// GET latest state (base64)
app.get('/documents/:id/state', requireAuth, requireWorkspaceMember('id'), async (req, res) => {
  try {
    const { id } = req.params as { id: string }
    const ds = await prisma.documentState.findUnique({ where: { documentId: id } })
    if (!ds) return res.json({ updateB64: null, updatedAt: null, size: 0 })
    res.json({
      updateB64: Buffer.from(ds.update).toString('base64'),
      updatedAt: ds.updatedAt.toISOString(),
      size: ds.size,
    })
  } catch (e) {
    req.log?.error?.(e, 'doc:state:get failed')
    res.status(500).json({ error: 'Failed to fetch document state' })
  }
})

// GET server state vector (base64) for minimal diff
app.get('/documents/:id/state/vector', requireAuth, requireWorkspaceMember('id'), async (req, res) => {
  try {
    const { id } = req.params as { id: string }
    const ds = await prisma.documentState.findUnique({ where: { documentId: id } })
    if (!ds) return res.json({ svB64: null })
    // Build vector from update (one-time per request)
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, new Uint8Array(ds.update))
    const sv = Y.encodeStateVector(ydoc)
    res.json({ svB64: Buffer.from(sv).toString('base64') })
  } catch (e) {
    req.log?.error?.(e, 'doc:state:vector failed')
    res.status(500).json({ error: 'Failed to fetch state vector' })
  }
})

// POST incremental update (base64); merges into latest
app.post('/documents/:id/state', requireAuth, requireWorkspaceMember('id'), async (req, res) => {
  try {
    const { id } = req.params as { id: string }
    const parsed = DocStatePost.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Bad payload' })
    const { updateB64 } = parsed.data

    const buf = Buffer.from(updateB64, 'base64')
    if (buf.length > 2_000_000) return res.status(413).json({ error: 'Update too large' }) // 2MB guard

    const existing = await prisma.documentState.findUnique({ where: { documentId: id } })
    const merged = mergeUpdates(existing ? new Uint8Array(existing.update) : null, new Uint8Array(buf))
    const size = merged.byteLength

    await prisma.documentState.upsert({
      where: { documentId: id },
      create: { documentId: id, update: Buffer.from(merged), size },
      update: { update: Buffer.from(merged), size },
    })

    return res.json({ ok: true, size })
  } catch (e) {
    req.log?.error?.(e, 'doc:state:post failed')
    res.status(500).json({ error: 'Failed to save document state' })
  }
})

// Chat history with cursor pagination + Zod validation
// GET /workspaces/:id/messages?limit=50&cursor=2025-01-01T00:00:00.000Z
app.get('/workspaces/:id/messages', requireAuth, requireWorkspaceMember('id'), async (req, res) => {
  const { id } = req.params as { id: string }
  const q = GetMessagesQuery.safeParse(req.query)
  if (!q.success) return res.status(400).json({ error: 'Bad query' })

  const limit = Math.min(parseInt(q.data.limit || '50', 10), 200)
  const cursor = q.data.cursor ? new Date(q.data.cursor) : undefined

  const where = cursor
    ? { workspaceId: id, createdAt: { lt: cursor } }
    : { workspaceId: id }

  const rows = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null
  res.json({ data: data.reverse(), nextCursor })
})

// GET profiles by user IDs
app.get('/profiles', requireAuth, async (req, res) => {
  const parsed = ProfilesQuery.safeParse({ ids: String(req.query.ids || '') })
  if (!parsed.success) return res.status(400).json({ error: 'Bad ids' })
  const ids = parsed.data.ids
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, imageUrl: true }
  })
  res.json(users)
})

// GET board with columns+tasks (ordered)
app.get('/workspaces/:id/board', requireAuth, requireWorkspaceMember('id'), async (req, res) => {
  const { id } = req.params as { id: string }
  const board = await prisma.board.findFirst({
    where: { workspaceId: id },
    include: {
      columns: {
        orderBy: { order: 'asc' },
        include: { tasks: { orderBy: { order: 'asc' } } }
      }
    }
  })
  res.json(board)
})

// Simple socket send rate limit per user (global across connections)
const chatBuckets = new Map<string, { ts: number[] }>()
function canSend(userId: string) {
  const now = Date.now()
  const bucket = chatBuckets.get(userId) || { ts: [] }
  bucket.ts = bucket.ts.filter(t => now - t < 60_000)
  if (bucket.ts.length >= 120) return false
  bucket.ts.push(now)
  chatBuckets.set(userId, bucket)
  return true
}

io.on('connection', (socket) => {
  logger.info({ sid: socket.id }, 'socket:connected')
  socket.on('join_workspace', async (workspaceId: string) => {
    const userId = socket.data.userId as string
    logger.info({ sid: socket.id, userId, workspaceId }, 'socket:join_workspace attempt')
    if (!(await assertMember(userId, workspaceId))) {
      socket.emit('error:auth', { message: 'Not a workspace member' })
      return
    }
    socket.join(`ws:${workspaceId}`)
    logger.info({ sid: socket.id, userId, workspaceId }, 'socket:join_workspace ok')
  })

  socket.on('chat:send', async ({ workspaceId, content }: { workspaceId: string; content: string }) => {
    const userId = socket.data.userId as string
    if (!(await assertMember(userId, workspaceId))) return
    if (!canSend(userId)) return socket.emit('error:rate', { kind: 'chat' })
    const msg = await prisma.message.create({ data: { content, userId, workspaceId } })
    io.to(`ws:${workspaceId}`).emit('chat:new', { ...msg })
  })

  // Persist task reordering
  socket.on('tasks:move', async ({ workspaceId, taskId, toColumnId, toIndex }: {
    workspaceId: string; taskId: string; toColumnId: string; toIndex: number
  }) => {
    const userId = socket.data.userId as string
    if (!(await assertMember(userId, workspaceId))) return
    try {
      await prisma.$transaction(async (tx) => {
        // Find current column
        const current = await tx.task.findUnique({ where: { id: taskId }, select: { columnId: true } })
        if (!current) throw new Error('Task not found')

        // Move task to target column (same-column moves are fine)
        await tx.task.update({ where: { id: taskId }, data: { columnId: toColumnId } })

        // Build destination order excluding the moved task
        const dest = await tx.task.findMany({
          where: { columnId: toColumnId },
          orderBy: { order: 'asc' },
          select: { id: true }
        })
        const filtered = dest.filter(t => t.id !== taskId)
        const ordered = [
          ...filtered.slice(0, toIndex),
          { id: taskId },
          ...filtered.slice(toIndex),
        ]
        // Reindex destination
        for (let i = 0; i < ordered.length; i++) {
          await tx.task.update({ where: { id: ordered[i].id }, data: { order: i } })
        }

        // If moved across columns, reindex the source column too
        if (current.columnId !== toColumnId) {
          const src = await tx.task.findMany({
            where: { columnId: current.columnId },
            orderBy: { order: 'asc' },
            select: { id: true }
          })
          for (let i = 0; i < src.length; i++) {
            await tx.task.update({ where: { id: src[i].id }, data: { order: i } })
          }
        }
      })

      io.to(`ws:${workspaceId}`).emit('tasks:moved', { taskId, toColumnId, toIndex })
    } catch (e) {
      console.error('tasks:move failed', e)
      socket.emit('error:tasks_move', { message: 'Move failed' })
    }
  })

  socket.on('whiteboard:request_state', async ({ workspaceId }) => {
    const userId = socket.data.userId as string
    if (!(await assertMember(userId, workspaceId))) return
    const state = whiteboardState.get(workspaceId)
    if (state) socket.emit('whiteboard:state', state.data)
  })

  socket.on('whiteboard:update', async ({ workspaceId, payload }) => {
    const userId = socket.data.userId as string
    if (!(await assertMember(userId, workspaceId))) return
    const size = JSON.stringify(payload).length
    if (size > 5_000_000) return
    whiteboardState.set(workspaceId, { data: payload, ts: Date.now() })
    socket.to(`ws:${workspaceId}`).emit('whiteboard:update', { payload, from: socket.id })
  })

  socket.on('disconnect', (reason) => {
    logger.info({ sid: socket.id, reason }, 'socket:disconnected')
  })
})

async function bootstrap() {
  if (process.env.REDIS_URL) {
    const pub = createRedisClient({ url: process.env.REDIS_URL })
    const sub = pub.duplicate()
    await pub.connect()
    await sub.connect()
    io.adapter(createAdapter(pub, sub))
    app.locals.redis = pub
  }

  // Rate limit (Redis-backed if available)
  const redisClient: any = app.locals.redis
  const limiter = (process.env.REDIS_URL && redisClient)
    ? rateLimit({
        windowMs: 60_000,
        max: 600,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({ sendCommand: (...args: string[]) => redisClient.sendCommand(args) }),
      })
    : rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false })
  app.use(limiter)

  const PORT = process.env.PORT || 8081
  server.listen(PORT, () => logger.info({ port: PORT }, 'API + WS started'))
}

bootstrap().catch((e) => {
  console.error('Failed to start server', e)
  process.exit(1)
})


