<template>
  <section class="section">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">There's a perfect game for everyone.</h2>
        <p class="section-subtitle">
          Five ways to play. One tap to set the vibe — from social nights to
          serious competition.
        </p>
      </div>
      <div class="row q-col-gutter-lg justify-center">
        <div
          v-for="mode in modes"
          :key="mode.label"
          class="col-12 col-sm-6 col-md-4"
        >
          <q-card flat bordered class="mode-card">
            <div class="mode-icon">
              <q-icon :name="mode.icon" size="28px" color="white" />
            </div>
            <div class="text-h6 text-weight-bold q-mb-xs">
              {{ mode.label }}
            </div>
            <div class="text-body2 text-grey-7">{{ mode.desc }}</div>
          </q-card>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const modes = [
  {
    icon: 'balance',
    label: 'Fair Play',
    desc: 'The everyday default. Next in line, teams balanced by skill.',
  },
  {
    icon: 'diversity_3',
    label: 'Social Mixer',
    desc: 'Meet everyone. Next in line, with new partners and opponents each round.',
  },
  {
    icon: 'tune',
    label: 'Balanced Mix',
    desc: 'Best of both. Fair teams and fresh faces in equal measure.',
  },
  {
    icon: 'local_fire_department',
    label: 'Competitive Mix',
    desc: 'For serious sessions. The closest possible games, never a repeat matchup.',
  },
  {
    icon: 'emoji_events',
    label: 'All-Star Match',
    desc: 'The showcase. Skips the queue and puts the top-rated players on court.',
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
  background: white;
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

.mode-card {
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

.mode-icon {
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
