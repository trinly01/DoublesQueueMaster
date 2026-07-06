<template>
  <section class="section">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">Everything you need for fair play</h2>
        <p class="section-subtitle">Less managing, more playing.</p>
      </div>
      <div class="row q-col-gutter-lg justify-center">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="col-12 col-sm-6 col-md-4"
        >
          <q-card flat bordered class="feature-card">
            <div class="feature-icon">
              <q-icon :name="feature.icon" size="28px" color="white" />
            </div>
            <div class="text-h6 text-weight-bold q-mb-xs">
              {{ feature.title }}
            </div>
            <div class="text-body2 text-grey-7">{{ feature.desc }}</div>
          </q-card>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const features = [
  {
    icon: 'auto_awesome',
    title: 'Fair games in one tap',
    desc: 'The app builds balanced singles or doubles matches from the queue, with five matchmaking modes to fit your group.',
  },
  {
    icon: 'groups',
    title: 'No more one-sided games',
    desc: 'Players are matched by skill so games stay close, not blowouts.',
  },
  {
    icon: 'stadium',
    title: 'No one stands around',
    desc: 'Courts and matches are assigned automatically so play keeps moving.',
  },
  {
    icon: 'emoji_events',
    title: 'Watch yourself get better',
    desc: 'Track wins, rating, partners, and rivals in your own player profile.',
  },
  {
    icon: 'download',
    title: 'Send to DUPR, no typing',
    desc: 'Export completed matches to a DUPR-ready file for bulk upload.',
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

.feature-card {
  border-radius: 16px;
  padding: 1.75rem 1.5rem;
  height: 100%;
  background: white;
  box-shadow:
    0 10px 20px -8px rgba(0, 0, 0, 0.08),
    0 4px 6px -4px rgba(0, 0, 0, 0.04);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 20px 25px -5px rgba(118, 75, 162, 0.15),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }
}

.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px !important;
  background: $brand-gradient;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}
</style>
