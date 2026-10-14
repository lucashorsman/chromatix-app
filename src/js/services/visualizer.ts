// ======================================================================
// VISUALIZER SERVICE (BUTTERCHURN / MILKDROP 2 ENGINE)
// ======================================================================

import * as audioBridge from './audioBridge';

interface VisualizerState {
  isInitialized: boolean;
  currentPresetName: string;
  isAutoCycling: boolean;
  totalPresets: number;
}

let visualizerInstance: any = null;
let presetsMap: Record<string, any> = {};
let presetNames: string[] = [];
let currentPresetIndex = 0;
let autoCycleTimer: ReturnType<typeof setInterval> | null = null;
let currentCanvas: HTMLCanvasElement | null = null;

// ======================================================================
// INITIALISATION & SETUP
// ======================================================================

/**
 * Checks whether WebGL2 (required by Butterchurn) is supported by the client.
 */
export const isVisualizerSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch (_e) {
    return false;
  }
};

/**
 * Dynamically initialises the Butterchurn visualizer engine and preset pack.
 * Binds to the given canvas and connects to the global audio bridge graph.
 */
export const initVisualizer = async (
  canvas: HTMLCanvasElement,
  options: { width?: number; height?: number } = {}
): Promise<boolean> => {
  if (!isVisualizerSupported()) {
    console.warn('[visualizer] WebGL 2 not supported, visualizer disabled.');
    return false;
  }

  currentCanvas = canvas;

  try {
    const [butterchurnModule, presetsModule] = await Promise.all([
      import('butterchurn'),
      import('butterchurn-presets'),
    ]);

    const resolveButterchurn = (mod: any) => {
      if (typeof mod?.createVisualizer === 'function') return mod;
      if (typeof mod?.default?.createVisualizer === 'function') return mod.default;
      if (typeof mod?.default?.default?.createVisualizer === 'function') return mod.default.default;
      if (typeof window !== 'undefined' && typeof (window as any).butterchurn?.createVisualizer === 'function') {
        return (window as any).butterchurn;
      }
      if (typeof globalThis !== 'undefined' && typeof (globalThis as any).butterchurn?.createVisualizer === 'function') {
        return (globalThis as any).butterchurn;
      }
      return mod?.default || mod;
    };

    const resolvePresets = (mod: any): Record<string, any> => {
      if (typeof mod?.getPresets === 'function') return mod.getPresets();
      if (typeof mod?.default?.getPresets === 'function') return mod.default.getPresets();
      if (typeof mod?.default?.default?.getPresets === 'function') return mod.default.default.getPresets();
      if (typeof window !== 'undefined' && typeof (window as any).butterchurnPresets?.getPresets === 'function') {
        return (window as any).butterchurnPresets.getPresets();
      }
      if (typeof globalThis !== 'undefined' && typeof (globalThis as any).butterchurnPresets?.getPresets === 'function') {
        return (globalThis as any).butterchurnPresets.getPresets();
      }
      if (mod?.presets) return mod.presets;
      if (mod?.default?.presets) return mod.default.presets;
      return {};
    };

    const butterchurn = resolveButterchurn(butterchurnModule);
    if (!butterchurn || typeof butterchurn.createVisualizer !== 'function') {
      console.warn('[visualizer] createVisualizer not found on Butterchurn export.');
      return false;
    }

    audioBridge.ensureAudioGraph();
    const audioContext = audioBridge.getAudioContext();
    const audioSource = audioBridge.getAudioSourceNode();

    if (!audioContext) {
      console.warn('[visualizer] AudioContext could not be created.');
      return false;
    }

    const width = options.width || canvas.clientWidth || 800;
    const height = options.height || canvas.clientHeight || 600;

    visualizerInstance = butterchurn.createVisualizer(audioContext, canvas, {
      width,
      height,
      pixelRatio: 1,
      textureRatio: 1,
    });

    if (audioSource) {
      visualizerInstance.connectAudio(audioSource);
    }

    presetsMap = resolvePresets(presetsModule);
    presetNames = Object.keys(presetsMap);

    if (presetNames.length > 0) {
      // Pick a stunning default preset (or first available)
      const preferredPreset = 'Flexi, martin + geiss - dedicated to the sherwin maxawow';
      const idx = presetNames.indexOf(preferredPreset);
      currentPresetIndex = idx !== -1 ? idx : Math.floor(Math.random() * presetNames.length);
      visualizerInstance.loadPreset(presetsMap[presetNames[currentPresetIndex]], 0.0);
    }

    return true;
  } catch (err) {
    console.error('[visualizer] Failed to initialize Butterchurn:', err);
    return false;
  }
};

// ======================================================================
// PRESET MANAGEMENT
// ======================================================================

/**
 * Loads a preset by name with an optional cross-fade blend time in seconds.
 */
export const loadPreset = (presetName: string, blendTime: number = 2.0): boolean => {
  if (!visualizerInstance || !presetsMap[presetName]) return false;
  const idx = presetNames.indexOf(presetName);
  if (idx !== -1) currentPresetIndex = idx;
  visualizerInstance.loadPreset(presetsMap[presetName], blendTime);
  return true;
};

/**
 * Advances to the next visualizer preset with cross-fading.
 */
export const nextPreset = (blendTime: number = 2.0): string | null => {
  if (!visualizerInstance || presetNames.length === 0) return null;
  currentPresetIndex = (currentPresetIndex + 1) % presetNames.length;
  const name = presetNames[currentPresetIndex];
  visualizerInstance.loadPreset(presetsMap[name], blendTime);
  return name;
};

/**
 * Reverts to the previous visualizer preset with cross-fading.
 */
export const prevPreset = (blendTime: number = 2.0): string | null => {
  if (!visualizerInstance || presetNames.length === 0) return null;
  currentPresetIndex = (currentPresetIndex - 1 + presetNames.length) % presetNames.length;
  const name = presetNames[currentPresetIndex];
  visualizerInstance.loadPreset(presetsMap[name], blendTime);
  return name;
};

/**
 * Selects a random visualizer preset with cross-fading.
 */
export const randomPreset = (blendTime: number = 2.0): string | null => {
  if (!visualizerInstance || presetNames.length === 0) return null;
  currentPresetIndex = Math.floor(Math.random() * presetNames.length);
  const name = presetNames[currentPresetIndex];
  visualizerInstance.loadPreset(presetsMap[name], blendTime);
  return name;
};

/**
 * Returns the name of the currently active preset.
 */
export const getCurrentPresetName = (): string => {
  return presetNames[currentPresetIndex] || 'None';
};

/**
 * Returns the list of all available MilkDrop preset names.
 */
export const getPresetNames = (): string[] => {
  return presetNames;
};

// ======================================================================
// AUTO-CYCLE PRESETS
// ======================================================================

/**
 * Starts auto-cycling presets at the specified interval (default 25 seconds).
 */
export const startAutoCycle = (intervalMs: number = 25000, blendTime: number = 2.5): void => {
  stopAutoCycle();
  autoCycleTimer = setInterval(() => {
    randomPreset(blendTime);
  }, intervalMs);
};

/**
 * Stops auto-cycling presets.
 */
export const stopAutoCycle = (): void => {
  if (autoCycleTimer) {
    clearInterval(autoCycleTimer);
    autoCycleTimer = null;
  }
};

/**
 * Returns whether auto-cycling is currently running.
 */
export const isAutoCycleActive = (): boolean => {
  return autoCycleTimer !== null;
};

// ======================================================================
// RENDER & RESIZE
// ======================================================================

/**
 * Renders a single frame of the visualizer. Call from requestAnimationFrame.
 */
export const renderVisualizer = (): void => {
  if (visualizerInstance) {
    try {
      visualizerInstance.render();
    } catch (_e) {
      /* ignore occasional shader frame hiccup */
    }
  }
};

/**
 * Resizes the visualizer render buffer.
 */
export const resizeVisualizer = (width: number, height: number): void => {
  if (visualizerInstance) {
    try {
      visualizerInstance.setRendererSize(width, height);
    } catch (_e) {
      /* ignore */
    }
  }
};

// ======================================================================
// TEARDOWN
// ======================================================================

/**
 * Cleans up and tears down the visualizer instance and auto-cycle timer.
 */
export const destroyVisualizer = (): void => {
  stopAutoCycle();
  visualizerInstance = null;
  currentCanvas = null;
};
