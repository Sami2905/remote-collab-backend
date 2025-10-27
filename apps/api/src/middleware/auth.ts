import type { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return res.status(401).json({ error: 'Unauthorized' })
    res.locals.userId = data.user.id
    return next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

export function requireWorkspaceMember(paramKey = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = res.locals.userId as string
    const workspaceId = (req.params as any)[paramKey]
    const prisma = req.app.get('prisma')
    const m = await prisma.membership.findFirst({ where: { userId, workspaceId }, select: { id: true } })
    if (!m) return res.status(403).json({ error: 'Forbidden' })
    return next()
  }
}
