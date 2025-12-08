// engine/core/kernel.ts

import fs from "fs";
import path from "path";

// ---------------------------
// Foam grid constants
// ---------------------------

const FOAM_HALF_EXTENT = 200; // meters
const FOAM_CELL_SIZE = 2;     // meters per cell
const FOAM_DIM = Math.floor((FOAM_HALF_EXTENT * 2) / FOAM_CELL_SIZE); // 200x200

const FOAM_DIFFUSION = 0.8;
const FOAM_DECAY = 0.5;

// Concept pulses
const CONCEPT_TTL_SECONDS = 20;   // lifetime of each impulse
const CONCEPT_COOC_RADIUS = 40;   // spatial radius for co-occurrence
const CONCEPT_COOC_WINDOW = 5;    // time window (s) for co-occurrence

// ---------------------------
// Types (aligned with RDL v0.1)
// ---------------------------

type Vec3 = [number, number, number];

interface UniverseSpace {
  type: "euclidean";
  dimensions: number;
  units: string;
  bounds: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
}

interface UniverseTime {
  mode: "discrete";
  tick_seconds: number;
  max_substeps: number;
}

interface UniverseManifold {
  semantic_dimension: number;
  semantic_field: {
    type: "scalar";
    description: string;
  };
}

interface UniverseDef {
  id: string;
  description: string;
  space: UniverseSpace;
  time: UniverseTime;
  manifold: UniverseManifold;
}

interface PhysicsRules {
  gravity: Vec3;
  solver: string;
  max_iterations: number;
}

interface InteractionRule {
  id: string;
  type: "collision" | string;
  effect: string;
}

interface EntityArchetype {
  id: string;
  components: any;
}

interface RDLCore {
  rdl_version: string;
  universe: UniverseDef;
  sharding: {
    strategy: string;
    cell_size_m: number;
    max_entities_per_shard: number;
  };
  entity_archetypes: EntityArchetype[];
  rules: {
    physics: PhysicsRules;
    interactions: InteractionRule[];
  };
}

// ---------------------------
// ECS Core
// ---------------------------

type EntityId = number;

interface Transform {
  position: Vec3;
  rotation: Vec3;
}

interface PhysicsBody {
  mass_kg: number;
  velocity: Vec3;
  collider: "capsule" | "sphere" | "box";
  radius_m?: number;
  height_m?: number;
  dynamic: boolean;
}

interface Appearance {
  mesh_id: string;
  lods: string[];
}

interface Mind {
  type: "external_controlled" | "ai_wander" | string;
  channels: string[];
}

interface Identity {
  identity_source: "IPL" | string;
  allow_persistence: boolean;
}

interface Components {
  transform: Map<EntityId, Transform>;
  physics_body: Map<EntityId, PhysicsBody>;
  appearance: Map<EntityId, Appearance>;
  mind: Map<EntityId, Mind>;
  identity: Map<EntityId, Identity>;
}

// ---------------------------
// Foam grid structures
// ---------------------------

interface FoamGrid {
  width: number;
  height: number;
  cellSize: number;
  values: Float32Array;
  scratch: Float32Array;
}

interface FoamPatch {
  width: number;
  height: number;
  cellSize: number;
  values: number[][]; // [row][col]
}

// ---------------------------
// Concept pulses & Thought Graph
// ---------------------------

interface ConceptImpulse {
  id: number;
  label: string;
  position: Vec3;
  createdAt: number;   // simulation timeSeconds
  baseStrength: number;
}

interface PerceivedConcept {
  label: string;
  relativePosition: Vec3;
  strength: number;
}

interface GraphNode {
  label: string;
  totalCount: number;
  lastSeenAt: number;
}

interface GraphEdge {
  a: string;
  b: string;
  weight: number;
  lastCooccurAt: number;
}

interface ConceptSummary {
  label: string;
  weight: number;
}

interface EdgeSummary {
  a: string;
  b: string;
  weight: number;
}

interface ResonanceState {
  local: number;
  labels: { [label: string]: number };
}

interface ConceptEcho {
  label: string;
  distance: number;
  ageSeconds: number;
  strength: number;
  direction: Vec3;
}

// ---------------------------
// Proximity chat (server-side log)
// ---------------------------

interface ChatMessage {
  id: number;
  authorId: EntityId;
  text: string;
  position: Vec3;
  createdAt: number;
  name?: string;
  color?: string;
  moodHints?: string[];
}

// ---------------------------
// Identity signatures (client-facing identity & color)
// ---------------------------

interface IdentitySignature {
  name: string;
  color: string;
  assignedAt: number;
  source?: string;
}

// ---------------------------
// Ambient foam anomalies
// ---------------------------

interface AmbientFoamZone {
  id: string;
  label: string;
  flavor?: string;
  position: Vec3;
  radius: number;
  baseIntensity: number;
  pulsePeriod: number;
  pulseOffset: number;
  conceptLabel?: string;
  moodHint?: string;
}

// ---------------------------
// World & perception
// ---------------------------

interface WorldState {
  tick: number;
  timeSeconds: number;
  universe: UniverseDef;
  components: Components;
  foam: FoamGrid;
  ambientZones: AmbientFoamZone[];
}

interface InputState {
  move: Vec3;
}

interface PerceivedEntity {
  id: EntityId;
  relativePosition: Vec3;
  distance: number;
  name?: string;
  color?: string;
}

interface FrameChatMessage {
  text: string;
  name?: string;
  color?: string;
  distance: number;
  ageSeconds: number;
  moodHints?: string[];
}

interface FrameSelfState {
  id: EntityId;
  position: Vec3;
  velocity: Vec3;
  name?: string;
  color?: string;
  mood?: string;
  moodConfidence?: number;
  moodSince?: number;
}

interface MoodSnapshot {
  mood: string;
  confidence: number;
  sinceSeconds: number;
  signalQuality?: "strong" | "steady" | "fragile" | "stale";
  trend?: "rising" | "steady" | "fading";
}

interface FrameAmbientZone {
  label: string;
  distance: number;
  intensity: number;
  radius: number;
  flavor?: string;
  moodHint?: string;
}

interface FrameAtmosphere {
  foamEnergy: number;
  foamPeak: number;
  skyLight: number;
  fogDensity: number;
  phase: string;
  skyTint?: string;
  nearestAnomaly?: {
    label: string;
    distance: number;
    intensity: number;
    moodHint?: string;
  };
}

interface PerceptualFrame {
  tick: number;
  timeSeconds: number;
  self: FrameSelfState;
  nearbyEntities: PerceivedEntity[];
  foamPatch?: FoamPatch;
  concepts?: PerceivedConcept[];
  conceptEchoes?: ConceptEcho[];
  resonance?: ResonanceState;
  graphSummary?: {
    concepts: ConceptSummary[];
    edges: EdgeSummary[];
  };
  narrative?: string[];
  worldMood?: string;
  worldMoodConfidence?: number;
  worldMoodSince?: number;
  worldMoodSignalQuality?: "strong" | "steady" | "fragile" | "stale";
  worldMoodTrend?: "rising" | "steady" | "fading";
  chatLog?: FrameChatMessage[];
  ambientZones?: FrameAmbientZone[];
  atmosphere?: FrameAtmosphere;
}


// ---------------------------
// AI State
// ---------------------------

interface AIWanderState {
  move: Vec3;
  timeToChange: number;
}

// ---------------------------
// Kernel Class
// ---------------------------

export class CoreRealityKernel {
  private rdl: RDLCore;
  private world: WorldState;
  private nextEntityId: EntityId = 1;
  private running: boolean = false;

  // Control
  private controlInputs: Map<EntityId, InputState> = new Map();
  private controlledEntities: Set<EntityId> = new Set();

  // Archetypes
  private archetypesById: Map<string, EntityArchetype> = new Map();

  // AI
  private aiWanderStates: Map<EntityId, AIWanderState> = new Map();

  // Ambient zones
  private ambientFoamZones: AmbientFoamZone[] = [];
  private ambientConceptCooldown: Map<string, number> = new Map();

  // Concepts & Thought Graph
  private nextConceptId: number = 1;
  private conceptImpulses: ConceptImpulse[] = [];
  private graphNodes: Map<string, GraphNode> = new Map();
  private graphEdges: Map<string, GraphEdge> = new Map();
  private lastGraphActivityAt: number = 0;

  // Proximity chat log
  private nextChatId: number = 1;
  private chatMessages: ChatMessage[] = [];

  // Player-facing identity overlays
  private identitySignatures: Map<EntityId, IdentitySignature> = new Map();

  // Mood memory to dampen sudden oscillations
  private moodMemory: Map<
    EntityId,
    { mood: string; lastChangeAt: number; stability: number; lastSeenAt: number }
  > = new Map();

  // World mood memory to keep shard-level sentiment stable
  private worldMoodMemory?: {
    mood: string;
    stability: number;
    lastChangeAt: number;
    lastSeenAt: number;
  };

  private worldMoodTrend: "rising" | "steady" | "fading" = "steady";

  // Cached graph summary for consistent world mood sampling per tick
  private globalGraphSummary: { concepts: ConceptSummary[]; edges: EdgeSummary[] } = {
    concepts: [],
    edges: []
  };

  constructor(rdlPath: string) {
    this.rdl = this.loadRdl(rdlPath);
    this.indexArchetypes(this.rdl.entity_archetypes);
    this.ambientFoamZones = this.createAmbientFoamZones();
    this.world = this.initWorld(this.rdl.universe);
    this.bootstrapWorldFromArchetypes(this.rdl.entity_archetypes);
    this.updateWorldMoodMemory();
  }

  private loadRdl(rdlPath: string): RDLCore {
    const abs = path.resolve(rdlPath);
    const raw = fs.readFileSync(abs, "utf-8");
    const data = JSON.parse(raw);
    return data as RDLCore;
  }

  private indexArchetypes(archetypes: EntityArchetype[]) {
    for (const arch of archetypes) {
      this.archetypesById.set(arch.id, arch);
    }
  }

  private createAmbientFoamZones(): AmbientFoamZone[] {
    return [
      {
        id: "ruins-signal",
        label: "signal ruins",
        flavor: "Old antennae spill static into the foam.",
        position: [-40, 0, 35],
        radius: 36,
        baseIntensity: 3.4,
        pulsePeriod: 26,
        pulseOffset: 2,
        conceptLabel: "signal",
        moodHint: "restless static"
      },
      {
        id: "calm-pool",
        label: "quiet pool",
        flavor: "A mirrored basin soothes the manifold.",
        position: [52, 0, -28],
        radius: 30,
        baseIntensity: 2.6,
        pulsePeriod: 38,
        pulseOffset: 9,
        conceptLabel: "calm",
        moodHint: "cool and glassy"
      },
      {
        id: "resonant-spire",
        label: "resonant spire",
        flavor: "Stone pillars hum when concepts pass nearby.",
        position: [10, 0, 70],
        radius: 44,
        baseIntensity: 3.1,
        pulsePeriod: 19,
        pulseOffset: 15,
        conceptLabel: "resonance",
        moodHint: "anticipatory hum"
      }
    ];
  }

  private createFoamGrid(): FoamGrid {
    const width = FOAM_DIM;
    const height = FOAM_DIM;
    const cellSize = FOAM_CELL_SIZE;
    const size = width * height;
    return {
      width,
      height,
      cellSize,
      values: new Float32Array(size),
      scratch: new Float32Array(size)
    };
  }

  private initWorld(universe: UniverseDef): WorldState {
    return {
      tick: 0,
      timeSeconds: 0,
      universe,
      components: {
        transform: new Map(),
        physics_body: new Map(),
        appearance: new Map(),
        mind: new Map(),
        identity: new Map()
      },
      foam: this.createFoamGrid(),
      ambientZones: this.ambientFoamZones
    };
  }

  private createEntity(): EntityId {
    const id = this.nextEntityId++;
    return id;
  }

  private applyComponentsFromArchetype(entity: EntityId, arch: EntityArchetype) {
    const comps = arch.components || {};

    if (comps.transform) {
      this.world.components.transform.set(entity, {
        position: comps.transform.position ?? [0, 0, 0],
        rotation: comps.transform.rotation ?? [0, 0, 0]
      });
    }

    if (comps.physics_body) {
      this.world.components.physics_body.set(entity, {
        ...comps.physics_body,
        velocity: [0, 0, 0]
      });
    }

    if (comps.appearance) {
      this.world.components.appearance.set(entity, {
        ...comps.appearance
      });
    }

    if (comps.mind) {
      const mind: Mind = { ...comps.mind };
      this.world.components.mind.set(entity, mind);

      if (mind.type === "external_controlled") {
        this.controlledEntities.add(entity);
        if (!this.controlInputs.has(entity)) {
          this.controlInputs.set(entity, { move: [0, 0, 0] });
        }
      } else if (mind.type === "ai_wander") {
        this.aiWanderStates.set(entity, {
          move: [0, 0, 0],
          timeToChange: 0
        });
      }
    }

    if (comps.identity) {
      this.world.components.identity.set(entity, {
        ...comps.identity
      });
    }

    console.log(`[CRK] Spawned entity ${entity} from archetype "${arch.id}"`);
  }

  private bootstrapWorldFromArchetypes(archetypes: EntityArchetype[]) {
    for (const arch of archetypes) {
      const entity = this.createEntity();
      this.applyComponentsFromArchetype(entity, arch);
    }
  }

  // ---------------------------
  // Public spawn hook
  // ---------------------------

  public spawnEntityFromArchetype(archetypeId: string): EntityId {
    const arch = this.archetypesById.get(archetypeId);
    if (!arch) {
      throw new Error(`Archetype "${archetypeId}" not found`);
    }
    const entity = this.createEntity();
    this.applyComponentsFromArchetype(entity, arch);
    return entity;
  }

  // ---------------------------
  // Control hooks
  // ---------------------------

  public registerControlledEntity(entityId: EntityId) {
    if (!this.world.components.transform.has(entityId)) {
      throw new Error(`Entity ${entityId} has no transform, cannot control.`);
    }
    this.controlledEntities.add(entityId);
    if (!this.controlInputs.has(entityId)) {
      this.controlInputs.set(entityId, { move: [0, 0, 0] });
    }
    console.log(`[CRK] Registered controlled entity: ${entityId}`);
  }

  public setEntitySignature(
    entityId: EntityId,
    signature: { name: string; color: string; source?: string }
  ) {
    this.identitySignatures.set(entityId, {
      name: signature.name,
      color: signature.color,
      source: signature.source,
      assignedAt: this.world.timeSeconds
    });
  }

  public clearEntitySignature(entityId: EntityId) {
    this.identitySignatures.delete(entityId);
  }

  private getEntitySignature(entityId: EntityId): IdentitySignature | undefined {
    return this.identitySignatures.get(entityId);
  }

  // ---------------------------
  // Proximity chat
  // ---------------------------

  public postProximityChat(entityId: EntityId, text: string) {
    const transform = this.world.components.transform.get(entityId);
    if (!transform) return;

    const trimmed = (text || "").trim();
    if (!trimmed) return;

    const normalized = trimmed.slice(0, 240);
    const signature = this.getEntitySignature(entityId);

    const message: ChatMessage = {
      id: this.nextChatId++,
      authorId: entityId,
      text: normalized,
      position: [...transform.position] as Vec3,
      createdAt: this.world.timeSeconds,
      name: signature?.name,
      color: signature?.color
    };

    const influences = this.inferConceptInfluenceFromText(normalized);
    if (influences.length > 0) {
      const hints: string[] = [];
      for (const influence of influences) {
        const strength = 0.6 + Math.min(2, influence.strength) * 0.25;
        this.injectConcept(influence.label, entityId, strength);
        hints.push(influence.label);
      }
      message.moodHints = hints;
    }

    this.chatMessages.push(message);

    // Keep the buffer bounded
    const maxMessages = 200;
    if (this.chatMessages.length > maxMessages) {
      this.chatMessages.splice(0, this.chatMessages.length - maxMessages);
    }
  }

  public setInputState(entityId: EntityId, input: InputState) {
    if (!this.controlledEntities.has(entityId)) {
      this.registerControlledEntity(entityId);
    }
    this.controlInputs.set(entityId, input);
  }

  public getWorldState(): WorldState {
    return this.world;
  }

  // ---------------------------
  // Concept injection & Thought Graph
  // ---------------------------

  public injectConcept(
    label: string,
    sourceEntityId?: EntityId,
    strength: number = 1,
    positionOverride?: Vec3
  ) {
    let position: Vec3 = [0, 0, 0];
    if (positionOverride) {
      position = [positionOverride[0], positionOverride[1], positionOverride[2]];
    } else if (sourceEntityId !== undefined) {
      const t = this.world.components.transform.get(sourceEntityId);
      if (t) {
        position = [t.position[0], t.position[1], t.position[2]];
      }
    }

    const impulse: ConceptImpulse = {
      id: this.nextConceptId++,
      label,
      position,
      createdAt: this.world.timeSeconds,
      baseStrength: strength
    };

    this.conceptImpulses.push(impulse);
    this.addFoamSourceAt(position, 10 * strength);

    // Update node stats
    let node = this.graphNodes.get(label);
    if (!node) {
      node = { label, totalCount: 0, lastSeenAt: this.world.timeSeconds };
      this.graphNodes.set(label, node);
    }
    node.totalCount += 1;
    node.lastSeenAt = this.world.timeSeconds;
    this.lastGraphActivityAt = this.world.timeSeconds;

    console.log(
      `[CRK] Injected concept "${label}" at t=${this.world.timeSeconds.toFixed(
        2
      )} from entity ${sourceEntityId ?? "none"}`
    );
  }

  private inferConceptInfluenceFromText(text: string): {
    label: string;
    strength: number;
  }[] {
    const normalized = text.toLowerCase();
    const tokenCounts: Record<string, number> = {};
    for (const token of normalized.split(/[^a-z]+/).filter(Boolean)) {
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    }

    const keywordMap: Record<string, string[]> = {
      curiosity: ["why", "how", "explore", "learn", "wonder", "search"],
      danger: ["danger", "warning", "threat", "help", "run", "fear"],
      calm: ["calm", "peace", "rest", "safe", "quiet", "breathe"]
    };

    const influences: { label: string; strength: number }[] = [];

    for (const [label, keywords] of Object.entries(keywordMap)) {
      let hits = 0;
      for (const kw of keywords) {
        const occurrences = tokenCounts[kw];
        if (occurrences) {
          hits += occurrences;
        }
      }
      if (hits > 0) {
        influences.push({ label, strength: hits });
      }
    }

    return influences;
  }

  private edgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private updateThoughtGraphCooccurrences() {
    const now = this.world.timeSeconds;
    const impulses = this.conceptImpulses;
    const n = impulses.length;

    for (let i = 0; i < n; i++) {
      const ci = impulses[i];
      for (let j = i + 1; j < n; j++) {
        const cj = impulses[j];

        const dt = Math.abs(ci.createdAt - cj.createdAt);
        if (dt > CONCEPT_COOC_WINDOW) continue;

        const dx = ci.position[0] - cj.position[0];
        const dy = ci.position[1] - cj.position[1];
        const dz = ci.position[2] - cj.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > CONCEPT_COOC_RADIUS) continue;

        const key = this.edgeKey(ci.label, cj.label);
        let edge = this.graphEdges.get(key);
        if (!edge) {
          const [a, b] = ci.label < cj.label ? [ci.label, cj.label] : [cj.label, ci.label];
          edge = { a, b, weight: 0, lastCooccurAt: now };
          this.graphEdges.set(key, edge);
        }
        edge.weight += 1;
        edge.lastCooccurAt = now;
        this.lastGraphActivityAt = now;
      }
    }
  }

  private decayGraphMemory(dt: number) {
    if (dt <= 0) return;

    const now = this.world.timeSeconds;
    const baseDecay = Math.exp(-0.08 * dt);

    const removeNodeLabels: string[] = [];
    for (const node of this.graphNodes.values()) {
      const ageSeconds = Math.max(0, now - node.lastSeenAt);
      const agePenalty = Math.exp(-0.004 * ageSeconds);
      node.totalCount *= baseDecay * agePenalty;
      if (node.totalCount < 0.01) {
        removeNodeLabels.push(node.label);
      }
    }
    for (const label of removeNodeLabels) {
      this.graphNodes.delete(label);
    }

    const removeEdgeKeys: string[] = [];
    for (const [key, edge] of this.graphEdges.entries()) {
      const ageSeconds = Math.max(0, now - edge.lastCooccurAt);
      const agePenalty = Math.exp(-0.004 * ageSeconds);
      edge.weight *= baseDecay * agePenalty;
      if (edge.weight < 0.01) {
        removeEdgeKeys.push(key);
      }
    }
    for (const key of removeEdgeKeys) {
      this.graphEdges.delete(key);
    }
  }

  private buildGlobalGraphSummary(maxNodes: number = 5, maxEdges: number = 5) {
    const nodeArr: ConceptSummary[] = [];
    for (const node of this.graphNodes.values()) {
      if (node.totalCount > 0.01) {
        nodeArr.push({ label: node.label, weight: node.totalCount });
      }
    }
    nodeArr.sort((a, b) => b.weight - a.weight);

    const edgeArr: EdgeSummary[] = [];
    for (const edge of this.graphEdges.values()) {
      if (edge.weight > 0.01) {
        edgeArr.push({ a: edge.a, b: edge.b, weight: edge.weight });
      }
    }
    edgeArr.sort((a, b) => b.weight - a.weight);

    return {
      concepts: nodeArr.slice(0, maxNodes),
      edges: edgeArr.slice(0, maxEdges)
    };
  }

  private classifyWorldMood(summary: { concepts: ConceptSummary[]; edges: EdgeSummary[] }): string {
    const byLabel: { [label: string]: number } = {};
    for (const c of summary.concepts) {
      byLabel[c.label] = (byLabel[c.label] || 0) + c.weight;
    }

    const curiosity = byLabel["curiosity"] || 0;
    const danger = byLabel["danger"] || 0;
    const calm = byLabel["calm"] || 0;
    const total = curiosity + danger + calm;

    if (total < 1) return "empty";

    if (danger > curiosity && danger > calm) {
      if (curiosity > 0.3 * danger) return "tense curiosity";
      return "anxious / threatened";
    }

    if (curiosity >= danger && curiosity >= calm) {
      if (danger > 0.5 * curiosity) return "exploratory but wary";
      return "curious / exploratory";
    }

    if (calm >= danger && calm > curiosity) {
      if (danger > 0.3 * calm) return "calm with distant tensions";
      return "calm / settled";
    }

    return "mixed / shifting";
  }

  private estimateWorldMoodStrength(summary: { concepts: ConceptSummary[]; edges: EdgeSummary[] }) {
    const conceptWeight = summary.concepts.reduce((sum, c) => sum + c.weight, 0);
    const edgeWeight = summary.edges.reduce((sum, e) => sum + e.weight, 0);
    const dominant = summary.concepts[0]?.weight || 0;
    const total = conceptWeight + 0.4 * edgeWeight;
    if (total <= 0) return 0;

    const dominanceFactor = dominant > 0 ? dominant / Math.max(1, conceptWeight) : 0;
    return this.clamp01(total * 0.08 + dominanceFactor * 0.3);
  }

  private updateWorldMoodMemory() {
    const summary = this.buildGlobalGraphSummary();
    this.globalGraphSummary = summary;

    const moodLabel = this.classifyWorldMood(summary);
    const strength = this.estimateWorldMoodStrength(summary);
    const now = this.world.timeSeconds;
    const timeSinceGraphActivity = this.lastGraphActivityAt > 0 ? now - this.lastGraphActivityAt : Infinity;
    const hasFreshSignal = strength > 0.02 && timeSinceGraphActivity < 120;
    const prevStability = this.worldMoodMemory?.stability ?? strength;

    if (!this.worldMoodMemory) {
      this.worldMoodMemory = {
        mood: hasFreshSignal ? moodLabel : "empty",
        stability: hasFreshSignal ? strength : 0,
        lastChangeAt: now,
        lastSeenAt: hasFreshSignal ? now : 0
      };
      this.worldMoodTrend = "steady";
      return;
    }

    const memory = this.worldMoodMemory;
    const timeSinceChange = now - memory.lastChangeAt;
    const lowSignal = strength < 0.06;
    const lastSeenAt = memory.lastSeenAt ?? 0;
    const timeSinceSeen = hasFreshSignal ? 0 : now - lastSeenAt;

    let mood = memory.mood;
    let stability = Math.max(memory.stability * (lowSignal ? 0.9 : 0.97), strength);

    // If the shard has been quiet for a while, gently bleed stability and
    // eventually clear the mood back to empty so downstream cues know the
    // feeling is fading out instead of frozen in time.
    if (!hasFreshSignal && timeSinceSeen > 60) {
      const stalePenalty = Math.exp(-0.0025 * (timeSinceSeen - 60));
      stability *= stalePenalty;
      if (timeSinceSeen > 150 && stability < 0.15) {
        mood = "empty";
      }
    }

    if (moodLabel !== memory.mood) {
      const allowChange = strength > memory.stability * 0.6 || timeSinceChange > 45 || moodLabel === "empty";
      if (allowChange) {
        mood = moodLabel;
        stability = Math.max(strength, stability * 0.7);
        this.worldMoodMemory = { mood, stability, lastChangeAt: now, lastSeenAt: hasFreshSignal ? now : lastSeenAt };
        this.worldMoodTrend = stability > prevStability + 0.05 ? "rising" : stability < prevStability - 0.05 ? "fading" : "steady";
        return;
      }
    }

    if (lowSignal && timeSinceChange > 60 && mood !== "empty") {
      mood = "empty";
      stability = Math.max(stability * 0.5, strength);
      this.worldMoodMemory = { mood, stability, lastChangeAt: now, lastSeenAt: hasFreshSignal ? now : lastSeenAt };
      this.worldMoodTrend = stability > prevStability + 0.05 ? "rising" : stability < prevStability - 0.05 ? "fading" : "steady";
      return;
    }

    this.worldMoodMemory = {
      mood,
      stability: Math.min(1, stability + strength * 0.12),
      lastChangeAt: memory.lastChangeAt,
      lastSeenAt: hasFreshSignal ? now : lastSeenAt
    };
    this.worldMoodTrend = stability > prevStability + 0.05 ? "rising" : stability < prevStability - 0.05 ? "fading" : "steady";
  }

  private getWorldMoodSnapshot(now: number) {
    if (!this.worldMoodMemory) {
      return { mood: "empty", confidence: 0, sinceSeconds: 0, signalQuality: "stale", trend: "steady" } as MoodSnapshot;
    }

    const timeSinceSeen = now - (this.worldMoodMemory.lastSeenAt ?? 0);
    const signalQuality =
      timeSinceSeen > 150
        ? "stale"
        : timeSinceSeen > 90
        ? "fragile"
        : this.worldMoodMemory.stability > 0.7
        ? "strong"
        : this.worldMoodMemory.stability > 0.35
        ? "steady"
        : "fragile";

    return {
      mood: this.worldMoodMemory.mood,
      confidence: this.worldMoodMemory.stability,
      sinceSeconds: now - this.worldMoodMemory.lastChangeAt,
      signalQuality,
      trend: this.worldMoodTrend
    } as MoodSnapshot;
  }

  private buildNarrativeLines(
    selfMood: MoodSnapshot,
    resonance: ResonanceState | undefined,
    graphSummary: { concepts: ConceptSummary[]; edges: EdgeSummary[] } | undefined,
    conceptEchoes?: ConceptEcho[],
    ambientZones?: FrameAmbientZone[],
    atmosphere?: FrameAtmosphere,
    worldMoodSnapshot?: MoodSnapshot
  ): string[] {
    const lines: string[] = [];

    if (selfMood && selfMood.mood && selfMood.mood !== "neutral") {
      const confidenceLabel =
        selfMood.confidence >= 0.75
          ? "strong"
          : selfMood.confidence >= 0.4
          ? "steady"
          : "fragile";
      const duration = selfMood.sinceSeconds > 12 ? "lingering" : "fresh";
      lines.push(`You feel ${selfMood.mood} (${confidenceLabel}, ${duration}).`);
    }

    if (resonance && resonance.local > 0.1) {
      const labels = resonance.labels || {};
      const parts: string[] = [];
      const top = Object.entries(labels)
        .filter(([_, v]) => v > 0.01)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      for (const [label] of top) {
        parts.push(label);
      }
      if (parts.length > 0) {
        lines.push(`Local field is saturated with ${parts.join(", ")}.`);
      }
    }

    if (graphSummary) {
      const mood = worldMoodSnapshot?.mood ?? this.classifyWorldMood(graphSummary);
      const confidence = worldMoodSnapshot?.confidence ?? 0;
      const worldMoodAge = worldMoodSnapshot?.sinceSeconds ?? 0;
      const signalQuality = worldMoodSnapshot?.signalQuality;
      const trend = worldMoodSnapshot?.trend;
      const strongest = graphSummary.concepts[0]?.label;
      const second = graphSummary.concepts[1]?.label;

      if (mood !== "empty") {
        if (strongest && second) {
          lines.push(
            `The world remembers mostly ${strongest}, intertwined with ${second}.`
          );
        } else if (strongest) {
          lines.push(`The world remembers mostly ${strongest}.`);
        } else {
          lines.push(`The world mood is ${mood}.`);
        }

        if (confidence > 0.15) {
          const tone =
            confidence > 0.7 ? "steady" : confidence > 0.35 ? "forming" : "fragile";
          const durationLabel =
            worldMoodAge > 120 ? "long-held" : worldMoodAge > 30 ? "settling" : "newly forming";
          lines.push(
            `World feeling is ${tone} (${(confidence * 100).toFixed(0)}% signal, ${durationLabel}).`
          );
        } else if (signalQuality === "stale") {
          lines.push("World feeling is faint — the shard waits for new memories.");
        }

        if (trend && trend !== "steady") {
          const trendText = trend === "rising" ? "growing clearer" : "dissolving";
          lines.push(`World feeling is ${trendText}.`);
        }
      }
    }

    if (conceptEchoes && conceptEchoes.length > 0) {
      const echo = conceptEchoes[0];
      const age = echo.ageSeconds;
      const ageText =
        age < 6
          ? "just now"
          : age < 18
          ? "moments ago"
          : `${age.toFixed(0)}s ago`;
      const distanceText = echo.distance <= 2
        ? "right here"
        : `${echo.distance.toFixed(0)}m away`;
      lines.push(`A ${echo.label} ripple lingers ${distanceText}, cast ${ageText}.`);
    }

    if (ambientZones && ambientZones.length > 0) {
      const nearest = ambientZones[0];
      const distanceText = nearest.distance <= 1
        ? "around you"
        : `~${nearest.distance.toFixed(0)}m away`;
      const tone = nearest.moodHint ? ` It feels ${nearest.moodHint}.` : "";
      lines.push(`You sense the ${nearest.label} ${distanceText}.${tone}`);
    }

    if (atmosphere) {
      const fogHint =
        atmosphere.fogDensity > 0.7
          ? "Mist thickens, hiding edges of the shard."
          : atmosphere.fogDensity > 0.4
          ? "A low fog softens distances."
          : "Air stays clear enough to see far.";
      const phaseLine = `Sky drifts toward ${atmosphere.phase}; ${fogHint}`;
      lines.push(phaseLine);

      if (atmosphere.foamPeak > 0.6) {
        const foamLine = atmosphere.foamEnergy > 0.9
          ? "The foam underfoot thrums, carrying echoes through the shard."
          : "The foam softly ripples beneath, storing whispers of motion.";
        lines.push(foamLine);
      }
    }

    // Keep it short
    return lines.slice(0, 3);
  }


  // ---------------------------
  // Foam helpers
  // ---------------------------

  private worldToFoamIndices(position: Vec3): [number, number] | null {
    const x = position[0];
    const z = position[2];

    const minX = -FOAM_HALF_EXTENT;
    const minZ = -FOAM_HALF_EXTENT;

    const fx = (x - minX) / FOAM_CELL_SIZE;
    const fz = (z - minZ) / FOAM_CELL_SIZE;

    const ix = Math.floor(fx);
    const iz = Math.floor(fz);

    if (
      ix < 0 ||
      iz < 0 ||
      ix >= this.world.foam.width ||
      iz >= this.world.foam.height
    ) {
      return null;
    }

    return [ix, iz];
  }

  private addFoamSourceAt(position: Vec3, amount: number) {
    const idx = this.worldToFoamIndices(position);
    if (!idx) return;
    const [ix, iz] = idx;
    const grid = this.world.foam;
    const index = iz * grid.width + ix;
    grid.values[index] += amount;
  }

  private sampleAmbientZoneIntensity(zone: AmbientFoamZone): number {
    const t = this.world.timeSeconds + zone.pulseOffset;
    const period = Math.max(4, zone.pulsePeriod);
    const phase = (t / period) * Math.PI * 2;
    const oscillation = 0.5 + 0.5 * Math.sin(phase);
    return zone.baseIntensity * (0.6 + 0.4 * oscillation);
  }

  private applyAmbientFoamZones(dt: number) {
    for (const zone of this.ambientFoamZones) {
      const intensity = this.sampleAmbientZoneIntensity(zone);
      const spread = Math.min(zone.radius * 0.4, 25);
      const centers: Vec3[] = [
        zone.position,
        [zone.position[0] + spread, zone.position[1], zone.position[2]],
        [zone.position[0] - spread, zone.position[1], zone.position[2]],
        [zone.position[0], zone.position[1], zone.position[2] + spread],
        [zone.position[0], zone.position[1], zone.position[2] - spread]
      ];

      const perSource = (intensity * dt) / centers.length;
      for (const center of centers) {
        this.addFoamSourceAt(center, perSource);
      }
    }
  }

  private injectAmbientConcepts() {
    const now = this.world.timeSeconds;
    for (const zone of this.ambientFoamZones) {
      const cadence = Math.max(1.5, Math.min(6, zone.pulsePeriod * 0.3));
      const last = this.ambientConceptCooldown.get(zone.id) || -Infinity;
      if (now - last < cadence) continue;

      const intensity = this.sampleAmbientZoneIntensity(zone);
      const label = zone.conceptLabel || zone.label;
      const strength = 0.25 + 0.12 * intensity;

      this.injectConcept(label, undefined, strength, zone.position);
      this.ambientConceptCooldown.set(zone.id, now);
    }
  }

  private stepFoam(dt: number) {
    const grid = this.world.foam;
    const w = grid.width;
    const h = grid.height;
    const values = grid.values;
    const scratch = grid.scratch;

    for (let z = 1; z < h - 1; z++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = z * w + x;
        const center = values[idx];
        const left = values[idx - 1];
        const right = values[idx + 1];
        const up = values[idx - w];
        const down = values[idx + w];

        const laplacian = left + right + up + down - 4 * center;
        let next = center + FOAM_DIFFUSION * laplacian * dt;
        scratch[idx] = next;
      }
    }

    // borders
    for (let x = 0; x < w; x++) {
      const topIdx = x;
      const bottomIdx = (h - 1) * w + x;
      scratch[topIdx] = values[topIdx];
      scratch[bottomIdx] = values[bottomIdx];
    }
    for (let z = 0; z < h; z++) {
      const leftIdx = z * w;
      const rightIdx = z * w + (w - 1);
      scratch[leftIdx] = values[leftIdx];
      scratch[rightIdx] = values[rightIdx];
    }

    const decayFactor = Math.max(0, 1 - FOAM_DECAY * dt);
    for (let i = 0; i < w * h; i++) {
      let v = scratch[i] * decayFactor;
      if (v < 0) v = 0;
      values[i] = v;
    }
  }

  private buildFoamPatchAround(position: Vec3, patchSize: number = 31): FoamPatch | undefined {
    const centerIdx = this.worldToFoamIndices(position);
    if (!centerIdx) return undefined;

    const grid = this.world.foam;
    const [cx, cz] = centerIdx;

    const size = Math.min(patchSize, Math.min(grid.width, grid.height));
    const half = Math.floor(size / 2);

    const values2D: number[][] = [];

    for (let dz = -half; dz <= half; dz++) {
      const row: number[] = [];
      for (let dx = -half; dx <= half; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        let v = 0;
        if (gx >= 0 && gz >= 0 && gx < grid.width && gz < grid.height) {
          const idx = gz * grid.width + gx;
          v = grid.values[idx];
        }
        row.push(v);
      }
      values2D.push(row);
    }

    return {
      width: values2D[0]?.length ?? 0,
      height: values2D.length,
      cellSize: grid.cellSize,
      values: values2D
    };
  }

  private sampleFoamStatsAround(position: Vec3, radius: number = 20) {
    const centerIdx = this.worldToFoamIndices(position);
    if (!centerIdx) return { mean: 0, peak: 0, count: 0 };

    const [cx, cz] = centerIdx;
    const grid = this.world.foam;
    const r = Math.max(1, Math.floor(radius / grid.cellSize));

    let sum = 0;
    let peak = 0;
    let count = 0;

    for (let z = Math.max(0, cz - r); z <= Math.min(grid.height - 1, cz + r); z++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(grid.width - 1, cx + r); x++) {
        const idx = z * grid.width + x;
        const v = grid.values[idx];
        sum += v;
        if (v > peak) peak = v;
        count++;
      }
    }

    const mean = count > 0 ? sum / count : 0;
    return { mean, peak, count };
  }

  // ---------------------------
  // Resonance & perception helpers
  // ---------------------------

  private buildConceptsAround(position: Vec3, radius: number = 60): PerceivedConcept[] {
    const out: PerceivedConcept[] = [];
    const now = this.world.timeSeconds;

    for (const c of this.conceptImpulses) {
      const age = now - c.createdAt;
      if (age < 0 || age > CONCEPT_TTL_SECONDS) continue;

      const dx = c.position[0] - position[0];
      const dy = c.position[1] - position[1];
      const dz = c.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;

      const ageFactor = 1 - age / CONCEPT_TTL_SECONDS;
      const spatialFactor = 1 / (1 + dist / 10);
      const strength = c.baseStrength * ageFactor * spatialFactor;

      if (strength <= 0.001) continue;

      out.push({
        label: c.label,
        relativePosition: [dx, dy, dz],
        strength
      });
    }

    out.sort((a, b) => b.strength - a.strength);
    return out;
  }

  private buildConceptEchoesAround(
    position: Vec3,
    radius: number = 120,
    horizonSeconds: number = 90,
    maxEntries: number = 8
  ): ConceptEcho[] {
    const now = this.world.timeSeconds;
    const echoes: ConceptEcho[] = [];

    for (const impulse of this.conceptImpulses) {
      const age = now - impulse.createdAt;
      if (age < 0 || age > horizonSeconds) continue;

      const dx = impulse.position[0] - position[0];
      const dy = impulse.position[1] - position[1];
      const dz = impulse.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;

      const ageFactor = 1 - age / horizonSeconds;
      const spatialFactor = 1 / (1 + dist / 20);
      const strength = impulse.baseStrength * ageFactor * spatialFactor;

      if (strength <= 0.01) continue;

      echoes.push({
        label: impulse.label,
        distance: dist,
        ageSeconds: age,
        strength,
        direction: [dx, dy, dz]
      });
    }

    echoes.sort((a, b) => b.strength - a.strength);
    return echoes.slice(0, maxEntries);
  }

  private buildLocalResonance(position: Vec3): ResonanceState {
    const concepts = this.buildConceptsAround(position, 60);
    const labels: { [label: string]: number } = {};
    let sum = 0;

    for (const c of concepts) {
      labels[c.label] = (labels[c.label] || 0) + c.strength;
      sum += c.strength;
    }

    return { local: sum, labels };
  }

  private buildAmbientZonesAround(
    position: Vec3,
    radius: number = 200,
    maxEntries: number = 4
  ): FrameAmbientZone[] {
    const readings: FrameAmbientZone[] = [];

    for (const zone of this.ambientFoamZones) {
      const dx = zone.position[0] - position[0];
      const dy = zone.position[1] - position[1];
      const dz = zone.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const edgeDistance = Math.max(0, dist - zone.radius);
      if (edgeDistance > radius) continue;

      readings.push({
        label: zone.label,
        flavor: zone.flavor,
        radius: zone.radius,
        distance: edgeDistance,
        intensity: this.sampleAmbientZoneIntensity(zone),
        moodHint: zone.moodHint
      });
    }

    readings.sort((a, b) => a.distance - b.distance);
    return readings.slice(0, maxEntries);
  }

  private clamp01(v: number) {
    return Math.min(1, Math.max(0, v));
  }

  private lerpHex(a: string, hexB: string, t: number) {
    const ca = parseInt(a.replace("#", ""), 16);
    const cb = parseInt(hexB.replace("#", ""), 16);
    const ar = (ca >> 16) & 0xff;
    const ag = (ca >> 8) & 0xff;
    const ab = ca & 0xff;
    const br = (cb >> 16) & 0xff;
    const bg = (cb >> 8) & 0xff;
    const bb = cb & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bChannel = Math.round(ab + (bb - ab) * t);
    return `#${((r << 16) | (g << 8) | bChannel).toString(16).padStart(6, "0")}`;
  }

  private pickSkyTint(phase: string, skyLight: number, foamEnergy: number) {
    const dawn = "#82b8ff";
    const day = "#a4e0ff";
    const dusk = "#f7a08a";
    const night = "#0d1024";
    const foamGlow = "#7cf2c7";

    let base = night;
    if (phase.includes("dawn")) base = this.lerpHex(night, dawn, 0.6);
    else if (phase.includes("dusk")) base = this.lerpHex(night, dusk, 0.7);
    else if (phase.includes("day")) base = day;

    const foamFactor = this.clamp01(foamEnergy * 0.4);
    const withFoam = this.lerpHex(base, foamGlow, foamFactor * 0.45);
    return this.lerpHex(withFoam, day, skyLight * 0.2);
  }

  private buildAtmosphereCue(
    position: Vec3,
    ambientZones: FrameAmbientZone[] = [],
    worldMood?: string
  ): FrameAtmosphere {
    const foam = this.sampleFoamStatsAround(position, 24);
    const cycleSeconds = 240;
    const dayFrac = (this.world.timeSeconds % cycleSeconds) / cycleSeconds;
    const sunWave = Math.sin(dayFrac * Math.PI * 2);
    const skyLight = this.clamp01((sunWave + 1) / 2);
    const twilight = Math.abs(sunWave);
    const phase =
      skyLight < 0.2
        ? "night"
        : sunWave > 0.4
        ? "bright day"
        : sunWave > 0.05
        ? "late day"
        : sunWave > -0.05
        ? "dawn"
        : sunWave > -0.4
        ? "dusk"
        : "night";

    let fogDensity = 0.12 + (1 - skyLight) * 0.4 + foam.mean * 0.12;
    const mood = (worldMood || "").toLowerCase();
    if (mood.includes("anxious") || mood.includes("tense")) {
      fogDensity += 0.08;
    } else if (mood.includes("calm") || mood.includes("settled")) {
      fogDensity *= 0.82;
    }
    fogDensity += (1 - twilight) * 0.05;
    fogDensity = this.clamp01(fogDensity);
    const atmosphere: FrameAtmosphere = {
      foamEnergy: foam.mean,
      foamPeak: foam.peak,
      skyLight,
      fogDensity,
      phase,
      skyTint: this.pickSkyTint(phase, skyLight, foam.mean)
    };

    if (ambientZones.length > 0) {
      const nearest = ambientZones[0];
      atmosphere.nearestAnomaly = {
        label: nearest.label,
        distance: nearest.distance,
        intensity: nearest.intensity,
        moodHint: nearest.moodHint
      };
    }

    return atmosphere;
  }

  private buildChatLogAround(position: Vec3, radius: number = 80, maxEntries = 10): FrameChatMessage[] {
    const now = this.world.timeSeconds;
    const out: FrameChatMessage[] = [];

    for (const message of this.chatMessages) {
      const dx = message.position[0] - position[0];
      const dy = message.position[1] - position[1];
      const dz = message.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;

      const age = now - message.createdAt;
      out.push({
        text: message.text,
        name: message.name,
        color: message.color,
        distance: dist,
        ageSeconds: age,
        moodHints: message.moodHints
      });
    }

    out.sort((a, b) => a.ageSeconds - b.ageSeconds);
    return out.slice(0, maxEntries);
  }

  private classifyMood(resonance: ResonanceState): string {
    const labels = resonance.labels || {};
    const curiosity = labels["curiosity"] || 0;
    const danger = labels["danger"] || 0;
    const calm = labels["calm"] || 0;

    // Dominant label decides base mood
    const maxVal = Math.max(curiosity, danger, calm, resonance.local);

    if (maxVal < 0.01) return "neutral";

    if (danger === maxVal && danger > curiosity && danger > calm) {
      if (danger > 2 * calm) return "afraid";
      return "uneasy";
    }

    if (curiosity === maxVal && curiosity > danger && curiosity > calm) {
      if (curiosity > 2 * calm) return "hyper-curious";
      return "curious";
    }

    if (calm === maxVal && calm > danger && calm >= curiosity) {
      if (danger < calm * 0.5) return "calm";
      return "alert but calm";
    }

    return "mixed";
  }

  private estimateMoodStrength(resonance: ResonanceState): number {
    const labels = resonance.labels || {};
    const curiosity = labels["curiosity"] || 0;
    const danger = labels["danger"] || 0;
    const calm = labels["calm"] || 0;

    return Math.max(curiosity, danger, calm, Math.abs(resonance.local));
  }

  private cleanupMoodMemory(maxAgeSeconds: number = 300) {
    const now = this.world.timeSeconds;
    for (const [entityId, entry] of this.moodMemory.entries()) {
      const stillExists = this.world.components.transform.has(entityId);
      const stale = now - entry.lastSeenAt > maxAgeSeconds;
      if (!stillExists || stale) {
        this.moodMemory.delete(entityId);
      }
    }
  }

  private classifyMoodForEntity(entityId: EntityId, resonance: ResonanceState): MoodSnapshot {
    const baseMood = this.classifyMood(resonance);
    const moodStrength = this.estimateMoodStrength(resonance);
    const now = this.world.timeSeconds;
    const memory = this.moodMemory.get(entityId);

    if (!memory) {
      const stability = Math.min(1, moodStrength);
      this.moodMemory.set(entityId, {
        mood: baseMood,
        lastChangeAt: now,
        stability,
        lastSeenAt: now
      });
      return { mood: baseMood, confidence: stability, sinceSeconds: 0 };
    }

    const timeSinceChange = now - memory.lastChangeAt;
    const lowSignal = moodStrength < 0.05;
    let mood = memory.mood;
    let stability = Math.max(memory.stability * (lowSignal ? 0.9 : 0.95), moodStrength);

    if (baseMood !== memory.mood) {
      const allowChange = stability >= 0.2 || timeSinceChange > 8 || baseMood === "mixed";

      if (allowChange) {
        mood = baseMood;
        stability = Math.max(stability, moodStrength);
        this.moodMemory.set(entityId, {
          mood,
          lastChangeAt: now,
          stability,
          lastSeenAt: now
        });
        return { mood, confidence: Math.min(1, stability), sinceSeconds: 0 };
      }
    }

    if (lowSignal && mood !== "neutral" && timeSinceChange > 12) {
      mood = "neutral";
      stability = Math.max(stability * 0.6, moodStrength);
      this.moodMemory.set(entityId, {
        mood,
        lastChangeAt: now,
        stability,
        lastSeenAt: now
      });
      return { mood, confidence: Math.min(1, stability), sinceSeconds: 0 };
    }

    // reinforce current mood memory while tracking last seen time
    const reinforcedStability = Math.min(1, lowSignal ? stability : stability + 0.05 * moodStrength);

    this.moodMemory.set(entityId, {
      mood,
      lastChangeAt: memory.lastChangeAt,
      stability: reinforcedStability,
      lastSeenAt: now
    });

    return { mood, confidence: reinforcedStability, sinceSeconds: timeSinceChange };
  }


  // ---------------------------
  // Perception
  // ---------------------------

  public getPerceptualFrame(entityId: EntityId, radius: number = 200): PerceptualFrame | null {
    const transform = this.world.components.transform.get(entityId);
    const body = this.world.components.physics_body.get(entityId);
    if (!transform || !body) return null;

    const position = transform.position;
    const velocity = body.velocity;
    const selfSignature = this.getEntitySignature(entityId);

    const nearbyEntities: PerceivedEntity[] = [];

    for (const [otherId, otherTransform] of this.world.components.transform) {
      if (otherId === entityId) continue;
      const op = otherTransform.position;
      const dx = op[0] - position[0];
      const dy = op[1] - position[1];
      const dz = op[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= radius) {
        const sig = this.getEntitySignature(otherId);
        nearbyEntities.push({
          id: otherId,
          relativePosition: [dx, dy, dz],
          distance: dist,
          name: sig?.name,
          color: sig?.color
        });
      }
    }
    const foamPatch = this.buildFoamPatchAround(position, 31);
    const concepts = this.buildConceptsAround(position, 60);
    const conceptEchoes = this.buildConceptEchoesAround(position, 140, 90, 6);
    const resonance = this.buildLocalResonance(position);
    const ambientZones = this.buildAmbientZonesAround(position, 200, 4);
    const graphSummary = this.globalGraphSummary || this.buildGlobalGraphSummary();
    const worldMoodSnapshot = this.getWorldMoodSnapshot(this.world.timeSeconds);
    const worldMood = worldMoodSnapshot.mood;
    const atmosphere = this.buildAtmosphereCue(position, ambientZones, worldMood);
    const selfMood = this.classifyMoodForEntity(entityId, resonance);
    const narrative = this.buildNarrativeLines(
      selfMood,
      resonance,
      graphSummary,
      conceptEchoes,
      ambientZones,
      atmosphere,
      worldMoodSnapshot
    );
    const chatLog = this.buildChatLogAround(position, 120, 12);

    return {
      tick: this.world.tick,
      timeSeconds: this.world.timeSeconds,
      self: {
        id: entityId,
        position: [...position] as Vec3,
        velocity: [...velocity] as Vec3,
        name: selfSignature?.name,
        color: selfSignature?.color,
        mood: selfMood.mood,
        moodConfidence: selfMood.confidence,
        moodSince: selfMood.sinceSeconds
      },
      nearbyEntities,
      foamPatch,
      concepts,
      conceptEchoes,
      resonance,
      ambientZones,
      graphSummary,
      atmosphere,
      narrative,
      worldMood,
      worldMoodConfidence: worldMoodSnapshot.confidence,
      worldMoodSince: worldMoodSnapshot.sinceSeconds,
      worldMoodSignalQuality: worldMoodSnapshot.signalQuality,
      worldMoodTrend: worldMoodSnapshot.trend,
      chatLog
    };

  }

  // ---------------------------
  // Main Simulation Loop
  // ---------------------------

  public start() {
    if (this.running) return;
    this.running = true;

    const tickSeconds = this.world.universe.time.tick_seconds;
    const tickMs = tickSeconds * 1000;
    console.log(`[CRK] Starting simulation with Δt=${tickSeconds}s`);

    const loop = () => {
      if (!this.running) return;
      const start = Date.now();

      this.step(tickSeconds);

      const elapsed = Date.now() - start;
      const delay = Math.max(0, tickMs - elapsed);
      setTimeout(loop, delay);
    };

    loop();
  }

  public stop() {
    this.running = false;
    console.log("[CRK] Stopped simulation.");
  }

  private step(dt: number) {
    this.world.tick += 1;
    this.world.timeSeconds += dt;

    this.cleanupMoodMemory();
    this.updateMinds(dt);
    this.updatePhysics(dt);
    this.updateFoam(dt);
    this.updateConcepts();
    this.updateChatMessages();
    this.updateThoughtGraphCooccurrences();
    this.decayGraphMemory(dt);
    this.updateWorldMoodMemory();
    this.resolveInteractions();
    this.emitTickSummary();
  }

  // ---------------------------
  // Mind / AI update (now resonance-aware)
// ---------------------------

  private updateMinds(dt: number) {
    const moveSpeed = 5; // m/s

    // External controlled
    for (const entityId of this.controlledEntities) {
      const input = this.controlInputs.get(entityId);
      if (!input) continue;

      const body = this.world.components.physics_body.get(entityId);
      if (!body) continue;

      const move = input.move;
      const mx = move[0];
      const mz = move[2];
      const mag = Math.sqrt(mx * mx + mz * mz);
      let vx = body.velocity[0];
      let vz = body.velocity[2];

      if (mag > 0.0001) {
        const nx = mx / mag;
        const nz = mz / mag;
        vx = nx * moveSpeed;
        vz = nz * moveSpeed;
      } else {
        vx *= 0.8;
        vz *= 0.8;
      }

      body.velocity = [vx, body.velocity[1], vz];
    }

    // AI wander — biased by local resonance
    for (const [entityId, state] of this.aiWanderStates.entries()) {
      const body = this.world.components.physics_body.get(entityId);
      const transform = this.world.components.transform.get(entityId);
      if (!body || !transform) continue;

      const resonance = this.buildLocalResonance(transform.position);
      const labels = resonance.labels;
      const curiosity = labels["curiosity"] || 0;
      const danger = labels["danger"] || 0;
      const calm = labels["calm"] || 0;

      state.timeToChange -= dt;
      if (state.timeToChange <= 0) {
        // Base: random wander
        let targetAngle = Math.random() * Math.PI * 2;
        let speedFactor = 0.7;

        // If curiosity dominates, bias toward other agents (approach)
        if (curiosity > danger && curiosity > calm) {
          const nearest = this.findNearestEntity(entityId);
          if (nearest) {
            const dx = nearest.position[0] - transform.position[0];
            const dz = nearest.position[2] - transform.position[2];
            targetAngle = Math.atan2(dz, dx);
            speedFactor = 0.9;
          }
        }

        // If danger dominates, bias away from center of local concepts
        if (danger > curiosity && danger > calm) {
          const center = this.estimateConceptCenter(transform.position, "danger");
          if (center) {
            const dx = transform.position[0] - center[0];
            const dz = transform.position[2] - center[2];
            targetAngle = Math.atan2(dz, dx);
            speedFactor = 1.1;
          }
        }

        // If calm dominates, slow down & sometimes stop
        if (calm > curiosity && calm > danger) {
          speedFactor = 0.3;
          if (Math.random() < 0.4) {
            state.move = [0, 0, 0];
          } else {
            state.move = [Math.cos(targetAngle), 0, Math.sin(targetAngle)];
          }
        } else {
          state.move = [Math.cos(targetAngle), 0, Math.sin(targetAngle)];
        }

        state.timeToChange = 1 + Math.random() * 3;

        // apply immediately this step
        const mx = state.move[0];
        const mz = state.move[2];
        const mag = Math.sqrt(mx * mx + mz * mz);
        if (mag > 0.0001) {
          const nx = mx / mag;
          const nz = mz / mag;
          body.velocity = [
            nx * moveSpeed * speedFactor,
            body.velocity[1],
            nz * moveSpeed * speedFactor
          ];
        }
      } else {
        // between re-targets, just keep current direction with damping
        body.velocity = [
          body.velocity[0] * 0.99,
          body.velocity[1],
          body.velocity[2] * 0.99
        ];
      }
    }
  }

  private findNearestEntity(entityId: EntityId): { id: EntityId; position: Vec3 } | null {
    const myTransform = this.world.components.transform.get(entityId);
    if (!myTransform) return null;

    let bestId: EntityId | null = null;
    let bestDist = Infinity;

    for (const [otherId, t] of this.world.components.transform.entries()) {
      if (otherId === entityId) continue;
      const dx = t.position[0] - myTransform.position[0];
      const dy = t.position[1] - myTransform.position[1];
      const dz = t.position[2] - myTransform.position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = otherId;
      }
    }

    if (bestId === null) return null;
    const bestT = this.world.components.transform.get(bestId)!;
    return { id: bestId, position: bestT.position };
  }

  private estimateConceptCenter(origin: Vec3, label: string): Vec3 | null {
    const now = this.world.timeSeconds;
    let sx = 0, sy = 0, sz = 0, sw = 0;

    for (const c of this.conceptImpulses) {
      if (c.label !== label) continue;
      const age = now - c.createdAt;
      if (age < 0 || age > CONCEPT_TTL_SECONDS) continue;

      const dx = c.position[0] - origin[0];
      const dy = c.position[1] - origin[1];
      const dz = c.position[2] - origin[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 80) continue;

      const ageFactor = 1 - age / CONCEPT_TTL_SECONDS;
      const spatialFactor = 1 / (1 + dist / 10);
      const w = c.baseStrength * ageFactor * spatialFactor;

      sx += c.position[0] * w;
      sy += c.position[1] * w;
      sz += c.position[2] * w;
      sw += w;
    }

    if (sw <= 0.0001) return null;
    return [sx / sw, sy / sw, sz / sw];
  }

  // ---------------------------
  // Physics / Foam / Concepts
  // ---------------------------

  private updatePhysics(dt: number) {
    const gravity = this.rdl.rules.physics.gravity;

    for (const [entity, body] of this.world.components.physics_body) {
      if (!body.dynamic) continue;

      body.velocity = [
        body.velocity[0] + gravity[0] * dt,
        body.velocity[1] + gravity[1] * dt,
        body.velocity[2] + gravity[2] * dt
      ];

      const transform = this.world.components.transform.get(entity);
      if (!transform) continue;

      transform.position = [
        transform.position[0] + body.velocity[0] * dt,
        transform.position[1] + body.velocity[1] * dt,
        transform.position[2] + body.velocity[2] * dt
      ];

      const bounds = this.world.universe.space.bounds;
      const p = transform.position;
      transform.position = [
        Math.min(bounds.x[1], Math.max(bounds.x[0], p[0])),
        Math.min(bounds.y[1], Math.max(bounds.y[0], p[1])),
        Math.min(bounds.z[1], Math.max(bounds.z[0], p[2]))
      ];
    }
  }

  private updateFoam(dt: number) {
    // deposit from all entities with minds
    for (const [entityId, _mind] of this.world.components.mind.entries()) {
      const transform = this.world.components.transform.get(entityId);
      if (!transform) continue;
      this.addFoamSourceAt(transform.position, 2.0 * dt);
    }

    this.applyAmbientFoamZones(dt);
    this.injectAmbientConcepts();
    this.stepFoam(dt);
  }

  private updateConcepts() {
    const now = this.world.timeSeconds;
    this.conceptImpulses = this.conceptImpulses.filter(
      c => now - c.createdAt < CONCEPT_TTL_SECONDS
    );
  }

  private updateChatMessages() {
    const now = this.world.timeSeconds;
    const ttl = 60; // seconds
    this.chatMessages = this.chatMessages.filter(msg => now - msg.createdAt < ttl);
  }

  private resolveInteractions() {
    // Placeholder for collisions / rules
  }

  private emitTickSummary() {
    if (this.world.tick % 200 === 0) {
      console.log(
        `[CRK] Tick=${this.world.tick} t=${this.world.timeSeconds.toFixed(
          2
        )}s entities=${this.world.components.transform.size}`
      );
    }
  }
}

// ---------------------------
// Optional local demo entry
// ---------------------------

if (require.main === module) {
  const rdlPath = process.argv[2] || "./spec/rdl/rdl-core-v0.1.json";
  const kernel = new CoreRealityKernel(rdlPath);
  kernel.start();
  setTimeout(() => kernel.stop(), 10000);
}
