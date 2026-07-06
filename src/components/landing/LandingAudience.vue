<template>
  <section class="section">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">Made for everyone who loves the game.</h2>
        <p class="section-subtitle">
          Whether you run the club or just want to play, DinkMatch makes open
          play easy and fun.
        </p>
      </div>
      <div class="row q-col-gutter-xl">
        <div class="col-12 col-md-6">
          <q-card flat bordered class="audience-card">
            <div class="row items-center q-mb-md">
              <div class="audience-icon">
                <q-icon name="manage_accounts" size="26px" color="white" />
              </div>
              <div class="text-h6 text-weight-bold">For organizers</div>
            </div>
            <ul class="audience-list text-grey-7">
              <li v-for="point in organizerPoints" :key="point">{{ point }}</li>
            </ul>
            <q-btn
              unelevated
              rounded
              no-caps
              color="accent"
              label="Run your club"
              @click="goRegister"
            />
          </q-card>
        </div>
        <div class="col-12 col-md-6">
          <q-card flat bordered class="audience-card">
            <div class="row items-center q-mb-md">
              <div class="audience-icon player-icon">
                <q-icon name="sports_tennis" size="26px" color="white" />
              </div>
              <div class="text-h6 text-weight-bold">For players</div>
            </div>
            <ul class="audience-list text-grey-7">
              <li v-for="point in playerPoints" :key="point">{{ point }}</li>
            </ul>
            <q-btn
              unelevated
              rounded
              no-caps
              color="accent"
              label="Find your game"
              @click="goRegister"
            />
          </q-card>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
const goRegister = () => router.push('/register');

const organizerPoints = [
  'Spend more time playing, less time managing the rack.',
  'One tap makes fair games and gives out courts.',
  'People stay longer and keep coming back.',
  'Send matches to a DUPR-ready file in one go.',
];

const playerPoints = [
  'Get a real game every time you play.',
  'Fair waiting — the less you have played, the sooner you go.',
  'See your rating, partners, rivals, and close games.',
  'Just play. No awkward stuff.',
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

.audience-card {
  border-radius: 18px;
  padding: 2rem;
  height: 100%;
  background: white;
  box-shadow:
    0 10px 20px -8px rgba(0, 0, 0, 0.08),
    0 4px 6px -4px rgba(0, 0, 0, 0.04);
}

.audience-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: $brand-gradient;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.75rem;
}

.player-icon {
  background: #ffd86b;
}

.audience-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem;
  line-height: 1.8;
}

.audience-list li {
  position: relative;
  padding-left: 1.5rem;
  margin-bottom: 0.5rem;
}

.audience-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #764ba2;
  font-weight: 700;
}
</style>
