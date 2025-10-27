import { z } from 'zod'

export const GetMessagesQuery = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
})

export const ProfilesQuery = z.object({
  ids: z.string().transform(s => s.split(',').filter(Boolean)).refine(arr => arr.length > 0 && arr.length <= 100, '1-100 ids required'),
})


