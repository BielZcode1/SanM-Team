const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANTE: Necessário para o Render/Heroku reconhecer o IP real
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { error: "Muitas requisições. Tente mais tarde." }
});

// A lista precisa persistir. 
let serverList = [];
const SERVER_TIMEOUT = 60 * 1000;

function isLocalIP(ip) {
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');
}

// ROTA ÚNICA DE ANUNCIO
app.post('/api/announce', apiLimiter, (req, res) => {
    const { port, name, desc, players, ping } = req.body;
    console.log("Recebi:", req.body);
    
    if (!port || !name) {
        return res.status(400).json({ error: "Dados incompletos." });
    }

    let publicIp = req.ip; 

    const serverId = `${publicIp}:${port}`;
    const now = Date.now();
    
    const serverData = {
        id: serverId,
        ip: publicIp,
        port: parseInt(port),
        name: name.substring(0, 32).replace(/[<>]/g, ''),
        desc: desc ? desc.substring(0, 64).replace(/[<>]/g, '') : "Sem descrição.",
        players: players || "0/0",
        ping: parseInt(ping) || 99,
        lastSeen: now
    };

    const idx = serverList.findIndex(s => s.id === serverId);
    if (idx > -1) serverList[idx] = serverData;
    else serverList.push(serverData);

    res.status(200).json({ message: "OK" });
});

app.post('/api/log', (req, res) => {
    const { sender, message, level } = req.body;
    const timestamp = new Date().toISOString();
    
    // Aqui você pode salvar em um arquivo ou apenas exibir no console do servidor
    console.log(`[${timestamp}] [${level}] ${sender}: ${message}`);
    
    res.status(200).json({ status: "Log recebido" });
});

app.get('/api/servers', (req, res) => {
    const now = Date.now();
    // Remove servidores inativos automaticamente
    serverList = serverList.filter(srv => (now - srv.lastSeen) < SERVER_TIMEOUT);
    res.json(serverList);
});

app.use((req, res, next) => {
    if (req.path === '/api/announce') {
        console.log("Headers recebidos:", req.headers['content-type']);
        console.log("Body bruto recebido:", req.body);
    }
    next();
});

app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
