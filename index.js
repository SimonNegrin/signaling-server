import { WebSocketServer } from "ws"
import { config as loadEnv } from 'dotenv'

loadEnv()

const port = parseInt(process.env.PORT) || 6100
const rooms = new Map()
const socketRooms = new WeakMap()
const wss = new WebSocketServer({
  port,
})

const actions = {
  createroom,
  joinroom,
  broadcast,
  ping,
}

wss.on('listening', () => {
  console.log(`Server listening on port ${port}`)
})

wss.on("connection", (ws) => {
  socketRooms.set(ws, new Set())

  ws.on("message", (json) => {
    try {
      const message = JSON.parse(json)

      if (!Object.hasOwn(actions, message.type)) {
        console.warn("Unknown message type received:", message.type)
        return
      }

      actions[message.type](ws, message)
    } catch (error) {
      console.error(error)
    }
  })

  ws.on("close", () => {
    log('Connection closed')
    const leaveRooms = socketRooms.get(ws)
    leaveRooms.forEach(room => {
      room.connections.delete(ws)
      if (room.connections.size === 0) {
        rooms.delete(room.roomId)
        log(`Room ID ${room.roomId} is empty so was deleted`)
      }
      sendFrom(ws, room, { type: 'peerclose' })
    })
  })
})

function createroom(ws, message) {
  const { roomId } = message

  if (!roomId) {
    throw new Error("Error creating room: Room ID is required to create room")
  }

  if (rooms.has(roomId)) {
    throw new Error("Error creating room: Room ID already exists")
  }

  const room = {
    roomId,
    connections: new Set([ws]),
  }

  socketRooms.get(ws).add(room)
  rooms.set(roomId, room)
  log(`Room created: ${roomId}`)
}

function joinroom(ws, message) {
  const { roomId } = message

  if (!roomId) {
    throw new Error("Error joining room: Room ID is required to join room")
  }

  if (!rooms.has(roomId)) {
    throw new Error("Error joining room: Room ID does not exists")
  }

  const room = rooms.get(roomId)
  
  room.connections.add(ws)
  socketRooms.get(ws).add(room)

  sendFrom(ws, room, { type: 'peerjoin' })
  log(`Peer joined to room: ${roomId}`)
}

function broadcast(ws, message) {
  const { roomId } = message
  if (!roomId) {
    throw new Error("Error broadcasting: Room ID is required to broadcast")
  }

  if (!rooms.has(roomId)) {
    throw new Error("Error broadcasting: Room ID does not exists")
  }

  const room = rooms.get(roomId)
  sendFrom(ws, room, message.data)
  log(`Broadcast to room ${roomId}`)
}

function sendFrom(from, room, message) {
  const encoded = JSON.stringify(message)
  room.connections.forEach(ws => {
    if (ws !== from) {
      ws.send(encoded)
    }
  })
}

function ping(ws, message) {
  log('Ping received')
  ws.send(JSON.stringify({ type: 'pong' }))
}

function log(...args) {
  const time = new Date().toISOString()
  console.log(`[${time}]`, ...args)
}
