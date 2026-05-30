# 🏓 Queue Master

Smart matchmaking system for table tennis singles and doubles matches.

## Features

- ✅ **Singles (1v1) & Doubles (2v2)** match support
- 🎯 **Smart balanced team generation** using skill levels
- 📊 **Player statistics tracking** (wins/losses/games played)
- 🎨 **Manual match creation** with drag & drop (desktop) and tap-to-swap (mobile)
- 💾 **LocalStorage persistence** - your data is saved automatically
- 📱 **Fully responsive** PWA design
- 🌐 **Works offline** with service worker

## How Player Ratings Work

Behind the scenes, Queue Master uses a smart, self-correcting system to figure out how good players are and to build fair matches. You don't need to be good at math to understand it! Here are the simple rules it follows:

1. **New Players Calibrate Fast**: When a new player joins, their rating is hidden as "NR" (No Rating) until they play 3 games. During these first few games, their rating jumps up and down very quickly so the system can quickly figure out their true skill level.
2. **The "Weakest Link" Rule**: In a doubles match, a team is only as strong as its weakest player. Instead of just finding the average between two players, the system heavily factors in the weaker player. This correctly calculates that a Pro and a Beginner will struggle against two Average players.
3. **The "Carry" Rule**: If a highly-rated player and a low-rated player team up and WIN, the system knows the highly-rated player did the heavy lifting. Therefore, the higher player earns *more* points, and the lower player earns *fewer*. If they LOSE, the higher player failed to carry the team, so they lose *more* points, while the beginner is forgiven and loses *fewer*. 
4. **Point Spread Matters**: Beating a team by a landslide (like 11-2) will reward you slightly more rating points than barely scraping by (like 11-9).
5. **Fresh Matchups**: The system remembers who you played with and against. It actively tries to avoid putting you with the exact same partner or against the exact same opponents over and over again!
## Install the dependencies
```bash
yarn
# or
npm install
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)
```bash
quasar dev
```


### Lint the files
```bash
yarn lint
# or
npm run lint
```


### Format the files
```bash
yarn format
# or
npm run format
```



### Build the app for production
```bash
quasar build
```

### Customize the configuration
See [Configuring quasar.config.js](https://v2.quasar.dev/quasar-cli-vite/quasar-config-js).
