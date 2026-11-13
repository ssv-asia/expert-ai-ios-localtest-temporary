export type StorePlan = {
  label: string;
  price: number;
  weekly: number;
  message: string;
  headline: number;
  haiku: number;
  sonnet: number;
  luna: number;
  apps: string[];
};

export type PlanBillingPeriod = 'monthly' | 'weekly';

export type ModelAllowance = { model: string; tokens: number };

function formatTokenAllowance(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions.toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  }
  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return `${thousands.toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
  }
  return tokens.toLocaleString('en-US');
}

export function planModelAllowances(plan: StorePlan, period: PlanBillingPeriod): ModelAllowance[] {
  const scale = period === 'monthly' ? 1 : 1 / 3;
  return [
    { model: 'Expert AI', tokens: plan.headline },
    { model: 'Claude Haiku 5.5', tokens: plan.haiku },
    { model: 'Claude Sonnet 5.5', tokens: plan.sonnet },
    { model: 'GPT-6 Luna', tokens: plan.luna },
  ]
    .filter((allowance) => allowance.tokens > 0)
    .map((allowance) => ({ ...allowance, tokens: Math.round(allowance.tokens * scale) }));
}

export function planFeatureLines(plan: StorePlan, period: PlanBillingPeriod): string[] {
  const allowances = planModelAllowances(plan, period);
  const totalTokens = allowances.reduce((total, allowance) => total + allowance.tokens, 0);
  return [
    `${formatTokenAllowance(totalTokens)} total model tokens per ${period === 'monthly' ? 'month' : 'week'}`,
    `Models: ${allowances.map(({ model }) => model).join(', ')}`,
    'Token usage limits apply separately by model.',
    `Works with ${plan.apps.join(', ')}`,
  ];
}

// Product IDs are deliberately kept separate from browser checkout mechanics
// so native builds can use the same catalog without bundling web payments.
export const TIER_STORE_PLANS: Record<number, StorePlan> = {
  11: { label: 'Essential', price: 299, weekly: 100, message: 'Everyday AI help, right on Android.', headline: 6000000, haiku: 100000, sonnet: 0, luna: 800000, apps: ['Android'] },
  12: { label: 'Pro', price: 599, weekly: 200, message: 'Take work from mobile chat to your desktop agent and Terminal.', headline: 12000000, haiku: 400000, sonnet: 0, luna: 1000000, apps: ['Android', 'Terminal', 'Agent'] },
  13: { label: 'Max', price: 999, weekly: 333, message: 'Add Expert OS and Claude Sonnet 5.5 to your AI toolkit.', headline: 20000000, haiku: 50000, sonnet: 300000, luna: 1800000, apps: ['Android', 'Terminal', 'Agent', 'Expert OS'] },
  14: { label: 'Founder', price: 1999, weekly: 666, message: 'Unlock the full Expert AI suite, including Terminal Pro.', headline: 40000000, haiku: 50000, sonnet: 650000, luna: 4000000, apps: ['Android', 'Terminal', 'Agent', 'Expert OS', 'Terminal Pro'] },
};

export const TIER_PRODUCT_IDS: Record<number, string> = {
  11: 'expert_ai_essential',
  12: 'expert_ai_pro',
  13: 'expert_ai_max',
  14: 'expert_ai_founder',
};
