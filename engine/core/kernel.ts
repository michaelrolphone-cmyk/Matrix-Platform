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

// ---------------------------
// World & perception
// ---------------------------

interface WorldState {
  tick: number;
  timeSeconds: number;
  universe: UniverseDef;
  components: Components;
  foam: FoamGrid;
}

interface InputState {
  move: Vec3;
}

interface PerceivedEntity {
  id: EntityId;
  relativePosition: Vec3;
  distance: number;
}

interface PerceptualFrame {
  tick: number;
  timeSeconds: number;
  self: {
    id: EntityId;
    position: Vec3;
    velocity: Vec3;
  };
  nearbyEntities: PerceivedEntity[];
  foamPatch?: FoamPatch;
  concepts?: PerceivedConcept[];
  resonance?: ResonanceState;
  graphSummary?: {
    concepts: ConceptSummary[];
    edges: EdgeSummary[];
  };
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

  // Concepts & Thought Graph
  private nextConceptId: number = 1;
  private conceptImpulses: ConceptImpulse[] = [];
  private graphNodes: Map<string, GraphNode> = new Map();
  private graphEdges: Map<string, GraphEdge> = new Map();

  constructor(rdlPath: string) {
    this.rdl = this.loadRdl(rdlPath);
    this.indexArchetypes(this.rdl.entity_archetypes);
    this.world = this.initWorld(this.rdl.universe);
    this.bootstrapWorldFromArchetypes(this.rdl.entity_archetypes);
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
      foam: this.createFoamGrid()
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

  public injectConcept(label: string, sourceEntityId?: EntityId, strength: number = 1) {
    let position: Vec3 = [0, 0, 0];
    if (sourceEntityId !== undefined) {
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

    console.log(
      `[CRK] Injected concept "${label}" at t=${this.world.timeSeconds.toFixed(
        2
      )} from entity ${sourceEntityId ?? "none"}`
    );
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
      }
    }
  }

  private buildGlobalGraphSummary(maxNodes: number = 5, maxEdges: number = 5) {
    const nodeArr: ConceptSummary[] = [];
    for (const node of this.graphNodes.values()) {
      nodeArr.push({ label: node.label, weight: node.totalCount });
    }
    nodeArr.sort((a, b) => b.weight - a.weight);

    const edgeArr: EdgeSummary[] = [];
    for (const edge of this.graphEdges.values()) {
      edgeArr.push({ a: edge.a, b: edge.b, weight: edge.weight });
    }
    edgeArr.sort((a, b) => b.weight - a.weight);

    return {
      concepts: nodeArr.slice(0, maxNodes),
      edges: edgeArr.slice(0, maxEdges)
    };
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

  // ---------------------------
  // Perception
  // ---------------------------

  public getPerceptualFrame(entityId: EntityId, radius: number = 50): PerceptualFrame | null {
    const transform = this.world.components.transform.get(entityId);
    const body = this.world.components.physics_body.get(entityId);
    if (!transform || !body) return null;

    const position = transform.position;
    const velocity = body.velocity;

    const nearbyEntities: PerceivedEntity[] = [];

    for (const [otherId, otherTransform] of this.world.components.transform) {
      if (otherId === entityId) continue;
      const op = otherTransform.position;
      const dx = op[0] - position[0];
      const dy = op[1] - position[1];
      const dz = op[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= radius) {
        nearbyEntities.push({
          id: otherId,
          relativePosition: [dx, dy, dz],
          distance: dist
        });
      }
    }

    const foamPatch = this.buildFoamPatchAround(position, 31);
    const concepts = this.buildConceptsAround(position, 60);
    const resonance = this.buildLocalResonance(position);
    const graphSummary = this.buildGlobalGraphSummary();

    return {
      tick: this.world.tick,
      timeSeconds: this.world.timeSeconds,
      self: {
        id: entityId,
        position: [...position] as Vec3,
        velocity: [...velocity] as Vec3
      },
      nearbyEntities,
      foamPatch,
      concepts,
      resonance,
      graphSummary
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

    this.updateMinds(dt);
    this.updatePhysics(dt);
    this.updateFoam(dt);
    this.updateConcepts();
    this.updateThoughtGraphCooccurrences();
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
    this.stepFoam(dt);
  }

  private updateConcepts() {
    const now = this.world.timeSeconds;
    this.conceptImpulses = this.conceptImpulses.filter(
      c => now - c.createdAt < CONCEPT_TTL_SECONDS
    );
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
