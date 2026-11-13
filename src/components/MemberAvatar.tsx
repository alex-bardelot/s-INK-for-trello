import React, {useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import {colors} from '../theme';

export interface MemberAvatarProps {
  initials: string;
  /** Trello avatar base URL (`…/{size}.png` is appended), or none. */
  avatarUrl?: string | null;
  size: number;
}

/**
 * Round Trello avatar. The initials stay underneath, so they show while the
 * image loads and when it cannot be loaded.
 */
export function MemberAvatar({
  initials,
  avatarUrl,
  size,
}: MemberAvatarProps): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View
      style={[
        styles.avatar,
        {width: size, height: size, borderRadius: size / 2},
      ]}>
      <Text style={[styles.initials, {fontSize: Math.round(size * 0.4)}]}>
        {initials}
      </Text>
      {avatarUrl && !imageFailed && (
        <Image
          source={{uri: `${avatarUrl}/${size > 50 ? 170 : 50}.png`}}
          style={styles.image}
          onError={() => setImageFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatar,
  },
  initials: {
    color: colors.foreground,
    fontWeight: '700',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
});
