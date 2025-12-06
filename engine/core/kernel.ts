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
  components: any; // we’ll refine later
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
  type: "external_controlled" | "ai_controlled";
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
// Kernel Class
// ---------------------------

export class CoreRealityKernel {
  private rdl: RDLCore;
  private world: WorldState;
  private nextEntityId: EntityId = 1;
  private running: boolean = false;

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
    // For v0.1, we’ll just create a single example entity for each archetype
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

    // 1. Apply mind/controller logic (not implemented yet)
    this.updateMinds(dt);

    // 2. Apply physics
    this.updatePhysics(dt);

    // 3. Apply interactions (collisions, etc.) - stub for now
    this.resolveInteractions();

    // 4. Emit state snapshot / events (for shards/clients)
    this.emitTickSummary();
  }

  private updateMinds(_dt: number) {
    // Placeholder:
    // - external_controlled: later hooked to client inputs
    // - ai_controlled: run AI brain/update behavior
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
    // For v0.1 we’ll skip actual collision and just log occasional info.
    // Later: broadphase + narrowphase + rule application.
  }

  private emitTickSummary() {
    if (this.world.tick % 100 === 0) {
      console.log(
        `[CRK] Tick=${this.world.tick} t=${this.world.timeSeconds.toFixed(2)}s ` +
        `entities=${this.world.components.transform.size}`
      );
    }
  }

  // ---------------------------
  // Public hooks (for shards/clients later)
  // ---------------------------

  public getWorldState(): WorldState {
    return this.world;
  }
}

// ---------------------------
// Script entry (for quick test)
// ---------------------------

if (require.main === module) {
  const rdlPath = process.argv[2] || "./spec/rdl/rdl-core-v0.1.json";
  const kernel = new CoreRealityKernel(rdlPath);
  kernel.start();

  // Stop after 10 seconds for a basic demo
  setTimeout(() => kernel.stop(), 10000);
}
