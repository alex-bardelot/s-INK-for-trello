import {
  clearInkLinkLog,
  getInkLinkLog,
  logInkLink,
} from '../src/inkLink/diagnostics';

describe('diagnostics log', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('keeps the startup lines after many taps and a clear', () => {
    logInkLink('startup: plugin started');
    logInkLink('startup: button listener ready');
    for (let i = 0; i < 100; i++) {
      logInkLink(`tap ${i}`);
    }
    const shown = getInkLinkLog().map(line => line.replace(/^\S+ /, ''));
    expect(shown).toHaveLength(62);
    expect(shown[0]).toBe('tap 99');
    expect(shown.slice(-2)).toEqual([
      'startup: button listener ready',
      'startup: plugin started',
    ]);

    clearInkLinkLog();
    expect(getInkLinkLog().map(line => line.replace(/^\S+ /, ''))).toEqual([
      'startup: button listener ready',
      'startup: plugin started',
    ]);
  });

  it('keeps the button presses after many taps, until a clear', () => {
    clearInkLinkLog();
    logInkLink('button 2 pressed');
    logInkLink('card: reading the lasso');
    for (let i = 0; i < 100; i++) {
      logInkLink(`release ${i}`);
    }
    const shown = getInkLinkLog().map(line => line.replace(/^\S+ /, ''));
    expect(shown[0]).toBe('release 99');
    expect(shown).toContain('button 2 pressed');
    expect(shown.indexOf('card: reading the lasso')).toBeLessThan(
      shown.indexOf('button 2 pressed'),
    );
    expect(shown.indexOf('button 2 pressed')).toBeLessThan(
      shown.indexOf('startup: plugin started'),
    );

    clearInkLinkLog();
    expect(
      getInkLinkLog().map(line => line.replace(/^\S+ /, '')),
    ).not.toContain('button 2 pressed');
  });
});
