<template>
  <section class="section">
    <div class="container">
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
    </div>
  </section>
</template>

<script setup lang="ts">
const faqs = [
  {
    question: 'How does my rating work?',
    answer:
      'Everyone starts at 1450. After each match, your rating goes up or down based on whether you won, how strong your opponents were, and the score margin. A blowout win (11-2) moves your rating more than a close game (11-9). Singles and doubles now move your rating by the same amount per player, so playing either format affects your rating equally.',
  },
  {
    question: 'What are the rating levels?',
    answer:
      'DinkMatch shows five skill levels based on your rating: Beginner (below 1400), Intermediate (1400+), Advanced (1700+), Expert (1900+), and Pro (2100+). Your level is shown as a colored chip next to your name and on the club leaderboard.',
  },
  {
    question: 'How does auto-matchmaking work?',
    answer:
      'The club admin picks a matchmaking style. Fair Play (default) always picks the most even teams. All-Star Match alternates each round between drafting the highest-rated and lowest-rated players for a showcase game. Competitive Mix and Balanced Mix try to keep games close while also mixing up partners and opponents so you do not play the same people every time. Social Mixer focuses on new matchups. You can also switch to Manual Match and hand-pick teams.',
  },
  {
    question:
      "What's the difference between General, Winners, and Losers queue?",
    answer:
      'General Queue is the default line — everyone starts here. Winners Queue is for players coming off a win (so winners can play winners). Losers Queue is for players coming off a loss. The admin can set how winners and losers re-enter the queue: jump to the front (fairness), go to the back (end of queue), or somewhere in between (smart position).',
  },
  {
    question: 'How do I get picked for the next match?',
    answer:
      'It depends on the queue order the admin sets. First in Line means the longest-waiting players go first. Less Played First gives priority to people who have played fewer games that day. The queue also respects bracket order — General players are picked before Winners, and Winners before Losers.',
  },
  {
    question: 'Can I pick my own team or court?',
    answer:
      'Yes — tap "Manual Match" to choose exactly who plays. For doubles, you can pick 4 players, then use "Balance Teams" to auto-sort by skill, "Shuffle" for random teams, or tap two players to swap them. A live balance indicator shows how even the teams are and each side\'s chance to win. Then pick a court and start the match.',
  },
  {
    question: 'Why did I lose more rating than my partner?',
    answer:
      "In doubles, the higher-rated player pays slightly more on losses and earns slightly more on wins. The split is soft — the strong partner does not carry the full result, but they do take a modestly larger share. This keeps a strong player from pulling up a weak partner's rating unfairly.",
  },
  {
    question: 'What stats can I see on my profile?',
    answer:
      'Your profile has five tabs: Rating shows a chart of your rating over time. Matches lists every game you have played. Partners shows who you win most with and your record together. Rivals shows your head-to-head against opponents. Clutch filters games decided by 2 points or less, so you can see how you perform under pressure.',
  },
  {
    question: 'What are the leaderboards?',
    answer:
      'Global leaderboard shows the top-rated players across all clubs. From Matches shows top players from events and clubs you have actually played in. Tap the trophy icon on your profile to view them.',
  },
  {
    question: 'Is this connected to DUPR?',
    answer:
      'No — DinkMatch uses its own rating system. However, the club admin can export all completed matches as a DUPR-ready CSV file for bulk upload. Add your DUPR ID in your profile so it gets included in the export.',
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
</style>
