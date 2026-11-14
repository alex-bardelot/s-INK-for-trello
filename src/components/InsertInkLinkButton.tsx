import React, {useCallback, useState} from 'react';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {InkLinkTarget} from '../inkLink/inkLink';
import {insertInkLink} from '../inkLink/noteBridge';
import {SmallButton} from './SmallButton';

export interface InsertInkLinkButtonProps {
  target: InkLinkTarget;
  /** Name of the card or board, shown in the note. */
  name: string;
}

/**
 * Title bar button that places an s-INK link to a card or board on the
 * current note page, then closes the plugin view to show it.
 */
export function InsertInkLinkButton({
  target,
  name,
}: InsertInkLinkButtonProps): React.JSX.Element {
  const {t} = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  const insert = useCallback(async () => {
    setState('busy');
    if (await insertInkLink(target, name)) {
      setState('idle');
      PluginManager.closePluginView().catch(error =>
        console.warn('[sINK] Failed to close the plugin view', error),
      );
    } else {
      setState('failed');
    }
  }, [name, target]);

  return (
    <SmallButton
      label={t(state === 'failed' ? 'inkLink.insertFailed' : 'inkLink.insert')}
      accessibilityLabel={t('inkLink.insertHint')}
      disabled={state === 'busy'}
      onPress={insert}
    />
  );
}
