import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import telemetryRoutes from "./routes/telemetry.routes.js";
import { connectDatabase, closeDatabase } from "./config/database.js";

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const io = new SocketIOServer(server, {
  cors: { origin: allowedOrigin, methods: ["GET", "POST"] }
});

app.set("io", io);
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "NexusFlow API", time: new Date().toISOString() });
});

app.use("/api/telemetry", telemetryRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

io.on("connection", (socket) => {
  console.log(`Browser connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`Browser disconnected: ${socket.id}`));
});

const PORT = Number(process.env.PORT) || 5000;

try {
  await connectDatabase();
  server.listen(PORT, () => console.log(`NexusFlow API listening at http://localhost:${PORT}`));
} catch (error) {
  console.error("Could not start NexusFlow:", error.message);
  process.exit(1);
}

async function shutdown() {
  console.log("Shutting down NexusFlow...");
  await closeDatabase();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
