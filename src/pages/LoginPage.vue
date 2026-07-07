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

          <div v-if="!isBlockedWebview" class="text-center q-mt-md">
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
import { registerUserVerify } from '@likha-erp/likha-sdk';
import { PlayerProfile } from 'src/services/playerProfile';

// Google blocks OAuth inside embedded webviews (403 disallowed_useragent).
// iOS WKWebView: iOS UA without the "Safari" token.
// Android raw WebView: UA contains the "; wv)" token.
const isBlockedWebview = (() => {
  const ua = navigator.userAgent;
  const isIOSWebview = /iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua);
  const isAndroidWebview = /Android/i.test(ua) && /; wv\)/i.test(ua);
  return isIOSWebview || isAndroidWebview;
})();

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
  const isPopup =
    (route.query['popup'] as string | undefined) ||
    new URLSearchParams(window.location.search).get('popup') ||
    undefined;

  // Directus signals an SSO failure by redirecting back with a `reason`
  // query param (and it may NOT preserve our `sso=google` flag). Handle this
  // first so the user always sees an error instead of a silent failure.
  if (ssoReason) {
    const reasonMessages: Record<string, string> = {
      INVALID_PROVIDER:
        'This account is not registered with Google. Please log in with your email and password.',
      INVALID_CREDENTIALS:
        'Google login failed. This email may belong to a different login method.',
      INVALID_TOKEN: 'Google login failed. Please try again.',
      SERVICE_UNAVAILABLE:
        'Google login is temporarily unavailable. Please try again later.',
    };
    notify({
      color: 'negative',
      textColor: 'white',
      icon: 'warning',
      message:
        reasonMessages[ssoReason] ??
        `Google login failed (${ssoReason}). Please try logging in with your email and password.`,
    });
    googleLoading.value = false;
    return;
  }

  if (sso === 'google') {
    googleLoading.value = true;
    try {
      // After Google SSO, Directus sets a refresh token cookie. Exchange it
      // for JSON tokens via the SDK. In popup mode, the cookie was set
      // first-party (popup was on dink-it.zyberlab.com during SSO), so iOS
      // ITP won't block it.
      try {
        await likhaClient.refresh({ mode: 'cookie' });
      } catch (refreshErr) {
        console.warn('[SSO] token exchange failed:', refreshErr);
      }

      // If we're in a popup, send tokens back to the parent window and
      // close the popup. The parent handles the rest of the login flow.
      // Use the popup=1 flag from the URL because window.opener may be
      // null after cross-origin navigation (dinkmatch → directus → google).
      if (isPopup === '1') {
        if (window.opener && !window.opener.closed) {
          const tokenData = LocalStorage.getItem('likha-data');
          window.opener.postMessage(
            {
              type: 'sso-google-callback',
              tokens: tokenData,
              redirect:
                (route.query.redirect as string | undefined) ?? undefined,
            },
            window.location.origin,
          );
        }
        // Close popup regardless — parent will handle login or the user
        // will need to retry if opener was lost.
        window.close();
        return;
      }

      // Non-popup flow (desktop/Android): handle directly in this window.
      await PlayerProfile.fetchProfile();
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
      // If in popup, send error to parent and close.
      if (isPopup === '1') {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: 'sso-google-callback',
              error: errorMessage,
            },
            window.location.origin,
          );
        }
        window.close();
        return;
      }
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

// Shared login completion logic used by both postMessage and storage event.
let ssoRedirectTarget: string | undefined = undefined;

const completeSsoLogin = async () => {
  const tokenData = LocalStorage.getItem('likha-data') as {
    access_token?: string;
    refresh_token?: string | null;
    expires?: number | null;
    expires_at?: number | null;
  } | null;

  if (!tokenData?.access_token) {
    notify({
      color: 'negative',
      textColor: 'white',
      icon: 'warning',
      message: 'Google login failed. No token received.',
    });
    googleLoading.value = false;
    return;
  }

  await likhaClient.setToken(tokenData.access_token);

  try {
    await PlayerProfile.fetchProfile();
    LocalStorage.set('dink-auth', true);
    notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: 'Login with Google successful',
    });
    router.push(
      typeof ssoRedirectTarget === 'string' ? ssoRedirectTarget : '/profile',
    );
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    notify({
      color: 'negative',
      textColor: 'white',
      icon: 'warning',
      message:
        error?.errors?.[0]?.message ?? 'Google login failed. Please try again.',
    });
  }
  googleLoading.value = false;
};

// Listen for SSO callback from popup via postMessage (works if window.opener survives).
const onSsoMessage = async (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'sso-google-callback') return;

  window.removeEventListener('message', onSsoMessage);
  window.removeEventListener('storage', onSsoStorage);
  if (popupCheckInterval) clearInterval(popupCheckInterval);

  if (event.data.error) {
    notify({
      color: 'negative',
      textColor: 'white',
      icon: 'warning',
      message: event.data.error,
    });
    googleLoading.value = false;
    return;
  }

  if (event.data.redirect) ssoRedirectTarget = event.data.redirect;
  await completeSsoLogin();
};

// Fallback: listen for localStorage changes (popup writes tokens via SDK refresh).
const onSsoStorage = async (event: StorageEvent) => {
  if (event.key !== 'likha-data') return;
  if (!event.newValue) return;

  window.removeEventListener('message', onSsoMessage);
  window.removeEventListener('storage', onSsoStorage);
  if (popupCheckInterval) clearInterval(popupCheckInterval);

  await completeSsoLogin();
};

// Fallback: poll popup.closed in case both postMessage and storage event fail.
let popupCheckInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  window.addEventListener('message', onSsoMessage);
  window.addEventListener('storage', onSsoStorage);
});

onUnmounted(() => {
  window.removeEventListener('pageshow', resetGoogleLoading);
  window.removeEventListener('message', onSsoMessage);
  window.removeEventListener('storage', onSsoStorage);
  if (popupCheckInterval) clearInterval(popupCheckInterval);
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
  // Force https on real domains: iOS Safari may serve the page over http,
  // making window.location.origin "http://..." which fails to match the
  // Directus redirect allow-list (which contains the https variant).
  const { hostname, origin } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const safeOrigin =
    !isLocalhost && origin.startsWith('http://')
      ? origin.replace(/^http:\/\//, 'https://')
      : origin;
  // Preserve the original ?redirect= target through the SSO round-trip so
  // users who came from a club link land back on that club after login.
  const redirectTarget = route.query.redirect;
  const redirectParam =
    typeof redirectTarget === 'string'
      ? `&redirect=${encodeURIComponent(redirectTarget)}`
      : '';
  const redirect = `${safeOrigin}/#/login?sso=google&popup=1${redirectParam}`;
  const authUrl = `${LIKHA_URL}/auth/login/google?redirect=${encodeURIComponent(
    redirect,
  )}`;

  // Use a popup so the SSO cookie is set first-party (popup navigates
  // through dink-it.zyberlab.com during Google auth). This avoids iOS
  // ITP blocking third-party cookies. Falls back to full redirect if
  // the popup is blocked (e.g., some embedded webviews).
  ssoRedirectTarget = (route.query.redirect as string | undefined) ?? undefined;
  const popup = window.open(authUrl, 'google-sso', 'width=500,height=600');
  if (!popup) {
    // Popup blocked — fall back to full-page redirect.
    window.location.href = authUrl;
  } else {
    // Poll popup.closed as a last-resort fallback. If postMessage and
    // storage events both fail, this catches the case where the popup
    // closed after writing tokens to localStorage.
    popupCheckInterval = setInterval(() => {
      if (popup.closed) {
        if (popupCheckInterval) clearInterval(popupCheckInterval);
        // Check if tokens appeared in localStorage.
        const tokenData = LocalStorage.getItem('likha-data');
        if (tokenData) {
          window.removeEventListener('message', onSsoMessage);
          window.removeEventListener('storage', onSsoStorage);
          void completeSsoLogin();
        } else {
          // Popup closed without tokens — login failed or user cancelled.
          googleLoading.value = false;
        }
      }
    }, 500);
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
