/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

declare module '*.geojson?url' {
  const url: string;
  export default url;
}

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?url' {
  const url: string;
  export default url;
}
