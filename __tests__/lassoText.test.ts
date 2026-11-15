jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {
    getLassoElements: jest.fn(),
    getCurrentFilePath: jest.fn(),
    getCurrentPageNum: jest.fn(),
    recognizeElements: jest.fn(),
    cancelRecognize: jest.fn(),
  },
  PluginFileAPI: {
    getPageSize: () =>
      Promise.resolve({success: true, result: {width: 1920, height: 2560}}),
  },
  PluginManager: {closePluginView: jest.fn(), showPluginView: jest.fn()},
  PluginNoteAPI: {getLassoText: () => Promise.resolve({success: true})},
}));
jest.mock('../src/plugin/permissions', () => ({
  ensureFileReadPermission: () => Promise.resolve(true),
}));

import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';

import {RECOGNITION_TIMEOUT_MS, readLassoText} from '../src/plugin/lassoText';

const mockComm = PluginCommAPI as unknown as Record<
  | 'getLassoElements'
  | 'getCurrentFilePath'
  | 'getCurrentPageNum'
  | 'recognizeElements'
  | 'cancelRecognize',
  jest.Mock
>;
const mockManager = PluginManager as unknown as Record<
  'closePluginView' | 'showPluginView',
  jest.Mock
>;

const ok = <T>(result: T) => Promise.resolve({success: true, result});

beforeEach(() => {
  jest.clearAllMocks();
  mockComm.getLassoElements.mockReturnValue(ok([{type: 0}, {type: 0}]));
  mockComm.getCurrentFilePath.mockReturnValue(ok('/note.note'));
  mockComm.getCurrentPageNum.mockReturnValue(ok(0));
  mockComm.cancelRecognize.mockReturnValue(ok(true));
  mockManager.closePluginView.mockResolvedValue(true);
  mockManager.showPluginView.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('readLassoText', () => {
  it('opens the view before recognizing the handwriting', async () => {
    const events: string[] = [];
    mockComm.recognizeElements.mockImplementation(() => {
      events.push('recognize');
      return ok('Buy milk\n☐ Oat');
    });
    const result = await readLassoText(async () => {
      events.push('view open');
    });
    expect(result).toEqual({ok: true, text: 'Buy milk\n☐ Oat'});
    expect(events).toEqual(['view open', 'recognize']);
    expect(mockManager.closePluginView).not.toHaveBeenCalled();
  });

  it('recognizes again with the view hidden if it stalls with the view open', async () => {
    jest.useFakeTimers();
    mockComm.recognizeElements
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(ok('Buy milk'));
    const reading = readLassoText(() => Promise.resolve());
    await jest.advanceTimersByTimeAsync(RECOGNITION_TIMEOUT_MS);
    await expect(reading).resolves.toEqual({ok: true, text: 'Buy milk'});
    expect(mockComm.cancelRecognize).toHaveBeenCalledTimes(1);
    expect(mockManager.closePluginView).toHaveBeenCalledTimes(1);
    expect(mockComm.recognizeElements).toHaveBeenCalledTimes(2);
    // Shown again on the result.
    expect(mockManager.showPluginView).toHaveBeenCalledTimes(1);
  });

  it('has no time limit with the view hidden', async () => {
    mockComm.recognizeElements.mockReturnValue(ok('Buy milk'));
    await expect(readLassoText()).resolves.toEqual({
      ok: true,
      text: 'Buy milk',
    });
    expect(mockManager.showPluginView).not.toHaveBeenCalled();
  });
});
