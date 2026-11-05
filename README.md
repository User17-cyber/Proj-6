# Drillion

An 8-bit deep-sea trivia dive. Pilot the Drillion, a drill-nosed submarine, from the coral reef down to Challenger Deep. At each of the 7 depths you get one prompt, like *"Name a country that borders at least 4 other countries."* Any answer that fits scores, but **rarer answers score more**: the most obvious answer is worth about 10 points, an obscure one up to 100. A wrong answer hauls up an old boot (0 points).

## Play

Open `drillion/index.html` in a browser. No build step or server is needed.

## The dive

| Depth | Zone | Category |
| --- | --- | --- |
| 0–30 m | Coral Reef | Sea life |
| 30–200 m | Sunlight Zone | Countries |
| 200–1,000 m | Twilight Zone | Capital cities |
| 1,000–4,000 m | Midnight Zone | Space |
| 4,000–6,000 m | Abyssal Zone | Chemical elements |
| 6,000–10,900 m | Hadal Zone (named for Hades) | Gods, heroes and monsters |
| 10,935 m | Challenger Deep | Sunken treasure: gems, precious metals, coins |

Every dive builds 7 fresh prompts from about 290 templates and parameters (letters, continents, neighbours, atomic-number ranges, moons of each planet and so on). Prompts you saw in recent dives are avoided.

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
