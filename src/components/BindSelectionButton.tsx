import React, {useCallback, useState} from 'react';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {InkLinkTarget} from '../inkLink/inkLink';
import {
  bindPendingSelection,
  usePendingBinding,
} from '../inkLink/lassoBinding';
import {SmallButton} from './SmallButton';

/**
 * "Link" button of a board tile or a card tile, shown only while a lasso
 * selection waits to be linked: it links the selection to that board or
 * card, then closes the plugin view to show the note.
 */
export function BindSelectionButton({
  target,
}: {
  target: InkLinkTarget;
}): React.JSX.Element | null {
  const {t} = useTranslation();
  const pending = usePendingBinding();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  const bind = useCallback(async () => {
    setState('busy');
    if (await bindPendingSelection(target)) {
      setState('idle');
      PluginManager.closePluginView().catch(error =>
        console.warn('[sINK] Failed to close the plugin view', error),
      );
    } else {
      setState('failed');
    }
  }, [target]);

  if (!pending) {
    return null;
  }
  return (
    <SmallButton
      label={t(state === 'failed' ? 'inkLink.insertFailed' : 'inkLink.bindShort')}
      accessibilityLabel={t('inkLink.bindSelectionHint')}
      disabled={state === 'busy'}
      onPress={bind}
    />
  );
}
