const PROXY_MAP_INNER_SIZE = 80;
const PROXY_MAP_SHADOW_MARGIN = 10;

export const PROXY_MAP_SIZE = PROXY_MAP_INNER_SIZE + 2*PROXY_MAP_SHADOW_MARGIN;

export default class ProxyMap {
  readonly canvas: HTMLCanvasElement;

  constructor(
    readonly label: string,
    readonly image: ImageBitmap,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2 * PROXY_MAP_SHADOW_MARGIN + PROXY_MAP_INNER_SIZE;
    this.canvas.height = 2 * PROXY_MAP_SHADOW_MARGIN + PROXY_MAP_INNER_SIZE;
    this.canvas.setAttribute('title', this.label);

    this.render();
  }

  private render() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.translate(PROXY_MAP_SHADOW_MARGIN + PROXY_MAP_INNER_SIZE/2, PROXY_MAP_SHADOW_MARGIN + PROXY_MAP_INNER_SIZE/2);

    // shadow
    ctx.filter = `blur(${PROXY_MAP_SHADOW_MARGIN/2}px`;
    ctx.fillStyle='black';
    ctx.beginPath();
    ctx.arc(0, 0, PROXY_MAP_INNER_SIZE/2, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();

    // image
    ctx.filter = 'none';
    ctx.beginPath();
    ctx.arc(0, 0, PROXY_MAP_INNER_SIZE/2, 0, Math.PI * 2, false);
    ctx.clip();
    ctx.drawImage(this.image, -PROXY_MAP_INNER_SIZE/2, -PROXY_MAP_INNER_SIZE/2, PROXY_MAP_INNER_SIZE, PROXY_MAP_INNER_SIZE);
  }

  toImageData(): string {
    return this.canvas.toDataURL('png');
  }
};