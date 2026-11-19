jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    closePluginView: jest.fn(),
    showPluginView: jest.fn(),
  },
  RattaFileSelector: {selectFile: jest.fn()},
}));
jest.mock('../src/inkLink/diagnostics', () => ({logInkLink: jest.fn()}));

import {PluginManager, RattaFileSelector} from 'sn-plugin-lib';

import {pickFile} from '../src/platform/fileSelector';

const closeView = PluginManager.closePluginView as jest.Mock;
const showView = PluginManager.showPluginView as jest.Mock;
const selectFile = RattaFileSelector.selectFile as jest.Mock;
const options = {title: 'Attach a file', confirmLabel: 'Attach'};

beforeEach(() => {
  jest.clearAllMocks();
  closeView.mockResolvedValue(true);
  showView.mockResolvedValue(true);
});

describe('pickFile', () => {
  it('hides the view while the file manager is open, then shows it', async () => {
    const order: string[] = [];
    closeView.mockImplementation(async () => order.push('hide'));
    selectFile.mockImplementation(async () => {
      order.push('select');
      return ['/storage/emulated/0/Document/report.pdf'];
    });
    showView.mockImplementation(async () => order.push('show'));

    await expect(pickFile(options)).resolves.toBe(
      '/storage/emulated/0/Document/report.pdf',
    );
    expect(order).toEqual(['hide', 'select', 'show']);
    expect(selectFile).toHaveBeenCalledWith({
      selectType: 1,
      maxNum: 1,
      title: 'Attach a file',
      rightButtonText: 'Attach',
    });
  });

  it('shows the view again when no file was chosen', async () => {
    selectFile.mockResolvedValue(null);
    await expect(pickFile(options)).resolves.toBeNull();
    expect(showView).toHaveBeenCalledTimes(1);
  });

  it('shows the view again when the file manager failed', async () => {
    selectFile.mockRejectedValue(new Error('select File is error'));
    await expect(pickFile(options)).rejects.toThrow('select File is error');
    expect(showView).toHaveBeenCalledTimes(1);
  });

  it('still opens the file manager when hiding the view failed', async () => {
    closeView.mockRejectedValue(new Error('no view'));
    selectFile.mockResolvedValue(['/a.pdf']);
    await expect(pickFile(options)).resolves.toBe('/a.pdf');
    expect(showView).toHaveBeenCalledTimes(1);
  });

  it('keeps the chosen file when showing the view failed', async () => {
    showView.mockRejectedValue(new Error('no view'));
    selectFile.mockResolvedValue(['', '/b.png']);
    await expect(pickFile(options)).resolves.toBe('/b.png');
  });
});
