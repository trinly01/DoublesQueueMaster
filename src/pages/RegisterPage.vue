<template>
  <q-page class="flex flex-center register-page">
    <q-card class="q-pa-lg register-card shadow-4" bordered>
      <template v-if="!registeredSuccessfully">
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
          <div class="text-subtitle1 text-grey-7">
            Sign up for a player account
          </div>
        </q-card-section>

        <q-card-section>
          <q-form @submit="onSubmit">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  filled
                  v-model="firstName"
                  label="First Name"
                  lazy-rules
                  :rules="[
                    (val) => (val && val.trim().length > 0) || 'Required',
                  ]"
                  color="primary"
                  dense
                  hide-bottom-space
                >
                  <template v-slot:prepend>
                    <q-icon name="person" color="primary" />
                  </template>
                </q-input>
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  filled
                  v-model="lastName"
                  label="Last Name"
                  lazy-rules
                  :rules="[
                    (val) => (val && val.trim().length > 0) || 'Required',
                  ]"
                  color="primary"
                  dense
                  hide-bottom-space
                >
                  <template v-slot:prepend>
                    <q-icon name="person" color="primary" />
                  </template>
                </q-input>
              </div>

              <div class="col-12">
                <q-input
                  filled
                  v-model="email"
                  type="email"
                  label="Email Address"
                  lazy-rules
                  :rules="[
                    (val) => !!val || 'Please enter your email',
                    (val) =>
                      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ||
                      'Please enter a valid email',
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
                  label="Confirm Password"
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
                label="Sign Up"
                type="submit"
                color="primary"
                size="lg"
                class="full-width register-btn"
                :loading="loading"
                :disable="!isFormValid"
                unelevated
                rounded
              />
            </div>

            <div class="text-center q-mt-md">
              <span class="text-grey-7">Already have an account? </span>
              <router-link
                to="/login"
                class="text-primary text-weight-bold text-decoration-none"
                >Sign In</router-link
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
      </template>

      <!-- Registration Success State -->
      <template v-else>
        <q-card-section class="text-center q-pa-lg">
          <q-icon
            name="mark_email_unread"
            color="primary"
            size="80px"
            class="q-mb-md"
          />
          <div
            class="text-h5 text-weight-bold text-primary brand-title q-mb-md"
          >
            Verify Your Email
          </div>
          <p class="text-body1 text-grey-8">
            Registration submitted successfully! We have sent a confirmation
            link to your email address:
          </p>
          <p class="text-subtitle1 text-weight-bold text-primary q-mb-lg">
            {{ email }}
          </p>
          <q-banner
            class="bg-blue-1 text-blue-9 rounded-borders q-mb-xl text-left"
          >
            <template v-slot:avatar>
              <q-icon name="info" color="primary" />
            </template>
            Please check your inbox (and spam folder) for the verification email
            to complete your registration.
          </q-banner>
          <q-btn
            label="Back to Login"
            color="primary"
            class="full-width register-btn"
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
import { ref, computed } from 'vue';
import { useNotify } from 'src/composables/useNotify';
import { likhaClient } from 'src/boot/likha';
import { registerUser } from '@likha-erp/likha-sdk';

const firstName = ref('');
const lastName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');

const loading = ref(false);
const registeredSuccessfully = ref(false);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isFormValid = computed(
  () =>
    firstName.value.trim().length > 0 &&
    lastName.value.trim().length > 0 &&
    emailRegex.test(email.value.trim()) &&
    password.value.length >= 8 &&
    password.value === confirmPassword.value,
);
const { notify } = useNotify();

const onSubmit = async () => {
  loading.value = true;
  try {
    const verificationUrl = `${window.location.origin}/#/login`;

    await likhaClient.request(
      registerUser(email.value, password.value, {
        first_name: firstName.value.trim(),
        last_name: lastName.value.trim(),
        verification_url: verificationUrl,
      }),
    );

    notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: 'Account created! Verification email sent.',
    });

    registeredSuccessfully.value = true;
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    let errorMessage = 'An error occurred during registration.';
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
</script>

<style scoped>
.register-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}
.brand-logo {
  font-size: 3.5rem;
  line-height: 1;
}
.brand-title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.register-card {
  width: 100%;
  max-width: 500px;
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
.register-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.register-btn {
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
  .register-card {
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
  .register-card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
