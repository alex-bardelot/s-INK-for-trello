import React from 'react';
import {ImageURISource, StyleSheet, View} from 'react-native';

import {AttachmentImage} from '../components/AttachmentImage';
import {ScreenFrame} from '../components/ScreenFrame';
import {SmallButton} from '../components/SmallButton';
import {useTranslation} from '../i18n';
import {openInBrowser} from '../platform/browser';

export interface AttachmentViewerProps {
  name: string;
  /** The largest image Trello made of the attachment. */
  source: ImageURISource;
  /** Web address of the attachment itself, offered in the browser if set. */
  url: string | null;
  onClose: () => void;
}

/**
 * Page showing an attachment's image over the card, as large as the page
 * allows, with its name in the title bar. Back returns to the card; the
 * attachment itself can still be opened in the browser.
 */
export function AttachmentViewer({
  name,
  source,
  url,
  onClose,
}: AttachmentViewerProps): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <ScreenFrame
      title={name}
      onBack={onClose}
      actions={
        url !== null && (
          <SmallButton
            label={t('cardDetail.openAttachment')}
            accessibilityLabel={t('cardDetail.openAttachmentHint')}
            onPress={() => openInBrowser(url)}
          />
        )
      }>
      <View style={styles.page}>
        <AttachmentImage messages source={source} style={styles.image} />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  image: {
    flex: 1,
    width: '100%',
  },
});
