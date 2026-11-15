import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Orientation} from '../board/layout';
import {colors} from '../theme';

/** Long side of the drawn tablet. */
const LONG_SIDE = 132;
/** Ratio of the tablet's short side to its long side. */
const SIDE_RATIO = 0.76;
/** Frame around the screen, thicker on the side of the pen holder. */
const BEZEL = 7;
const BEZEL_THICK = 14;
/** Cards drawn per list, from tallest to shortest. */
const CARD_HEIGHTS = [0.22, 0.15, 0.18, 0.12];

export interface TabletPreviewProps {
  orientation: Orientation;
  /** Lists shown side by side. */
  columns: number;
}

/**
 * A small drawing of the tablet held in `orientation`, showing the board
 * view with `columns` lists side by side: a dark header and a few cards
 * per list. It follows the column count as it is changed.
 */
export function TabletPreview({
  orientation,
  columns,
}: TabletPreviewProps): React.JSX.Element {
  const portrait = orientation === 'portrait';
  const short = Math.round(LONG_SIDE * SIDE_RATIO);
  const width = portrait ? short : LONG_SIDE;
  const height = portrait ? LONG_SIDE : short;
  // The thick bezel is at the bottom in portrait, on the left in landscape.
  const frame = portrait
    ? {
        paddingTop: BEZEL,
        paddingBottom: BEZEL_THICK,
        paddingHorizontal: BEZEL,
      }
    : {
        paddingLeft: BEZEL_THICK,
        paddingRight: BEZEL,
        paddingVertical: BEZEL,
      };
  const screenHeight =
    height - (portrait ? BEZEL + BEZEL_THICK : 2 * BEZEL) - 2;
  const gap = columns > 3 ? 2 : 3;
  return (
    <View
      style={[styles.tablet, {width, height}, frame]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.screen}>
        <View style={styles.titleBar} />
        <View style={[styles.lists, {gap}]}>
          {Array.from({length: columns}, (_, list) => (
            <View key={list} style={styles.list}>
              <View style={styles.listHeader} />
              {CARD_HEIGHTS.map((_share, card) => (
                <View
                  key={card}
                  style={[
                    styles.card,
                    {
                      // Shifted per list, so lists do not look all alike.
                      height: Math.max(
                        4,
                        Math.round(
                          screenHeight *
                            CARD_HEIGHTS[(card + list) % CARD_HEIGHTS.length],
                        ),
                      ),
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tablet: {
    borderColor: colors.foreground,
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    borderColor: colors.foreground,
    borderWidth: 1,
    padding: 3,
    gap: 3,
    overflow: 'hidden',
  },
  titleBar: {
    height: 5,
    backgroundColor: colors.avatar,
  },
  lists: {
    flex: 1,
    flexDirection: 'row',
  },
  list: {
    flex: 1,
    gap: 2,
  },
  listHeader: {
    height: 5,
    borderRadius: 1,
    backgroundColor: colors.listHeader,
  },
  card: {
    borderColor: colors.foreground,
    borderWidth: 1,
    borderRadius: 1,
  },
});
