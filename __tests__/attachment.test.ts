import {
  attachmentFile,
  DEFAULT_MIME_TYPE,
  fileNameOf,
  fileUri,
  mimeTypeOf,
  withAttachment,
} from '../src/cards/attachment';
import {TrelloCardDetail} from '../src/trello/types';

describe('fileNameOf', () => {
  it('keeps the last part of a path', () => {
    expect(fileNameOf('/storage/emulated/0/Document/report.pdf')).toBe(
      'report.pdf',
    );
    expect(fileNameOf('file:///storage/a/b.note')).toBe('b.note');
  });
});

describe('mimeTypeOf', () => {
  it('knows the usual types, whatever the case of the extension', () => {
    expect(mimeTypeOf('report.PDF')).toBe('application/pdf');
    expect(mimeTypeOf('photo.jpeg')).toBe('image/jpeg');
  });

  it('falls back to a plain binary type', () => {
    expect(mimeTypeOf('page.note')).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeOf('README')).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeOf('.hidden')).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeOf('name.')).toBe(DEFAULT_MIME_TYPE);
  });
});

describe('fileUri', () => {
  it('encodes each part of the path', () => {
    expect(fileUri('/storage/My Notes/a#1 50%.pdf')).toBe(
      'file:///storage/My%20Notes/a%231%2050%25.pdf',
    );
  });

  it('does not add a second scheme', () => {
    expect(fileUri('file:///storage/a.pdf')).toBe('file:///storage/a.pdf');
  });
});

describe('attachmentFile', () => {
  it('names the attachment after the file', () => {
    expect(attachmentFile('/storage/Document/Plan v2.docx')).toEqual({
      uri: 'file:///storage/Document/Plan%20v2.docx',
      name: 'Plan v2.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });
});

describe('withAttachment', () => {
  const card = {
    id: 'card',
    name: 'Card',
    attachments: [{id: 'a', name: 'First', url: 'https://a', date: ''}],
  } as TrelloCardDetail;
  const added = {id: 'b', name: 'Second', url: 'https://b', date: ''};

  it('adds the attachment last', () => {
    expect(withAttachment(card, added).attachments).toEqual([
      card.attachments![0],
      added,
    ]);
  });

  it('does not add an attachment twice', () => {
    const twice = withAttachment(withAttachment(card, added), added);
    expect(twice.attachments).toHaveLength(2);
  });
});
