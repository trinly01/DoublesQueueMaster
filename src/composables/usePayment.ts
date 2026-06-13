import { ref } from 'vue';
import { likhaClient } from 'src/boot/likha';
import { readItems } from '@likha-erp/likha-sdk';

export function usePayment() {
  const paymentLoading = ref(false);
  const paymentLink = ref('');

  const fetchPaymentSettings = async () => {
    try {
      const result = await likhaClient.request(
        readItems('payment_settings', {
          fields: ['club_activation_payment_link'] as string[],
          limit: 1,
        }),
      );

      const settings = result as unknown as Record<string, unknown>;
      paymentLink.value =
        typeof settings.club_activation_payment_link === 'string'
          ? settings.club_activation_payment_link
          : '';
    } catch (err) {
      console.warn('Failed to fetch payment settings:', err);
    }
  };

  const callPayment = async (body: { clubId?: string; playerId?: string }) => {
    if (!paymentLink.value || paymentLoading.value) return;
    paymentLoading.value = true;
    try {
      const token = await likhaClient.getToken();
      const response = await fetch(paymentLink.value, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()).data;
      console.log('Payment POST result:', result);

      if (result && typeof result.invoice_url === 'string') {
        window.open(result.invoice_url, '_blank');
      }
    } catch (err) {
      console.error('Payment request failed:', err);
    } finally {
      paymentLoading.value = false;
    }
  };

  return {
    paymentLoading,
    paymentLink,
    fetchPaymentSettings,
    callPayment,
  };
}
