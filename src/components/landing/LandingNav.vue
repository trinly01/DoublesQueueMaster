<template>
  <header class="landing-nav">
    <div class="container row items-center justify-between no-wrap q-py-sm">
      <div class="row items-center no-wrap nav-left">
        <img :src="logoUrl" alt="DinkMatch logo" class="nav-logo" />
        <span class="text-weight-bold text-white q-ml-sm nav-brand"
          >DinkMatch</span
        >
      </div>
      <div class="row items-center no-wrap q-gutter-sm nav-right">
        <q-btn
          flat
          no-caps
          color="white"
          label="Play with AI"
          icon="sports_esports"
          @click="goPlay"
        />
        <q-btn
          unelevated
          rounded
          no-caps
          color="accent"
          label="Get Started"
          @click="goLogin"
        />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import logoUrl from 'src/assets/queue master logo.png';

const router = useRouter();
const goLogin = () => router.push('/login');
const goPlay = () => router.push('/play');
</script>

<style lang="scss" scoped>
$brand-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

.container {
  margin: 0;
  padding: 0 1rem;
  width: 100%;
}

.nav-left {
  flex-shrink: 0;
}

.nav-right {
  flex-shrink: 0;
  margin-left: auto;
}

@media (max-width: 600px) {
  .nav-brand {
    display: none;
  }
  .nav-logo {
    height: 24px;
  }
}

.landing-nav {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: linear-gradient(to right, #667eea 0%, #764ba2 85%);
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
