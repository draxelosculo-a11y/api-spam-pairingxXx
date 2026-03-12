const express = require('express')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { Server } = require('socket.io')
const multer = require('multer')
const rotas = require('./rotas')

const app = express()
const server = http.createServer(app)

// SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// CONFIG SERVER
app.set('trust proxy', true)
app.disable('x-powered-by')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000

// PASTAS
const uploadDir = path.join(__dirname, 'uploads')
const pairDir = path.join(__dirname, 'Pairings')

;[uploadDir, pairDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

// MULTER
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniquePrefix = Math.random().toString(36).substring(2, 10)
    cb(null, `${uniquePrefix}_${file.originalname}`)
  }
})

const upload = multer({ storage })

// ROTA PRINCIPAL
app.get('/', (req, res) => {
  res.status(200).json({
    status: "online",
    message: "API SPAM-PAIRING + CHAT",
    creator: "MDK0111",
    uptime: process.uptime().toFixed(0) + "s"
  })
})

// UPLOAD
app.post('/upload', upload.single('file'), (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: "Arquivo não enviado" })
  }

  res.json({
    status: "upload realizado",
    url: `/uploads/${req.file.filename}`
  })

})

// ARQUIVOS ESTÁTICOS
app.use('/uploads', express.static(uploadDir))

// HTML
app.get('/alugar', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// ROTAS EXTERNAS
app.use('/api', rotas)

// SOCKET CHAT
io.on('connection', (socket) => {

  console.log(`👤 Novo usuário conectado: ${socket.id}`)

  socket.on('join', (data) => {

    if (data.room) {
      socket.join(data.room)
      console.log(`📥 Entrada na sala: ${data.room}`)
    }

  })

  socket.on('message', (data) => {

    if (data.room) {
      io.to(data.room).emit('message', data)
    } else {
      io.emit('message', data)
    }

  })

  socket.on('disconnect', () => {
    console.log(`❌ Usuário desconectado: ${socket.id}`)
  })

})

// LIMPEZA AUTOMÁTICA
setInterval(() => {

  const folders = [pairDir, uploadDir]
  const agora = Date.now()

  folders.forEach(dir => {

    if (!fs.existsSync(dir)) return

    fs.readdirSync(dir).forEach(file => {

      const filePath = path.join(dir, file)

      try {

        const stats = fs.statSync(filePath)

        if (agora - stats.birthtimeMs > 86400000) {

          fs.rmSync(filePath, {
            recursive: true,
            force: true
          })

          console.log(`🗑 Removido: ${file}`)

        }

      } catch (err) {}

    })

  })

}, 3600000)


// START SERVER (não roda na Vercel)
if (!process.env.VERCEL) {

  server.listen(PORT, () => {

    console.log(`
==========================================
🚀 SERVIDOR ONLINE
🔌 Porta: ${PORT}
👤 Creator: MDK0111
==========================================
`)

  })

}

// EXPORT PARA VERCEL
module.exports = app