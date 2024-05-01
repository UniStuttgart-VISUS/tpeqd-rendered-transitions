import type { Vertex } from './datatypes';

export function edgeName(
  v1: Vertex | string,
  v2: Vertex | string,
): string {
  const arr = [
    (typeof v1 == 'string') ? v1 : v1.id,
    (typeof v2 == 'string') ? v2 : v2.id,
  ];
  arr.sort((a, b) => a.localeCompare(b));
  const [a, b] = arr;
  return `${a}__${b}`;
}

export function transitionName(
  v1: Vertex | string,
  v2: Vertex | string,
): string {
  const id1 = (typeof v1 == 'string') ? v1 : v1.id;
  const id2 = (typeof v2 == 'string') ? v2 : v2.id;
  return `transition_${id1}-${id2}.webm`;
}

export function isReverse(
  v1: Vertex | string,
  v2: Vertex | string,
): boolean {
  const arr = [
    (typeof v1 == 'string') ? v1 : v1.id,
    (typeof v2 == 'string') ? v2 : v2.id,
  ];
  const a0 = arr[0];
  arr.sort();
  return a0 !== arr[0];
}