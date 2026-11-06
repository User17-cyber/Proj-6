# Drillion

An 8-bit deep-sea trivia dive. Pilot the Drillion, a drill-nosed submarine, from the surface toward the sea floor at 10,935 m. You get 7 prompts, like *"Name a country that borders at least 4 other countries."* Any answer that fits scores, but **rarer answers score more**: the most obvious answer is worth about 10 points, an obscure one up to 100.

**Points are drill power.** Every 100 points breaks through to the next zone, and each prompt comes from the zone the drill has reached, so strong answers unlock the deep categories. You have **25 seconds of air** for each prompt. A wrong answer hauls up an old boot and running out of air scores nothing: either way, 0 points and the drill doesn't move. Your final score is the depth you reach; seven perfect answers hit the sea floor.

## Play

Open `drillion/index.html` in a browser. No build step or server is needed.

## The dive

| Points | Depth | Zone | Category |
| --- | --- | --- | --- |
| 0 | 0–30 m | Coral Reef | Sea life |
| 100 | 30–200 m | Sunlight Zone | Countries |
| 200 | 200–1,000 m | Twilight Zone | Capital cities |
| 300 | 1,000–4,000 m | Midnight Zone | Space |
| 400 | 4,000–6,000 m | Abyssal Zone | Chemical elements |
| 500 | 6,000–10,000 m | Hadal Zone (named for Hades) | Gods, heroes and monsters |
| 600 | 10,000–10,935 m | Challenger Deep | Sunken treasure: gems, precious metals, coins |

Depth is linear inside each zone, so 150 points puts you at 115 m and 450 points at 5,000 m. Each prompt is built fresh from about 290 templates and parameters (letters, continents, neighbours, atomic-number ranges, moons of each planet and so on). Prompts never repeat within a dive, and prompts from recent dives are avoided.

## How rarity is scored

Each answer in the game's data has a fame score from 1 to 100. For a prompt, the game estimates the share of divers who would think of an answer as `90% × (fame ÷ top fame among valid answers)^1.6`, and awards `100 − share` points. Tiers: Common (1–29), Uncommon (30–54), Rare (55–74), Epic (75–89), Legendary (90–100).

Typos are forgiven (edit-distance matching), plurals and alternate names work ("Burkina", "Kiev", "Scorpio"), and answers that are not in the category (a city for a country prompt, a goldfish for a sea creature) get a retry instead of a penalty.

## Files

- `drillion/index.html`, `drillion/style.css`: page and 8-bit styling
- `drillion/js/engine.js`: prompt templates, answer matching, rarity scoring
- `drillion/js/art.js`: the pixel-art canvas scene
- `drillion/js/audio.js`: chiptune sound effects
- `drillion/js/main.js`: game flow
- `drillion/js/data/*.js`: countries, capitals, sea life, space, elements, myth, gems and coins
- `drillion/tools/test-engine.js`: engine checks (`node drillion/tools/test-engine.js`)
- `drillion/tools/build.js`: bundles everything into one file, `drillion/dist/drillion.html`

# Rose & Ruin

A large-scale medieval knight battle game set at the castles of the Wars of the Roses, with six knight classes, bots, a bots-only spectator mode and online multiplayer. See [`rose-and-ruin/README.md`](rose-and-ruin/README.md) for how to run and play it.
