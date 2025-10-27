const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')
const { LeveldbPersistence } = require('y-leveldb')

const server = http.createServer()
const wss = new WebSocket.Server({ server })
const persistence = new LeveldbPersistence('./yjs-data')

wss.on('connection', (conn, req) => {
  const url = new URL(req.url || '', 'http://localhost')
  const docName = url.pathname.slice(1) || 'default'
  setupWSConnection(conn, req, { docName, persistence })
})

server.listen(1234, () => console.log('y-websocket on :1234 with LevelDB'))


