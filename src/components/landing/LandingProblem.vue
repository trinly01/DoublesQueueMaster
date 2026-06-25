<template>
  <section class="section">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">
          Modern pickleball needs a better way to play.
        </h2>
        <p class="section-subtitle">
          The paddle rack was a great start, but it can't keep up with how much
          we've all grown.
        </p>
      </div>
      <div class="row q-col-gutter-md">
        <div
          v-for="pain in pains"
          :key="pain.title"
          class="col-12 col-sm-6 col-md-4"
        >
          <q-card flat bordered class="pain-card">
            <div class="text-subtitle1 text-weight-bold q-mb-xs">
              {{ pain.title }}
            </div>
            <div class="text-body2 text-grey-7">{{ pain.desc }}</div>
          </q-card>
        </div>
      </div>
      <div class="text-center q-mt-xl">
        <p class="agitate-line">
          DinkMatch lets you leave the politics at the door and get back to what
          you love — the game.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const pains = [
  {
    title: 'The wait & play gap',
    desc: 'Your time is precious. We help you spend less time waiting and more time playing the games that matter.',
  },
  {
    title: 'True leveling',
    desc: 'Everyone gets a better experience when players are matched by skill.',
  },
  {
    title: 'A smoother experience',
    desc: 'We handle the queue so you can focus on the dinks, the drives, and the post-game laughs.',
  },
  {
    title: 'Everyone plays',
    desc: "Whether you're new or a seasoned pro, the app ensures you get your fair share of court time.",
  },
  {
    title: 'Friendly courts',
    desc: 'We remove the awkwardness so the focus stays on sportsmanship and community.',
  },
  {
    title: 'More time for the good stuff',
    desc: 'Organizers spend less time managing and more time playing their own game.',
  },
];
</script>

<style lang="scss" scoped>
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

.pain-card {
  border-radius: 16px;
  padding: 1.5rem;
  height: 100%;
  background: white;
  border-left: 4px solid #764ba2;
  box-shadow: 0 4px 6px -4px rgba(0, 0, 0, 0.04);
}

.agitate-line {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2d2d3a;
  max-width: 480px;
  margin: 0 auto;
}
</style>
