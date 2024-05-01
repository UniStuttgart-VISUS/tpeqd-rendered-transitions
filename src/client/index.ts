import { json, select } from 'd3';
import Animator from './animator';


const parsed = new URLSearchParams(document.location.search);
const graphId = parsed.get('graph') ?? 'stuv';

json<string[]>('graphs.json').then(availableGraphs => {
  availableGraphs!.sort((a, b) => a.localeCompare(b));
  select('header .graph-links')
    .selectAll('a')
    .data(availableGraphs!)
    .join('a')
      .attr('target', '_self')
      .attr('data-identity-link', d => (d === graphId) ? '' : null)
      .attr('href', d => `?${new URLSearchParams([['graph', d]]).toString()}`)
      .text(d => d);
});


const canvasParent = select<HTMLDivElement, any>('#canvas').node();

const animator = new Animator(canvasParent!);
await animator.loadGraph(graphId);