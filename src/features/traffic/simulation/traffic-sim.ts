// Explicit `.ts` extension so this module can also be loaded directly by Node
// for headless verification of the simulation, which cannot be checked by
// looking at the rendered scene. Bundler resolution handles it either way.
import { pointOnEdge, type RoadGraph } from './road-graph.ts';

/**
 * Traffic simulation.
 *
 * **This is simulated data, not a measurement.** No free, open, real-time
 * congestion feed exists for Jakarta (TomTom, HERE and Google traffic are paid
 * and licence-restricted, and OpenStreetMap carries no congestion data), so
 * vehicle positions and the congestion levels derived from them are generated
 * here. Every surface that displays them is labelled SIMULATED.
 *
 * What is real: the road network the vehicles drive on, including geometry,
 * classification, lane counts and one-way restrictions.
 *
 * Design notes:
 *
 * - Deterministic. A seeded PRNG means the same density setting produces the
 *   same traffic, so a frame-rate measurement is repeatable and a vehicle does
 *   not teleport when React happens to re-render.
 * - Vehicles are stored in flat typed arrays and stepped in one pass, so the
 *   per-frame cost stays proportional to the vehicle count with no allocation.
 * - Congestion is an emergent count per edge, not a number invented per road:
 *   vehicles slow down where they are dense, which makes them denser still.
 */

export type VehicleType = 'motorcycle' | 'car' | 'van' | 'bus' | 'truck';

export interface VehicleTypeSpec {
  readonly type: VehicleType;
  readonly label: string;
  /** Share of the fleet, 0..1. Must sum to 1 across the table. */
  readonly share: number;
  /** Length, width and height in metres. */
  readonly size: readonly [number, number, number];
  /** Multiplier on the road's free-flow speed. */
  readonly speedFactor: number;
  readonly colour: string;
}

/**
 * Fleet mix.
 *
 * Motorcycle-dominant, which is what Jakarta's traffic actually looks like —
 * a fleet of mostly cars would misrepresent the city even in a simulation.
 * The exact proportions are a plausible assumption, not a measured statistic,
 * which is part of why the whole layer is labelled SIMULATED.
 */
export const VEHICLE_TYPES: readonly VehicleTypeSpec[] = [
  {
    type: 'motorcycle',
    label: 'Motorcycle',
    share: 0.6,
    size: [1.9, 0.8, 1.1],
    speedFactor: 1.05,
    colour: '#8ea2bd',
  },
  {
    type: 'car',
    label: 'Car',
    share: 0.26,
    size: [4.3, 1.8, 1.5],
    speedFactor: 1,
    colour: '#b9c6d8',
  },
  {
    type: 'van',
    label: 'Van',
    share: 0.07,
    size: [5.4, 2, 2.2],
    speedFactor: 0.9,
    colour: '#9aa8b8',
  },
  {
    type: 'bus',
    label: 'Bus',
    share: 0.04,
    size: [11, 2.5, 3.1],
    speedFactor: 0.8,
    colour: '#6f8aa8',
  },
  {
    type: 'truck',
    label: 'Truck',
    share: 0.03,
    size: [7.5, 2.4, 2.9],
    speedFactor: 0.75,
    colour: '#7d8a99',
  },
] as const;

/**
 * Vehicles per kilometre of road at density 1.0.
 *
 * Tuned so that density 1.0 lands just at the hard cap for this study area's
 * ~65 km of road. An earlier value of 95 saturated the cap at density 0.5,
 * which made the top half of the slider do nothing at all.
 */
const VEHICLES_PER_KM_AT_FULL = 22;

/** Hard cap, so a dense network cannot spawn an unbounded fleet. */
const MAX_VEHICLES = 1400;

/** Congestion at or above this fraction of capacity is "severe". */
export const CONGESTION_SEVERE = 0.8;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VehicleSnapshot {
  readonly type: VehicleType;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export class TrafficSimulation {
  private readonly graph: RoadGraph;
  private readonly random: () => number;

  /** Per-vehicle state, in parallel arrays. */
  private edgeIndex: Int32Array;
  private offset: Float32Array;
  private forward: Uint8Array;
  private typeIndex: Uint8Array;
  /** Per-vehicle speed preference, so identical vehicles do not move in lockstep. */
  private speedBias: Float32Array;
  /** Lateral offset from the centreline, to suggest lanes. */
  private lateral: Float32Array;

  private count = 0;

  /** Live vehicle count per edge, recomputed each step. */
  private readonly edgeLoad: Int32Array;
  /** Smoothed congestion per edge, 0..1. */
  private readonly edgeCongestion: Float32Array;

  constructor(graph: RoadGraph, seed = 0x51a2a7c3) {
    this.graph = graph;
    this.random = mulberry32(seed);

    this.edgeIndex = new Int32Array(0);
    this.offset = new Float32Array(0);
    this.forward = new Uint8Array(0);
    this.typeIndex = new Uint8Array(0);
    this.speedBias = new Float32Array(0);
    this.lateral = new Float32Array(0);

    this.edgeLoad = new Int32Array(graph.edges.length);
    this.edgeCongestion = new Float32Array(graph.edges.length);
  }

  /** Target vehicle count for a density setting, 0..1. */
  targetCount(density: number): number {
    const km = this.graph.totalLengthM / 1000;
    const clamped = Math.min(1, Math.max(0, density));
    return Math.min(MAX_VEHICLES, Math.round(km * VEHICLES_PER_KM_AT_FULL * clamped));
  }

  get vehicleCount(): number {
    return this.count;
  }

  /** Resize the fleet, keeping existing vehicles where possible. */
  setDensity(density: number): void {
    const target = this.targetCount(density);
    if (target === this.count) return;

    if (target > this.capacity()) this.grow(Math.max(target, 16));

    if (target > this.count) {
      for (let i = this.count; i < target; i += 1) this.spawn(i);
    }

    this.count = target;
  }

  private capacity(): number {
    return this.edgeIndex.length;
  }

  private grow(size: number): void {
    const grown = {
      edgeIndex: new Int32Array(size),
      offset: new Float32Array(size),
      forward: new Uint8Array(size),
      typeIndex: new Uint8Array(size),
      speedBias: new Float32Array(size),
      lateral: new Float32Array(size),
    };

    grown.edgeIndex.set(this.edgeIndex);
    grown.offset.set(this.offset);
    grown.forward.set(this.forward);
    grown.typeIndex.set(this.typeIndex);
    grown.speedBias.set(this.speedBias);
    grown.lateral.set(this.lateral);

    this.edgeIndex = grown.edgeIndex;
    this.offset = grown.offset;
    this.forward = grown.forward;
    this.typeIndex = grown.typeIndex;
    this.speedBias = grown.speedBias;
    this.lateral = grown.lateral;
  }

  /** Pick a vehicle type by its share of the fleet. */
  private pickType(): number {
    const roll = this.random();
    let cumulative = 0;
    for (let i = 0; i < VEHICLE_TYPES.length; i += 1) {
      cumulative += VEHICLE_TYPES[i].share;
      if (roll <= cumulative) return i;
    }
    return 0;
  }

  private spawn(index: number): void {
    const edges = this.graph.edges;
    if (edges.length === 0) return;

    // Weight placement by edge length so vehicles spread over the network
    // rather than clustering on short service roads.
    let pick = this.random() * this.graph.totalLengthM;
    let chosen = 0;
    for (let i = 0; i < edges.length; i += 1) {
      pick -= edges[i].lengthM;
      if (pick <= 0) {
        chosen = i;
        break;
      }
    }

    const edge = edges[chosen];
    const forward = edge.oneway ? 1 : this.random() < 0.5 ? 1 : 0;
    const typeIndex = this.pickType();

    this.edgeIndex[index] = chosen;
    this.offset[index] = this.random() * edge.lengthM;
    this.forward[index] = forward;
    this.typeIndex[index] = typeIndex;
    this.speedBias[index] = 0.82 + this.random() * 0.36;

    // Offset from the centreline: right-hand side of travel, since Indonesia
    // drives on the left... which means the near side is the left. Keeping the
    // sign tied to direction is what stops oncoming vehicles overlapping.
    const half = Math.max(1.2, edge.widthM / 2 - 1.4);
    this.lateral[index] = edge.oneway
      ? (this.random() - 0.5) * half
      : (forward ? 1 : -1) * half * 0.5;
  }

  /**
   * Advance the simulation.
   *
   * `dt` is clamped: a backgrounded tab resumes with a large delta, and without
   * a clamp every vehicle would jump hundreds of metres, often past a junction
   * it should have turned at.
   */
  step(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.25);
    if (dt === 0 || this.count === 0) return;

    const edges = this.graph.edges;
    const outgoing = this.graph.outgoing;

    this.edgeLoad.fill(0);
    for (let i = 0; i < this.count; i += 1) {
      this.edgeLoad[this.edgeIndex[i]] += 1;
    }

    // Smooth congestion toward the instantaneous load so the colour ramp does
    // not flicker as vehicles cross edge boundaries.
    for (let e = 0; e < edges.length; e += 1) {
      const instant = Math.min(1, this.edgeLoad[e] / edges[e].capacity);
      this.edgeCongestion[e] += (instant - this.edgeCongestion[e]) * 0.08;
    }

    for (let i = 0; i < this.count; i += 1) {
      const edge = edges[this.edgeIndex[i]];
      const congestion = this.edgeCongestion[this.edgeIndex[i]];

      // Congested edges are slower, which is what makes queues form and
      // persist instead of vehicles passing through each other unaffected.
      const congestionFactor = 1 - Math.min(0.82, congestion * 0.95);
      const spec = VEHICLE_TYPES[this.typeIndex[i]];
      const speed =
        edge.freeFlowMs * spec.speedFactor * this.speedBias[i] * congestionFactor;

      let offset = this.offset[i] + speed * dt;

      if (offset >= edge.lengthM) {
        // Reached the end: turn onto a connected edge.
        const exitNode = this.forward[i] ? edge.toNode : edge.fromNode;
        const options = outgoing[exitNode];

        if (options && options.length > 0) {
          const nextIndex = options[Math.floor(this.random() * options.length)];
          const next = edges[nextIndex];
          const enteringAtStart = next.fromNode === exitNode;

          // A one-way edge can only be entered at its start; if the only
          // option is a one-way facing the wrong way, stay put and turn around.
          if (next.oneway && !enteringAtStart) {
            this.forward[i] = this.forward[i] ? 0 : 1;
            offset = 0;
          } else {
            this.edgeIndex[i] = nextIndex;
            this.forward[i] = enteringAtStart ? 1 : 0;
            offset = 0;

            const half = Math.max(1.2, next.widthM / 2 - 1.4);
            this.lateral[i] = next.oneway
              ? (this.random() - 0.5) * half
              : (enteringAtStart ? 1 : -1) * half * 0.5;
          }
        } else {
          // Dead end: reverse along the same edge.
          this.forward[i] = this.forward[i] ? 0 : 1;
          offset = 0;
        }
      }

      this.offset[i] = offset;
    }
  }

  /**
   * Write current positions into caller-owned arrays, grouped by vehicle type.
   *
   * Returns the number written per type. The caller keeps one instanced mesh
   * per type, so this avoids rebuilding any arrays per frame.
   */
  writePositions(
    buffers: readonly { x: Float32Array; z: Float32Array; heading: Float32Array }[],
  ): number[] {
    const written = VEHICLE_TYPES.map(() => 0);

    for (let i = 0; i < this.count; i += 1) {
      const typeIndex = this.typeIndex[i];
      const buffer = buffers[typeIndex];
      if (!buffer) continue;

      const slot = written[typeIndex];
      if (slot >= buffer.x.length) continue;

      const edge = this.graph.edges[this.edgeIndex[i]];
      const point = pointOnEdge(edge, this.offset[i], this.forward[i] === 1);

      // Shift sideways, perpendicular to the heading, to suggest lanes.
      const lateral = this.lateral[i];
      buffer.x[slot] = point.x + Math.cos(point.heading) * lateral;
      buffer.z[slot] = point.z - Math.sin(point.heading) * lateral;
      buffer.heading[slot] = point.heading;

      written[typeIndex] = slot + 1;
    }

    return written;
  }

  /** Smoothed congestion per edge, 0..1, index-aligned with `graph.edges`. */
  get congestion(): Float32Array {
    return this.edgeCongestion;
  }

  /** Mean congestion across edges that currently carry a vehicle. */
  meanCongestion(): number {
    let sum = 0;
    let used = 0;
    for (let e = 0; e < this.edgeCongestion.length; e += 1) {
      if (this.edgeLoad[e] > 0) {
        sum += this.edgeCongestion[e];
        used += 1;
      }
    }
    return used === 0 ? 0 : sum / used;
  }

  /** Number of edges at or above the severe congestion threshold. */
  severeEdgeCount(): number {
    let count = 0;
    for (let e = 0; e < this.edgeCongestion.length; e += 1) {
      if (this.edgeCongestion[e] >= CONGESTION_SEVERE) count += 1;
    }
    return count;
  }
}
