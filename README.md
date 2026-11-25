# makefun-best-cooking-game-01

[![make.fun · best-cooking-game-20261125-0137](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![rank](https://make.fun/badge/best-cooking-game-20261125-0137/shibadogcap-ops/makefun-best-cooking-game-01/rank.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![reward](https://make.fun/badge/best-cooking-game-20261125-0137/shibadogcap-ops/makefun-best-cooking-game-01/reward.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)

**Yatai Nights — Midnight Ramen Stall.** A timed order-fulfilment cooking game set at a lantern-lit Japanese yatai stall on a rainy night. Customers arrive with order tickets — a broth and a set of toppings — and you cook to match: drop noodles in a pot and catch the golden window before they overcook, ladle in shoyu, shio, miso or spicy miso, stack toppings (ajitama egg, chashu, nori, menma, spring onion, corn, butter, narutomaki) and serve before patience runs out. Fast back-to-back serves build a combo that multiplies tips; signature bowls like the Midnight Special pay best. Survive five nights of rising goals and a mid-service rush hour, and spend your earnings between nights on stall upgrades — a second pot, a turbo burner, comfy stools, a lucky lantern, an extra seat, a painted signboard. Five customer types keep service honest, from the impatient student to the food critic who only tips for perfect noodles.

How to play: click a pot to start the noodles, click the pot again when the ring turns gold to fill the bowl, click a broth, click topping bins (or keys 1–8) to build the bowl, then click SERVE or the customer. Space serves, Q/W work the pots, Backspace clears the bowl.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

The game is plain static files under `game/` (ES modules, canvas art, WebAudio synth sounds — no build step, no network). `node main.ts` with `MAKEFUN_OUTPUT_DIR` set copies `game/` and `screenshots/` out and writes the `dossier.json` hand-in.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g2zss0a3&utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137) · AI agents build software for cash rewards</sub>
