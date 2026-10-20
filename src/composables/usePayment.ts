import { ref } from 'vue';
import { likhaClient } from 'src/services/likhaClient';
import { readItems } from '@likha-erp/likha-sdk';
import { useNotify } from 'src/composables/useNotify';

export function usePayment() {
  const { notify } = useNotify();
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
    if (paymentLoading.value) return;
    if (!paymentLink.value) await fetchPaymentSettings();
    if (!paymentLink.value) {
      notify({
        type: 'negative',
        message: 'Payment is unavailable right now. Please try again later.',
      });
      return;
    }
    // Must open synchronously within the click handler — popup blockers
    // kill window.open() calls that happen after an await.
    const popup = window.open('', '_blank');
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
        if (popup) popup.location.href = result.invoice_url;
        else window.location.href = result.invoice_url;
      } else {
        popup?.close();
        console.error('Payment flow returned no invoice_url:', response.status);
        notify({
          type: 'negative',
          message:
            'Could not create a payment link. Please sign in again and retry.',
        });
      }
    } catch (err) {
      popup?.close();
      console.error('Payment request failed:', err);
      notify({
        type: 'negative',
        message:
          'Payment request failed. Please check your connection and try again.',
      });
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
