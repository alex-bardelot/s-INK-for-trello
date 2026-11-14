import React, {useCallback, useState} from 'react';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {InkLinkTarget} from '../inkLink/inkLink';
import {
  bindPendingSelection,
  usePendingBinding,
} from '../inkLink/lassoBinding';
import {insertInkLink} from '../inkLink/noteBridge';
import {SmallButton} from './SmallButton';

export interface InsertInkLinkButtonProps {
  target: InkLinkTarget;
  /** Name of the card or board, shown in the note. */
  name: string;
}

/**
 * Title bar button that links the current card or board to the note, then
 * closes the plugin view to show it:
 * - after the lasso "Link to Trello" button, it links the selection;
 * - otherwise it places an s-INK link on the current note page.
 */
export function InsertInkLinkButton({
  target,
  name,
}: InsertInkLinkButtonProps): React.JSX.Element {
  const {t} = useTranslation();
  const pending = usePendingBinding();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  const link = useCallback(async () => {
    setState('busy');
    const done = pending
      ? await bindPendingSelection(target)
      : await insertInkLink(target, name);
    if (done) {
      setState('idle');
      PluginManager.closePluginView().catch(error =>
        console.warn('[sINK] Failed to close the plugin view', error),
      );
    } else {
      setState('failed');
    }
  }, [name, pending, target]);

  const label = pending ? 'inkLink.bindSelection' : 'inkLink.insert';
  return (
    <SmallButton
      label={t(state === 'failed' ? 'inkLink.insertFailed' : label)}
      accessibilityLabel={t(
        pending ? 'inkLink.bindSelectionHint' : 'inkLink.insertHint',
      )}
      disabled={state === 'busy'}
      onPress={link}
    />
  );
}
