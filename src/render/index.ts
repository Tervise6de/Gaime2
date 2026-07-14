/**
 * Rendering layer.
 *
 * Canvas renderers that turn GameState into pixels. Pure of game logic — they
 * read state and draw; they never mutate the simulation. The node+edge renderer
 * is the always-available fallback; additional renderers register here.
 */

export * from "@/render/types";
export { nodeEdgeRenderer } from "@/render/nodeEdge";
export { voronoiRenderer } from "@/render/voronoi";
