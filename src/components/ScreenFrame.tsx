import React, {useCallback, useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import type {SettingsCategory} from '../screens/SettingsScreen';
import {connectivity, useConnectivity} from '../network/connectivity';
import {borders, colors, spacing, typography} from '../theme';
import {CloseIcon} from './CloseIcon';
import {GearIcon} from './GearIcon';
import {useSettingsOpener} from './settingsOpener';
import {OfflineButton, OfflinePopup, useOfflineRetry} from './OfflineButton';

/**
 * Size of the icons of the title bar (close, refresh). Icon buttons put
 * `spacing.sm` around it, like the close button, so they line up.
 */
export const HEADER_ICON_SIZE = 32;
/**
 * Padding of the page under the title bar. A band drawn to the edges of
 * the page takes it back with negative margins.
 */
export const CONTENT_PADDING = spacing.lg;
/**
 * Height of the title bar, the same on every page whatever it holds: an
 * icon button with its padding, the bar's padding and its bottom border.
 */
const HEADER_HEIGHT =
  HEADER_ICON_SIZE + spacing.sm * 2 + spacing.md * 2 + borders.width;
/** The gear fills its square more than the close cross: a bit smaller. */
const SETTINGS_ICON_SIZE = 28;
/**
 * Padding of the settings button: its smaller gear gets the difference, so
 * the button is as big as the others and the gaps between the icons of
 * the bar (refresh, settings, close) come out the same.
 */
const SETTINGS_PADDING =
  spacing.sm + (HEADER_ICON_SIZE - SETTINGS_ICON_SIZE) / 2;

export interface ScreenFrameProps {
  title: string;
  children: React.ReactNode;
  /** When set, a back button is shown before the title. */
  onBack?: () => void;
  /** Extra controls shown between the title and the close button. */
  actions?: React.ReactNode;
  /** Content without the frame's padding, for screens drawing to its edges. */
  flush?: boolean;
  /** Hides the offline button, on a screen that has its own Retry. */
  hideOfflineButton?: boolean;
  /**
   * Settings category of the page: shows the settings button, which opens
   * Settings at it. Only the navigation pages (boards, a board, a card)
   * have one.
   */
  settingsCategory?: SettingsCategory;
  /**
   * Shows the title bar of the tablet's own creation dialogs (New Task,
   * New Event) instead: black, Cancel on the left, the title in the
   * middle, the confirming action on the right. Back, actions, close and
   * offline buttons are then left out.
   */
  dialog?: DialogBar;
  /** Popup of the page, drawn over the whole of it, title bar included. */
  overlay?: React.ReactNode;
}

/** The two actions of a dialog title bar. */
export interface DialogBar {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}

/**
 * Common layout of the plugin screens: title bar with a close button, and
 * the settings button on the navigation pages. While the tablet has no internet, an "Offline"
 * button with a Wi-Fi off sign stands last among the actions: it checks
 * again, and says in a popup that the tablet must be connected if it
 * still is not.
 */
export function ScreenFrame({
  title,
  children,
  onBack,
  actions,
  flush,
  hideOfflineButton,
  settingsCategory,
  dialog,
  overlay,
}: ScreenFrameProps): React.JSX.Element {
  const {t} = useTranslation();
  const openSettings = useSettingsOpener();

  // Arriving on a page while offline checks whether the internet is back:
  // nothing is checked in the background, to spare the battery.
  useEffect(() => {
    connectivity.pageShown();
  }, []);

  const showOffline = useConnectivity() === 'offline' && !hideOfflineButton;
  const offline = useOfflineRetry();

  const handleClose = useCallback(() => {
    PluginManager.closePluginView().catch(error =>
      console.warn('[sINK] Failed to close plugin view', error),
    );
  }, []);

  if (dialog) {
    return (
      <View style={styles.container}>
        <DialogHeader title={title} bar={dialog} />
        <View style={[styles.content, flush && styles.flush]}>{children}</View>
        {overlay}
        {offline.failed && <OfflinePopup onClose={offline.dismiss} />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={spacing.md}
            onPress={onBack}
            style={styles.backButton}>
            <Text style={styles.closeIcon}>‹</Text>
          </Pressable>
        )}
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {(actions || showOffline) && (
          <View style={styles.actions}>
            {actions}
            {/* Last, where the board page's refresh button stands. */}
            {showOffline && (
              <OfflineButton
                checking={offline.checking}
                onPress={offline.retry}
              />
            )}
          </View>
        )}
        {openSettings && settingsCategory && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.open')}
            hitSlop={spacing.md}
            onPress={() => openSettings(settingsCategory)}
            style={styles.settingsButton}>
            {({pressed}) => (
              <GearIcon
                size={SETTINGS_ICON_SIZE}
                color={colors.foreground}
                holeColor={pressed ? colors.avatar : colors.background}
              />
            )}
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={spacing.md}
          onPress={handleClose}
          style={styles.closeButton}>
          <CloseIcon size={HEADER_ICON_SIZE} color={colors.foreground} />
        </Pressable>
      </View>
      <View style={[styles.content, flush && styles.flush]}>{children}</View>
      {overlay}
      {offline.failed && <OfflinePopup onClose={offline.dismiss} />}
    </View>
  );
}

/** Black title bar with Cancel on the left and the action on the right. */
function DialogHeader({
  title,
  bar,
}: {
  title: string;
  bar: DialogBar;
}): React.JSX.Element {
  const disabled = !!bar.confirmDisabled;
  return (
    <View style={styles.dialogHeader}>
      <View style={styles.dialogSide}>
        <Pressable
          accessibilityRole="button"
          hitSlop={spacing.md}
          onPress={bar.onCancel}>
          {({pressed}) => (
            <Text
              style={[styles.dialogAction, pressed && styles.dialogPressed]}>
              {bar.cancelLabel}
            </Text>
          )}
        </Pressable>
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.dialogTitle}>
        {title}
      </Text>
      <View style={[styles.dialogSide, styles.dialogSideEnd]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{disabled}}
          disabled={disabled}
          hitSlop={spacing.md}
          onPress={bar.onConfirm}>
          {({pressed}) => (
            <Text
              style={[
                styles.dialogAction,
                styles.dialogConfirm,
                disabled && styles.dialogDisabled,
                pressed && styles.dialogPressed,
              ]}>
              {bar.confirmLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.foreground,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // Both sides share the width left by the title, so it stays centered.
  dialogSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  dialogSideEnd: {
    alignItems: 'flex-end',
  },
  dialogTitle: {
    flex: 2,
    color: colors.background,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  dialogAction: {
    color: colors.background,
    fontSize: typography.label,
  },
  dialogConfirm: {
    fontWeight: '700',
  },
  dialogDisabled: {
    color: colors.disabledOnDark,
  },
  dialogPressed: {
    textDecorationLine: 'underline',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_HEIGHT,
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width,
    paddingHorizontal: spacing.lg,
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  // No margin on the right: the actions end with an icon button (refresh
  // or offline), which then sits next to settings and close like they sit
  // next to each other, their paddings alone between them.
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginLeft: spacing.md,
  },
  closeButton: {
    padding: spacing.sm,
  },
  settingsButton: {
    padding: SETTINGS_PADDING,
  },
  backButton: {
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  // The back arrow is text: its line is held to the size of the icons.
  closeIcon: {
    color: colors.foreground,
    fontSize: typography.icon,
    fontWeight: '600',
    lineHeight: HEADER_ICON_SIZE,
  },
  content: {
    flex: 1,
    padding: CONTENT_PADDING,
  },
  flush: {
    padding: 0,
  },
});
