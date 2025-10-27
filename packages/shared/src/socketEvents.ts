export const SocketEvents = {
  JoinWorkspace: 'join_workspace',
  ChatSend: 'chat:send',
  ChatNew: 'chat:new',
  TasksMove: 'tasks:move',
  WhiteboardUpdate: 'whiteboard:update',
  WhiteboardState: 'whiteboard:state',
  WhiteboardRequestState: 'whiteboard:request_state',
} as const
export type SocketEvent = typeof SocketEvents[keyof typeof SocketEvents]


