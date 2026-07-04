<template>
  <q-page class="flex flex-center delete-account-page">
    <q-card class="q-pa-lg delete-account-card shadow-4" bordered>
      <q-card-section class="text-center q-pt-none q-pb-sm">
        <img
          :src="logoUrl"
          alt="Logo"
          class="brand-logo"
          style="height: 48px; margin-bottom: 8px"
        />
        <div class="text-h4 text-weight-bold text-primary brand-title q-mb-xs">
          DinkMatch
        </div>
        <div class="text-subtitle1 text-grey-7">
          Request Account Deletion
        </div>
      </q-card-section>

      <q-card-section class="q-pt-sm">
        <q-banner class="bg-blue-1 text-blue-9 rounded-borders q-mb-md" dense>
          <template v-slot:avatar>
            <q-icon name="info" color="primary" />
          </template>
          DinkMatch is developed by ZyberLab Solutions Inc. We respect your right to control your personal data.
        </q-banner>

        <q-form v-if="!submitted" @submit="onSubmit">
          <div class="col-12">
            <q-input
              filled
              v-model="email"
              type="email"
              label="Registered Email Address"
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

          <div class="col-12 q-mt-sm">
            <q-input
              filled
              v-model="reason"
              type="textarea"
              label="Reason for deletion (optional)"
              color="primary"
              dense
              autogrow
              maxlength="500"
              counter
            >
              <template v-slot:prepend>
                <q-icon name="edit" color="primary" />
              </template>
            </q-input>
          </div>

          <div class="q-mt-md">
            <q-btn
              label="Request Deletion"
              type="submit"
              color="primary"
              size="lg"
              class="full-width delete-btn"
              :loading="loading"
              :disable="!isFormValid"
              unelevated
              rounded
            />
          </div>
        </q-form>

        <q-banner
          v-else
          class="bg-green-1 text-green-9 rounded-borders q-mb-md"
          dense
        >
          <template v-slot:avatar>
            <q-icon name="check_circle" color="positive" />
          </template>
          Your deletion request has been submitted. We will process it within 30 days and confirm by email.
        </q-banner>

        <div class="text-center q-mt-md">
          <span class="text-grey-7">Changed your mind? </span>
          <router-link
            to="/login"
            class="text-primary text-weight-bold text-decoration-none"
            >Back to login</router-link
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
      </q-card-section>

      <q-separator class="q-my-md" />

      <q-card-section class="q-pt-none">
        <div class="text-subtitle2 text-weight-bold q-mb-xs">How it works</div>
        <p class="text-body2 text-grey-8 q-mb-sm">
          Send an email to <strong>support@dinkmatch.club</strong> from your registered email address, or use the form above. We will process your request within 30 days.
        </p>

        <div class="text-subtitle2 text-weight-bold q-mb-xs q-mt-sm">Data that will be deleted</div>
        <ul class="text-body2 text-grey-8 q-my-none q-pl-md">
          <li>Account profile information (name, email, phone number, profile photo)</li>
          <li>Login credentials and authentication tokens</li>
          <li>Match history and performance statistics linked to your account</li>
          <li>Club memberships and queue activity</li>
          <li>User preferences and settings</li>
        </ul>

        <div class="text-subtitle2 text-weight-bold q-mb-xs q-mt-sm">Data that may be retained</div>
        <p class="text-body2 text-grey-8 q-mb-sm">
          We may retain limited information only as long as necessary for legal or regulatory compliance, fraud prevention, security investigations, and aggregate anonymized analytics that cannot identify you.
        </p>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import logoUrl from 'src/assets/queue master logo.png';
import { ref, computed } from 'vue';
import { useNotify } from 'src/composables/useNotify';

const email = ref('');
const reason = ref('');
const loading = ref(false);
const submitted = ref(false);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { notify } = useNotify();

const isFormValid = computed(
  () => emailRegex.test(email.value.trim()),
);

const onSubmit = async () => {
  loading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 600));
    submitted.value = true;
    notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: 'Request submitted. We will process it within 30 days and confirm by email.',
    });
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.delete-account-page {
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
.delete-account-card {
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
.delete-account-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.delete-btn {
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
  .delete-account-card {
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
  .delete-account-card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
