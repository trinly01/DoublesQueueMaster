<template>
  <q-page class="flex flex-center reset-page">
    <q-card class="q-pa-lg reset-card shadow-4" bordered>
      <!-- No token state -->
      <template v-if="!token">
        <q-card-section class="text-center q-pa-lg">
          <q-icon
            name="link_off"
            color="negative"
            size="80px"
            class="q-mb-md"
          />
          <div
            class="text-h5 text-weight-bold text-primary brand-title q-mb-md"
          >
            Invalid Link
          </div>
          <p class="text-body1 text-grey-8 q-mb-lg">
            This password reset link is missing or invalid. Please request a new
            one.
          </p>
          <q-btn
            label="Request New Reset Link"
            color="primary"
            class="full-width reset-btn"
            to="/forgot-password"
            unelevated
            rounded
          />
        </q-card-section>
      </template>

      <!-- Reset form -->
      <template v-else-if="!resetSuccess">
        <q-card-section class="text-center q-pb-sm q-pt-none">
          <img
            :src="logoUrl"
            alt="Logo"
            class="brand-logo q-mb-none"
            style="height: 48px"
          />
          <div
            class="text-h4 text-weight-bold text-primary brand-title q-mb-xs"
          >
            DinkMatch
          </div>
          <div class="text-subtitle1 text-grey-7">Choose a new password</div>
        </q-card-section>

        <q-card-section>
          <q-form @submit="onSubmit">
            <div class="row q-col-gutter-xs">
              <div class="col-12">
                <q-input
                  filled
                  v-model="password"
                  type="password"
                  label="New Password"
                  lazy-rules
                  :rules="[
                    (val) =>
                      (val && val.length >= 8) ||
                      'Password must be at least 8 characters',
                  ]"
                  color="primary"
                  dense
                  hide-bottom-space
                >
                  <template v-slot:prepend>
                    <q-icon name="lock" color="primary" />
                  </template>
                </q-input>
              </div>

              <div class="col-12">
                <q-input
                  filled
                  v-model="confirmPassword"
                  type="password"
                  label="Confirm New Password"
                  lazy-rules
                  :rules="[
                    (val) => val === password || 'Passwords do not match',
                  ]"
                  color="primary"
                  dense
                  hide-bottom-space
                >
                  <template v-slot:prepend>
                    <q-icon name="lock" color="primary" />
                  </template>
                </q-input>
              </div>
            </div>

            <div class="q-mt-sm">
              <q-btn
                label="Reset Password"
                type="submit"
                color="primary"
                size="lg"
                class="full-width reset-btn"
                :loading="loading"
                :disable="!isFormValid"
                unelevated
                rounded
              />
            </div>

            <div class="text-center q-mt-md">
              <router-link
                to="/login"
                class="text-primary text-weight-bold text-decoration-none"
                >Back to Sign In</router-link
              >
            </div>
          </q-form>
        </q-card-section>
      </template>

      <!-- Success state -->
      <template v-else>
        <q-card-section class="text-center q-pa-lg">
          <q-icon
            name="check_circle"
            color="positive"
            size="80px"
            class="q-mb-md"
          />
          <div
            class="text-h5 text-weight-bold text-primary brand-title q-mb-md"
          >
            Password Reset!
          </div>
          <p class="text-body1 text-grey-8 q-mb-lg">
            Your password has been updated. You can now sign in with your new
            password.
          </p>
          <q-btn
            label="Sign In"
            color="primary"
            class="full-width reset-btn"
            to="/login"
            unelevated
            rounded
          />
        </q-card-section>
      </template>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import logoUrl from 'src/assets/queue master logo.png';
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { likhaClient } from 'src/boot/likha';
import { passwordReset } from '@likha-erp/likha-sdk';

const route = useRoute();
const $q = useQuasar();

const token = ref<string | null>(null);
const password = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const resetSuccess = ref(false);

const isFormValid = computed(
  () => password.value.length >= 8 && password.value === confirmPassword.value,
);

onMounted(() => {
  // Hash mode: Directus may append ?token= before the # fragment
  token.value =
    (route.query['token'] as string | undefined) ||
    new URLSearchParams(window.location.search).get('token') ||
    null;
});

const onSubmit = async () => {
  if (!token.value) return;
  loading.value = true;
  try {
    await likhaClient.request(passwordReset(token.value, password.value));
    resetSuccess.value = true;
    // Strip ?token= from the URL so the token isn't exposed in history/address bar
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.hash,
    );
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    const errorMessage =
      error?.errors?.[0]?.message ??
      'Password reset failed. The link may have expired.';
    $q.notify({
      color: 'negative',
      textColor: 'white',
      icon: 'warning',
      message: errorMessage,
    });
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.reset-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}
.brand-logo {
  font-size: 3.5rem;
  line-height: 1;
}
.brand-title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.reset-card {
  width: 100%;
  max-width: 450px;
  border-radius: 16px;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.1),
    0 8px 10px -6px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.reset-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.reset-btn {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%) !important;
  color: white;
  font-weight: bold;
}
.text-decoration-none {
  text-decoration: none;
}
.text-primary {
  color: #5a67d8 !important;
}
@media (max-width: 480px) {
  .reset-card {
    padding: 24px !important;
    max-width: none;
    border-radius: 0;
    background-color: #ffffff;
    backdrop-filter: none;
    border: none;
    box-shadow: none;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .reset-card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
