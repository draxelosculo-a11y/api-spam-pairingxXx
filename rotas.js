const express = require('express')
const router = express.Router()
const pino = require('pino')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, 'database.json')
const PAIRINGS_DIR = path.join(__dirname, 'Pairings')

if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}))
if (!fs.existsSync(PAIRINGS_DIR)) fs.mkdirSync(PAIRINGS_DIR, { recursive: true })

const processosAtivos = new Map()

const getDB = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  } catch {
    return {}
  }
}

const saveDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

const validarAcesso = (req, res, next) => {

  const apikey = req.query.apikey || req.body.apikey
  const db = getDB()

  if (!apikey || !db[apikey]) {
    return res.status(401).json({
      creator: "MDK0111",
      status: false,
      msg: "ApiKey inválida ou ausente."
    })
  }

  const user = db[apikey]

  if (user.requests !== null && user.requests <= 0) {
    return res.status(403).json({
      creator: "MDK0111",
      status: false,
      msg: "Limite de requests atingido."
    })
  }

  if (user.requests !== null) {
    user.requests -= 1
    saveDB(db)
  }

  next()
}


// ADMIN

router.get('/admin/keys', (req, res) => {
  res.json(getDB())
})

router.post('/admin/gerar-key', (req, res) => {

  const { novaKey, limite } = req.body

  if (!novaKey) {
    return res.status(400).json({
      status: false,
      msg: "Chave inválida."
    })
  }

  const db = getDB()

  db[novaKey] = {
    requests: (limite === "infinito" || !limite) ? null : parseInt(limite),
    created: new Date().toLocaleString()
  }

  saveDB(db)

  res.json({
    status: true,
    key: novaKey
  })

})


router.delete('/admin/deletar-key/:key', (req, res) => {

  const db = getDB()

  if (!db[req.params.key]) {
    return res.json({ status:false })
  }

  delete db[req.params.key]

  saveDB(db)

  res.json({
    status: true
  })

})


// START PAIRING

router.get('/send-pairing=:numero', validarAcesso, async (req, res) => {

  const { default: makeWASocket, useMultiFileAuthState, delay } = await import("@whiskeysockets/baileys")

  let numero = req.params.numero.replace(/\D/g, '')

  if (!numero || numero.length < 8) {
    return res.status(400).json({
      creator: "MDK0111",
      status: false,
      msg: "Número inválido"
    })
  }

  if (processosAtivos.has(numero)) {
    return res.json({
      creator: "MDK0111",
      status: "Aviso",
      msg: "Já existe um processo rodando para esse número"
    })
  }

  processosAtivos.set(numero, true)

  const sessionPath = path.join(PAIRINGS_DIR, `sess_${numero}_${Date.now()}`)

  const executar = async () => {

    try {

      while (processosAtivos.get(numero) === true) {

        const { state } = await useMultiFileAuthState(sessionPath)

        const sock = makeWASocket({
          auth: state,
          logger: pino({ level: 'silent' }),
          printQRInTerminal: false
        })

        try {

          await delay(3000)

          const code = await sock.requestPairingCode(numero)

          console.log(`PAIRING ${numero}: ${code}`)

        } catch (err) {

          console.log(`Erro envio ${numero}`)

        }

        await delay(5000)

        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true })
        }

      }

    } catch (err) {

      console.log("Erro crítico:", err.message)

    } finally {

      processosAtivos.delete(numero)

      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true })
      }

    }

  }

  executar()

  res.json({
    creator: "MDK0111",
    status: "Processo iniciado",
    numero: numero,
    tempo: "1 hora"
  })

})


// STOP

router.get('/stop-pairing=:numero', validarAcesso, (req, res) => {

  const numero = req.params.numero.replace(/\D/g, '')

  if (processosAtivos.has(numero)) {

    processosAtivos.set(numero, false)

    res.json({
      creator: "MDK0111",
      status: true,
      msg: `Processo parado para ${numero}`
    })

  } else {

    res.json({
      creator: "MDK0111",
      status: false,
      msg: "Número não está em execução"
    })

  }

})


router.get('/stop-all', validarAcesso, (req, res) => {

  for (const key of processosAtivos.keys()) {
    processosAtivos.set(key, false)
  }

  res.json({
    creator: "MDK0111",
    status: "Todos processos encerrados"
  })

})


module.exports = router
