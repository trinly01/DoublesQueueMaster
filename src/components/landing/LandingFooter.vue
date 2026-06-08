<template>
  <footer class="landing-footer">
    <div class="container row items-center justify-between q-gutter-sm wrap">
      <div class="row items-center no-wrap">
        <img :src="logoUrl" alt="DinkMatch logo" class="footer-logo" />
        <span class="text-weight-bold q-ml-sm">DinkMatch</span>
      </div>
      <div class="row q-gutter-md">
        <q-btn flat dense no-caps label="Login" @click="goLogin" />
        <q-btn flat dense no-caps label="Open Play" @click="goOpenPlay" />
      </div>
      <div class="text-caption text-grey-6">&copy; {{ currentYear }} DinkMatch</div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import logoUrl from 'src/assets/queue master logo.png';

const router = useRouter();
const currentYear = new Date().getFullYear();
const goLogin = () => router.push('/login');
const goOpenPlay = () => router.push('/openplay');
</script>

<style lang="scss" scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

.landing-footer {
  background: #1d1d2b;
  color: #c3cfe2;
  padding: 1.5rem 0;

  .footer-logo {
    height: 24px;
  }

  .q-btn {
    color: #c3cfe2;
  }
}
</style>
