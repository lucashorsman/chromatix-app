declare module 'butterchurn' {
  export interface VisualizerOptions {
    width: number;
    height: number;
    pixelRatio?: number;
    textureRatio?: number;
    meshWidth?: number;
    meshHeight?: number;
  }

  export interface Visualizer {
    connectAudio(audioNode: AudioNode): void;
    disconnectAudio(audioNode: AudioNode): void;
    loadPreset(presetMap: any, blendTime?: number): void;
    setRendererSize(width: number, height: number, opts?: any): void;
    render(opts?: any): void;
    launchSongTitleAnim(text: string): void;
  }

  interface ButterchurnStatic {
    createVisualizer(audioContext: AudioContext, canvas: HTMLCanvasElement, options: VisualizerOptions): Visualizer;
  }

  const butterchurn: ButterchurnStatic;
  export default butterchurn;
}

declare module 'butterchurn-presets' {
  interface ButterchurnPresetsStatic {
    getPresets(): Record<string, any>;
  }

  const butterchurnPresets: ButterchurnPresetsStatic;
  export default butterchurnPresets;
}
