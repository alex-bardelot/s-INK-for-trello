import type {Locale} from '../i18n';
import type {
  TrelloBoardMember,
  TrelloCardDetail,
  TrelloCheckItem,
  TrelloChecklist,
  TrelloComment,
  TrelloLabel,
} from '../trello/types';

/**
 * Content of the card detail page, as a sequence of blocks. The page is
 * turned rather than scrolled (scrolling is slow on E Ink), so the content
 * is cut into small blocks that are measured and spread over pages; a long
 * description is cut paragraph by paragraph.
 */
export type DetailBlock =
  | {kind: 'summary'; key: string}
  | {kind: 'heading'; key: string; section: DetailSection; count?: string}
  | {kind: 'paragraph'; key: string; text: string}
  | {
      kind: 'checklist';
      key: string;
      name: string;
      done: number;
      total: number;
    }
  | {
      kind: 'checkItem';
      key: string;
      /** Trello id of the item, to tick or untick it. */
      itemId: string;
      name: string;
      complete: boolean;
    }
  /** Stands under the heading of a section the card has nothing in. */
  | {kind: 'empty'; key: string; section: DetailSection}
  /** Field to write a new comment, at the top of the comments. */
  | {kind: 'commentComposer'; key: string}
  | {
      kind: 'attachment';
      key: string;
      name: string;
      /** Web address to open, or `null` if it is not a web address. */
      url: string | null;
    }
  | {
      kind: 'comment';
      key: string;
      author: string;
      date: string;
      text: string;
    };

export type DetailSection =
  | 'description'
  | 'checklists'
  | 'attachments'
  | 'comments';

/** Paragraphs with more lines than this are cut line by line. */
const MAX_PARAGRAPH_LINES = 8;

/**
 * Builds the blocks of the detail page of a card, in reading order. The
 * description, attachments and comments always have their heading, with a
 * line saying there are none when the card has none; checklists only show
 * when the card has some. With `canComment`, a field to write a comment
 * opens the comments, as on Trello.
 */
export function buildDetailBlocks(
  card: TrelloCardDetail,
  {canComment = false}: {canComment?: boolean} = {},
): DetailBlock[] {
  const blocks: DetailBlock[] = [{kind: 'summary', key: 'summary'}];
  const empty = (section: DetailSection) =>
    blocks.push({kind: 'empty', key: `e-${section}`, section});

  const paragraphs = descriptionParagraphs(card.desc ?? '');
  blocks.push({
    kind: 'heading',
    key: 'h-description',
    section: 'description',
  });
  if (paragraphs.length > 0) {
    paragraphs.forEach((text, i) =>
      blocks.push({kind: 'paragraph', key: `p-${i}`, text}),
    );
  } else {
    empty('description');
  }

  const checklists = sortedChecklists(card.checklists ?? []);
  if (checklists.length > 0) {
    blocks.push({kind: 'heading', key: 'h-checklists', section: 'checklists'});
    for (const checklist of checklists) {
      const items = checklist.checkItems;
      blocks.push({
        kind: 'checklist',
        key: `cl-${checklist.id}`,
        name: checklist.name,
        done: items.filter(item => item.state === 'complete').length,
        total: items.length,
      });
      for (const item of items) {
        blocks.push({
          kind: 'checkItem',
          key: `ci-${item.id}`,
          itemId: item.id,
          name: item.name,
          complete: item.state === 'complete',
        });
      }
    }
  }

  const attachments = card.attachments ?? [];
  blocks.push({
    kind: 'heading',
    key: 'h-attachments',
    section: 'attachments',
    ...(attachments.length > 0 && {count: String(attachments.length)}),
  });
  if (attachments.length === 0) {
    empty('attachments');
  }
  for (const attachment of attachments) {
    blocks.push({
      kind: 'attachment',
      key: `a-${attachment.id}`,
      name: attachment.name || attachment.url,
      url: webUrl(attachment.url),
    });
  }

  const comments = [...(card.actions ?? [])]
    .filter(action => typeof action.data?.text === 'string')
    .sort((a, b) => b.date.localeCompare(a.date));
  blocks.push({
    kind: 'heading',
    key: 'h-comments',
    section: 'comments',
    ...(comments.length > 0 && {count: String(comments.length)}),
  });
  if (canComment) {
    blocks.push({kind: 'commentComposer', key: 'comment-composer'});
  }
  if (comments.length === 0) {
    empty('comments');
  }
  for (const comment of comments) {
    blocks.push({
      kind: 'comment',
      key: `c-${comment.id}`,
      author: comment.memberCreator?.fullName ?? '',
      date: comment.date,
      text: plainMarkdown(comment.data.text).trim(),
    });
  }
  return blocks;
}

/** An `http:` or `https:` address with a host, and no space or control. */
const WEB_URL_PATTERN = /^https?:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/i;

/**
 * The address of an attachment if it is a web page, else `null`. Any
 * member of a board can set an attachment's address, so other schemes
 * (`intent:`, `file:`, `content:`, an app's own scheme…) are never opened:
 * they could start another app or reach the tablet's files.
 */
export function webUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }
  return WEB_URL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * The card with a comment Trello just stored, newest first; one already
 * there (the card was reloaded meanwhile) is not added twice.
 */
export function withComment(
  card: TrelloCardDetail,
  comment: TrelloComment,
): TrelloCardDetail {
  const actions = card.actions ?? [];
  if (actions.some(action => action.id === comment.id)) {
    return card;
  }
  return {...card, actions: [comment, ...actions]};
}

/** Checklists and their items in board order (Trello does not sort them). */
function sortedChecklists(
  checklists: readonly TrelloChecklist[],
): TrelloChecklist[] {
  return [...checklists]
    .sort((a, b) => a.pos - b.pos)
    .map(checklist => ({
      ...checklist,
      checkItems: [...(checklist.checkItems ?? [])].sort(
        (a, b) => a.pos - b.pos,
      ),
    }));
}

/**
 * The card with one checklist item ticked or unticked, as Trello will have
 * it once told; the card is returned as it is if it has no such item.
 */
export function withCheckItemState(
  card: TrelloCardDetail,
  itemId: string,
  complete: boolean,
): TrelloCardDetail {
  const state: TrelloCheckItem['state'] = complete ? 'complete' : 'incomplete';
  let found = false;
  const checklists = (card.checklists ?? []).map(checklist => {
    if (!(checklist.checkItems ?? []).some(item => item.id === itemId)) {
      return checklist;
    }
    found = true;
    return {
      ...checklist,
      checkItems: checklist.checkItems.map(item =>
        item.id === itemId ? {...item, state} : item,
      ),
    };
  });
  return found ? {...card, checklists} : card;
}

/**
 * The card with a label put on (`on`) or taken off, as shown while Trello
 * is told. A label already there, or already gone, leaves the card as is.
 */
export function withCardLabel(
  card: TrelloCardDetail,
  label: TrelloLabel,
  on: boolean,
): TrelloCardDetail {
  const labels = card.labels ?? [];
  const has = labels.some(other => other.id === label.id);
  if (has === on) {
    return card;
  }
  return {
    ...card,
    labels: on
      ? [...labels, label]
      : labels.filter(other => other.id !== label.id),
  };
}

/**
 * The card with a member added (`on`) or removed, in its ids and, when the
 * detail holds them, in its members.
 */
export function withCardMember(
  card: TrelloCardDetail,
  member: TrelloBoardMember,
  on: boolean,
): TrelloCardDetail {
  const ids = card.idMembers ?? [];
  if (ids.includes(member.id) === on) {
    return card;
  }
  const idMembers = on
    ? [...ids, member.id]
    : ids.filter(id => id !== member.id);
  if (!card.members) {
    return {...card, idMembers};
  }
  return {
    ...card,
    idMembers,
    members: on
      ? [...card.members.filter(other => other.id !== member.id), member]
      : card.members.filter(other => other.id !== member.id),
  };
}

/**
 * Labels offered by the card page's floating list: the board's named
 * labels, then those of the card the board did not give (unnamed ones),
 * so that they can be taken off.
 */
export function labelChoices(
  boardLabels: readonly TrelloLabel[],
  cardLabels: readonly TrelloLabel[],
): TrelloLabel[] {
  const named = boardLabels.filter(label => label.name.trim() !== '');
  const ids = new Set(named.map(label => label.id));
  return [...named, ...cardLabels.filter(label => !ids.has(label.id))];
}

/** Members of the card, from the nested members or the board's. */
export function cardMembers(
  card: TrelloCardDetail,
  boardMembers: ReadonlyMap<string, TrelloBoardMember>,
): TrelloBoardMember[] {
  if (card.members && card.members.length > 0) {
    return card.members;
  }
  return (card.idMembers ?? [])
    .map(id => boardMembers.get(id))
    .filter((member): member is TrelloBoardMember => member !== undefined);
}

/**
 * Splits a card description into paragraphs of plain text. Blank lines
 * separate paragraphs; very long paragraphs are cut line by line so that
 * each block fits on a page.
 */
export function descriptionParagraphs(desc: string): string[] {
  const text = plainMarkdown(desc.replace(/\r\n?/g, '\n'));
  const paragraphs: string[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const lines = raw
      .split('\n')
      .map(line => line.trimEnd())
      .filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      continue;
    }
    if (lines.length > MAX_PARAGRAPH_LINES) {
      paragraphs.push(...lines);
    } else {
      paragraphs.push(lines.join('\n'));
    }
  }
  return paragraphs;
}

/**
 * Turns the Markdown Trello stores in descriptions and comments into plain
 * text: emphasis marks, heading marks, link targets and escapes are
 * removed, and list bullets become "•".
 */
export function plainMarkdown(markdown: string): string {
  return markdown
    .split('\n')
    .map(line => {
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        return ''; // Horizontal rule.
      }
      return line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s{0,3}>\s?/, '')
        .replace(
          /^(\s*)[-*+]\s+\[( |x|X)\]\s+/,
          (_m, indent, mark) => `${indent}${mark === ' ' ? '☐' : '☑'} `,
        )
        .replace(/^(\s*)[-*+]\s+/, '$1• ')
        .replace(
          /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
          (_m, label, url) => (label.trim() ? label : url),
        )
        .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, '$2')
        .replace(/~~(\S(?:.*?\S)?)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, '$1');
    })
    .join('\n');
}

/** A page of blocks: indexes `[start, end)`. */
export interface BlockPage {
  start: number;
  end: number;
}

/**
 * Spreads blocks of measured heights over pages of `available` pixels.
 * Headings (`keepWithNext`) are never left alone at the bottom of a page:
 * they move to the next page with the block they introduce. A block taller
 * than a page gets a page of its own.
 */
export function paginateBlocks(
  heights: readonly number[],
  keepWithNext: readonly boolean[],
  available: number,
  gap: number,
): BlockPage[] {
  const pages: BlockPage[] = [];
  let start = 0;
  let used = 0;
  for (let index = 0; index < heights.length; index++) {
    const height = heights[index];
    const needed = index === start ? height : used + gap + height;
    if (index > start && needed > available) {
      // Do not leave the headings that end the page without their content.
      let cut = index;
      while (cut - 1 > start && keepWithNext[cut - 1]) {
        cut--;
      }
      pages.push({start, end: cut});
      start = cut;
      used = 0;
      for (let i = cut; i <= index; i++) {
        used = i === cut ? heights[i] : used + gap + heights[i];
      }
    } else {
      used = needed;
    }
  }
  pages.push({start, end: heights.length});
  return pages;
}

/**
 * Formats a Trello date for display, with the time when `withTime` is set.
 * Falls back to the ISO form where the JavaScript engine lacks locale data.
 */
export function formatCardDate(
  iso: string,
  locale: Locale,
  withTime = false,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return date.toLocaleString(locale.replace('_', '-'), {
      day: 'numeric',
      month: 'short',
      ...(withTime
        ? {year: 'numeric', hour: '2-digit', minute: '2-digit'}
        : {}),
    });
  } catch {
    const text = date.toISOString();
    return withTime
      ? `${text.slice(0, 10)} ${text.slice(11, 16)}`
      : text.slice(0, 10);
  }
}
