import React, {useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {InkLinkTarget} from '../inkLink/inkLink';
import {
  bindPendingSelection,
  usePendingBinding,
} from '../inkLink/lassoBinding';
import {borders, colors, spacing, typography} from '../theme';
import {ChainIcon} from './ChainIcon';

/** Height of the tab, for the room tiles keep free under it. */
export const BIND_TAB_HEIGHT = 44;
/** Width the tab takes, for the room tiles keep free beside it. */
export const BIND_TAB_ROOM = 112;

/**
 * "Link" tab of a board tile or a card tile, shown only while a lasso
 * selection waits to be linked. It hangs from the top edge of the tile,
 * like a folder tab, with a chain icon. A press links the selection to
 * that board or card, then closes the plugin view to show the note.
 * The caller places it (absolutely, at the top right of the tile).
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('inkLink.bindSelectionHint')}
      accessibilityState={{disabled: state === 'busy'}}
      disabled={state === 'busy'}
      hitSlop={spacing.sm}
      onPress={bind}
      style={({pressed}) => [styles.tab, pressed && styles.pressed]}>
      {({pressed}) => {
        const color = pressed ? colors.foreground : colors.background;
        return (
          <>
            <ChainIcon size={22} color={color} />
            <Text style={[styles.label, {color}]}>
              {t(
                state === 'failed' ? 'inkLink.insertFailed' : 'inkLink.bindShort',
              )}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    height: BIND_TAB_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderTopWidth: 0,
    borderBottomLeftRadius: borders.radius * 2,
    borderBottomRightRadius: borders.radius * 2,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  label: {
    fontSize: typography.label,
    fontWeight: '700',
  },
});
