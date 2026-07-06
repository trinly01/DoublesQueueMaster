<template>
  <section class="section section-alt">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">How it works</h2>
        <p class="section-subtitle">Three steps to your next game.</p>
      </div>
      <div class="row q-col-gutter-xl">
        <div
          v-for="(step, i) in steps"
          :key="step.title"
          class="col-12 col-md-4 text-center"
        >
          <div class="step-number">{{ i + 1 }}</div>
          <div class="text-h6 text-weight-bold q-mb-xs">{{ step.title }}</div>
          <div class="text-body2 text-grey-7">{{ step.desc }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const steps = [
  {
    title: 'Join a club',
    desc: 'Create your free account and join your local pickleball club.',
  },
  {
    title: 'Queue up',
    desc: 'Add yourself to the open-play queue when you are ready to play.',
  },
  {
    title: 'Play balanced matches',
    desc: 'DinkMatch auto-generates fair matches and assigns your court.',
  },
];
</script>

<style lang="scss" scoped>
$brand-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

.section {
  padding: 4rem 1.5rem;
}

.section-alt {
  background: white;
  padding: 4rem 0;
}

.section-title {
  font-size: clamp(1.6rem, 4vw, 2.25rem);
  font-weight: 800;
  margin: 0 0 0.5rem;
  color: #2d2d3a;
}

.section-subtitle {
  font-size: 1.05rem;
  color: #6b7280;
  margin: 0;
}

.step-number {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: $brand-gradient;
  color: white;
  font-size: 1.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  box-shadow: 0 8px 20px -6px rgba(118, 75, 162, 0.5);
}
</style>
