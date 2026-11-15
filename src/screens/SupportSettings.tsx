import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {Button} from '../components/Button';
import {QrCodeView} from '../components/QrCodeView';
import {SettingsSection} from '../components/SettingsSection';
import {useTranslation} from '../i18n';
import {displayUrl, openInBrowser} from '../platform/browser';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  DONATION_URL,
  FUNDING_GOAL,
  FUNDING_URL,
  INKHUB_URL,
} from '../support/config';
import {
  fetchFundingTotal,
  fundingProgress,
  FundingTotal,
  loadCachedFunding,
  saveCachedFunding,
} from '../support/funding';
import {borders, colors, spacing, typography} from '../theme';

/** Side of the QR codes, quiet zone included. */
const QR_SIZE = 170;
const BAR_HEIGHT = 28;

export interface SupportSettingsProps {
  store: KeyValueStore;
  /** Asks for network access; resolves `false` if refused. */
  ensureNetwork: () => Promise<boolean>;
}

/**
 * The Support s-INK category: feedback first (bugs, ideas and ratings go
 * through InkHub for now), then donations toward the current funding
 * goal, with the amount raised read from the relay (the last one read is
 * shown offline).
 */
export function SupportSettings({
  store,
  ensureNetwork,
}: SupportSettingsProps): React.JSX.Element {
  const {t} = useTranslation();
  const total = useFundingTotal(store, ensureNetwork);

  const progress = fundingProgress(total?.raised ?? 0, FUNDING_GOAL.target);
  const target = String(FUNDING_GOAL.target);

  return (
    <>
      <Text style={[styles.text, styles.intro]}>{t('support.intro')}</Text>

      <SettingsSection title={t('support.feedback')}>
        <Text style={styles.text}>{t('support.feedbackText')}</Text>
        <LinkBlock url={INKHUB_URL} label={t('support.inkhubQr')} />
      </SettingsSection>

      <SettingsSection title={t('support.donate')}>
        <View style={styles.card}>
          <Text style={styles.goalTitle}>{t('support.goalTitle')}</Text>
          <Text style={styles.text}>{t('support.goalWhy')}</Text>

          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{min: 0, max: 100, now: progress.percent}}
            style={styles.bar}>
            <View style={[styles.fill, {width: `${progress.percent}%`}]} />
          </View>
          <View style={styles.amounts}>
            <Text style={[styles.text, styles.bold]}>
              {progress.reached
                ? t('support.goalReached')
                : total
                ? t('support.raised', {amount: String(progress.raised)})
                : t('support.raisedUnknown')}
            </Text>
            <Text style={styles.text}>
              {progress.reached
                ? t('support.ofTarget', {
                    amount: String(progress.raised),
                    target,
                  })
                : t('support.percentOf', {
                    percent: String(progress.percent),
                    target,
                  })}
            </Text>
          </View>
          <Text style={styles.small}>{t('support.goalBreakdown')}</Text>
        </View>
        <LinkBlock url={DONATION_URL} label={t('support.donateQr')} />
      </SettingsSection>
    </>
  );
}

/**
 * The last total read, then the relay's. Network access is asked only
 * when there is a relay to read from.
 */
function useFundingTotal(
  store: KeyValueStore,
  ensureNetwork: () => Promise<boolean>,
): FundingTotal | null {
  const [total, setTotal] = useState<FundingTotal | null>(null);
  // Read once per opening, even if the parent passes a new function.
  const askNetwork = useRef(ensureNetwork);
  askNetwork.current = ensureNetwork;

  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await loadCachedFunding(store);
      if (active && cached) {
        setTotal(cached);
      }
      if (!FUNDING_URL || !(await askNetwork.current())) {
        return;
      }
      const fresh = await fetchFundingTotal(FUNDING_URL);
      if (active && fresh && fresh.currency === FUNDING_GOAL.currency) {
        setTotal(fresh);
        saveCachedFunding(store, fresh);
      }
    })();
    return () => {
      active = false;
    };
  }, [store]);

  return total;
}

/**
 * A QR code to scan with a phone, the address printed under it, and a
 * button opening it in the tablet's browser. Without an address yet, a
 * "coming soon" line.
 */
function LinkBlock({
  url,
  label,
}: {
  url: string;
  label: string;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [failed, setFailed] = useState(false);

  const open = useCallback(() => {
    setFailed(false);
    openInBrowser(url).then(opened => setFailed(!opened));
  }, [url]);

  if (!url) {
    return <Text style={styles.small}>{t('support.comingSoon')}</Text>;
  }
  return (
    <View style={styles.link}>
      <QrCodeView value={url} size={QR_SIZE} accessibilityLabel={label} />
      <View style={styles.linkTexts}>
        <Text style={[styles.text, styles.bold]}>{t('support.scan')}</Text>
        <Text style={styles.url}>{displayUrl(url)}</Text>
        <View style={styles.actions}>
          <Button label={t('support.openBrowser')} onPress={open} />
        </View>
        {failed && (
          <Text accessibilityRole="alert" style={styles.small}>
            {t('error.browserUnavailable')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  intro: {
    marginBottom: spacing.lg,
  },
  bold: {
    fontWeight: '700',
  },
  small: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  card: {
    gap: spacing.sm,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius * 2,
    padding: spacing.md,
  },
  goalTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  bar: {
    height: BAR_HEIGHT,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius / 2,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.foreground,
  },
  amounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  linkTexts: {
    flex: 1,
    gap: spacing.xs,
  },
  url: {
    color: colors.foreground,
    fontSize: typography.body,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
});
