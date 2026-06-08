<template>
  <section class="cta-band">
    <div class="container text-center">
      <h2 class="text-h4 text-weight-bold text-white q-mb-sm">Ready to play?</h2>
      <p class="text-body1 text-grey-2 q-mb-lg">Create your free player account and join a club today.</p>
      <q-btn unelevated rounded no-caps size="lg" color="white" text-color="accent" icon-right="arrow_forward" label="Get Started" @click="goRegister" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
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

.cta-band {
  background: $brand-gradient;
  padding: 4rem 1.5rem;
}
</style>
