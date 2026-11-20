/**
 * Owner plans and prices — the plan catalogue's lifecycle surface.
 *
 * Reads `plans` and writes only through the owner-gated server functions:
 * `create_plan` (validated name/duration/positive price, INR),
 * `update_plan_price` (price change with an audit entry) and
 * `deactivate_plan` (soft `is_active = false`). Deactivation never touches a
 * member's locked price or an applied term — historical records are derived
 * from the stored rows, not from the catalogue.
 *
 * Demo mode shows the approved demo catalogue with every write disabled;
 * nothing is faked as saved.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerSection,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerStatusText,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { createPlan, deactivatePlan, updatePlanPrice, usePlans } from '@/services/data';
import { formatCurrency } from '@/utils/format';
import type { MembershipPlan, PlanDuration } from '@/types/domain';

const durationLabels: Record<PlanDuration, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfYearly: 'Half-yearly',
  yearly: 'Yearly',
};

const durationOptions = (Object.keys(durationLabels) as PlanDuration[]).map((value) => ({
  value,
  label: durationLabels[value],
}));

export default function OwnerPlansScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const plansResource = usePlans();
  const live = plansResource.isLive;
  const plans = plansResource.data;
  const loading = plansResource.status === 'loading';
  const hasError = plansResource.status === 'error';

  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);

  const [deactivating, setDeactivating] = useState<MembershipPlan | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDuration, setNewDuration] = useState<PlanDuration>('monthly');
  const [newPrice, setNewPrice] = useState('');
  const [createErrors, setCreateErrors] = useState<Record<string, string | undefined>>({});

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const ordered = useMemo(
    () =>
      [...plans].sort((a, b) => {
        const aActive = a.isActive !== false;
        const bActive = b.isActive !== false;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return a.price - b.price;
      }),
    [plans],
  );
  const activeCount = ordered.filter((plan) => plan.isActive !== false).length;
  const inactiveCount = ordered.length - activeCount;

  const refreshAll = () => plansResource.refresh();

  const openPrice = (plan: MembershipPlan) => {
    setActionError(null);
    setNotice(null);
    setPriceError(null);
    setPriceDraft(String(plan.price));
    setEditing(plan);
  };

  const savePrice = async () => {
    if (!editing || busy || !live) return;
    const price = Number(priceDraft.trim());
    if (!Number.isFinite(price) || price <= 0) {
      setPriceError('Enter a price greater than zero, in whole rupees.');
      return;
    }
    setPriceError(null);
    setBusy(true);
    const outcome = await updatePlanPrice(editing.id, price);
    setBusy(false);
    if (!outcome.ok) {
      setPriceError(outcome.error);
      return;
    }
    const name = editing.name;
    setEditing(null);
    setSavedOpen(true);
    setNotice(
      `${name}'s price is now ${formatCurrency(price)} for new subscriptions. Existing members keep their locked price; the server wrote an audit entry.`,
    );
    refreshAll();
  };

  const confirmDeactivate = async () => {
    if (!deactivating || busy || !live) return;
    setBusy(true);
    const outcome = await deactivatePlan(deactivating.id);
    setBusy(false);
    if (!outcome.ok) {
      setActionError(outcome.error);
      setDeactivating(null);
      return;
    }
    const name = deactivating.name;
    setDeactivating(null);
    setSavedOpen(true);
    setNotice(
      `${name} is now inactive for new subscriptions. Existing memberships and locked prices are untouched; the server wrote an audit entry.`,
    );
    refreshAll();
  };

  const openCreate = () => {
    setCreateErrors({});
    setNewName('');
    setNewDuration('monthly');
    setNewPrice('');
    setActionError(null);
    setNotice(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (busy || !live) return;
    const next: Record<string, string | undefined> = {};
    const name = newName.trim();
    const price = Number(newPrice.trim());
    if (!name) next.name = 'Enter a plan name.';
    if (!Number.isFinite(price) || price <= 0) {
      next.price = 'Enter a price greater than zero, in whole rupees.';
    }
    setCreateErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const outcome = await createPlan(name, newDuration, price, 'INR', true);
    setBusy(false);
    if (!outcome.ok) {
      setCreateErrors({ server: outcome.error });
      return;
    }
    setCreateOpen(false);
    setSavedOpen(true);
    setNotice(
      `${name} was created as an active ${durationLabels[newDuration].toLowerCase()} plan at ${formatCurrency(price)}. The server wrote an audit entry.`,
    );
    refreshAll();
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Plans and prices"
        eyebrow="Administration"
        subtitle={live ? 'The live catalogue and its audited changes' : 'The approved demo catalogue'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={
          live ? <DataRefreshControl refreshing={loading} onRefresh={refreshAll} /> : undefined
        }>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Plans could not load"
              message={plansResource.error ?? 'The plan catalogue is unavailable right now.'}
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && loading && plans.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}

        <RiseIn>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Every change is an owner-gated server function with an audit entry. A price change applies to new subscriptions only: a member keeps the price locked when their payment was verified. Deactivation is soft — the row stays for history and existing memberships are never rewritten.'
                : 'Demo mode disables every write. The catalogue below is the approved demo set; nothing is saved, and plan changes are performed only by the audited server actions in live mode.'}
            </AppText>
          </OwnerWell>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <OwnerSection
            title={`Plans — ${activeCount} active${inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''}`}
            action={
              <Button
                label="New plan"
                size="small"
                variant="secondary"
                icon="add-outline"
                disabled={!live || busy}
                onPress={openCreate}
              />
            }>
            {ordered.length === 0 ? (
              <OwnerWell>
                <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                  No plans on record. Create one to start selling memberships.
                </AppText>
              </OwnerWell>
            ) : (
              <OwnerListGroup>
                {ordered.map((plan, index) => {
                  const active = plan.isActive !== false;
                  return (
                    <View key={plan.id}>
                      {index > 0 && <OwnerRowDivider />}
                      <OwnerListRow
                        title={`${plan.name} · ${formatCurrency(plan.price)}`}
                        detail={`${durationLabels[plan.duration]} · ${plan.currency}`}
                        status={
                          <OwnerStatusText
                            label={active ? 'Active' : 'Inactive'}
                            tone={active ? 'up' : 'neutral'}
                          />
                        }
                        meta={
                          live && active ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
                              <Button
                                label="Change price"
                                size="small"
                                variant="secondary"
                                disabled={busy}
                                onPress={() => openPrice(plan)}
                              />
                              <Button
                                label="Deactivate"
                                size="small"
                                variant="secondary"
                                disabled={busy}
                                onPress={() => {
                                  setActionError(null);
                                  setDeactivating(plan);
                                }}
                              />
                            </View>
                          ) : undefined
                        }
                      />
                    </View>
                  );
                })}
              </OwnerListGroup>
            )}
            {actionError && (
              <AppText variant="caption" style={{ color: colors.dangerStrong, marginTop: spacing.xs }}>
                The server refused the change: {actionError}
              </AppText>
            )}
          </OwnerSection>
        </RiseIn>

        <RiseIn index={2} style={{ marginTop: spacing.md }}>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Plan price changes never alter a recorded payment, an applied term or a member&apos;s
              locked price. The reception desk can request a plan change for a member; it applies on
              the next verified payment, priced at that moment.
            </AppText>
          </OwnerWell>
        </RiseIn>
      </OwnerScreen>

      {/* Price change */}
      <ModalSheet
        visible={editing !== null}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        title="Change plan price"
        subtitle={editing?.name}>
        {editing ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Current price {formatCurrency(editing.price)} · {durationLabels[editing.duration]}. The
              new price applies to new subscriptions; members keep the price locked at their verified
              payment.
            </AppText>
            <TextField
              label="New price (whole rupees)"
              placeholder="0"
              keyboardType="number-pad"
              inputMode="numeric"
              value={priceDraft}
              onChangeText={(value) => {
                setPriceDraft(value);
                setPriceError(null);
              }}
              error={priceError}
              editable={!busy}
            />
            <Button
              label={busy ? 'Saving…' : 'Save price'}
              fullWidth
              disabled={busy}
              onPress={() => void savePrice()}
            />
            <Button
              label="Cancel"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => setEditing(null)}
            />
          </View>
        ) : null}
      </ModalSheet>

      {/* Deactivation confirmation */}
      <ModalSheet
        visible={deactivating !== null}
        onClose={() => {
          if (!busy) setDeactivating(null);
        }}
        title="Deactivate plan"
        subtitle={deactivating?.name}>
        {deactivating ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="body" style={{ color: colors.ownerInk }}>
              {deactivating.name} will stop being offered for new subscriptions. Existing members
              keep their plan, their locked price and their applied term — nothing is rewritten.
            </AppText>
            <Button
              label={busy ? 'Deactivating…' : 'Deactivate plan'}
              fullWidth
              variant="secondary"
              disabled={busy}
              onPress={() => void confirmDeactivate()}
            />
            <Button
              label="Cancel"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => setDeactivating(null)}
            />
          </View>
        ) : null}
      </ModalSheet>

      {/* New plan */}
      <ModalSheet
        visible={createOpen}
        onClose={() => {
          if (!busy) setCreateOpen(false);
        }}
        title="New plan"
        subtitle="Created active; you can deactivate it later">
        <View style={{ gap: spacing.sm }}>
          <TextField
            label="Plan name"
            placeholder="Monthly"
            value={newName}
            onChangeText={(value) => {
              setNewName(value);
              setCreateErrors((prev) => ({ ...prev, name: undefined }));
            }}
            error={createErrors.name}
            editable={!busy}
          />
          <View>
            <AppText variant="label" style={{ color: colors.ownerInkMuted, marginBottom: spacing['3xs'] }}>
              Duration
            </AppText>
            <SegmentedTabs
              size="small"
              variant="owner"
              options={durationOptions}
              value={newDuration}
              onChange={(value) => setNewDuration(value as PlanDuration)}
            />
          </View>
          <TextField
            label="Price (whole rupees)"
            placeholder="0"
            keyboardType="number-pad"
            inputMode="numeric"
            value={newPrice}
            onChangeText={(value) => {
              setNewPrice(value);
              setCreateErrors((prev) => ({ ...prev, price: undefined }));
            }}
            error={createErrors.price}
            editable={!busy}
          />
          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
            Currency is fixed to INR by the server. Duration boundaries follow calendar months:
            1, 3, 6 or 12 months from the verified payment.
          </AppText>
          {createErrors.server && (
            <AppText variant="caption" style={{ color: colors.dangerStrong }}>
              {createErrors.server}
            </AppText>
          )}
          <Button
            label={busy ? 'Creating…' : 'Create plan'}
            fullWidth
            disabled={busy}
            onPress={() => void submitCreate()}
          />
          <Button
            label="Cancel"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => setCreateOpen(false)}
          />
        </View>
      </ModalSheet>

      <ModalSheet
        visible={savedOpen}
        onClose={() => setSavedOpen(false)}
        title="Plan update recorded"
        subtitle="Applied by the server">
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <SuccessPop size={54} color={colors.success} />
        </View>
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          {notice ?? 'The plan change was recorded.'}
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setSavedOpen(false)} />
        </View>
      </ModalSheet>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}
