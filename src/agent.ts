
import express, { type Express, type Request, type Response } from "express";
import { exec } from "node:child_process";
import http from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

import type {
  Metrics,
  AlertPayload,
  ServerToClientEvents,
  ClientToServerEvents,
} from "./types";

config();

const app: Express = express();
const server = http.createServer(app);

const dashboardUrl = process.env.DASHBOARD_URL;

app.use(
  cors({
    origin: dashboardUrl || "*",
    methods: ["GET", "POST"],
  })
);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: dashboardUrl || "*",
    methods: ["GET", "POST"],
  },
});

const PORT = Number(process.env.PORT) || 4000;
const POLL_INTERVAL_MS = 3000;

// Works with CommonJS TypeScript compilation.
const SCRIPT_PATH = path.resolve(__dirname, "../metrics.sh");

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

function collectMetrics(): Promise<Metrics> {
  return new Promise((resolve, reject) => {
    exec(
      `bash "${SCRIPT_PATH}"`,
      { timeout: 5000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Metrics collection failed: ${error.message}`));
          return;
        }

        if (stderr.trim()) {
          console.warn("Metrics stderr:", stderr);
        }

        try {
          resolve(JSON.parse(stdout.trim()) as Metrics);
        } catch (error) {
          reject(
            new Error(
              `Invalid metrics JSON: ${(error as Error).message}`
            )
          );
        }
      }
    );
  });
}

function checkThresholds(metrics: Metrics): AlertPayload | null {
  if (metrics.cpu > 90) {
    return {
      type: "CPU",
      message: "CPU usage critical!",
      value: metrics.cpu,
    };
  }

  if (metrics.memory > 90) {
    return {
      type: "Memory",
      message: "Memory usage critical!",
      value: metrics.memory,
    };
  }

  if (metrics.disk > 85) {
    return {
      type: "Disk",
      message: "Disk usage high!",
      value: metrics.disk,
    };
  }

  return null;
}

io.on("connection", (socket) => {
  console.log(`Dashboard connected: ${socket.id}`);

  let collecting = false;

  const interval = setInterval(async () => {
    if (collecting) return;

    collecting = true;

    try {
      const metrics = await collectMetrics();

      socket.emit("metrics", metrics);

      const alert = checkThresholds(metrics);
      if (alert) {
        socket.emit("alert", alert);
      }
    } catch (error) {
      console.error("Metrics error:", (error as Error).message);
    } finally {
      collecting = false;
    }
  }, POLL_INTERVAL_MS);

  socket.on("disconnect", (reason) => {
    clearInterval(interval);
    console.log(`Dashboard disconnected: ${socket.id} (${reason})`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Monitoring agent listening on port ${PORT}`);
  console.log(`Metrics script: ${SCRIPT_PATH}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down...");

  io.close(() => {
    process.exit(0);
  });
});
