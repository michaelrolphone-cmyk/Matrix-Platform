// server/index.ts
import path from "path";
import express from "express";
import http from "http";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { CoreRealityKernel } from "../engine/core/kernel";

type EntityId = number;

interface ClientInfo {
  ws: WebSocket;
  entityId: EntityId;
  name: string;
  color: string;
}

interface InputMessage {
  type: "input";
  move: [number, number, number];
}

interface FrameMessage {
  type: "frame";
  frame: any;
}

interface ConceptMessage {
  type: "concept";
  label: string;
}

interface ChatMessage {
  type: "chat";
  text: string;
}

type ClientMessage = InputMessage | ConceptMessage | ChatMessage;


const RDL_PATH = process.env.RDL_PATH || "./spec/rdl/rdl-core-v0.1.json";
const PORT = Number(process.env.PORT || 8080);
const PERCEPT_RADIUS = 200;
const TICK_BROADCAST_MS = 100;

const PLAYER_COLORS = [
  "#7af7d0",
  "#ff9c73",
  "#7aa2ff",
  "#ffd86b",
  "#c9ff7a",
  "#ff7ad9",
  "#7afff6"
];
let nextPlayerColorIndex = 0;

function allocateClientIdentity() {
  const color = PLAYER_COLORS[nextPlayerColorIndex % PLAYER_COLORS.length];
  nextPlayerColorIndex += 1;
  const suffix = Math.floor(Math.random() * 900 + 100).toString(16);
  const name = `wanderer-${suffix}`;
  return { color, name };
}

// ---------------------------
// Kernel
// ---------------------------

const rdlAbsPath = path.resolve(RDL_PATH);
const kernel = new CoreRealityKernel(rdlAbsPath);
kernel.start();

// ---------------------------
// Express HTTP server
// ---------------------------

const app = express();

// IMPORTANT: resolve client path from project root (process.cwd),
// not from __dirname (dist/server)
const clientPath = path.resolve(process.cwd(), "clients", "web");
console.log("[HTTP] Static client path:", clientPath);

// Serve static client
app.use(express.static(clientPath));

// Fallback route: serve index.html for any unknown path
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

const server = http.createServer(app);

// ---------------------------
// WebSocket server on same HTTP server
// ---------------------------

const wss = new WebSocketServer({ server });
const clients = new Map<WebSocket, ClientInfo>();
wss.on("connection", (ws: WebSocket) => {
  console.log("[WSS] New client connection");

  let entityId: number;
  try {
    // Create a new body for this client
    entityId = kernel.spawnEntityFromArchetype("human_agent");
  } catch (err) {
    console.error("[WSS] Failed to spawn human_agent for client:", err);
    ws.close();
    return;
  }

  kernel.registerControlledEntity(entityId);

  const identity = allocateClientIdentity();
  kernel.setEntitySignature(entityId, {
    name: identity.name,
    color: identity.color,
    source: "ws:client"
  });

  const clientInfo: ClientInfo = { ws, entityId, name: identity.name, color: identity.color };
  clients.set(ws, clientInfo);

  console.log(
    `[WSS] Assigned entity ${entityId} to client (#${clients.size}) as ${identity.name}`
  );

  ws.on("message", (data: RawData) => {
    try {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      const msg = JSON.parse(text) as ClientMessage;

      if (msg.type === "input") {
        kernel.setInputState(entityId, { move: msg.move });
      } else if (msg.type === "concept") {
        kernel.injectConcept(msg.label, entityId, 1);
      } else if (msg.type === "chat") {
        kernel.postProximityChat(entityId, msg.text);
      }
    } catch (err) {
      console.error("[WSS] Error parsing client message:", err);
    }
  });

  ws.on("close", () => {
    console.log("[WSS] Client disconnected");
    clients.delete(ws);
    kernel.clearEntitySignature(entityId);
  });

  ws.on("error", (err) => {
    console.error("[WSS] Client error:", err);
    clients.delete(ws);
    kernel.clearEntitySignature(entityId);
  });
});


setInterval(() => {
  for (const [ws, client] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
  
    const frame = kernel.getPerceptualFrame(client.entityId, PERCEPT_RADIUS);
    if (!frame) continue;
    const message: FrameMessage = { type: "frame", frame };
    ws.send(JSON.stringify(message));
  }
}, TICK_BROADCAST_MS);

// ---------------------------
// Start server
// ---------------------------

server.listen(PORT, () => {
  console.log(`[HTTP] Listening on port ${PORT}`);
  console.log(`[HTTP] Serving client from ${clientPath}`);
});
