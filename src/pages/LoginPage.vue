<template>
  <q-page class="flex flex-center login-page">
    <q-card class="q-pa-lg login-card shadow-4" bordered>
      <q-card-section class="text-center q-pb-sm q-pt-none">
        <div class="brand-logo q-mb-none">🏓</div>
        <div class="text-h4 text-weight-bold text-primary brand-title q-mb-xs">
          Dink It
        </div>
        <div class="text-subtitle1 text-grey-7">
          Sign in to your player account
        </div>
      </q-card-section>

      <!-- Email verification banner -->
      <q-card-section v-if="verifyStatus !== 'idle'" class="q-pt-none q-pb-xs">
        <q-banner
          v-if="verifyStatus === 'loading'"
          class="bg-blue-1 text-blue-9 rounded-borders"
          dense
        >
          <template v-slot:avatar>
            <q-spinner color="primary" size="20px" />
          </template>
          Verifying your email…
        </q-banner>

        <q-banner
          v-else-if="verifyStatus === 'success'"
          class="bg-green-1 text-green-9 rounded-borders"
          dense
        >
          <template v-slot:avatar>
            <q-icon name="check_circle" color="positive" />
          </template>
          Email verified! You can now sign in.
        </q-banner>

        <q-banner
          v-else-if="verifyStatus === 'error'"
          class="bg-red-1 text-red-9 rounded-borders"
          dense
        >
          <template v-slot:avatar>
            <q-icon name="error" color="negative" />
          </template>
          {{ verifyError }}
        </q-banner>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit">
          <div class="row q-col-gutter-xs">
            <div class="col-12">
              <q-input
                filled
                v-model="email"
                type="email"
                label="Email Address"
                lazy-rules
                :rules="[
                  (val) => (val && val.length > 0) || 'Please enter your email',
                ]"
                color="primary"
                dense
                hide-bottom-space
              >
                <template v-slot:prepend>
                  <q-icon name="email" color="primary" />
                </template>
              </q-input>
            </div>

            <div class="col-12">
              <q-input
                filled
                v-model="password"
                type="password"
                label="Password"
                lazy-rules
                :rules="[
                  (val) =>
                    (val && val.length > 0) || 'Please enter your password',
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

          <div class="text-right q-mt-xs q-mb-xs">
            <router-link
              to="/forgot-password"
              class="text-primary text-caption text-weight-medium text-decoration-none"
              >Forgot password?</router-link
            >
          </div>

          <div class="q-mt-xs">
            <q-btn
              label="Login"
              type="submit"
              color="primary"
              size="lg"
              class="full-width login-btn"
              :loading="loading"
              unelevated
              rounded
            />
          </div>

          <div class="text-center q-mt-md">
            <span class="text-grey-7">Don't have an account? </span>
            <router-link
              to="/register"
              class="text-primary text-weight-bold text-decoration-none"
              >Sign Up</router-link
            >
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { likhaClient } from 'src/boot/likha';
import { registerUserVerify } from '@likha-erp/likha-sdk';

const email = ref('');
const password = ref('');
const loading = ref(false);

type VerifyStatus = 'idle' | 'loading' | 'success' | 'error';
const verifyStatus = ref<VerifyStatus>('idle');
const verifyError = ref('');

const router = useRouter();
const route = useRoute();
const $q = useQuasar();

onMounted(async () => {
  // In hash mode, Directus may append ?token= BEFORE the # (e.g. /?token=xxx#/login)
  // which means route.query won't see it — fall back to window.location.search
  const token =
    (route.query['token'] as string | undefined) ||
    new URLSearchParams(window.location.search).get('token') ||
    undefined;

  console.log('Token is: ', token);

  if (!token) return;

  verifyStatus.value = 'loading';
  try {
    await likhaClient.request(registerUserVerify(token));
    verifyStatus.value = 'success';
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    verifyError.value =
      error?.errors?.[0]?.message ??
      'Email verification failed. The link may have expired.';
    verifyStatus.value = 'error';
  }
});

const onSubmit = async () => {
  loading.value = true;
  try {
    await likhaClient.login({ email: email.value, password: password.value });

    $q.notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: 'Login successful',
    });

    router.push('/');
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    let errorMessage = 'An error occurred during login.';
    if (error?.errors?.[0]?.message) {
      errorMessage = error.errors[0].message;
    }

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
.login-page {
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
  -webkit-text-fill-color: transparent;
}
.login-card {
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
.login-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.login-btn {
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
  .login-card {
    padding: 16px !important;
  }
}
</style>
