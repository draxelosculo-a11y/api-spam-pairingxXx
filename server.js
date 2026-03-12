const express = require('express')
const path = require('path')
const multer = require('multer')
const rotas = require('./rotas')

const app = express()

app.set('trust proxy', true)
app.disable('x-powered-by')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// multer em memória (não usa disco)
const storage = multer.memoryStorage()
const upload = multer({ storage })

app.get('/', (req, res) => {

  res.json({
    status: "online",
    api: "spam pairing",
    creator: "MDK0111"
  })

})

// upload
app.post('/upload', upload.single('file'), (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: "arquivo não enviado" })
  }

  res.json({
    status: "upload recebido",
    name: req.file.originalname
  })

})

// rota html
app.get('/alugar', (req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'))
})

app.use('/api', rotas)

module.exports = app
