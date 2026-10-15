"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
const PORT = Number(process.env.PORT) || 4000;
const POLL_INTERVAL_MS = 3000;
// Absolute path to metrics.sh so it works inside Docker
const SCRIPT_PATH = path_1.default.resolve(__dirname, '..', 'metrics.sh');
// ---------- Health check ----------
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ---------- Metrics Collector ----------
function collectMetrics() {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(`bash ${SCRIPT_PATH}`, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Exec error: ${error.message}`));
                return;
            }
            if (stderr) {
                console.warn(`⚠️  Shell stderr: ${stderr}`);
            }
            try {
                const parsed = JSON.parse(stdout.trim());
                resolve(parsed);
            }
            catch (e) {
                reject(new Error(`JSON parse failed: ${e.message} | Raw: ${stdout}`));
            }
        });
    });
}
// ---------- Threshold Logic ----------
function checkThresholds(metrics) {
    if (metrics.cpu > 90) {
        return { type: 'CPU', message: 'CPU usage critical!', value: metrics.cpu };
    }
    if (metrics.memory > 90) {
        return {
            type: 'Memory',
            message: 'Memory usage critical!',
            value: metrics.memory,
        };
    }
    if (metrics.disk > 85) {
        return { type: 'Disk', message: 'Disk usage high!', value: metrics.disk };
    }
    return null;
}
// ---------- Socket.io ----------
io.on('connection', (socket) => {
    console.log(`🟢 Dashboard connected: ${socket.id}`);
    const interval = setInterval(async () => {
        try {
            const metrics = await collectMetrics();
            socket.emit('metrics', metrics);
            const alert = checkThresholds(metrics);
            if (alert) {
                socket.emit('alert', alert);
            }
        }
        catch (err) {
            console.error(`❌ ${err.message}`);
        }
    }, POLL_INTERVAL_MS);
    socket.on('disconnect', (reason) => {
        clearInterval(interval);
        console.log(`🔴 Dashboard disconnected: ${socket.id} (${reason})`);
    });
});
// ---------- Boot ----------
server.listen(PORT, () => {
    console.log(`🚀 Monitoring agent running on http://localhost:${PORT}`);
    console.log(`📜 Using script: ${SCRIPT_PATH}`);
});
// ---------- Graceful shutdown ----------
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received. Shutting down gracefully...');
    io.close();
    server.close(() => process.exit(0));
});
//# sourceMappingURL=agent.js.map