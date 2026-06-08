<template>
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
          DinkMatch builds skill-balanced games from your open-play queue in seconds. Less standing around, more dinking.
        </p>
        <div class="row q-gutter-md q-mt-lg items-center">
          <q-btn unelevated rounded no-caps size="lg" color="accent" icon-right="arrow_forward" label="Get Started" @click="goRegister" />
          <q-btn outline rounded no-caps size="lg" color="white" label="Login" @click="goLogin" />
        </div>
        <q-btn flat no-caps color="white" class="q-mt-md try-link" icon="bolt" label="Try Open Play — no account needed" @click="goOpenPlay" />
      </div>
      <div class="col-12 col-md-5 flex flex-center hero-visual">
        <div class="paddle-ball">
          <q-icon name="sports_tennis" class="ball-icon" />
          <div class="court-lines"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
const goRegister = () => router.push('/register');
const goLogin = () => router.push('/login');
const goOpenPlay = () => router.push('/openplay');
</script>

<style lang="scss" scoped>
$brand-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

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
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-14px); }
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
