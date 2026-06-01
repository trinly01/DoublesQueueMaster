<template>
  <q-page class="flex flex-center forgot-page">
    <q-card class="q-pa-lg forgot-card shadow-4" bordered>
      <template v-if="!emailSent">
        <q-card-section class="text-center q-pb-sm q-pt-none">
          <div class="brand-logo q-mb-none">🏓</div>
          <div class="text-h4 text-weight-bold text-primary brand-title q-mb-xs">
            Dink It
          </div>
          <div class="text-subtitle1 text-grey-7">Reset your password</div>
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
            </div>

            <div class="q-mt-sm">
              <q-btn
                label="Send Reset Link"
                type="submit"
                color="primary"
                size="lg"
                class="full-width forgot-btn"
                :loading="loading"
                :disable="!isEmailValid"
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
          <q-icon name="mark_email_unread" color="primary" size="80px" class="q-mb-md" />
          <div class="text-h5 text-weight-bold text-primary brand-title q-mb-md">
            Check Your Email
          </div>
          <p class="text-body1 text-grey-8">
            If an account exists for this address, we've sent a password reset link to:
          </p>
          <p class="text-subtitle1 text-weight-bold text-primary q-mb-lg">
            {{ email }}
          </p>
          <q-banner class="bg-blue-1 text-blue-9 rounded-borders q-mb-xl text-left">
            <template v-slot:avatar>
              <q-icon name="info" color="primary" />
            </template>
            Please check your inbox (and spam folder) and click the link to reset
            your password.
          </q-banner>
          <q-btn
            label="Back to Sign In"
            color="primary"
            class="full-width forgot-btn"
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
import { ref, computed } from 'vue';

import { likhaClient } from 'src/boot/likha';
import { passwordRequest } from '@likha-erp/likha-sdk';

const email = ref('');
const loading = ref(false);
const emailSent = ref(false);


const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmailValid = computed(() => emailRegex.test(email.value.trim()));

const onSubmit = async () => {
  loading.value = true;
  try {
    const resetUrl = `${window.location.origin}/#/reset-password`;
    await likhaClient.request(passwordRequest(email.value.trim(), resetUrl));
    emailSent.value = true;
  } catch (err) {
    // Always show the success state regardless of error
    // (prevents email enumeration — don't reveal if account exists)
    emailSent.value = true;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.forgot-page {
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
.forgot-card {
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
.forgot-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.forgot-btn {
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
  .forgot-card {
    padding: 16px !important;
  }
}
</style>
