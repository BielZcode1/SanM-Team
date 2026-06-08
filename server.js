const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); // 🛡️ Proteção contra ataques

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🛡️ LIMITADOR DE REQUISIÇÕES: Evita que bots derrubem sua API
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // Janela de 1 minuto
    max: 30, // Cada IP só pode fazer 30 requisições por minuto
    message: { error: "Muitas requisições vindas deste IP. Tente novamente mais tarde." }
});

// Aplica o limitador nas rotas críticas
app.post('/api/announce', (req, res) => {
    // 'x-forwarded-for' contém a cadeia de IPs. O primeiro é o original.
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;

    const serverData = req.body;
    serverData.ip = ip; // Agora você salva o IP real aqui
    serverData.status = "Online";
    
    // Salve serverData no seu banco de dados ou array de servidores
    res.status(200).send("OK");
});

let serverList = [];
const SERVER_TIMEOUT = 60 * 1000;

function isLocalIP(ip) {
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');
}

// Rota de teste para o Cron-Job
app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: "alive" });
});

// Buscar servidores ativos (Seu cliente chama aqui)
app.get('/api/servers', (req, res) => {
    const now = Date.now();
    serverList = serverList.filter(srv => (now - srv.lastSeen) < SERVER_TIMEOUT);

    res.json(serverList.map(srv => ({
        ip: srv.ip,
        port: srv.port,
        name: srv.name,
        desc: srv.desc,
        players: srv.players,
        ping: srv.ping,
        status: "Online"
    })));
});

// Anunciar Servidor (O executável do jogo chama aqui)
app.post('/api/announce', (req, res) => {
    const { port, name, desc, players, ping } = req.body;

    // 1. Validação estrita dos dados recebidos
    if (!port || !name || typeof name !== 'string' || isNaN(port)) {
        return res.status(400).json({ error: "Dados inválidos ou incompletos." });
    }

    // Proteção contra nomes gigantescos que quebram o layout do ImGui
    if (name.length > 32 || (desc && desc.length > 64)) {
        return res.status(400).json({ error: "Nome ou descrição muito longos." });
    }

    // 2. Captura do IP Público Real
    let publicIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (publicIp.includes('::ffff:')) {
        publicIp = publicIp.split('::ffff:')[1];
    }

    if (isLocalIP(publicIp)) {
        return res.status(400).json({ error: "Apenas servidores com IP público podem ser listados." });
    }

    const serverId = `${publicIp}:${port}`;
    const now = Date.now();
    const existingServerIndex = serverList.findIndex(srv => srv.id === serverId);

    const serverData = {
        id: serverId,
        ip: publicIp,
        port: parseInt(port),
        name: name.replace(/[<>]/g, ''), // Limpeza básica contra injeção de scripts
        desc: desc ? desc.replace(/[<>]/g, '') : "Sem descrição.",
        players: players || "0/0",
        ping: parseInt(ping) || 99,
        lastSeen: now
    };

    if (existingServerIndex > -1) {
        serverList[existingServerIndex] = serverData;
    } else {
        // Limita a lista global a no máximo 100 servidores (evita estouro de memória no plano grátis)
        if (serverList.length >= 100) {
            return res.status(503).json({ error: "Lista de servidores cheia no momento." });
        }
        serverList.push(serverData);
    }

    res.status(200).json({ message: "Atualizado!", id: serverId });
});

app.listen(PORT, () => {
    console.log(`Master Server protegido rodando na porta ${PORT}`);
});
