import releaseNotesText from '../RELEASE_NOTES.md';
import pluginConfig from '../PluginConfig.json';
import {parseInline, parseReleaseNotes} from '../src/settings/releaseNotes';

describe('parseReleaseNotes', () => {
  it('reads entries, bullets, nested bullets and continuation lines', () => {
    const notes = parseReleaseNotes(
      [
        '# Release notes',
        '',
        'Introduction, ignored.',
        '',
        '## 1.2.0 — New things',
        '',
        '- First change, written',
        '  on two lines.',
        '- Second change:',
        '  - nested **one**;',
        '  - nested two.',
        '',
        '## Unreleased — Older',
        '',
        'A plain paragraph.',
      ].join('\n'),
    );

    expect(notes).toEqual([
      {
        version: '1.2.0',
        title: 'New things',
        items: [
          {text: 'First change, written on two lines.', level: 0},
          {text: 'Second change:', level: 0},
          {text: 'nested **one**;', level: 1},
          {text: 'nested two.', level: 1},
        ],
      },
      {
        version: 'Unreleased',
        title: 'Older',
        items: [{text: 'A plain paragraph.', level: 0}],
      },
    ]);
  });

  it('reads the bundled release notes, newest first', () => {
    const notes = parseReleaseNotes(releaseNotesText);
    expect(notes.length).toBeGreaterThan(10);
    expect(notes[0].version).toBe(pluginConfig.versionName);
    expect(notes[0].items.length).toBeGreaterThan(0);
  });
});

describe('parseInline', () => {
  it('splits bold and code spans', () => {
    expect(parseInline('Use **Mode** with `focus` now')).toEqual([
      {text: 'Use '},
      {text: 'Mode', bold: true},
      {text: ' with '},
      {text: 'focus', code: true},
      {text: ' now'},
    ]);
  });

  it('keeps unclosed markers as text', () => {
    expect(parseInline('a ** b')).toEqual([{text: 'a ** b'}]);
  });
});
