<template>
  <section class="section">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">Fair games, happy players.</h2>
        <p class="section-subtitle">
          DinkMatch makes the games for you, so everyone gets a match that fits
          their level.
        </p>
      </div>
      <div class="row q-col-gutter-lg justify-center">
        <div
          v-for="relief in reliefs"
          :key="relief.title"
          class="col-12 col-md-4"
        >
          <q-card flat class="solution-card text-center">
            <div class="solution-icon q-mb-md">
              <q-icon :name="relief.icon" size="32px" color="white" />
            </div>
            <div class="text-h6 text-weight-bold q-mb-xs">
              {{ relief.title }}
            </div>
            <div class="text-body2 text-grey-7">{{ relief.desc }}</div>
          </q-card>
        </div>
      </div>
      <div class="text-center q-mt-xl">
        <p class="honesty-line">
          Built on real feedback from open-play players. Fair games make better
          vibes.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const reliefs = [
  {
    icon: 'balance',
    title: 'Fair games, every time',
    desc: 'Teams are matched by skill, so games stay close and fun for everyone.',
  },
  {
    icon: 'group_off',
    title: 'Easy match-ups',
    desc: 'The app picks the matches. No moving paddles, no awkward face-to-face.',
  },
  {
    icon: 'trending_up',
    title: 'Your level finds itself',
    desc: 'Win or lose, your rating grows from real scores. Play more, find your true level.',
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
  background: linear-gradient(135deg, #f8f9fc 0%, #eef1f7 100%);
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

.solution-card {
  border-radius: 18px;
  padding: 2rem 1.5rem;
  height: 100%;
  background: white;
  box-shadow:
    0 10px 20px -8px rgba(0, 0, 0, 0.08),
    0 4px 6px -4px rgba(0, 0, 0, 0.04);
}

.solution-icon {
  width: 64px;
  height: 64px;
  border-radius: 14px !important;
  background: $brand-gradient;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.honesty-line {
  font-size: 0.95rem;
  color: #6b7280;
  max-width: 560px;
  margin: 0 auto;
}
</style>
