import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {MenuRect, placeCardMenu} from '../board/cardMenu';
import {
  ActionIconProps,
  ArchiveIcon,
  OpenIcon,
  StartIcon,
} from '../components/ActionIcons';
import {Button} from '../components/Button';
import {ChainIcon} from '../components/ChainIcon';
import {
  MarkCompleteIcon,
  MarkIncompleteIcon,
} from '../components/CompleteMark';
import {useInkLinkAction} from '../components/InsertInkLinkButton';
import {Popup} from '../components/Popup';
import {useTranslation} from '../i18n';
import {TrelloBoardCard} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

const MENU_WIDTH = 380;
/** Rows have a fixed height, so that the menu's is known before drawing. */
const ROW_HEIGHT = 64;
const MENU_BORDER = borders.width * 2;
const MENU_PADDING = spacing.xs;
const ICON_SIZE = 28;
const POPUP_ICON_SIZE = 48;

/**
 * Finds where the card's tile stands in `area`, the view the menu is drawn
 * in (it must be positioned).
 */
export function measureCardRect(tile: View, area: View): Promise<MenuRect> {
  return new Promise(resolve =>
    tile.measureInWindow((tx, ty, width, height) =>
      area.measureInWindow((ax, ay) =>
        resolve({left: tx - ax, top: ty - ay, width, height}),
      ),
    ),
  );
}

/** The card whose menu is open, and where its tile stands. */
export interface CardMenuTarget {
  card: TrelloBoardCard;
  rect: MenuRect;
}

/**
 * The actions of a card, opened by a long press on it on the board: a
 * menu beside the card, on its right or on its left, whichever has room.
 * A tap beside the menu closes it. Start work, Mark complete (or
 * incomplete) and Archive are only offered to members who may edit the
 * board; Start work is not offered on a card already done.
 */
export function CardMenu({
  target,
  page,
  canEdit,
  onOpen,
  onStartWork,
  onToggleComplete,
  onArchive,
  onClose,
}: {
  target: CardMenuTarget;
  /** Size of the area the menu is drawn in. */
  page: {width: number; height: number};
  canEdit: boolean;
  onOpen: () => void;
  onStartWork: () => void;
  /** Marks the card complete, or incomplete when it is. */
  onToggleComplete: () => void;
  onArchive: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const {card} = target;
  const inkLink = useInkLinkAction(
    {kind: 'card', shortLink: card.shortLink || card.id},
    card.name,
  );

  const rows: MenuRowProps[] = [
    {
      label: t('board.cardOpen'),
      hint: t('board.openCardHint'),
      icon: OpenIcon,
      onPress: onOpen,
    },
    ...(canEdit
      ? [
          // A card already done is not started again.
          ...(card.dueComplete
            ? []
            : [
                {
                  label: t('startWork.start'),
                  hint: t('startWork.startHint'),
                  icon: StartIcon,
                  onPress: onStartWork,
                },
              ]),
          card.dueComplete
            ? {
                label: t('board.cardIncomplete'),
                hint: t('board.cardIncompleteHint'),
                icon: MarkIncompleteIcon,
                onPress: onToggleComplete,
              }
            : {
                label: t('board.cardComplete'),
                hint: t('board.cardCompleteHint'),
                icon: MarkCompleteIcon,
                onPress: onToggleComplete,
              },
        ]
      : []),
    {
      label: t(inkLink.label),
      hint: t(inkLink.hint),
      icon: ChainIcon,
      disabled: inkLink.busy,
      onPress: inkLink.link,
    },
    ...(canEdit
      ? [
          {
            label: t('board.cardArchive'),
            hint: t('board.cardArchiveHint'),
            icon: ArchiveIcon,
            onPress: onArchive,
          },
        ]
      : []),
  ];

  const height = rows.length * ROW_HEIGHT + 2 * (MENU_BORDER + MENU_PADDING);
  const placement = placeCardMenu(
    target.rect,
    {width: MENU_WIDTH, height},
    page,
    spacing.sm,
  );

  return (
    <>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      <View
        accessibilityRole="menu"
        accessibilityLabel={card.name}
        style={[
          styles.menu,
          {left: placement.left, top: placement.top, width: MENU_WIDTH},
        ]}>
        {rows.map((row, index) => (
          <MenuRow key={index} {...row} first={index === 0} />
        ))}
      </View>
    </>
  );
}

interface MenuRowProps {
  label: string;
  hint: string;
  icon: React.ComponentType<ActionIconProps>;
  onPress: () => void;
  disabled?: boolean;
  first?: boolean;
}

/** A row of the menu: its icon and its words, inverted while pressed. */
function MenuRow({
  label,
  hint,
  icon: Icon,
  onPress,
  disabled = false,
  first = false,
}: MenuRowProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.row,
        !first && styles.rowDivided,
        pressed && styles.rowPressed,
      ]}>
      {({pressed}) => (
        <>
          <Icon
            size={ICON_SIZE}
            color={pressed ? colors.background : colors.foreground}
          />
          <Text
            numberOfLines={1}
            style={[styles.rowLabel, pressed && styles.rowLabelPressed]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Asks before a card is archived, with its name; Archive stays on the
 * popup, unavailable, while Trello is asked, and the popup tells when
 * Trello refused.
 */
export function ArchiveCardPopup({
  card,
  busy,
  failed,
  onCancel,
  onConfirm,
}: {
  card: TrelloBoardCard;
  busy: boolean;
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Popup
      title={t('board.archiveConfirmTitle')}
      icon={<ArchiveIcon size={POPUP_ICON_SIZE} color={colors.foreground} />}
      onClose={busy ? () => {} : onCancel}
      actions={
        <>
          <Button
            label={t('common.cancel')}
            disabled={busy}
            onPress={onCancel}
          />
          <Button
            primary
            label={t(busy ? 'board.archiving' : 'board.cardArchive')}
            disabled={busy}
            onPress={onConfirm}
          />
        </>
      }>
      <Text style={styles.popupCardName}>{card.name}</Text>
      <Text style={styles.popupText}>{t('board.archiveConfirmText')}</Text>
      {failed && (
        <Text accessibilityRole="alert" style={styles.popupText}>
          {t('board.archiveFailed')}
        </Text>
      )}
    </Popup>
  );
}

/**
 * Tells that Trello refused to mark a card complete, or incomplete, from
 * its menu; the card went back as it was.
 */
export function CompleteFailedPopup({
  card,
  onClose,
}: {
  card: TrelloBoardCard;
  onClose: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Popup
      title={t('board.completeFailedTitle')}
      onClose={onClose}
      actions={<Button primary label={t('common.ok')} onPress={onClose} />}>
      <Text style={styles.popupCardName}>{card.name}</Text>
      <Text accessibilityRole="alert" style={styles.popupText}>
        {t('cardDetail.completeFailed')}
      </Text>
    </Popup>
  );
}

/** Where archiving a card from its menu is at. */
export interface ArchiveState {
  card: TrelloBoardCard;
  status: 'confirm' | 'busy' | 'failed';
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderWidth: MENU_BORDER,
    borderRadius: borders.radius * 2,
    paddingVertical: MENU_PADDING,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowDivided: {
    borderTopWidth: borders.width,
    borderTopColor: colors.foreground,
  },
  rowPressed: {
    backgroundColor: colors.foreground,
  },
  rowLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  rowLabelPressed: {
    color: colors.background,
  },
  popupCardName: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  popupText: {
    color: colors.foreground,
    fontSize: typography.body,
  },
});
