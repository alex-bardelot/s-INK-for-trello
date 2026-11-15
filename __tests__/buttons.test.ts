jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    registerButton: jest.fn(),
    unregisterButton: jest.fn(),
  },
}));

import {PluginManager} from 'sn-plugin-lib';

import {i18n} from '../src/i18n';
import {refreshButtons, registerButtons} from '../src/plugin/buttons';
import {ButtonId} from '../src/plugin/constants';

const registerButton = PluginManager.registerButton as jest.Mock;
const unregisterButton = PluginManager.unregisterButton as jest.Mock;

describe('plugin buttons', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    registerButton.mockReset();
    unregisterButton.mockReset();
    registerButton.mockImplementation(
      async (_type: number, _apps: string[], button: {id: number}) => {
        calls.push(`register ${button.id}`);
        // The host answers late, after the next call was sent.
        await new Promise(resolve => setImmediate(resolve));
        return true;
      },
    );
    unregisterButton.mockImplementation(async (id: number) => {
      calls.push(`unregister ${id}`);
      await new Promise(resolve => setImmediate(resolve));
      return true;
    });
    i18n.setLocale('en');
  });

  it('skips the refresh while the labels are unchanged', async () => {
    await registerButtons();
    calls = [];
    await expect(refreshButtons()).resolves.toBe(true);
    expect(calls).toEqual([]);
  });

  it('never interleaves overlapping refreshes', async () => {
    await registerButtons();
    calls = [];
    i18n.setLocale('fr');
    const first = refreshButtons();
    const second = refreshButtons();
    await Promise.all([first, second]);
    // One cycle only, all removed before any is added again: the second
    // refresh found the labels up to date.
    expect(calls).toEqual([
      `unregister ${ButtonId.Open}`,
      `unregister ${ButtonId.LassoCreateCard}`,
      `unregister ${ButtonId.LassoLink}`,
      `unregister ${ButtonId.LassoInspect}`,
      `register ${ButtonId.Open}`,
      `register ${ButtonId.LassoCreateCard}`,
      `register ${ButtonId.LassoLink}`,
      // Diagnostics is locked: Inspect stays removed.
      `unregister ${ButtonId.LassoInspect}`,
    ]);
  });

  it('waits for the first registration before refreshing', async () => {
    const initial = registerButtons();
    // Applied before the queued registration runs: it already uses it.
    i18n.setLocale('ja');
    const refresh = refreshButtons();
    await Promise.all([initial, refresh]);
    expect(calls).toEqual([
      `register ${ButtonId.Open}`,
      `register ${ButtonId.LassoCreateCard}`,
      `register ${ButtonId.LassoLink}`,
      `unregister ${ButtonId.LassoInspect}`,
    ]);
    expect(registerButton.mock.calls[0][2].name).toBe(
      i18n.t('button.toolbar.name'),
    );
  });

  it('registers again after the host rejected a button', async () => {
    registerButton.mockResolvedValueOnce(false);
    await expect(registerButtons()).resolves.toBe(false);
    calls = [];
    await expect(refreshButtons()).resolves.toBe(true);
    expect(calls.filter(call => call.startsWith('register'))).toHaveLength(3);
  });
});
