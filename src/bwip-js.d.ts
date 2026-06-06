declare module 'bwip-js' {
  interface RenderOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    textxalign?: string;
    textsize?: number;
    rotate?: string;
    [key: string]: any;
  }

  function toCanvas(canvas: HTMLCanvasElement | OffscreenCanvas | string, opts: RenderOptions): HTMLCanvasElement;
  function toSVG(opts: RenderOptions): string;

  export { toCanvas, toSVG, RenderOptions };
  export default { toCanvas, toSVG };
}
