import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {Button} from '../components/Button';
import {Checkbox} from '../components/Checkbox';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {TokenStorageNotice} from '../components/TokenStorageNotice';
import {useTranslation} from '../i18n';
import {TokenStorage} from '../session/trelloSession';
import {TrelloMember} from '../trello';
import {borders, colors, spacing, typography} from '../theme';
import {APP_VERSION} from '../version';

const AVATAR_SIZE = 56;

export interface SettingsScreenProps {
  /** The connected member; the account settings are hidden without one. */
  member: TrelloMember | null;
  tokenStorage?: TokenStorage;
  saveFailed?: boolean;
  showRoadmap: boolean;
  onShowRoadmapChange: (show: boolean) => void;
  /** Saves the token on the tablet, or removes it from there. */
  onRememberChange: (remember: boolean) => void;
  onDisconnect: () => void;
  onBack: () => void;
}

/**
 * Settings that are rarely needed, kept off the boards page: the boards
 * page display, the connected account and where its token is kept.
 */
export function SettingsScreen({
  member,
  tokenStorage,
  saveFailed,
  showRoadmap,
  onShowRoadmapChange,
  onRememberChange,
  onDisconnect,
  onBack,
}: SettingsScreenProps): React.JSX.Element {
  const {t} = useTranslation();

  return (
    <ScreenFrame
      title={t('settings.title')}
      subtitle={t('app.version', {version: APP_VERSION})}
      onBack={onBack}>
      <Section title={t('settings.display')}>
        <Checkbox
          label={t('settings.showRoadmap')}
          checked={showRoadmap}
          onChange={onShowRoadmapChange}
        />
      </Section>

      {member && tokenStorage && (
        <AccountSettings
          member={member}
          tokenStorage={tokenStorage}
          saveFailed={saveFailed}
          onRememberChange={onRememberChange}
          onDisconnect={onDisconnect}
        />
      )}
    </ScreenFrame>
  );
}

function AccountSettings({
  member,
  tokenStorage,
  saveFailed,
  onRememberChange,
  onDisconnect,
}: {
  member: TrelloMember;
  tokenStorage: TokenStorage;
  saveFailed?: boolean;
  onRememberChange: (remember: boolean) => void;
  onDisconnect: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  return (
    <>
      <Section title={t('settings.account')}>
        <View style={styles.member}>
          <MemberAvatar
            initials={member.initials}
            avatarUrl={member.avatarUrl}
            size={AVATAR_SIZE}
          />
          <Text style={[styles.text, styles.memberText]}>
            {t('settings.signedInAs', {
              name: member.fullName,
              username: member.username,
            })}
          </Text>
        </View>
        {confirmingDisconnect ? (
          <View style={styles.confirm}>
            <Text accessibilityRole="alert" style={styles.text}>
              {t('settings.disconnectConfirm')}
            </Text>
            <View style={styles.actions}>
              <Button
                label={t('common.cancel')}
                onPress={() => setConfirmingDisconnect(false)}
              />
              <Button
                primary
                label={t('settings.disconnect')}
                onPress={onDisconnect}
              />
            </View>
          </View>
        ) : (
          <Button
            label={t('settings.disconnect')}
            onPress={() => setConfirmingDisconnect(true)}
          />
        )}
      </Section>

      <Section title={t('settings.token')}>
        <TokenStorageNotice
          tokenStorage={tokenStorage}
          saveFailed={saveFailed}
          onChange={onRememberChange}
        />
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width / 2,
    paddingBottom: spacing.xs,
  },
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  memberText: {
    flex: 1,
  },
  confirm: {
    gap: spacing.md,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
