import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@/lib/auth';
import type { AccountInfo, BalanceInfo } from '@/lib/gateway-client';
import { formatTokenCount } from '@/lib/gateway-client';
import { cancelTierSubscription, requestTierPaymentLink, requestTierSubscription } from '@/lib/web-payments';
import { TIER_STORE_PLANS } from '@/lib/plan-catalog';

export function WebAccountPanel({ visible, session, accountInfo, balance, onClose, onRefresh, onSignOut, onSignOutEverywhere, onDeleteAccount, onOpenConsole }: { visible: boolean; session: Session | null; accountInfo: AccountInfo | null; balance: BalanceInfo | null; onClose: () => void; onRefresh: () => Promise<void>; onSignOut: () => void; onSignOutEverywhere: () => void; onDeleteAccount: () => void; onOpenConsole: () => void }) {
  const [tier, setTier] = useState(13);
  const [kind, setKind] = useState<'weekly' | 'monthly'>('monthly');
  const [busy, setBusy] = useState(false);
  const plan = TIER_STORE_PLANS[tier];
  const price = kind === 'weekly' ? plan.weekly : plan.price;
  const subscription = accountInfo?.subscription;
  const usage = accountInfo?.expert_ai;
  const buy = async (autopay: boolean) => {
    if (!session?.token) return;
    setBusy(true);
    try {
      const result = autopay ? await requestTierSubscription(session.token, tier, kind) : await requestTierPaymentLink(session.token, tier, kind);
      if (result?.url) await Linking.openURL(result.url);
      await onRefresh();
    } catch (e) { alert(e instanceof Error ? e.message : 'Payment could not be started.'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!session?.token || !confirm('Cancel automatic renewal for this subscription?')) return;
    setBusy(true); try { await cancelTierSubscription(session.token); await onRefresh(); } catch (e) { alert(e instanceof Error ? e.message : 'Could not cancel subscription.'); } finally { setBusy(false); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.sheet}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={styles.kicker}>EXPERT AI ACCOUNT</Text><Text style={styles.email}>{session?.email}</Text></View><Pressable onPress={onClose}><Text style={styles.close}>×</Text></Pressable></View>
        <Text style={styles.title}>Your balance</Text>
        <View style={styles.balance}><Text style={styles.plan}>{accountInfo?.planLabel || 'Community'}</Text><Text style={styles.expiry}>{accountInfo?.expires ? `Renews/expires ${new Date(accountInfo.expires).toLocaleDateString()}` : 'No paid plan yet'}</Text>{usage?.total ? <Text style={styles.usage}>{formatTokenCount(usage.used)} / {formatTokenCount(usage.total)} tokens used</Text> : null}{balance?.community ? <Text style={styles.usage}>{balance.community.used} / {balance.community.limit} free messages used today</Text> : null}</View>
        <Text style={styles.title}>Choose a plan</Text><Text style={styles.muted}>Monthly includes 3× the weekly allowance. Weekly quotas and prices are exactly one-third.</Text>
        <View style={styles.toggle}><Pressable onPress={() => setKind('weekly')} style={[styles.toggleBtn, kind === 'weekly' && styles.selected]}><Text style={styles.toggleText}>Weekly</Text></Pressable><Pressable onPress={() => setKind('monthly')} style={[styles.toggleBtn, kind === 'monthly' && styles.selected]}><Text style={styles.toggleText}>Monthly · 3× tokens</Text></Pressable></View>
        <View style={styles.plans}>{Object.entries(TIER_STORE_PLANS).map(([index, p]) => <Pressable key={index} onPress={() => setTier(Number(index))} style={[styles.planCard, Number(index) === tier && styles.activeCard]}><Text style={styles.planName}>{p.label}</Text><Text style={styles.price}>₹{kind === 'weekly' ? p.weekly : p.price}</Text><Text style={styles.per}>{kind === 'weekly' ? 'per week' : 'per month'}</Text><Text style={styles.cardDetail}>{formatTokenCount(kind === 'weekly' ? Math.round(p.headline / 3) : p.headline)}+ usage</Text></Pressable>)}</View>
        <View style={styles.actions}><Pressable disabled={busy} onPress={() => buy(true)} style={styles.primary}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Subscribe & auto-renew · ₹{price}</Text>}</Pressable><Pressable disabled={busy} onPress={() => buy(false)} style={styles.secondary}><Text style={styles.secondaryText}>Buy once instead · ₹{price}</Text></Pressable></View>
        {subscription && subscription.status !== 'cancelled' ? <Pressable disabled={busy} onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel auto-pay ({subscription.status})</Text></Pressable> : null}
        <Pressable onPress={onRefresh} style={styles.link}><Text style={styles.linkText}>Restore purchases / refresh balance</Text></Pressable>
        <Text style={styles.title}>Application access</Text><Text style={styles.muted}>{plan.apps.join(' · ')}</Text><Text style={styles.muted}>Your plan unlocks the applications associated with this tier.</Text>
        {session?.email?.toLowerCase().includes('@ssv.asia') ? <Pressable onPress={onOpenConsole} style={styles.link}><Text style={styles.linkText}>Console</Text></Pressable> : null}
        <Pressable onPress={() => Linking.openURL('https://wa.me/919914499477')} style={styles.link}><Text style={styles.linkText}>Contact support</Text></Pressable>
        <Pressable onPress={onDeleteAccount} style={styles.link}><Text style={styles.danger}>Delete account</Text></Pressable>
        <Pressable onPress={onSignOut} style={styles.link}><Text style={styles.danger}>Sign out</Text></Pressable>
        <Pressable onPress={onSignOutEverywhere} style={styles.link}><Text style={styles.danger}>Sign out of all devices</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.62)', justifyContent: 'flex-end' }, sheet: { maxHeight: '92%', width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: '#171717', borderTopLeftRadius: 20, borderTopRightRadius: 20 }, content: { padding: 24, gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, kicker: { color: '#999', fontSize: 11, letterSpacing: 1 }, email: { color: '#fff', fontSize: 15, marginTop: 5 }, close: { color: '#fff', fontSize: 30, lineHeight: 30 }, title: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 12 }, muted: { color: '#a8a8a8', fontSize: 13, lineHeight: 19 }, balance: { backgroundColor: '#222', borderRadius: 14, padding: 16 }, plan: { color: '#fff', fontSize: 20, fontWeight: '700' }, expiry: { color: '#aaa', marginTop: 5 }, usage: { color: '#ddd', marginTop: 10 }, toggle: { flexDirection: 'row', gap: 8 }, toggleBtn: { flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 9, padding: 12, alignItems: 'center' }, selected: { backgroundColor: '#34345f', borderColor: '#7777d0' }, toggleText: { color: '#fff', fontWeight: '600' }, plans: { flexDirection: 'row', gap: 8 }, planCard: { flex: 1, minHeight: 125, backgroundColor: '#222', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#333' }, activeCard: { borderColor: '#8c83ff', backgroundColor: '#292650' }, planName: { color: '#fff', fontWeight: '700' }, price: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 9 }, per: { color: '#999', fontSize: 11 }, cardDetail: { color: '#bbb', fontSize: 12, marginTop: 12 }, actions: { gap: 8, marginTop: 8 }, primary: { minHeight: 48, borderRadius: 9, backgroundColor: '#635bff', alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#fff', fontWeight: '700' }, secondary: { minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: '#635bff', alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#c5c0ff', fontWeight: '700' }, cancel: { alignItems: 'center', padding: 10 }, cancelText: { color: '#ff9c9c' }, link: { alignItems: 'center', padding: 10 }, linkText: { color: '#aaa6ff', textDecorationLine: 'underline' }, danger: { color: '#ff9c9c' } });
