<template>
  <q-page class="landing-page">
    <!-- Sticky Nav -->
    <header class="landing-nav">
      <div class="container row items-center justify-between q-py-sm">
        <div class="row items-center no-wrap">
          <img :src="logoUrl" alt="DinkMatch logo" class="nav-logo" />
          <span class="text-weight-bold text-white q-ml-sm nav-brand"
            >DinkMatch</span
          >
        </div>
        <div class="row items-center q-gutter-sm">
          <q-btn
            flat
            no-caps
            color="white"
            label="Login"
            class="gt-xs"
            @click="goLogin"
          />
          <q-btn
            unelevated
            rounded
            no-caps
            color="accent"
            label="Get Started"
            @click="goRegister"
          />
        </div>
      </div>
    </header>

    <!-- Hero -->
    <section class="hero-section">
      <div class="container row items-center">
        <div class="col-12 col-md-7 hero-copy">
          <div class="hero-badge">
            <q-icon name="sports_tennis" size="18px" class="q-mr-xs" />
            Pickleball Matchmaking
          </div>
          <h1 class="hero-title">
            Smart matchmaking for pickleball &mdash;
            <span class="hero-accent">singles &amp; doubles</span>
          </h1>
          <p class="hero-subtitle">
            DinkMatch builds skill-balanced games from your open-play queue in
            seconds. Less standing around, more dinking.
          </p>
          <div class="row q-gutter-md q-mt-lg items-center">
            <q-btn
              unelevated
              rounded
              no-caps
              size="lg"
              color="accent"
              icon-right="arrow_forward"
              label="Get Started"
              @click="goRegister"
            />
            <q-btn
              outline
              rounded
              no-caps
              size="lg"
              color="white"
              label="Login"
              @click="goLogin"
            />
          </div>
          <q-btn
            flat
            no-caps
            color="white"
            class="q-mt-md try-link"
            icon="bolt"
            label="Try Open Play — no account needed"
            @click="goOpenPlay"
          />
        </div>
        <div class="col-12 col-md-5 flex flex-center hero-visual">
          <div class="paddle-ball">
            <q-icon name="sports_tennis" class="ball-icon" />
            <div class="court-lines"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="section container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">Everything your open play needs</h2>
        <p class="section-subtitle">
          Built for clubs, organizers, and players who just want fair games.
        </p>
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
    </section>

    <!-- How it works -->
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

    <!-- Secondary CTA -->
    <section class="cta-band">
      <div class="container text-center">
        <h2 class="text-h4 text-weight-bold text-white q-mb-sm">
          Ready to play?
        </h2>
        <p class="text-body1 text-grey-2 q-mb-lg">
          Create your free player account and join a club today.
        </p>
        <q-btn
          unelevated
          rounded
          no-caps
          size="lg"
          color="white"
          text-color="accent"
          icon-right="arrow_forward"
          label="Get Started"
          @click="goRegister"
        />
      </div>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
      <div class="container row items-center justify-between q-gutter-sm wrap">
        <div class="row items-center no-wrap">
          <img :src="logoUrl" alt="DinkMatch logo" class="footer-logo" />
          <span class="text-weight-bold q-ml-sm">DinkMatch</span>
        </div>
        <div class="row q-gutter-md">
          <q-btn flat dense no-caps label="Login" @click="goLogin" />
          <q-btn flat dense no-caps label="Open Play" @click="goOpenPlay" />
        </div>
        <div class="text-caption text-grey-6">
          &copy; {{ currentYear }} DinkMatch
        </div>
      </div>
    </footer>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import logoUrl from 'src/assets/queue master logo.png';

defineOptions({ name: 'LandingPage' });

const router = useRouter();
const currentYear = new Date().getFullYear();

const goRegister = () => router.push('/register');
const goLogin = () => router.push('/login');
const goOpenPlay = () => router.push('/openplay');

const features = [
  {
    icon: 'auto_awesome',
    title: 'Auto Matchmaking',
    desc: 'Generate balanced singles or doubles matches from the queue in one tap.',
  },
  {
    icon: 'groups',
    title: 'Skill-Balanced Queue',
    desc: 'Players are matched by level so every game stays competitive and fun.',
  },
  {
    icon: 'stadium',
    title: 'Court Assignment',
    desc: 'Assign and track courts automatically so play never stalls.',
  },
  {
    icon: 'emoji_events',
    title: 'Live Player Ratings',
    desc: 'Track wins and ratings over time with built-in player profiles.',
  },
  {
    icon: 'download',
    title: 'DUPR Export',
    desc: 'Export completed matches to a DUPR-ready CSV for bulk upload — no manual data entry.',
  },
];

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

.landing-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

/* Nav */
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

/* Hero */
.hero-section {
  background: $brand-gradient;
  color: white;
  padding: 4rem 0 5rem;
  position: relative;
  overflow: hidden;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
}

.hero-title {
  font-size: clamp(2rem, 5vw, 3.25rem);
  font-weight: 800;
  line-height: 1.1;
  margin: 0 0 1rem;
}

.hero-accent {
  color: #ffd86b;
}

.hero-subtitle {
  font-size: 1.15rem;
  max-width: 540px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.try-link {
  text-decoration: underline;
}

/* Hero visual */
.hero-visual {
  margin-top: 2rem;
}

.paddle-ball {
  position: relative;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 2px dashed rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: float 4s ease-in-out infinite;
}

.ball-icon {
  font-size: 110px;
  color: #ffd86b;
}

.court-lines {
  position: absolute;
  inset: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-14px);
  }
}

/* Sections */
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

/* Feature cards */
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

/* Steps */
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

/* CTA band */
.cta-band {
  background: $brand-gradient;
  padding: 4rem 1.5rem;
}

/* Footer */
.landing-footer {
  background: #1d1d2b;
  color: #c3cfe2;
  padding: 1.5rem 0;

  .footer-logo {
    height: 24px;
  }

  .q-btn {
    color: #c3cfe2;
  }
}

@media (max-width: 599px) {
  .hero-section {
    padding: 2.5rem 0 3rem;
    text-align: center;
  }

  .hero-subtitle {
    margin: 0 auto;
  }

  .hero-badge {
    margin-left: auto;
    margin-right: auto;
  }
}
</style>
