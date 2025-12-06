// engine/core/kernel.ts

import fs from "fs";
import path from "path";

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
  components: any; // refine later
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
// ECS Core: Entities & Components
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
  type: "external_controlled" | "ai_controlled" | string;
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

interface WorldState {
  tick: number;
  timeSeconds: number;
  universe: UniverseDef;
  components: Components;
}

// ---------------------------
// Control & Perception
// ---------------------------

interface InputState {
  // desired movement direction in local/world space (for now world XZ)
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
}

// ---------------------------
// Kernel Class
// ---------------------------

export class CoreRealityKernel {
  private rdl: RDLCore;
  private world: WorldState;
  private nextEntityId: EntityId = 1;
  private running: boolean = false;

  private controlInputs: Map<EntityId, InputState> = new Map();
  private controlledEntities: Set<EntityId> = new Set();

  constructor(rdlPath: string) {
    this.rdl = this.loadRdl(rdlPath);
    this.world = this.initWorld(this.rdl.universe);
    this.bootstrapWorldFromArchetypes(this.rdl.entity_archetypes);
  }

  private loadRdl(rdlPath: string): RDLCore {
    const abs = path.resolve(rdlPath);
    const raw = fs.readFileSync(abs, "utf-8");
    const data = JSON.parse(raw);
    // TODO: add schema validation here
    return data as RDLCore;
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
      }
    };
  }

  private createEntity(): EntityId {
    const id = this.nextEntityId++;
    return id;
  }

  private bootstrapWorldFromArchetypes(archetypes: EntityArchetype[]) {
    for (const arch of archetypes) {
      const entity = this.createEntity();
      const comps = arch.components;

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
        this.world.components.mind.set(entity, {
          ...comps.mind
        });

        if (comps.mind.type === "external_controlled") {
          // Mark as potentially controllable
          this.controlledEntities.add(entity);
        }
      }

      if (comps.identity) {
        this.world.components.identity.set(entity, {
          ...comps.identity
        });
      }

      console.log(`[CRK] Spawned entity ${entity} from archetype "${arch.id}"`);
    }
  }

  // ---------------------------
  // Public control hooks
  // ---------------------------

  /**
   * Register an entity as actively controlled (e.g., by a logged-in human).
   */
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

  /**
   * Update the input state for a given entity (e.g., WASD movement).
   */
  public setInputState(entityId: EntityId, input: InputState) {
    if (!this.controlledEntities.has(entityId)) {
      this.registerControlledEntity(entityId);
    }
    this.controlInputs.set(entityId, input);
  }

  /**
   * Get the current world state snapshot (for debugging).
   */
  public getWorldState(): WorldState {
    return this.world;
  }

  /**
   * Build a perceptual frame for a given entity:
   * - self position/velocity
   * - nearby entities within a radius
   */
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

    return {
      tick: this.world.tick,
      timeSeconds: this.world.timeSeconds,
      self: {
        id: entityId,
        position: [...position] as Vec3,
        velocity: [...velocity] as Vec3
      },
      nearbyEntities
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

    // 1. Apply mind/controller logic
    this.updateMinds(dt);

    // 2. Apply physics
    this.updatePhysics(dt);

    // 3. Apply interactions (collisions, etc.) - stub for now
    this.resolveInteractions();

    // 4. Emit state snapshot / events (for shards/clients)
    this.emitTickSummary();
  }

  private updateMinds(dt: number) {
    // For external-controlled entities, translate input into velocity changes.
    const moveSpeed = 5; // m/s, base walking speed

    for (const entityId of this.controlledEntities) {
      const input = this.controlInputs.get(entityId);
      if (!input) continue;

      const body = this.world.components.physics_body.get(entityId);
      const transform = this.world.components.transform.get(entityId);
      if (!body || !transform) continue;

      const move = input.move;

      // Normalize move vector on XZ plane
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
        // No input → simple damping to stop sliding
        vx *= 0.8;
        vz *= 0.8;
      }

      body.velocity = [vx, body.velocity[1], vz];
    }
  }

  private updatePhysics(dt: number) {
    const gravity = this.rdl.rules.physics.gravity;

    for (const [entity, body] of this.world.components.physics_body) {
      if (!body.dynamic) continue;

      // Update velocity with gravity
      body.velocity = [
        body.velocity[0] + gravity[0] * dt,
        body.velocity[1] + gravity[1] * dt,
        body.velocity[2] + gravity[2] * dt
      ];

      // Integrate position
      const transform = this.world.components.transform.get(entity);
      if (!transform) continue;

      transform.position = [
        transform.position[0] + body.velocity[0] * dt,
        transform.position[1] + body.velocity[1] * dt,
        transform.position[2] + body.velocity[2] * dt
      ];

      // Basic bounds clamp to universe
      const bounds = this.world.universe.space.bounds;
      const p = transform.position;
      transform.position = [
        Math.min(bounds.x[1], Math.max(bounds.x[0], p[0])),
        Math.min(bounds.y[1], Math.max(bounds.y[0], p[1])),
        Math.min(bounds.z[1], Math.max(bounds.z[0], p[2]))
      ];
    }
  }

  private resolveInteractions() {
    // Placeholder for proper collision & interaction rules.
  }

  private emitTickSummary() {
    if (this.world.tick % 100 === 0) {
      console.log(
        `[CRK] Tick=${this.world.tick} t=${this.world.timeSeconds.toFixed(2)}s ` +
        `entities=${this.world.components.transform.size}`
      );
    }
  }
}

// ---------------------------
// Script entry (demo mode)
// ---------------------------

if (require.main === module) {
  const rdlPath = process.argv[2] || "./spec/rdl/rdl-core-v0.1.json";
  const kernel = new CoreRealityKernel(rdlPath);

  // Pick the first entity as controlled (for now)
  const world = kernel.getWorldState();
  const firstEntityId = Array.from(world.components.transform.keys())[0];
  if (firstEntityId !== undefined) {
    kernel.registerControlledEntity(firstEntityId);

    // Simple constant "forward" input on +X
    kernel.setInputState(firstEntityId, { move: [1, 0, 0] });
  }

  kernel.start();

  // Periodically log a perceptual frame for the controlled entity
  const logInterval = setInterval(() => {
    if (firstEntityId === undefined) return;
    const frame = kernel.getPerceptualFrame(firstEntityId, 50);
    if (frame) {
      console.log("[PERCEPT]", JSON.stringify(frame, null, 2));
    }
  }, 1000);

  // Stop after 10 seconds for demo
  setTimeout(() => {
    clearInterval(logInterval);
    kernel.stop();
  }, 10000);
}
