/**
 * Reception notification bell — the desk's in-app centre.
 *
 * The badge and the list are derived from the same authorised queries the
 * desk screens use (see `useReceptionNotifications`). Read marks live in this
 * component's memory for the session only; they are not persisted and no
 * server read state is invented.
 *
 * Wording is deliberately in-app: nothing here says a message was sent,
 * delivered or pushed, because no push/SMS/email provider is configured.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button, IconButton } from '@/components/ui/button';
import { PressSurface } from '@/components/ui/press-surface';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { useTokens } from '@/hooks/use-tokens';
import { useReceptionNotifications } from '@/hooks/use-reception-notifications';
import type { InAppNotification } from '@/types/domain';

const toneIcon: Record<InAppNotification['tone'], keyof typeof Ionicons.glyphMap> = {
  warning: 'alert-circle-outline',
  info: 'information-circle-outline',
  danger: 'alert-outline',
  success: 'checkmark-circle-outline',
};

export function ReceptionNotificationBell() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  const { items, total, loading, error, refresh } = useReceptionNotifications();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Record<string, true>>({});

  const unread = items.filter((item) => !read[item.id]).length;

  const toneColor = (tone: InAppNotification['tone']) => {
    if (tone === 'warning') return colors.ownerWarningDeep;
    if (tone === 'danger') return colors.ownerErrorDeep;
    if (tone === 'success') return colors.ownerSuccessDeep;
    return colors.ownerAccentDeep;
  };

  const openItem = (item: InAppNotification) => {
    setRead((prev) => ({ ...prev, [item.id]: true }));
    setOpen(false);
    router.navigate(item.href as never);
  };

  return (
    <>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <IconButton
          name={unread > 0 ? 'notifications' : 'notifications-outline'}
          tone="inverse"
          label={
            unread > 0
              ? `Notifications, ${unread} open in-app ${unread === 1 ? 'item' : 'items'}`
              : 'Notifications, nothing open'
          }
          onPress={() => setOpen(true)}
        />
        {unread > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 4,
              right: 2,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 4,
              borderRadius: radius.pill,
              backgroundColor: colors.ownerAccent,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText
              variant="caption"
              style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 10, lineHeight: 14 }}>
              {unread > 9 ? '9+' : String(unread)}
            </AppText>
          </View>
        )}
      </View>

      <ModalSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        subtitle={
          loading
            ? 'Checking your desk data'
            : items.length === 0
              ? 'Nothing open right now'
              : `${items.length} ${items.length === 1 ? 'kind' : 'kinds'} of open items · ${total} in total`
        }
        toneBadge={
          unread > 0 ? (
            <AppText variant="caption" style={{ color: colors.ownerWarningDeep, fontWeight: '700' }}>
              {unread} unread
            </AppText>
          ) : undefined
        }>
        <View style={{ gap: spacing.xs }}>
          {error && (
            <AppText variant="caption" style={{ color: colors.ownerErrorDeep }}>
              Some desk data could not load: {error}
            </AppText>
          )}
          {items.length === 0 ? (
            <AppText variant="body" style={{ color: colors.ownerInk }}>
              {loading
                ? 'Checking the desk data…'
                : error
                  ? 'The notification data is unavailable right now. Pull to refresh the home screen and try again.'
                  : 'Nothing is waiting on the desk. New items appear here from the same records the desk screens show.'}
            </AppText>
          ) : (
            items.map((item) => {
              const isRead = read[item.id] === true;
              return (
                <PressSurface
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.detail}. ${isRead ? 'Read' : 'Unread'}.`}
                  onPress={() => openItem(item)}
                  scaleOnPress={false}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.xs,
                    borderRadius: radius.sm,
                    backgroundColor: isRead ? 'transparent' : colors.ownerPanelMuted,
                    opacity: isRead ? 0.65 : 1,
                  }}>
                  <Ionicons
                    name={toneIcon[item.tone]}
                    size={20}
                    color={toneColor(item.tone)}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                      {item.title}
                    </AppText>
                    <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                      {item.detail}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ownerInkMuted} />
                </PressSurface>
              );
            })
          )}
          {unread > 0 && (
            <Button
              label="Mark all read"
              variant="secondary"
              fullWidth
              onPress={() => {
                const next: Record<string, true> = {};
                for (const item of items) next[item.id] = true;
                setRead(next);
              }}
            />
          )}
          {error && (
            <Button label="Retry" variant="secondary" fullWidth onPress={refresh} />
          )}
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'] }}>
            In-app only. Push, SMS and email delivery are not configured, so nothing is sent and no
            delivery is claimed. Read marks are kept in memory for this session and reset when the app
            restarts.
          </AppText>
        </View>
      </ModalSheet>
    </>
  );
}
