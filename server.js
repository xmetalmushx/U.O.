// Unseen Oracle Backend - Phase 1
// This server manages SSH connections and provides the first AI feature endpoint.

const express = require('express');
const http = require('http');
const pty = require('node-pty');
const os = require('os');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const expressWs = require('express-ws')(app, server);

app.use(cors());
app.use(express.json());

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

// --- WebSocket Endpoint for SSH ---
app.ws('/ssh', (ws, req) => {
    console.log('SSH WebSocket client connected');
    const term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    term.on('data', (data) => {
        try {
            ws.send(data);
        } catch (ex) {}
    });

    ws.on('message', (msg) => {
        term.write(msg);
    });

    ws.on('close', () => {
        term.kill();
        console.log('SSH WebSocket client disconnected');
    });
});

// --- API Endpoint for Natural Language to Command ---
app.post('/api/generate-command', async (req, res) => {
    const { userRequest, llmUrl } = req.body;

    if (!userRequest || !llmUrl) {
        return res.status(400).json({ error: 'Missing userRequest or llmUrl' });
    }

    // This is our first "master prompt"
    const prompt = `You are an expert Linux system administrator. Your task is to translate the user's plain-English request into a single, precise, and executable bash command. Do not provide any explanation or surrounding text. Only provide the command itself.\n\nUser Request: "${userRequest}"\n\nBash Command:`;

    try {
        const llmResponse = await fetch(`${llmUrl}/completion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                n_predict: 128,
                stop: ["\n"], // Stop generating after the first line break
                stream: false // We want the full command at once
            })
        });

        if (!llmResponse.ok) {
            throw new Error(`LLM API responded with status ${llmResponse.status}`);
        }

        const data = await llmResponse.json();
        const command = data.content.trim();
        res.json({ command: command });

    } catch (error) {
        console.error('Error generating command:', error);
        res.status(500).json({ error: 'Failed to communicate with the LLM API.' });
    }
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
