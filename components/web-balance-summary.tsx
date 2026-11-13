import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccountInfo, BalanceInfo } from '@/lib/gateway-client';
import { Fonts } from '@/constants/theme';

type Props = { balance: BalanceInfo | null; accountInfo: AccountInfo | null; colors: any };

const compact = (value?: number) => {
  if (typeof value !== 'number') return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} billion`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} million`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString();
};

export function WebBalanceSummary({ balance, accountInfo, colors }: Props) {
  if (Platform.OS !== 'web') return null;
  const usage = accountInfo?.expert_ai;
  const models = [
    ['Everyday assistant', accountInfo?.luna],
    ['Fast answers', accountInfo?.haiku],
    ['Deep research & coding', accountInfo?.sonnet],
  ] as const;
  const subscription = accountInfo?.subscription;
  const activePlan = accountInfo?.planLabel || balance?.tierLabel || 'Free';
  const expires = accountInfo?.expires ? new Date(accountInfo.expires).toLocaleDateString() : null;
  const passStatus = balance?.passActive ? (balance.monthly ? 'Monthly plan active' : 'Pass active') : 'No active paid plan';

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { backgroundColor: colors.buttonBackground, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.textTertiary }]}>CURRENT PLAN</Text>
        <Text style={[styles.plan, { color: colors.text }]}>{activePlan}</Text>
        <Text style={[styles.heroLine, { color: colors.textSecondary }]}>Unlimited AI included in your plan</Text>
        <Text style={[styles.heroLine, { color: colors.textTertiary }]}>{passStatus}{expires ? ` · renews/expires ${expires}` : ''}</Text>
        {usage ? <Text style={[styles.heroLine, { color: colors.textTertiary }]}>{compact(usage.used)} used of {compact(usage.total)} this cycle</Text> : null}
        {balance?.community ? <Text style={[styles.heroLine, { color: colors.textTertiary }]}>{balance.community.used} of {balance.community.limit} free messages used today</Text> : null}
        {subscription ? <Text style={[styles.heroLine, { color: colors.textTertiary }]}>Subscription: {subscription.status}</Text> : null}
      </View>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Your balance</Text>
      <View style={styles.grid}>
        {models.map(([label, item]) => (
          <View key={label} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.buttonBackground }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[styles.amount, { color: colors.text }]}>{item ? compact(Math.max(0, item.total - item.used)) : '—'}</Text>
            <Text style={[styles.sub, { color: colors.textTertiary }]}>{item ? `of ${compact(item.total)} remaining` : 'No separate allowance reported'}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.note, { color: colors.textTertiary }]}>Expert AI routes requests across the available models through one account balance. The figures above come from your live account data.</Text>
      <Pressable onPress={() => Linking.openURL('https://ssv.asia/dashboard/')} style={styles.dashboardLink}>
        <Text style={[styles.dashboardLinkText, { color: colors.accent }]}>Open detailed dashboard →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 18 },
  hero: { borderWidth: 1, borderRadius: 14, padding: 16 },
  kicker: { fontFamily: Fonts.sansSemiBold, fontSize: 10, letterSpacing: 1 },
  plan: { fontFamily: Fonts.sansBold, fontSize: 24, marginTop: 4 },
  heroLine: { fontFamily: Fonts.sans, fontSize: 12, marginTop: 5 },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, marginTop: 18, marginBottom: 8 },
  grid: { flexDirection: 'row', gap: 7 },
  card: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 11, padding: 10 },
  cardLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 11, minHeight: 30 },
  amount: { fontFamily: Fonts.sansBold, fontSize: 16, marginTop: 6 },
  sub: { fontFamily: Fonts.sans, fontSize: 10, marginTop: 2 },
  note: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 12 },
  dashboardLink: { alignSelf: 'flex-start', marginTop: 10 },
  dashboardLinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 12, textDecorationLine: 'underline' },
});
