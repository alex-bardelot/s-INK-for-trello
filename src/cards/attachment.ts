import type {AttachmentFile} from '../trello/TrelloClient';
import {TrelloAttachment, TrelloCardDetail} from '../trello/types';

/** Sent for files whose type is not known: Trello stores them as is. */
export const DEFAULT_MIME_TYPE = 'application/octet-stream';

/** Types of the files a tablet usually holds, by lower-case extension. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
};

/** Path of a file, without a `file://` prefix. */
function plainPath(path: string): string {
  return path.replace(/^file:\/\//i, '');
}

/** Last part of a file's path, such as `report.pdf`. */
export function fileNameOf(path: string): string {
  const parts = plainPath(path).split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** Type of a file from its extension, {@link DEFAULT_MIME_TYPE} if unknown. */
export function mimeTypeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return DEFAULT_MIME_TYPE;
  }
  return MIME_TYPES[name.slice(dot + 1).toLowerCase()] ?? DEFAULT_MIME_TYPE;
}

/**
 * `file://` address of an absolute path. Each part is encoded, so that a
 * name with a space, `#` or `%` still points to the file: Android decodes
 * the address back to the path when it opens it.
 */
export function fileUri(path: string): string {
  const encoded = plainPath(path)
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
  return `file://${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

/** What to upload for a file chosen in the tablet's file manager. */
export function attachmentFile(path: string): AttachmentFile {
  const name = fileNameOf(path);
  return {uri: fileUri(path), name, mimeType: mimeTypeOf(name)};
}

/** The card with one more attachment, last as on Trello. */
export function withAttachment(
  card: TrelloCardDetail,
  attachment: TrelloAttachment,
): TrelloCardDetail {
  const attachments = (card.attachments ?? []).filter(
    other => other.id !== attachment.id,
  );
  return {...card, attachments: [...attachments, attachment]};
}
