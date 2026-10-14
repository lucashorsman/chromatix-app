// Tests generated using AI

import * as audioBridge from './audioBridge';

describe('Testing "audioBridge" service', () => {
  beforeEach(() => {
    audioBridge.resetAudioGraph();
  });

  afterEach(() => {
    audioBridge.resetAudioGraph();
  });

  test('getAudioEnergy returns zeros when no audio context is active', () => {
    const energy = audioBridge.getAudioEnergy();
    expect(energy).toEqual({ bass: 0, mid: 0, treble: 0, overall: 0 });
  });

  test('connectAudioElement handles null gracefully', () => {
    expect(() => audioBridge.connectAudioElement(null)).not.toThrow();
  });

  test('resumeAudioContext handles inactive context gracefully', async () => {
    await expect(audioBridge.resumeAudioContext()).resolves.toBeUndefined();
  });
});
