<template>
  <q-page class="landing-page">
    <LandingNav />
    <LandingHero />
    <LandingFeatures />
    <LandingHowItWorks />
    <LandingFAQ />
    <LandingCTA />
    <LandingFooter />
  </q-page>
</template>

<script setup lang="ts">
import LandingNav from 'src/components/landing/LandingNav.vue';
import LandingHero from 'src/components/landing/LandingHero.vue';
import LandingFeatures from 'src/components/landing/LandingFeatures.vue';
import LandingHowItWorks from 'src/components/landing/LandingHowItWorks.vue';
import LandingFAQ from 'src/components/landing/LandingFAQ.vue';
import LandingCTA from 'src/components/landing/LandingCTA.vue';
import LandingFooter from 'src/components/landing/LandingFooter.vue';

defineOptions({ name: 'LandingPage' });
</script>

<style lang="scss" scoped>
.landing-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}
</style>
