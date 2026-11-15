import {
  DIAGNOSTICS_UNLOCK_TAPS,
  diagnosticsUnlocked,
  RAPID_TAP_GAP_MS,
  RapidTapCounter,
  unlockDiagnostics,
} from '../src/settings/rapidTaps';

describe('rapid taps', () => {
  const tapAll = (counter: RapidTapCounter, times: number[]) =>
    times.map(time => counter.tap(time));

  it('completes on the seventh quick press', () => {
    const counter = new RapidTapCounter();
    const results = tapAll(
      counter,
      Array.from({length: DIAGNOSTICS_UNLOCK_TAPS}, (_, i) => i * 200),
    );
    expect(results.slice(0, -1).every(done => !done)).toBe(true);
    expect(results[results.length - 1]).toBe(true);
  });

  it('starts over after a pause', () => {
    const counter = new RapidTapCounter(3);
    expect(tapAll(counter, [0, 100])).toEqual([false, false]);
    // Too slow: this press starts a new series.
    expect(counter.tap(100 + RAPID_TAP_GAP_MS + 1)).toBe(false);
    expect(tapAll(counter, [900, 1000])).toEqual([false, true]);
  });

  it('starts over once a series is complete', () => {
    const counter = new RapidTapCounter(2);
    expect(tapAll(counter, [0, 100, 200, 300])).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it('remembers the unlock', () => {
    expect(diagnosticsUnlocked()).toBe(false);
    unlockDiagnostics();
    expect(diagnosticsUnlocked()).toBe(true);
  });
});
