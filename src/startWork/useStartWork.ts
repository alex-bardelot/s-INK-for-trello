import {useCallback, useEffect, useState} from 'react';

import {toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloClient} from '../trello/TrelloClient';
import {TrelloCardDetail} from '../trello/types';
import {createCardNote, findCardNote, openCardNote} from './cardNote';
import {fileNameOf} from './noteFiles';
import {loadStartWorkSettings, startWorkDisabled} from './settings';
import {applyStartWork, StartWorkStep} from './startWork';

/** What happened to the card's note when Start ran. */
export type NoteOutcome =
  | {
      kind: 'created' | 'found';
      fileName: string;
      /** Why the chosen template was not used: the note has a blank page. */
      templateWarning?: string | null;
    }
  /** `reason`: the step that failed and the host's answer. */
  | {kind: 'failed'; reason: string}
  | {kind: 'openFailed'};

/** Report shown on the card after Start, unless the note opened. */
export interface StartWorkReport {
  steps: StartWorkStep[];
  note: NoteOutcome | null;
  /** Every action is turned off in Settings. */
  disabled: boolean;
  failed: boolean;
}

export interface StartWorkControls {
  /** Path of the card's note, once found or created. */
  notePath: string | null;
  busy: boolean;
  report: StartWorkReport | null;
  start: () => void;
  openNote: () => void;
  dismissReport: () => void;
}

/**
 * Start on a card: applies the Trello changes, then creates (or finds) the
 * card's note and opens it. When something went wrong, or no note is made,
 * a report stays on the card instead.
 *
 * @param card - The loaded detail of the card, `null` while it loads.
 * @param onChanged - Reloads the card once Trello changed it.
 */
export function useStartWork({
  card,
  shortLink,
  cardName,
  boardName,
  client,
  store,
  memberId,
  onChanged,
  onTokenRejected,
}: {
  card: TrelloCardDetail | null;
  shortLink: string | undefined;
  /** Name of the card as the board shows it, before its detail loads. */
  cardName: string;
  /** Names the folder of the card's note. */
  boardName: string;
  client: TrelloClient;
  store: KeyValueStore;
  memberId: string;
  onChanged: () => void;
  onTokenRejected: () => void;
}): StartWorkControls {
  const [notePath, setNotePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<StartWorkReport | null>(null);

  // The Note button shows if the card already has one. Never prompts here,
  // nor reads every note: a note of a renamed card is found on Start.
  useEffect(() => {
    let active = true;
    if (shortLink) {
      findCardNote({shortLink, name: cardName, boardName}, store, {
        prompt: false,
        scan: false,
      }).then(path => active && path && setNotePath(path));
    }
    return () => {
      active = false;
    };
  }, [boardName, cardName, shortLink, store]);

  const start = useCallback(async () => {
    if (!card?.idBoard || busy) {
      return;
    }
    const idBoard = card.idBoard;
    setBusy(true);
    setReport(null);
    try {
      const settings = await loadStartWorkSettings(store);
      if (startWorkDisabled(settings)) {
        setReport({steps: [], note: null, disabled: true, failed: false});
        return;
      }
      const result = await applyStartWork(
        client,
        {
          id: card.id,
          idBoard,
          idList: card.idList,
          idMembers: card.idMembers ?? [],
          labels: card.labels ?? [],
        },
        settings,
        memberId,
      );
      if (result.steps.some(step => 'ok' in step && step.ok)) {
        onChanged();
      }

      let note: NoteOutcome | null = null;
      const link = card.shortLink ?? shortLink;
      if (settings.createNote && link) {
        const made = await createCardNote(
          {name: card.name, shortLink: link, boardName},
          settings.noteTemplate,
          store,
        );
        if (made.ok) {
          setNotePath(made.path);
          note = {
            kind: made.created ? 'created' : 'found',
            fileName: fileNameOf(made.path),
            templateWarning: made.templateWarning,
          };
          // All went well: show the note at once.
          if (!result.failed && !made.templateWarning) {
            // A new note opens with its title selected, ready to be moved.
            const opened = await openCardNote(
              made.path,
              !made.created
                ? undefined
                : made.titled
                ? {rect: made.titleRect}
                : {
                    rect: null,
                    missing: {
                      target: {kind: 'card', shortLink: link},
                      name: card.name,
                    },
                  },
            );
            if (opened) {
              return;
            }
            note = {kind: 'openFailed'};
          }
        } else {
          note = {kind: 'failed', reason: made.reason};
        }
      }
      setReport({
        steps: result.steps,
        note,
        disabled: false,
        failed:
          result.failed ||
          note?.kind === 'failed' ||
          note?.kind === 'openFailed' ||
          (note?.kind === 'created' && !!note.templateWarning),
      });
    } catch (error) {
      console.warn('[sINK] Start failed', error);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setReport({
        steps: [{kind: 'boardUnreadable'}],
        note: null,
        disabled: false,
        failed: true,
      });
    } finally {
      setBusy(false);
    }
  }, [
    boardName,
    busy,
    card,
    client,
    memberId,
    onChanged,
    onTokenRejected,
    shortLink,
    store,
  ]);

  const openNote = useCallback(async () => {
    if (notePath && !(await openCardNote(notePath))) {
      setReport({
        steps: [],
        note: {kind: 'openFailed'},
        disabled: false,
        failed: true,
      });
    }
  }, [notePath]);

  return {
    notePath,
    busy,
    report,
    start,
    openNote,
    dismissReport: () => setReport(null),
  };
}
