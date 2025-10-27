import { z } from 'zod'

export const ChatSend = z.object({
  workspaceId: z.string().min(1),
  content: z.string().min(1).max(4000),
})

export const TasksMove = z.object({
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
  toColumnId: z.string().min(1),
  toIndex: z.number().int().nonnegative(),
})

export const WhiteboardUpdate = z.object({
  workspaceId: z.string().min(1),
  payload: z.object({
    elements: z.any(),
    appState: z.any(),
    files: z.any(),
  })
})

export const GetMessagesQuery = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
})

export const DocStatePost = z.object({
  updateB64: z.string().min(1), // Base64 of Yjs update (Uint8Array)
})

export const DocStateGet = z.object({
  docId: z.string().min(1),
})

export const DocStateVector = z.object({
  docId: z.string().min(1),
})


