const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

const app = express()
app.use(cors({ origin: 'http://localhost:5173' }))
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: 'http://localhost:5173' } })

io.on('connection', (socket) => {
  socket.on('join', (room) => {
    socket.join(room)
    // send existing peers to the new client
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])
      .filter(id => id !== socket.id)
    socket.emit('peers', clients)
    // notify others someone joined
    socket.to(room).emit('user-joined', socket.id)
    socket.data.room = room
  })

  socket.on('signal', ({ to, data, room }) => {
    if (to) io.to(to).emit('signal', { from: socket.id, data })
    else socket.to(room).emit('signal', { from: socket.id, data }) // fallback
  })

  socket.on('disconnecting', () => {
    const room = socket.data.room
    if (room) socket.to(room).emit('user-left', socket.id)
  })
})

const PORT = process.env.PORT || 8082
server.listen(PORT, () => console.log(`Signaling on :${PORT}`))
