<template>
  <section class="section container">
    <div class="text-center q-mb-xl">
      <h2 class="section-title">Rating &amp; Matchmaking FAQs</h2>
      <p class="section-subtitle">How DinkMatch builds fair games.</p>
    </div>
    <div class="row justify-center">
      <div class="col-12 col-md-8">
        <q-list bordered separator class="rounded-borders bg-white">
          <q-expansion-item
            v-for="faq in faqs"
            :key="faq.question"
            expand-separator
            :label="faq.question"
            header-class="text-weight-medium"
          >
            <q-card>
              <q-card-section class="text-body2 text-grey-8">
                {{ faq.answer }}
              </q-card-section>
            </q-card>
          </q-expansion-item>
        </q-list>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const faqs = [
  {
    question: 'How does my rating work?',
    answer:
      "You start at 1500. Every match updates your rating using an Elo-based algorithm. Wins push you up, losses pull you down. The shift size depends on your opponent's strength and the score margin.",
  },
  {
    question: 'Why did I get an uneven match?',
    answer:
      'Early on, your rating is volatile (K-factor = 40) while the system learns your skill level. We also balance teams by harmonic mean — pairing a 1600 + 1400 against two 1500s, not two 1500s vs a 1600 and a 1400.',
  },
  {
    question: 'When will my rating stabilize?',
    answer:
      'As you move further from 1500, your K-factor drops: within 50 points → K=40 (high volatility), 50–100 points → K=30 (medium), 100+ points → K=20 (stable). More matches = more accurate rating = fairer pairings.',
  },
  {
    question: 'Does the score margin matter or just win/loss?',
    answer:
      'Both. An 11-2 win gives a bigger rating boost than 11-9. The algorithm uses a multiplier = 1 + |score difference| × 0.05. Close competitive games minimize rating swings.',
  },
  {
    question: 'Why did I lose rating when my partner played badly?',
    answer:
      "In doubles, rating shift is proportionally distributed by your rating share on the team. If you're the higher-rated player, you gain more on wins — but also lose more on losses. You carry more of the rating burden.",
  },
  {
    question: 'What is the rating history chart?',
    answer:
      'Your profile shows a line chart of wins, losses, and rating over time by day. Click your rating chip to view it.',
  },
  {
    question: 'Is this connected to DUPR?',
    answer:
      "No — this is DinkMatch's internal rating system. But you can export completed matches as a DUPR-ready CSV for bulk upload. Add your DUPR ID in your profile to include it in exports.",
  },
  {
    question: 'Can I reset my rating?',
    answer:
      'Ratings are per-club and stay with your account. If the club admin resets match data, ratings reset too.',
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
</style>
