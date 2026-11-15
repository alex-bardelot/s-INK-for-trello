/** One bullet of a release, possibly nested under the previous one. */
export interface ReleaseItem {
  text: string;
  /** 0 for a top-level bullet, 1 for a bullet nested under it, etc. */
  level: number;
}

/** One entry of RELEASE_NOTES.md: a `## version — title` heading. */
export interface ReleaseNote {
  /** What comes before the dash: `0.41.3`, `Unreleased`, `Relay 1.0.0`. */
  version: string;
  title: string;
  items: ReleaseItem[];
}

/** A piece of inline text, with its Markdown emphasis. */
export interface InlineSegment {
  text: string;
  bold?: boolean;
  code?: boolean;
}

const HEADING = /^##\s+(.+?)\s+[—-]\s+(.+)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
/** Spaces of indentation per nesting level. */
const INDENT = 2;

/**
 * Reads the release notes: one entry per `##` heading, newest first, each
 * with its bullets. Lines continuing a bullet are joined to it; text
 * before the first heading (the file's introduction) is ignored.
 */
export function parseReleaseNotes(markdown: string): ReleaseNote[] {
  const notes: ReleaseNote[] = [];
  let item: ReleaseItem | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      notes.push({version: heading[1], title: heading[2], items: []});
      item = null;
      continue;
    }
    const note = notes[notes.length - 1];
    if (!note || !line.trim()) {
      if (!line.trim()) {
        item = null;
      }
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      item = {
        text: bullet[2].trim(),
        level: Math.floor(bullet[1].length / INDENT),
      };
      note.items.push(item);
    } else if (item) {
      item.text = `${item.text} ${line.trim()}`;
    } else {
      // A paragraph outside any bullet.
      item = {text: line.trim(), level: 0};
      note.items.push(item);
    }
  }
  return notes;
}

/**
 * Splits a line on its `**bold**` and `` `code` `` spans. Unclosed markers
 * are kept as plain text.
 */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) {
      segments.push({text: text.slice(last, match.index)});
    }
    segments.push(
      match[1] !== undefined
        ? {text: match[1], bold: true}
        : {text: match[2], code: true},
    );
    last = pattern.lastIndex;
  }
  if (last < text.length) {
    segments.push({text: text.slice(last)});
  }
  return segments;
}
