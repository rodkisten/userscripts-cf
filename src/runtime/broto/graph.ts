import type { GraphEdge } from "@rodkisten/broto/types";

/** Tiny directed graph used by devtools, experiments and dependency inspection. */
export class Graph {
  private readonly edges = new Set<string>();

  /** Adds a directed edge. */
  add(from: string, to: string, label?: string): this {
    this.edges.add(JSON.stringify({ from, to, label } satisfies GraphEdge));
    return this;
  }

  /** Removes all edges. */
  clear(): void {
    this.edges.clear();
  }

  /** Returns all edges as plain data. */
  toJSON(): GraphEdge[] {
    return Array.from(this.edges, (edge) => JSON.parse(edge) as GraphEdge);
  }
}

/** Creates a graph instance. */
export function graph(): Graph {
  return new Graph();
}
