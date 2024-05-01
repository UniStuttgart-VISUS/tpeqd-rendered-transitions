import { readFile } from "fs/promises";

import type { Graph } from "../common/datatypes";

export default async function loadGraph(
  filePath: string
): Promise<Graph> {
  const graphJson = await readFile(filePath, { encoding: 'utf-8' });
  const graph = JSON.parse(graphJson);

  console.debug(`Loaded graph with ${Object.entries(graph.vertices).length} vertices and ${Object.entries(graph.edges).length} edges from file "${filePath}".`)
  return graph as unknown as Graph;
}