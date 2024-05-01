import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { generateFromGraph, generateStartTestImage, handleGraphCommit, handleGraphPregenerate, handleGraphPreload, handleGraphRender } from './generate-from-graph';
import { generateZoomOverview } from './generate-zoom-overview';
import { testOverpass } from './overpass';
import { LogLevel, replaceLoggingFunctions, setLoglevel } from './logger';
import loadGraph from './graph';
import { loadRenderData } from './render-layer-definitions';

const cliUsage = `Usage: ${process.argv.slice(0, 2).join(' ')} <command> [args]

<command> might be one of:

  help                            Show this text
  usage                           Show this text

  testimage <graph file> <vertex id> <output filename>
                                  Generate a test frame render for the vertex
                                  with given ID of the provided graph

  graph pregenerate <f> <n>       Pregenerate the graph frame definitions
  graph preload     <f> <n>       Preload OpenStreetMap data for the graph
  graph render      <f> <n> <d>   Render the edges. <d> is a running index,
                                  each process only renders one edge for memory
                                  purposes. The process exits with a non-zero
                                  status if <d> is larger than the number of
                                  edges. Then, all edges have been rendered,
                                  assuming it is called sequentially with each
                                  index.
  graph commit      <f> <n>       Write the finished graph to the client/data directory

  The "graph *" commands must be executed in the given order, as their
  intermediate outputs depend on previous stages' outputs. These commands take
  two mandatory arguments: the file name of the graph file to use, and the
  graph's final name.
`;


replaceLoggingFunctions();
setLoglevel(LogLevel.INFO);

main();


async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(cliUsage);
    process.exit(1);
  }

  switch (args[0]) {
    case 'help':
    case 'usage':
      console.error(cliUsage);
      process.exit(0);
      break;

    case 'testimage':
      await handleTestImage(args.slice(1));
      break;

    case 'graph':
      await handleGraph(args.slice(1));
      break;

    default:
      console.error(cliUsage);
      process.exit(1);
      break;
  }
}


async function handleGraph(
  args: Array<string>,
) {
  if (args.length < 3 || !['pregenerate', 'preload', 'render', 'commit'].includes(args[0])) {
    console.error(cliUsage);
    process.exit(1);
  }

  const [action, graphFilePath, graphName, ...restArgs] = args;

  if (!/^[a-zA-Z0-9_-]+$/.test(graphName)) {
    console.error(`Graph name may only contain letters, numbers, underscore and dash!`);
    process.exit(1);
  }

  const tempPath = await calculateGenerationTemporaryDirectoryPath(graphFilePath, graphName);

  switch (action) {
    case 'pregenerate':
      await handleGraphPregenerate(
        tempPath,
        graphFilePath,
        graphName,
      );
      break;
    case 'preload':
      await handleGraphPreload(
        tempPath,
        graphFilePath,
        graphName,
      );
      break;
    case 'render':
      const index = parseInt(restArgs[0]);
      const didRenderEdge = await handleGraphRender(
        tempPath,
        graphFilePath,
        graphName,
        index,
      );
      if (!didRenderEdge) process.exit(1);  // notify script that all edges are rendered
      break;
    case 'commit':
      await handleGraphCommit(
        tempPath,
        graphFilePath,
        graphName,
      );
      break;
    default:
      console.error(cliUsage);
      process.exit(1);
  }

  // TODO: split up executable functions:
  // 1. load graph, generate frames for edges
  // 2. preload OSM features for bboxes
  // 3. (for each edge) render edge
  // 4. write graph JSON


  //console.log(`Generating transitions from graph file "${graphFilePath}" to graph with name "${graphName}".`);


  //const graph = await loadGraph(graphFilePath);

  //const renderData = await loadRenderData();
  //await generateStartTestImage(graph, renderData, graphName);
  //await generateFromGraph(graph, renderData, graphName, { framesPause: 15, framesForHalfRotation: 60, framesPerTransition: 60 });
  //await generateZoomOverview(renderData);
  //await testOverpass();
}


async function handleTestImage(
  args: Array<string>,
) {
  if (args.length !== 3) {
    console.error(cliUsage);
    process.exit(1);
  }

  const graph = await loadGraph(args[0]);
  const renderData = await loadRenderData();
  await generateStartTestImage(graph, args[1], renderData, args[2]);
}


/**
 * Using a hash of the graph file and the graph name, determine the temporary
 * directory for the generation cycles. If the directory exists already, use
 * it. Otherwise, generate it first.
 */
async function calculateGenerationTemporaryDirectoryPath(
  graphFilePath: string,
  graphName: string,
): Promise<string> {
  const graphText = await readFile(graphFilePath, { encoding: 'utf-8' });
  const hasher = createHash('MD5');
  hasher.update(graphText);
  hasher.update(graphName);
  const hash = hasher.digest('hex');

  const hashedPartOfFileName = `-temp-${graphName}-${hash}`;

  // check if temporary directory exists
  try {
    const dirs = await readdir('cache');
    const dir = dirs.find(v => v.includes(hashedPartOfFileName));
    if (dir) {
      return resolve('cache', dir);
    }
    throw new Error('Cache directory does not exist');
  } catch (_err) {
    const dateString = new Date().toISOString().replace(/[^0-9]/g, '');
    const day = dateString.slice(0, 8);
    const time = dateString.slice(8, 14);

    const pathName = `${day}T${time}${hashedPartOfFileName}`;
    const path = resolve('cache', pathName);
    await mkdir(path, { recursive: true });

    return path;
  }
}