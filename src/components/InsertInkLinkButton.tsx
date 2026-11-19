import React, {useCallback, useState} from 'react';
import {PluginManager} from 'sn-plugin-lib';

import {TranslationKey, useTranslation} from '../i18n';
import {formatInkLink, InkLinkTarget} from '../inkLink/inkLink';
import {bindPendingSelection, usePendingBinding} from '../inkLink/lassoBinding';
import {closeViewAndSelect, insertInkLink} from '../inkLink/noteBridge';
import {ChainIcon} from './ChainIcon';
import {SmallButton} from './SmallButton';

export interface InsertInkLinkButtonProps {
  target: InkLinkTarget;
  /** Name of the card or board, shown in the note. */
  name: string;
}

export interface InkLinkAction {
  /** Links the target, then closes the plugin view to show the note. */
  link: () => Promise<void>;
  busy: boolean;
  /** Words of the action: link the lasso selection, or link in the note. */
  label: TranslationKey;
  hint: TranslationKey;
}

/**
 * Links a card or board to the note, then closes the plugin view to show
 * it:
 * - after the lasso "Insert Trello Link" button, it links the selection;
 * - otherwise it places an s-INK link in the middle of the current note
 *   page; when Settings › New card asks for it (experimental), it is then
 *   selected with the lasso, so that it can be moved at once.
 *
 * The label reads "Link failed" after a failure, until the next try.
 */
export function useInkLinkAction(
  target: InkLinkTarget,
  name: string,
): InkLinkAction {
  const pending = usePendingBinding();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  const link = useCallback(async () => {
    setState('busy');
    if (pending) {
      if (await bindPendingSelection(target)) {
        setState('idle');
        PluginManager.closePluginView().catch(error =>
          console.warn('[sINK] Failed to close the plugin view', error),
        );
      } else {
        setState('failed');
      }
      return;
    }
    const rect = await insertInkLink(target, name);
    if (rect) {
      setState('idle');
      // The new link may be selected with the lasso (experimental setting).
      await closeViewAndSelect({rect, link: formatInkLink(target)});
    } else {
      setState('failed');
    }
  }, [name, pending, target]);

  return {
    link,
    busy: state === 'busy',
    label:
      state === 'failed'
        ? 'inkLink.insertFailed'
        : pending
        ? 'inkLink.bindSelection'
        : 'inkLink.insert',
    hint: pending ? 'inkLink.bindSelectionHint' : 'inkLink.insertHint',
  };
}

/** Title bar button that links the current card or board to the note. */
export function InsertInkLinkButton({
  target,
  name,
}: InsertInkLinkButtonProps): React.JSX.Element {
  const {t} = useTranslation();
  const action = useInkLinkAction(target, name);
  return (
    <SmallButton
      label={t(action.label)}
      accessibilityLabel={t(action.hint)}
      disabled={action.busy}
      onPress={action.link}
      icon={ChainIcon}
    />
  );
}
