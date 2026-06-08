<template>
  <header class="landing-nav">
    <div class="container row items-center justify-between q-py-sm">
      <div class="row items-center no-wrap">
        <img :src="logoUrl" alt="DinkMatch logo" class="nav-logo" />
        <span class="text-weight-bold text-white q-ml-sm nav-brand">DinkMatch</span>
      </div>
      <div class="row items-center q-gutter-sm">
        <q-btn flat no-caps color="white" label="Login" class="gt-xs" @click="goLogin" />
        <q-btn unelevated rounded no-caps color="accent" label="Get Started" @click="goRegister" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import logoUrl from 'src/assets/queue master logo.png';

const router = useRouter();
const goLogin = () => router.push('/login');
const goRegister = () => router.push('/register');
</script>

<style lang="scss" scoped>
$brand-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

.landing-nav {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: $brand-gradient;
  box-shadow: 0 2px 12px rgba(118, 75, 162, 0.25);
}

.nav-logo {
  height: 28px;
}

.nav-brand {
  font-size: 1.15rem;
  letter-spacing: 0.5px;
}
</style>
