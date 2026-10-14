// ======================================================================
// AUDIO BRIDGE SERVICE
// ======================================================================

let audioContext: AudioContext | null = null;
let bridgeNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let frequencyDataArray: Uint8Array<ArrayBuffer> | null = null;

const connectedElements = new WeakSet<HTMLAudioElement>();

// ======================================================================
// INTERNAL GRAPH INITIALISATION
// ======================================================================

/**
 * Initialises the singleton AudioContext, GainNode, and AnalyserNode.
 * Returns true if the Web Audio graph is ready, false if unsupported.
 */
export const ensureAudioGraph = (): boolean => {
  if (audioContext && bridgeNode && analyserNode) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return false;
  }

  try {
    audioContext = new AudioContextClass();
    bridgeNode = audioContext.createGain();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    analyserNode.smoothingTimeConstant = 0.8;
    frequencyDataArray = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));

    // Wire: Sources -> bridgeNode -> destination (playback) & analyserNode (visualizer)
    bridgeNode.connect(analyserNode);
    bridgeNode.connect(audioContext.destination);

    return true;
  } catch (err) {
    console.warn('[audioBridge] Failed to create audio graph:', err);
    return false;
  }
};

// ======================================================================
// ELEMENT CONNECTION & LIFECYCLE
// ======================================================================

/**
 * Connects an HTMLAudioElement to the Web Audio pipeline.
 * Safe to call repeatedly; each element is connected only once.
 */
export const connectAudioElement = (element: HTMLAudioElement | null): void => {
  if (!element || connectedElements.has(element)) {
    return;
  }

  if (!ensureAudioGraph() || !audioContext || !bridgeNode) {
    return;
  }

  try {
    const sourceNode = audioContext.createMediaElementSource(element);
    sourceNode.connect(bridgeNode);
    connectedElements.add(element);
  } catch (err) {
    console.warn('[audioBridge] Failed to connect audio element to Web Audio graph:', err);
  }
};

/**
 * Resumes the AudioContext if it is in suspended state due to browser autoplay policies.
 */
export const resumeAudioContext = async (): Promise<void> => {
  if (audioContext && audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (_err) {
      /* ignore resume failure */
    }
  }
};

// ======================================================================
// NODE ACCESSORS
// ======================================================================

/**
 * Returns the active AudioContext instance.
 */
export const getAudioContext = (): AudioContext | null => {
  ensureAudioGraph();
  return audioContext;
};

/**
 * Returns the main bridge GainNode that receives all playback sources.
 */
export const getAudioSourceNode = (): AudioNode | null => {
  ensureAudioGraph();
  return bridgeNode;
};

/**
 * Returns the AnalyserNode used for frequency and waveform analysis.
 */
export const getAnalyserNode = (): AnalyserNode | null => {
  ensureAudioGraph();
  return analyserNode;
};

// ======================================================================
// AUDIO ANALYSIS UTILITIES
// ======================================================================

export interface AudioEnergy {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
}

const defaultEnergy: AudioEnergy = { bass: 0, mid: 0, treble: 0, overall: 0 };

/**
 * Samples the current frequency spectrum and returns normalized [0..1] energy levels.
 */
export const getAudioEnergy = (): AudioEnergy => {
  if (!analyserNode || !frequencyDataArray) {
    return defaultEnergy;
  }

  analyserNode.getByteFrequencyData(frequencyDataArray);
  const count = frequencyDataArray.length; // 256 bins for fftSize 512

  if (count === 0) {
    return defaultEnergy;
  }

  const bassEnd = Math.floor(count * 0.12); // ~0 - 250 Hz
  const midEnd = Math.floor(count * 0.5); // ~250 - 4000 Hz

  let bassSum = 0;
  for (let i = 0; i < bassEnd; i += 1) {
    bassSum += frequencyDataArray[i];
  }

  let midSum = 0;
  for (let i = bassEnd; i < midEnd; i += 1) {
    midSum += frequencyDataArray[i];
  }

  let trebleSum = 0;
  for (let i = midEnd; i < count; i += 1) {
    trebleSum += frequencyDataArray[i];
  }

  const bassCount = Math.max(1, bassEnd);
  const midCount = Math.max(1, midEnd - bassEnd);
  const trebleCount = Math.max(1, count - midEnd);

  const bass = bassSum / (bassCount * 255);
  const mid = midSum / (midCount * 255);
  const treble = trebleSum / (trebleCount * 255);
  const overall = (bassSum + midSum + trebleSum) / (count * 255);

  return { bass, mid, treble, overall };
};

// ======================================================================
// TEARDOWN (TESTING & UNLOAD)
// ======================================================================

/**
 * Resets the audio graph state for testing or cleanup.
 */
export const resetAudioGraph = (): void => {
  if (audioContext && audioContext.state !== 'closed') {
    try {
      audioContext.close();
    } catch (_err) {
      /* ignore */
    }
  }
  audioContext = null;
  bridgeNode = null;
  analyserNode = null;
  frequencyDataArray = null;
};
