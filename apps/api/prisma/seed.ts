import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.upsert({
    where: { id: 'demo-user-1' },
    update: {},
    create: { id: 'demo-user-1', email: 'alex@example.com', name: 'Alex Rivera' }
  })

  const ws = await prisma.workspace.upsert({
    where: { id: 'ws-demo-1' },
    update: {},
    create: { id: 'ws-demo-1', name: 'Demo Workspace' }
  })

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } },
    update: {},
    create: { userId: user.id, workspaceId: ws.id, role: 'owner' }
  })

  const board = await prisma.board.upsert({
    where: { id: 'board-1' },
    update: {},
    create: { id: 'board-1', name: 'Main Board', workspaceId: ws.id }
  })

  await prisma.column.upsert({ where: { id: 'todo' }, update: {}, create: { id: 'todo', title: 'To Do', order: 0, boardId: board.id } })
  await prisma.column.upsert({ where: { id: 'inprogress' }, update: {}, create: { id: 'inprogress', title: 'In Progress', order: 1, boardId: board.id } })
  await prisma.column.upsert({ where: { id: 'done' }, update: {}, create: { id: 'done', title: 'Done', order: 2, boardId: board.id } })

  await prisma.task.upsert({ where: { id: 't1' }, update: {}, create: { id: 't1', title: 'Design UI Mockups', order: 0, columnId: 'todo' } })
  await prisma.task.upsert({ where: { id: 't2' }, update: {}, create: { id: 't2', title: 'Review Code', order: 1, columnId: 'todo' } })
  await prisma.task.upsert({ where: { id: 't3' }, update: {}, create: { id: 't3', title: 'Deploy Update', order: 0, columnId: 'inprogress' } })
  await prisma.task.upsert({ where: { id: 't4' }, update: {}, create: { id: 't4', title: 'Write Report', order: 0, columnId: 'done' } })

  await prisma.document.upsert({
    where: { id: 'doc-1' },
    update: {},
    create: { id: 'doc-1', title: 'Project Proposal', workspaceId: ws.id }
  })

  await prisma.message.createMany({
    data: [
      { id: 'm1', content: 'Welcome to the workspace!', userId: user.id, workspaceId: ws.id },
      { id: 'm2', content: 'Kickoff at 10 AM.', userId: user.id, workspaceId: ws.id }
    ],
    skipDuplicates: true
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
