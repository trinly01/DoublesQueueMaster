/**
 * Per-scene VO lines shared by every generator — filenames must match
 * VO_LINES in src/ads/*.tsx. `voice`/`rate` are edge-tts overrides;
 * ElevenLabs ignores them (voice comes from ELEVENLABS_VOICE_ID).
 */
export const LINES = {
  // WalkingPaddle (scenes at 0 / 90 / 240 / 360)
  wp_hook: "Still doing the walking paddle shuffle at open play?",
  wp_draft: "DinkMatch drafts fair, balanced matches automatically.",
  wp_modes: "Five modes, zero politics.",
  wp_cta: "Try it free. No sign up.",
  // ZeroPolitics (scenes at 0 / 95 / 190 / 285 / 380)
  zp_hook: "Running open play shouldn't feel like refereeing.",
  zp_lock: "Lock a spot.",
  zp_duo: "Link a duo.",
  zp_avoid: "Quietly avoid a clash.",
  zp_cta: "DinkMatch handles the politics, so you can just play.",
  // EveryGameCounts (scenes at 0 / 90 / 210 / 330)
  egc_hook: "What if every open-play game counted?",
  egc_rating: "Real, partner-weighted ratings.",
  egc_duo: "Best-duo leaderboards.",
  egc_cta: "Dooper sync. Track your rise with DinkMatch. Start free.",
  // DuprOfficial announcement (scenes at 0 / 95 / 215 / 335 / 435)
  // Conversational read — says "syncs", not "officially connected"
  // (pre-approval safe until DUPR's review clears). Natural voice.
  // "dooper" = phonetic spelling so TTS says DUPR correctly
  // (rhymes with "super"); on-screen text stays "DUPR".
  du_hook: {
    text: "Big news — DinkMatch now syncs with dooper.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  du_connect: {
    text: "Link your dooper once. Ten seconds, done.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  du_submit: {
    text: "Play open play. Your organizer taps one button.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  du_cta: {
    text: "Your dooper rating updates itself. Every game counts — at dinkmatch dot club.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  // QueueGuide tutorial (scenes at 0 / 60 / 165 / 270 / 375 / 480 / 585)
  qg_intro: "Playing open play? Here's how it works.",
  qg_s1: "Step one. Check in with your club admin to join the queue.",
  qg_s2: "Step two. Watch the live queue and track your spot.",
  qg_s3: "Step three. The app calls your court when it's your turn.",
  qg_s4: "Step four. Report the score to your Queue Master.",
  qg_s5: {
    text: "Step five. Done for the day? Ask the Queue Master to check you out.",
    rate: "+0%",
  },
  qg_outro: "Organized queue. Fair play. More games. Powered by DinkMatch.",
  // BigScreen layout update — Natural multilingual voice for a human,
  // conversational ad read (per-line `voice` overrides the global VOICE).
  bs_intro: {
    text: "Okay — picture this. Your whole open play, up on the big screen.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  bs_layout: {
    text: "We rebuilt the player view. Up Next? It sits right on top of the queue.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  bs_called: {
    text: "Match called — boom, you're climbing straight to the top.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  bs_pulse: {
    text: "See that amber glow? That's you. Time to warm up.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  bs_outro: {
    text: "One board. Zero confusion. DinkMatch dot club.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  // Modes ad — mood-driven: each mode answers a vibe. Natural voice.
  mm_hook: {
    text: "Same queue. Different vibes.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  mm_casual: {
    text: "Just here to chill? Casual keeps it easy.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  mm_social: {
    text: "Bored of the same faces? Social mixes it up.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  mm_standard: {
    text: "Want it fair and fresh? That's Standard.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  mm_competitive: {
    text: "Ready to sweat? Competitive finds your match.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  mm_propick: {
    text: "Chasing the perfect game? Pro Pick ranks the pool — best four play.",
    voice: "en-US-AndrewMultilingualNeural",
  },
  mm_outro: {
    text: "Your club. Your vibe. DinkMatch dot club.",
    voice: "en-US-AndrewMultilingualNeural",
  },
};
