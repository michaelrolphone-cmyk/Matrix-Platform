// engine/infra/shardServer.ts

import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { CoreRealityKernel } from "../core/kernel";

// ---------------------------
// Types
// ---------------------------

type EntityId = number;

interface ClientInfo {
  ws: WebSocket;
  entityId: EntityId;
}

interface InputMessage {
  type: "input";
  move: [number, number, number]; // [x, y, z] in world space, we mainly use x/z
}

interface FrameMessage {
  type: "frame";
  frame: any; // PerceptualFrame from kernel
}

// ---------------------------
// Config
// ---------------------------

const RDL_PATH = process.env.RDL_PATH || "./spec/rdl/rdl-core-v0.1.json";
const PORT = Number(process.env.PORT || 8080);
const PERCEPT_RADIUS = 50;
const TICK_BROADCAST_MS = 100; // how often we send perceptual frames

// ---------------------------
// Setup Kernel
// ---------------------------

const rdlAbsPath = path.resolve(RDL_PATH);
const kernel = new CoreRealityKernel(rdlAbsPath);
kernel.start();

// ---------------------------
// WebSocket Shard Server
// ---------------------------

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<WebSocket, ClientInfo>();

console.log(`[WSS] World Shard Server listening on ws://localhost:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  console.log("[WSS] New client connection");

  // Choose an entity to control.
  const world = kernel.getWorldState();
  const allEntities = Array.from(world.components.transform.keys());

  if (allEntities.length === 0) {
    console.warn("[WSS] No entities available to assign to client");
    ws.close();
    return;
  }

  // Simple strategy: assign next entity in list, wrap around if needed.
  const assignedIndex = clients.size % allEntities.length;
  const entityId = allEntities[assignedIndex];

  kernel.registerControlledEntity(entityId);

  const clientInfo: ClientInfo = { ws, entityId };
  clients.set(ws, clientInfo);

  console.log(
    `[WSS] Assigned entity ${entityId} to client (#${clients.size})`
  );

  ws.on("message", (data: WebSocket.RawData) => {
    try {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      const msg = JSON.parse(text) as InputMessage;

      if (msg.type === "input") {
        kernel.setInputState(entityId, { move: msg.move });
      }
    } catch (err) {
      console.error("[WSS] Error parsing client message:", err);
    }
  });

  ws.on("close", () => {
    console.log("[WSS] Client disconnected");
    clients.delete(ws);
    // We leave the entity in the world; later we can despawn or park it.
  });

  ws.on("error", (err) => {
    console.error("[WSS] Client error:", err);
    clients.delete(ws);
  });
});

// Periodically send perceptual frames to each client
setInterval(() => {
  for (const [ws, client] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const frame = kernel.getPerceptualFrame(client.entityId, PERCEPT_RADIUS);
    if (!frame) continue;

    const message: FrameMessage = { type: "frame", frame };
    ws.send(JSON.stringify(message));
  }
}, TICK_BROADCAST_MS);
