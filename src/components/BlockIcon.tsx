import React from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';

import {iconStroke} from './iconStroke';

/** The blocks of a card that have an icon. */
export type BlockIconKind =
  | 'board'
  | 'list'
  | 'labels'
  | 'members'
  | 'title'
  | 'description'
  | 'checklist';

export interface BlockIconProps {
  kind: BlockIconKind;
  size: number;
  color: string;
}

type Draw = (size: number, stroke: number, color: string) => React.ReactNode;

/** An absolutely placed box inside the icon. */
function box(style: ViewStyle, key?: string | number): React.ReactNode {
  return <View key={key} style={[styles.part, style]} />;
}

/** Outline of a board with two columns of cards, as on Trello. */
const board: Draw = (size, stroke, color) => {
  const inset = stroke * 2;
  const column = (size - 2 * stroke - 3 * inset) / 2;
  const inner = size - 2 * stroke - 2 * inset;
  return [
    box(
      {
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderWidth: stroke,
        borderColor: color,
        borderRadius: stroke * 1.5,
      },
      'frame',
    ),
    box(
      {
        left: stroke + inset,
        top: stroke + inset,
        width: column,
        height: inner * 0.75,
        backgroundColor: color,
        borderRadius: stroke / 2,
      },
      'left',
    ),
    box(
      {
        left: stroke + 2 * inset + column,
        top: stroke + inset,
        width: column,
        height: inner * 0.45,
        backgroundColor: color,
        borderRadius: stroke / 2,
      },
      'right',
    ),
  ];
};

/** Three bulleted lines. */
const list: Draw = (size, stroke, color) => {
  const dot = stroke * 1.4;
  const step = (size - dot) / 2;
  return [0, 1, 2].flatMap(row => {
    const top = row * step;
    return [
      box(
        {left: 0, top, width: dot, height: dot, backgroundColor: color},
        `dot${row}`,
      ),
      box(
        {
          left: dot + stroke * 1.5,
          top: top + (dot - stroke) / 2,
          right: 0,
          height: stroke,
          backgroundColor: color,
        },
        `line${row}`,
      ),
    ];
  });
};

/** A price tag, tip up, with its hole. */
const labels: Draw = (size, stroke, color) => {
  const side = size * 0.66;
  const hole = stroke * 1.4;
  return (
    <View
      key="tag"
      style={[
        styles.part,
        styles.tagTip,
        {
          left: (size - side) / 2,
          top: (size - side) / 2 + size * 0.04,
          width: side,
          height: side,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: side * 0.18,
          transform: [{rotate: '45deg'}],
        },
      ]}>
      {box({
        left: stroke * 0.6,
        top: stroke * 0.6,
        width: hole,
        height: hole,
        borderRadius: hole / 2,
        backgroundColor: color,
      })}
    </View>
  );
};

/** Head and shoulders. */
const members: Draw = (size, stroke, color) => {
  const head = size * 0.44;
  const shoulders = size * 0.84;
  return [
    box(
      {
        left: (size - head) / 2,
        top: 0,
        width: head,
        height: head,
        borderRadius: head / 2,
        borderWidth: stroke,
        borderColor: color,
      },
      'head',
    ),
    box(
      {
        left: (size - shoulders) / 2,
        bottom: 0,
        width: shoulders,
        height: size * 0.42,
        borderTopLeftRadius: shoulders / 2,
        borderTopRightRadius: shoulders / 2,
        borderWidth: stroke,
        borderBottomWidth: stroke,
        borderColor: color,
      },
      'shoulders',
    ),
  ];
};

/** A capital T. */
const title: Draw = (size, stroke, color) => {
  const bar = stroke * 1.3;
  return [
    box(
      {
        left: size * 0.1,
        top: size * 0.08,
        width: size * 0.8,
        height: bar,
        backgroundColor: color,
      },
      'top',
    ),
    box(
      {
        left: (size - bar) / 2,
        top: size * 0.08,
        width: bar,
        height: size * 0.84,
        backgroundColor: color,
      },
      'stem',
    ),
  ];
};

/** A paragraph: four lines, the last one shorter. */
const description: Draw = (size, stroke, color) => {
  const step = (size - stroke) / 3;
  return [0, 1, 2, 3].map(row =>
    box(
      {
        left: 0,
        top: row * step,
        width: row === 3 ? size * 0.6 : size,
        height: stroke,
        backgroundColor: color,
      },
      row,
    ),
  );
};

/** A ticked box. */
const checklist: Draw = (size, stroke, color) => {
  const tickWidth = size * 0.5;
  const tickHeight = size * 0.26;
  return [
    box(
      {
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderWidth: stroke,
        borderColor: color,
        borderRadius: stroke,
      },
      'box',
    ),
    // An "L" turned a quarter left is a tick.
    box(
      {
        left: (size - tickWidth) / 2,
        top: (size - tickHeight) / 2 - size * 0.06,
        width: tickWidth,
        height: tickHeight,
        borderLeftWidth: stroke,
        borderBottomWidth: stroke,
        borderColor: color,
        transform: [{rotate: '-45deg'}],
      },
      'tick',
    ),
  ];
};

const DRAW: Readonly<Record<BlockIconKind, Draw>> = {
  board,
  list,
  labels,
  members,
  title,
  description,
  checklist,
};

/**
 * Icon of a block of a card (board, list, labels, members, title,
 * description, checklist), drawn with plain views like the other icons:
 * the plugin cannot ship native SVG support.
 */
export function BlockIcon({
  kind,
  size,
  color,
}: BlockIconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  return (
    <View
      style={{width: size, height: size}}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {DRAW[kind](size, stroke, color)}
    </View>
  );
}

const styles = StyleSheet.create({
  part: {
    position: 'absolute',
  },
  /** The sharp corner of the tag, pointing up once turned. */
  tagTip: {
    borderTopLeftRadius: 0,
  },
});
