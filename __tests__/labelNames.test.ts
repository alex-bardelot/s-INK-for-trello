import {labelColorName, labelDisplayName} from '../src/board/labelNames';
import {I18n} from '../src/i18n/i18n';

const i18n = new I18n();
const t = i18n.t.bind(i18n);

describe('label names', () => {
  it('names the color of a label, with its shade', () => {
    expect(labelColorName('green', t)).toBe('Green');
    expect(labelColorName('red_dark', t)).toBe('Red, dark');
    expect(labelColorName('sky_light', t)).toBe('Sky, light');
    expect(labelColorName(null, t)).toBe('No color');
    expect(labelColorName('mauve', t)).toBe('No color');
  });

  it('prefers the name of a label to its color', () => {
    expect(labelDisplayName({name: 'WIP', color: 'green'}, t)).toBe('WIP');
    expect(labelDisplayName({name: '  ', color: 'blue'}, t)).toBe('Blue');
  });
});
