import { type Selection, select } from 'd3-selection';
import { json } from 'd3-fetch';
import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import { geoTwoPointEquidistant } from 'd3-geo-projection';

import type { Graph, Vertex } from '../common/datatypes';
import { CANVAS_SIZE } from '../common/constants';
import { generateProjection } from '../common/generate-projection';
import ProxyMap, { PROXY_MAP_SIZE } from './proxy-map';
import { edgeName, isReverse, transitionName } from '../common/names';

const CANVAS_PADDING = 150;

export default class Animator {
  readonly canvas: HTMLCanvasElement;
  readonly overlaySvg: SVGSVGElement;
  readonly overlay: Selection<SVGSVGElement, any, any, any>;
  readonly videoElement: HTMLVideoElement;

  // animation state
  private animationRunning: boolean = false;
  private currentVertexID: string = '';
  private currentTargetVertexID: string = '';

  private graphId: string = '@invalid';
  private graph?: Graph;
  private videos: Array<{
    id: string;
    metadata: any,
    fromImage: ImageBitmap,
    toImage: ImageBitmap,
  }> = [];
  private readonly proxyImages = new Map<string, string>();
  private availableEdgesPerVertex = new Map<string, Map<string, string>>();

  constructor(
    readonly canvasParent: HTMLDivElement,
  ) {
    this.videoElement = document.createElement('video');
    this.videoElement.setAttribute('width', CANVAS_SIZE.toString());
    this.videoElement.setAttribute('height', CANVAS_SIZE.toString());

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('width', CANVAS_SIZE.toString());
    this.canvas.setAttribute('height', CANVAS_SIZE.toString());
    this.canvas.setAttribute('id', 'frame-canvas');

    this.overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.overlaySvg.setAttribute('width', `${CANVAS_SIZE + 2 * CANVAS_PADDING}`);
    this.overlaySvg.setAttribute('height', `${CANVAS_SIZE + 2 * CANVAS_PADDING}`);
    this.overlaySvg.setAttribute('viewBox', `${-CANVAS_PADDING} ${-CANVAS_PADDING} ${CANVAS_SIZE + 2 * CANVAS_PADDING} ${CANVAS_SIZE + 2 * CANVAS_PADDING}`);

    this.canvasParent.replaceChildren(this.videoElement, this.canvas, this.overlaySvg);
    this.overlay = select<SVGSVGElement, any>(this.overlaySvg);
  }

  private renderFrame(
    frame: ImageBitmap | null,
    metadata: any,
  ) {
    const context = this.canvas.getContext('2d')!;
    if (frame === null) context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    else context.drawImage(frame, 0, 0);

    if (metadata) {
      const dir = 90 - (metadata.azimuth ?? 0);
      const dirRadians = dir * Math.PI / 180;
      const deltaDir = Math.PI * 3/180;

      const pos = (r: number, a: number) => `${Math.cos(a) * r + CANVAS_SIZE/2} ${-Math.sin(a) * r + CANVAS_SIZE/2}`;

      const data = [
        {
          fill: true,
          d: `
            M ${pos(CANVAS_SIZE/2 + 5, dirRadians+deltaDir)}
            L ${pos(CANVAS_SIZE/2 + 50, dirRadians)}
              ${pos(CANVAS_SIZE/2 + 10, dirRadians)}
            Z
          `,
        },
        {
          fill: false,
          d: `
            M ${pos(CANVAS_SIZE/2 + 10, dirRadians)}
            L ${pos(CANVAS_SIZE/2 + 5, dirRadians-deltaDir)}
              ${pos(CANVAS_SIZE/2 + 50, dirRadians)}
            Z
            L ${pos(CANVAS_SIZE/2, dirRadians)}
          `,
        },
      ]

      this.overlay.selectAll('.compass')
        .data(data)
        .join('path')
          .classed('compass', true)
          .attr('fill', d => d.fill ? 'firebrick' : 'none')
          .attr('stroke', 'firebrick')
          .attr('stroke-width', 2)
          .attr('d', d => d.d);

      this.overlay.selectAll('.border')
        .data([null])
        .join('circle')
          .classed('border', true)
          .attr('cx', CANVAS_SIZE/2)
          .attr('cy', CANVAS_SIZE/2)
          .attr('r', CANVAS_SIZE/2)
          .attr('fill', 'none')
          .attr('stroke', 'black')
          .attr('stroke-width', '2');

      // draw proxy maps
      // only proxy maps that can be reached from the target node of the current transition
      // neighbors of the origin node are only drawn in the main map
      const vertexIds = new Set<string>();
      vertexIds.add(this.currentVertexID);
      vertexIds.add(this.currentTargetVertexID);
      this.availableEdgesPerVertex.get(this.currentTargetVertexID)?.forEach((_, key) => vertexIds.add(key));

      const vertices = Array.from(vertexIds)
        .map(d => this.graph!.vertices[d]);
      const proj = generateProjection(metadata.projectionNodes);
      proj.translate(metadata.translate).scale(metadata.scale);
      /// XXX change in metadata
      {
        const [x, y] = metadata.translate;
        proj.translate([
          -x * metadata.scale + CANVAS_SIZE / 2,
          -y * metadata.scale + CANVAS_SIZE / 2,
        ]);
      }

      // mark on map
      const center = [CANVAS_SIZE/2, CANVAS_SIZE/2];
      const verticesWithDirection = vertices.map(d => {
        const position = proj(d.coords)!;
        const dx = position[0] - center[0];
        const dy = position[1] - center[1];
        const direction = Math.atan2(dy, dx);
        const distance2 = dx * dx + dy * dy;
        const distance = Math.sqrt(distance2);
        return {
          vertex: d,
          position,
          dx, dy,
          direction,
          distance,
        }
      });

      // draw neighbors of origin, but only in main map
      const originNeighbors = Array.from(this.availableEdgesPerVertex.get(this.currentVertexID) ?? [])
        .filter(([key, value]) => !vertexIds.has(key))
        .map(([key, value]) => {
          const vertex = this.graph!.vertices[key];
          const position = proj(vertex.coords)!;
          const dx = position[0] - center[0];
          const dy = position[1] - center[1];
          const direction = Math.atan2(dy, dx);
          const distance2 = dx * dx + dy * dy;
          return {
            vertex,
            position,
            dx, dy,
            direction,
            distance2,
          };
        })
        .filter(d => d.distance2 < CANVAS_SIZE * CANVAS_SIZE / 4);

      const verticesWithinMap = verticesWithDirection.filter(d => d.distance < CANVAS_SIZE / 2 - PROXY_MAP_SIZE / 2);
      const verticesOutsideMap = verticesWithDirection.filter(d => d.distance >= CANVAS_SIZE / 2 - PROXY_MAP_SIZE / 2);

      // markers in map
      this.overlay
        .selectAll('g.map-markers')
        .data([null])
        .join('g')
          .classed('map-markers', true)
        .selectAll('circle.map-marker')
        .data([...verticesWithinMap, ...originNeighbors])
        .join('circle')
          .classed('map-marker', true)
          .attr('r', 4)
          .attr('cx', d => d.position[0])
          .attr('cy', d => d.position[1])
          .attr('fill', 'red')
          .attr('stroke', 'black')
          .attr('stroke-width', 2);

      // proxies
      this.overlay
        .selectAll('g.proxies')
        .data([null])
        .join('g')
          .classed('proxies', true)
          .attr('transform', new DOMMatrix().translate(CANVAS_SIZE/2, CANVAS_SIZE/2).toString())
        .selectAll('image.proxy')
        .data(verticesOutsideMap)
        .join('image')
          .classed('proxy', true)
          .attr('transform', d => {

            // already show inset map when the inset's border touches the main
            // map border from the inside, then move it outwards until the
            // outer borders (including shadow margin) touch
            const proxyMapDistance = Math.min(
              CANVAS_SIZE / 2 + PROXY_MAP_SIZE / 2,
              d.distance,
            );

            return new DOMMatrix()
              // angular position of proxy map
              .rotate(d.direction * 180 / Math.PI)

              // radius position of proxy map
              .translate(proxyMapDistance, 0)

              // object rotation of proxy map
              .rotate(/*metadata.azimuth*/0 - (d.direction * 180 / Math.PI))

              // object rotation center of proxy map
              .translate(-PROXY_MAP_SIZE/2, -PROXY_MAP_SIZE/2)
              .toString();
          })
          .attr('width', PROXY_MAP_SIZE)
          .attr('height', PROXY_MAP_SIZE)
          .attr('href', d => this.proxyImages.get(d.vertex.id) ?? '')
          .each(function(d) {
            select(this)
              .selectAll('title')
              .data([d.vertex.label])
              .join('title')
              .text(e => e);
          })
          .attr('title', d => d.vertex.label)
          .on('click', (_, d) => this.startAnimation(d.vertex.id));
    }
  }

  async loadGraph(graphId: string) {
    this.graphId = graphId;
    const graph = await json<Graph>(`data/${graphId}/graph.json`);

    const availableEdgesPerVertex = new Map<string, Map<string, string>>();

    // TBD: load all at once
    const videos = await Promise.all(graph!.edges.map(async ([fromId, toId]) => {
      const from = graph!.vertices[fromId]!;
      const to = graph!.vertices[toId]!;
      const id = edgeName(from, to);
      const req = await fetch(`data/${graphId}/${id}.zip`);
      const zipFileReader = new BlobReader(await req.blob());
      const zipReader = new ZipReader(zipFileReader);

      const entries = await zipReader.getEntries();
      entries.sort((a, b) => a.filename.localeCompare(b.filename));
      const framePromises: Array<Promise<ImageBitmap | Array<SVGElement>>> = [];

      entries.forEach(entry => {
        if (entry.filename === 'metadata.json') return;

        const blobWriter = new BlobWriter();
        const data = entry.getData!(blobWriter);
        framePromises.push(data.then(blob => createImageBitmap(blob)));
      });

      const textWriter = new TextWriter();
      const metadataEntry = entries.find(d => d.filename === 'metadata.json');
      const metadataContent = await metadataEntry?.getData?.(textWriter) ?? '{}';
      const metadata = JSON.parse(metadataContent);

      const [fromImage, toImage] = await Promise.all(['from', 'to'].map(async (id: string): Promise<ImageBitmap> => {
        const blobWriter = new BlobWriter();
        const entry = entries.find(d => d.filename === `${id}.png`)!;
        const data = await entry.getData!(blobWriter);
        return await createImageBitmap(data);
      })) as [ImageBitmap, ImageBitmap];

      return {
        id,
        metadata,
        fromImage,
        toImage,
      }
    }));

    this.graph = graph;
    this.videos = videos;

    videos.forEach(video => {
      // populate proxy map images
      [
        [ video.metadata.from.id, video.fromImage ],
        [ video.metadata.to.id, video.toImage ],
      ].forEach(([id, image]) => {
        if (this.proxyImages.has(id)) return;

        const proxy = new ProxyMap(id, image);
        this.proxyImages.set(id, proxy.toImageData());
      });

      const { from, to, forwardFile, backwardFile } = video.metadata;
      // populate edge lookup table
      if (!availableEdgesPerVertex.has(from.id)) availableEdgesPerVertex.set(from.id, new Map<string, string>([[to.id, forwardFile]]));
      else availableEdgesPerVertex.get(from.id)?.set(to.id, forwardFile);
      if (!availableEdgesPerVertex.has(to.id)) availableEdgesPerVertex.set(to.id, new Map<string, string>([[from.id, backwardFile]]));
      else availableEdgesPerVertex.get(to.id)?.set(from.id, backwardFile);
    });

    this.availableEdgesPerVertex = availableEdgesPerVertex;

    this.animationRunning = false;
    this.currentVertexID = videos[0].metadata.from.id;
    this.currentTargetVertexID = this.currentVertexID;
    this.renderFrame(videos[0].fromImage, videos[0].metadata.frames[0]);
    this.updateButtons();
  }

  private updateButtons() {
    select('aside')
      .selectAll<HTMLButtonElement, [string, Vertex]>('.vertex-button')
      .data(Object.entries(this.graph?.vertices ?? []), d => d[0])
      .join('button')
      .classed('vertex-button', true)
      .text(d => d[1].label)
      .attr('disabled', d => {
        if (this.animationRunning) return '';
        if (d[0] === this.currentVertexID) return '';
        if (Object.values(this.graph?.edges ?? []).some(e => e.includes(d[0]) && e.includes(this.currentVertexID))) return null;  // XXX

        return '';
      })
      .on('click', (_e, d) => this.startAnimation(d[0]));

    select('main')
      .style('pointer-events', this.animationRunning ? 'none' : 'auto');
    select('main')
      .selectAll('svg image.proxy')
      .style('pointer-events', this.animationRunning ? 'none' : 'auto')
      .style('cursor', this.animationRunning ? 'auto' : 'pointer');
  }

  private async startAnimation(toId: string) {
    await new Promise<void>((resolve) => {
      const videoFileName = this.availableEdgesPerVertex.get(this.currentVertexID)?.get(toId) ?? ``;
      const edgeId = edgeName(this.currentVertexID, toId);
      const reverse = isReverse(this.currentVertexID, toId);

      const videoData = this.videos.find(d => d.id === edgeId)!;
      const metadata = [...videoData.metadata.frames];
      if (reverse) {
        metadata.reverse();
      }
      this.renderFrame(reverse ? videoData.toImage : videoData.fromImage, metadata[0]);

      // TODO: use Web Codecs API instead? also not supported on Firefox (yet)
      // https://developer.chrome.com/docs/web-platform/best-practices/webcodecs#decoding
      this.videoElement.setAttribute('src', `data/${this.graphId}/${videoFileName}`);
      this.videoElement.setAttribute('preload', 'auto');

      let animationId = 0;
      let idx = 0;
      this.currentTargetVertexID = toId;
      this.animationRunning = true;
      this.updateButtons();

      const targetEdges = Array.from(this.availableEdgesPerVertex.get(toId)?.entries() ?? [])
        .map(([key, fileName]) => {
          return `data/${this.graphId}/${fileName}`;
        });

      const preloadLinks = select<HTMLHeadElement, any>('head')
        .selectAll<HTMLLinkElement, any>('link.video-link');
      preloadLinks.data(targetEdges)
        .join('link')
        .classed('video-link', true)
        .attr('rel', 'prefetch')
        .attr('as', 'video')
        .attr('type', 'video/webm')
        .attr('href', d => d);

      if (this.videoElement['requestVideoFrameCallback'] !== undefined) {
        const onFrame = (now, frameMetadata) => {
          const idx = Math.round(frameMetadata.mediaTime * 60);
          this.renderFrame(null, metadata[idx]);
          animationId = this.videoElement.requestVideoFrameCallback(onFrame);
        }

        const onLoad = () => {
          // draw first frame
          this.renderFrame(null, metadata[0]);
          this.videoElement.play();
          animationId = this.videoElement.requestVideoFrameCallback(onFrame);
        }

        const onEnd = () => {
          this.videoElement.cancelVideoFrameCallback(animationId);

          this.animationRunning = false;
          this.currentVertexID = toId;  // must be done before renderFrame and updateButtons is called
          this.renderFrame(reverse ? videoData.fromImage : videoData.toImage, metadata[metadata.length - 1]);
          this.updateButtons();

          select<HTMLHeadElement, any>('head')
            .selectAll<HTMLLinkElement, any>('link.video-link')
            .attr('rel', 'preload');  // seriously load now

          resolve();
        }

        this.videoElement.addEventListener('loadeddata', onLoad, { once: true });
        this.videoElement.addEventListener('ended', onEnd, { once: true })

        this.videoElement.load();
      } else {
        console.warn('HTMLVideoElement#requestVideoFrameCallback is not supported in this browser. The synchronization between the video playback and the other UI might be subpar.');

        const onFrame = () => {
          this.renderFrame(null, metadata[idx]);

          idx++;
          if (idx >= metadata.length) onEnd();
          else animationId = requestAnimationFrame(onFrame);
        }

        const onLoad = () => {
          // draw first frame
          this.renderFrame(null, metadata[0]);
          this.videoElement.play();
          // XXX: until video.requestVideoFrameCallback() is supported in Firefox
          animationId = requestAnimationFrame(onFrame);
        }

        const onEnd = () => {
          cancelAnimationFrame(animationId);

          this.animationRunning = false;
          this.currentVertexID = toId;  // must be done before renderFrame and updateButtons is called
          this.renderFrame(reverse ? videoData.fromImage : videoData.toImage, metadata[metadata.length - 1]);
          this.updateButtons();

          select<HTMLHeadElement, any>('head')
            .selectAll<HTMLLinkElement, any>('link.video-link')
            .attr('rel', 'preload');  // seriously load now

          resolve();
        }

        this.videoElement.addEventListener('loadeddata', onLoad, { once: true });
        this.videoElement.addEventListener('ended', onEnd, { once: true })

        this.videoElement.load();
      }
    });
  }
};