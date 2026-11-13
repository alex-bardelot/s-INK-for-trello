import {watchClipboardForToken} from '../src/session/clipboardTokenWatch';

const TOKEN = 'ATTA' + 'b'.repeat(72);
const OTHER_TOKEN = 'ATTA' + 'c'.repeat(72);

describe('watchClipboardForToken', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const tick = async (ms = 1500) => {
    await jest.advanceTimersByTimeAsync(ms);
  };

  it('reports a token once, then only a different one', async () => {
    let clipboard: string | null = 'hello';
    const onToken = jest.fn();
    const stop = watchClipboardForToken({
      read: async () => clipboard,
      onToken,
    });
    await tick(0);
    expect(onToken).not.toHaveBeenCalled();

    clipboard = TOKEN;
    await tick();
    await tick();
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenLastCalledWith(TOKEN);

    clipboard = OTHER_TOKEN;
    await tick();
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenLastCalledWith(OTHER_TOKEN);
    stop();
  });

  it('picks up a token already in the clipboard', async () => {
    const onToken = jest.fn();
    const stop = watchClipboardForToken({read: async () => TOKEN, onToken});
    await tick(0);
    expect(onToken).toHaveBeenCalledWith(TOKEN);
    stop();
  });

  it('skips reads while paused and stops for good', async () => {
    let paused = true;
    const read = jest.fn(async () => TOKEN);
    const onToken = jest.fn();
    const stop = watchClipboardForToken({
      read,
      onToken,
      isPaused: () => paused,
    });
    await tick();
    expect(read).not.toHaveBeenCalled();

    paused = false;
    await tick();
    expect(onToken).toHaveBeenCalledTimes(1);

    stop();
    const reads = read.mock.calls.length;
    await tick(10_000);
    expect(read).toHaveBeenCalledTimes(reads);
  });
});
