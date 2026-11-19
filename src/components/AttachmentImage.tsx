import React, {useState} from 'react';
import {
  Image,
  ImageErrorEventData,
  ImageURISource,
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {useTranslation} from '../i18n';
import {logInkLink} from '../inkLink/diagnostics';
import {colors, spacing, typography} from '../theme';

export interface AttachmentImageProps {
  /**
   * What to load; unset, only the image's room is drawn (the invisible
   * copy that measures the card page loads nothing).
   */
  source?: ImageURISource;
  /** Size and place of the image's room, set before the image loads. */
  style: StyleProp<ViewStyle>;
  /** Shown in the room until the image is drawn, if set. */
  loadingText?: string;
}

/**
 * Image of an attachment, fitted whole into a room of a set size, so that
 * the page around it is laid out before it loads. It appears at once,
 * without fading in (each step of a fade is a refresh on E Ink); if it
 * cannot be loaded, the room says so and the `attach:` lines of
 * Diagnostics tell why.
 */
export function AttachmentImage({
  source,
  style,
  loadingText,
}: AttachmentImageProps): React.JSX.Element {
  const {t} = useTranslation();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  );
  const onError = (event: NativeSyntheticEvent<ImageErrorEventData>) => {
    const reason = String(event.nativeEvent?.error ?? 'unknown error');
    logInkLink(`attach: preview failed (${reason.slice(0, 120)})`);
    setStatus('failed');
  };
  const message =
    status === 'failed'
      ? t('cardDetail.previewFailed')
      : status === 'loading'
      ? loadingText
      : undefined;
  return (
    <View style={[styles.room, style]}>
      {message !== undefined && source && (
        <Text style={styles.message}>{message}</Text>
      )}
      {source && status !== 'failed' && (
        <Image
          source={source}
          resizeMode="contain"
          fadeDuration={0}
          style={styles.image}
          onLoad={() => setStatus('loaded')}
          onError={onError}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.small,
    textAlign: 'center',
    padding: spacing.sm,
  },
});
