// Tests generated using AI

import * as visualizer from './visualizer';

describe('Testing "visualizer" service', () => {
  afterEach(() => {
    visualizer.destroyVisualizer();
  });

  test('isVisualizerSupported returns false in headless jsdom environment without webgl2', () => {
    expect(visualizer.isVisualizerSupported()).toBe(false);
  });

  test('getCurrentPresetName returns fallback when not initialized', () => {
    expect(visualizer.getCurrentPresetName()).toBe('None');
  });

  test('nextPreset and prevPreset return null when not initialized', () => {
    expect(visualizer.nextPreset()).toBeNull();
    expect(visualizer.prevPreset()).toBeNull();
    expect(visualizer.randomPreset()).toBeNull();
  });

  test('startAutoCycle and stopAutoCycle toggle timer state', () => {
    expect(visualizer.isAutoCycleActive()).toBe(false);
    visualizer.startAutoCycle(10000);
    expect(visualizer.isAutoCycleActive()).toBe(true);
    visualizer.stopAutoCycle();
    expect(visualizer.isAutoCycleActive()).toBe(false);
  });

  test('renderVisualizer and resizeVisualizer handle uninitialized state gracefully', () => {
    expect(() => visualizer.renderVisualizer()).not.toThrow();
    expect(() => visualizer.resizeVisualizer(800, 600)).not.toThrow();
  });
});
