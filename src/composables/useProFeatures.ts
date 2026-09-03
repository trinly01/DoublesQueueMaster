import { computed } from 'vue';
import { PlayerProfile } from 'src/services/playerProfile';

/**
 * Shared logic for Pro feature gating (blur/mask/paywall).
 *
 * - `isPaymentExpired`: true when the user has a `last_payment` older than
 *   30 days. No payment record = free access (false).
 * - `maskNum`: replaces a number with asterisks of the same digit count.
 * - `maskText`: replaces a string with asterisks of the same length.
 */
export function useProFeatures() {
  const isPaymentExpired = computed(() => {
    const lastPayment = PlayerProfile.state.lastPayment;
    if (!lastPayment) return false;
    const lastDate = new Date(lastPayment).getTime();
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return lastDate < oneMonthAgo;
  });

  const maskNum = (n: number | undefined, masked: boolean | undefined): string =>
    masked ? '*'.repeat(String(n ?? 0).length) : String(n ?? 0);

  const maskText = (text: string | undefined, masked: boolean | undefined): string =>
    masked ? (text ?? '').replace(/./g, '*') : (text ?? '');

  return {
    isPaymentExpired,
    maskNum,
    maskText,
  };
}
