<template>
  <q-page class="flex flex-center login-page">
    <q-card class="q-pa-lg login-card shadow-4" bordered>
      <q-card-section class="text-center q-pt-none">
        <img
          :src="logoUrl"
          alt="Logo"
          class="brand-logo"
          style="height: 64px; margin-bottom: 8px"
        />
        <div class="text-h4 text-weight-bold text-primary brand-title q-mb-xs">
          DinkMatch
        </div>
        <div class="text-subtitle1 text-grey-7 q-mb-md">
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
                autocomplete="username"
                autocapitalize="off"
                autocorrect="off"
                :rules="[
                  (val) => (val && val.length > 0) || 'Please enter your email',
                ]"
                color="primary"
                dense
                hide-bottom-space
                :disable="loading"
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
                :type="showPassword ? 'text' : 'password'"
                label="Password"
                lazy-rules
                autocomplete="current-password"
                :rules="[
                  (val) =>
                    (val && val.length > 0) || 'Please enter your password',
                ]"
                color="primary"
                dense
                hide-bottom-space
                :disable="loading"
              >
                <template v-slot:prepend>
                  <q-icon name="lock" color="primary" />
                </template>
                <template v-slot:append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    color="grey-6"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
            </div>
          </div>

          <div class="row items-center justify-between q-mt-sm q-mb-sm">
            <q-checkbox
              v-model="rememberMe"
              label="Remember me"
              color="primary"
              size="sm"
              dense
            />
            <router-link
              to="/forgot-password"
              class="text-primary text-caption text-weight-medium text-decoration-none"
              >Forgot password?</router-link
            >
          </div>

          <div>
            <q-btn
              label="Login"
              type="submit"
              color="primary"
              size="lg"
              class="full-width login-btn"
              :loading="loading"
              :disable="!email || !password"
              unelevated
              rounded
            />
          </div>

          <q-space />

          <div class="text-center q-mt-md">
            <q-btn
              color="white"
              text-color="grey-9"
              size="md"
              class="full-width google-btn"
              :loading="googleLoading"
              no-caps
              outline
              rounded
              @click="onGoogleLogin"
            >
              <img :src="googleIconUrl" alt="Google" class="google-icon" />
              <span class="q-ml-sm">Continue with Google</span>
            </q-btn>
          </div>

          <div class="text-center q-mt-md">
            <span class="text-grey-7">Don't have an account? </span>
            <router-link
              to="/register"
              class="text-primary text-weight-bold text-decoration-none"
              >Sign Up</router-link
            >
          </div>

          <div class="text-center q-mt-sm">
            <router-link
              to="/openplay"
              class="text-primary text-weight-medium text-decoration-none"
              >Start without account</router-link
            >
          </div>

          <div class="text-center q-mt-sm">
            <q-btn
              flat
              dense
              no-caps
              color="grey-6"
              icon="arrow_back"
              label="Back to home"
              to="/"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import logoUrl from 'src/assets/queue master logo.png';
import googleIconUrl from 'src/assets/google-icon.svg';
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { LocalStorage } from 'quasar';
import { useNotify } from 'src/composables/useNotify';
import { likhaClient, LIKHA_URL } from 'src/services/likhaClient';
import { registerUserVerify, readMe } from '@likha-erp/likha-sdk';

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const rememberMe = ref(false);
const loading = ref(false);
const googleLoading = ref(false);

type VerifyStatus = 'idle' | 'loading' | 'success' | 'error';
const verifyStatus = ref<VerifyStatus>('idle');
const verifyError = ref('');

const router = useRouter();
const route = useRoute();
const { notify } = useNotify();

const resetGoogleLoading = () => {
  googleLoading.value = false;
};

onMounted(async () => {
  // Defensive reset: if the user came back via the browser back button after
  // cancelling the Google consent screen, the page might be restored from
  // bfcache and still hold the old `googleLoading = true` state.
  googleLoading.value = false;
  window.addEventListener('pageshow', resetGoogleLoading);

  // In hash mode, Directus may append ?token= BEFORE the # (e.g. /?token=xxx#/login)
  // which means route.query won't see it — fall back to window.location.search
  const token =
    (route.query['token'] as string | undefined) ||
    new URLSearchParams(window.location.search).get('token') ||
    undefined;

  console.log('Token is: ', token);

  if (token) {
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
    return;
  }

  // Google SSO return handling
  const sso =
    (route.query['sso'] as string | undefined) ||
    new URLSearchParams(window.location.search).get('sso') ||
    undefined;
  const ssoReason =
    (route.query['reason'] as string | undefined) ||
    new URLSearchParams(window.location.search).get('reason') ||
    undefined;

  if (sso === 'google') {
    googleLoading.value = true;
    try {
      // Confirm the session cookie is active by reading the current user.
      await likhaClient.request(readMe());
      LocalStorage.set('dink-auth', true);
      notify({
        color: 'positive',
        textColor: 'white',
        icon: 'check_circle',
        message: 'Login with Google successful',
      });
      const redirect = route.query.redirect;
      router.push(typeof redirect === 'string' ? redirect : '/profile');
    } catch (err) {
      const error = err as { errors?: { message?: string }[] };
      const errorMessage =
        error?.errors?.[0]?.message ??
        ssoReason ??
        'Google login failed. Please try again.';
      notify({
        color: 'negative',
        textColor: 'white',
        icon: 'warning',
        message: errorMessage,
      });
      googleLoading.value = false;
    }
    return;
  }
});

onUnmounted(() => {
  window.removeEventListener('pageshow', resetGoogleLoading);
});

const onSubmit = async () => {
  loading.value = true;
  try {
    await likhaClient.login({ email: email.value, password: password.value });
    LocalStorage.set('dink-auth', true);

    notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: 'Login successful',
    });

    const redirect = route.query.redirect;
    router.push(typeof redirect === 'string' ? redirect : '/profile');
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    let errorMessage = 'An error occurred during login.';
    if (error?.errors?.[0]?.message) {
      errorMessage = error.errors[0].message;
    }

    notify({
      color: 'negative',
      textColor: 'white',
      icon: 'warning',
      message: errorMessage,
    });
  } finally {
    loading.value = false;
  }
};

const onGoogleLogin = () => {
  googleLoading.value = true;
  const redirect = `${window.location.origin}/#/login?sso=google`;
  const authUrl = `${LIKHA_URL}/auth/login/google?redirect=${encodeURIComponent(
    redirect,
  )}`;
  window.location.href = authUrl;
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
  background-clip: text;
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
.google-btn {
  border: 1px solid #dadce0 !important;
  font-weight: 500;
}
.google-icon {
  width: 18px;
  height: 18px;
}
.text-decoration-none {
  text-decoration: none;
}
.text-primary {
  color: #5a67d8 !important;
}
@media (max-width: 480px) {
  .login-card {
    padding: 24px !important;
    padding-bottom: 64px !important;
    max-width: none;
    border-radius: 0;
    background-color: #ffffff;
    backdrop-filter: none;
    border: none;
    box-shadow: none;
    min-height: 100vh;
    margin-top: 5vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .login-card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
