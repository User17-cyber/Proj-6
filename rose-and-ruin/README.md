# Rose & Ruin

A large-scale medieval knight battle game for the browser, set during the Wars of the Roses (1455–1487). House Lancaster and House York field 5 to 80 knights each at seven real British castles. You fight as one of them, watch the battle unfold with bots only, or join other players online.

## Run it

**Quickest:** download `RoseAndRuin.html` and open it in Chrome, Edge or Firefox: it runs offline from your disk, with nothing to install. Single player and bots-only battles work this way; multiplayer needs the server below. Build that file yourself with `npm run build:standalone` (it lands in `dist/`).

**From source:**

You need Node 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. This starts the Vite dev server and the game server together, so single player, spectating and multiplayer all work.

To build and serve a production copy (one process serves both the game and the multiplayer server):

```bash
npm run build
```

```bash
npm start
```

Then open http://localhost:8787. Set `PORT` to use another port.

Tests:

```bash
npm test
```

This runs the headless simulation checks (pose reach, map connectivity, a 150-second 24-vs-24 battle on every map) and the multiplayer smoke test against a real server.

## Playing

From the great hall:

- **Take the Field**: choose castle, manner of battle, army size, bot prowess, house, time limit, reserves and friendly fire, then pick your knight in the armoury. The hosts stay drawn up until you press Space (or click) to sound the charge.
- **Watch the Battle**: start a battle of bots alone; it begins as soon as it loads. A director camera chooses shots; you can follow any knight or fly freely, and slow or speed up time.
- **Join a Muster**: connect to a server, join a running battle or raise your own. Bots fill every place no player holds.

### Controls

| Action | Key |
| --- | --- |
| Move | W A S D |
| Light attack / heavy attack (hold) | Left mouse |
| Guard, raise shield and parry (archers: aim) | Right mouse or 3 |
| Thrust (archers: rondel stab) | R or middle mouse |
| Kick (breaks a guard) | F |
| Abilities | Q, E |
| Sprint, jump | Shift, Space |
| Over the shoulder / through the visor | V |
| Scoreboard | Tab |
| Chat (multiplayer) | Enter |
| Menu, pause and leave the battle (any time) | Esc or P |
| Spectator: director / follow / free camera | 1 / 2 / 3 |
| Spectator: previous / next knight | ← / → |
| Spectator: slower / faster, pause | − / +, P |

You can leave a battle at any moment: Esc opens the menu with **Leave the Battle** whether you are fighting, mustering, fallen or watching; the death screen has its own **Leave the Battle** button; and a castle that is still loading can be abandoned with **Turn Back**.

Keys can be rebound in Settings. Under **Your own keybinds** you can also add as many extra keys as you like (mouse side buttons too), each to any action: attack, guard, thrust, kick, either ability, sprint, jump, movement or change view. They work alongside the main keys and are saved in your browser.

### Combat

- **Guard**: hold right mouse to guard toward where you look. A guard turns a blow at the cost of stamina. Shield-bearers raise the shield to guard: it covers a wider arc, costs less stamina, and heater shields and pavises stop arrows.
- **Shield durability**: every blow and arrow a shield turns wears it down (the bar under your stamina). Maces splinter shields fastest and a clean parry barely marks them. When a shield breaks the bearer reels for a moment, then fights on without it, guarding with his weapon alone, until he next takes the field. Buckler 160, heater 260, pavise 440.
- **Parry**: raise the guard in the instant before a blow lands. It costs no stamina, staggers the attacker and opens a quicker riposte.
- **Feint**: press guard during your own windup to cancel the blow.
- **Breaking a guard**: kicks, shield bashes and heavy blows against an exhausted guard break it.
- **Wounds**: blows land on the head (extra damage), torso or legs. Armour resists cuts best, blunt weapons less so, and points find the gaps in mail.
- **Deaths**: a dying knight does not simply go limp. How he falls follows from the killing blow:
  - a body wound staggers him back, hunched and clutching it, to his knees and over
  - legs cut from under him drop him to his knees at once, arms thrown out
  - an arrow makes him reel and slump
  - bleeding out, he sways and sinks
  - a heavy blow or a charge hurls him off his feet with a spin
  - a blow to the head drops him where he stands
  
  Then the ragdoll takes over and the body comes to rest where it falls.
- **Gore** (Settings: Off, Standard or Brutal; Brutal by default): on Brutal a heavy cut that kills through the head takes it off, and the head tumbles and rolls away. Killing wounds pump blood in pulses for a few heartbeats, pools spread beneath the fallen, and harness is soon caked.
- **Slow-motion kills** (Settings, on by default): your heaviest killing blows play out for a moment in slow motion, in single player.

### The orders

| Class | Arms | Abilities |
| --- | --- | --- |
| Man-at-Arms | Arming sword and heater shield | Shield Bash, Rally to the Banner |
| Vanguard | Two-handed greatsword | Whirlwind, Battle Charge |
| Halberdier | Halberd | Impaling Lunge, Hook & Sweep |
| Banneret | Poleaxe and full plate | Earthshaker, Iron Bulwark |
| Longbowman | English longbow and rondel dagger | Arrow Storm, Bodkin Point |
| Knight-Errant | Falchion and buckler | Sidestep, Bloodletting |
| Pavisier | War spear and hand pavise | Shield Bash, Iron Bulwark |
| Knight Bachelor | Flanged mace and heater shield | Shield Bash, Battle Charge |

**Renowned orders.** Three more orders are won with renown, one after another:

| Class | Arms | Abilities | Renown |
| --- | --- | --- | --- |
| Yeoman of the Guard | English bill | Bill Hook (drag a foe in and stun him), Hold the Line (30% less damage for the line) | 1,500 |
| Knight Marshal | Hand-and-a-half sword | Half-Sword (thrusts pierce plate, harder and faster), War Cry (foes reel, allies hasten) | 4,000 |
| Champion | Great axe and gilded plate | Executioner (a blow that leaves a foe below a third slays him), Juggernaut (unstoppable, bowls men over) | 8,000 |

In bot duels at equal skill they win about 68%, 78% and 77% of rounds against the base orders, which win about 60% at best. A good archer in open ground is still the Champion's bane.

**Renown** is earned in battle: every point of your score (slaying, helping slay, taking banners), plus 150 for seeing a battle through and 500 more for winning it. It is kept in your browser, for that copy of the game: a new download, another folder or browser, or the online page each start afresh. To carry it across, use Settings › Your progress: save it to a file (or copy the save code) and load that into the other copy. Loading never lowers your renown; it brings your orders, keys and settings with it. The armoury shows how far you are from the next order, and a herald announces each one you win, which you may take to the field at once.

Each order is built differently, and its hitboxes, reach and footprint in the crowd follow its build. The bigger a knight, the further his weapon reaches and the easier he is to hit:

| Class | Height | Build | Attack speed |
| --- | --- | --- | --- |
| Banneret | 1.94 m | very broad | 15% slower |
| Vanguard | 1.91 m | broad | 10% slower |
| Halberdier | 1.87 m | lean | 5% slower |
| Knight Bachelor | 1.84 m | sturdy | 5% slower |
| Man-at-Arms | 1.80 m | average | 5% faster |
| Pavisier | 1.80 m | thickset | ordinary |
| Longbowman | 1.73 m | wiry | 5% faster (dagger) |
| Knight-Errant | 1.71 m | slight | 15% faster |

Attack speed scales the windup, release and recovery of every blow, so a quick order lands first and recovers sooner; exhaustion slows anyone down by a further quarter.

Any order you have won can be chosen at the start and again every time you fall (keys 1 to 9, 0 and minus). When you fall you may also choose where to return: any of your house's mustering places at that castle (its camps and outposts at the fighting grounds), or nearest the fighting.

### Manners of battle

- **Pitched Battle**: each house has a reserve of men. Every fallen knight spends one; a house loses when its reserves are spent and its last knight dies. You may fight as each of the eight orders once: when an order falls it is spent, and after all eight you watch the rest of the battle.
- **Conquest**: hold the castle's banners. A house holding more banners bleeds the enemy's reserves.
- **Last Stand**: one life each; the last house standing wins.
- **Single Combat**: you against one knight on open ground outside the castle, to practise guards, parries, feints and timing. Choose how many rounds win the day (3, 5 or 10), the foe's order (or any order, changing every round) and his prowess. Both fighters come back whole after each round and stand at their marks through a three-second countdown before the next. Between rounds, and during the countdown, you may change your order whether you won the round or lost it: the number keys or the mouse wheel pick from the orders you have won. Online, two players can duel each other.

Health bars hang only over enemies; allies show just their names (spectators see everyone's).

### The castles

Each castle sits in a wide stretch of country (roughly 400 by 400 metres) with open fighting grounds around it: a trampled meadow, a hill ringed by a broken palisade, a ruined chapel and its churchyard, a crossroads, and the nearby village. In a pitched battle the hosts split into bands that are sent to different grounds, so fights break out across the whole field, not only at the walls.


- **Bodiam Castle**, East Sussex, 1483: a moated quadrangular castle with bridges, barbican and a breach.
- **Harlech Castle**, Gwynedd, 1468: a concentric fortress on a crag, with a great gatehouse.
- **Bamburgh Castle**, Northumberland, 1464: on a basalt crag over the sea, its wall broken by cannon.
- **The Tower of London**, 1471: the wards beneath the White Tower beside the Thames.
- **Warwick Castle**, Warwickshire, 1469: Caesar's and Guy's towers, the barbican and Ethelfleda's Mound.
- **Conwy Castle**, North Wales, 1461: eight drum towers on a rock above the estuary, two wards and a cross wall, the walled town to the west.
- **Kenilworth Castle**, Warwickshire, 1459: the red keep and John of Gaunt's hall on the Great Mere, reached over the tiltyard causeway.

## How it works

The simulation is shared TypeScript code (`src/shared`) that runs in the browser for single player and spectating, and on the server for multiplayer.

- **Simulation** (`src/shared/sim`): a 60 Hz authoritative simulation. Hit detection sweeps the weapon blade along keyframed poses and tests it against head, torso and leg capsules. The same curve drives the animation, so a blow lands where it is seen to land.
- **Combat**: blocking arcs, parries, ripostes, feints, kicks, stamina, heavy charges, arrows with drop and piercing, and twelve abilities.
- **Bots** (`ai.ts`): bots press the same buttons a player does. They navigate the castles with A* and shared flow fields, hold guard stances, parry with human-like reaction times, use abilities, and archers lead their targets. Four difficulty levels change reactions and judgement.
- **Castles** (`src/shared/world`): built procedurally from a sculpted heightfield, with walls, towers, gatehouses, keeps, bridges, breaches, moats and the sea. They are laid out after the real castles.
- **Rendering** (`src/client/render`):
  - three.js with physically based materials, using textures baked on the GPU at load
  - real HDRI skies for image-based light, cascaded sun shadows, N8AO ambient occlusion
  - height fog with sun in-scattering, bloom, an AgX filmic grade, SMAA, and depth of field in the armoury
  - splat-mapped terrain with distance LODs, and instanced vegetation and grass
  - moats, rivers and the sea that mirror the castles and the knights through planar reflections
- **Knights** (`src/client/knights`):
  - a 17-bone procedural skeleton with IK arms and legs and planted feet
  - a man inside every harness: a continuous skinned body (torso, arms, legs, neck) that bends smoothly at the joints, and a sculpted head with a face, brows, beard and hair; skin tone and hair vary from knight to knight, and five orders wear open-faced helms
  - each class's harness, weapon and body merged into a few meshes skinned on the GPU from a texture of bone matrices, with three levels of detail, so a hundred knights cost a few dozen draw calls
  - tabards in the house colours, and blood and mud that build up per knight
  - verlet ragdoll deaths whose muscle tone fades as the knight falls; every corpse stays on the field for the rest of the battle (settled bodies are posed once into a static pool), and arrows stay stuck in them
- **Audio** (`src/client/audio`): everything is synthesised with WebAudio, including steel on steel, shield thuds, armour, voices, horns, the bow, footsteps and the battle din. Sounds are HRTF-positioned with stone-yard reverb, under a generative lute-and-drum score.
- **Multiplayer** (`src/server`, `src/shared/net`):
  - the server runs the matches at 60 Hz and streams compact binary snapshots at 20 Hz, plus events
  - clients interpolate other knights 100 ms in the past and predict their own knight with the same movement code, reconciling against acknowledged inputs
  - players can join a battle at any time, taking a bot's place and giving it back on leaving; when a battle ends the room moves on to the next castle

### Performance

- Settings › Graphics quality picks shadows, grass density, ambient occlusion and reflections. The default is chosen from your GPU (integrated GPUs start at Medium).
- **Ultimate** is the top graphics level, for powerful graphics cards. On top of Ultra it:
  - supersamples the image (1.5 to 2 rendered pixels for every pixel on screen)
  - casts soft-edged shadows from four 4096-pixel cascades out to 600 m
  - doubles the ambient occlusion samples and uses the strongest anti-aliasing
  - adds shafts of sunlight through towers, trees and crowds
  - doubles the texture resolution of armour, mail and cloth, and keeps knights at full detail out to 30 m (shadows to 140 m)
  - draws finer terrain further out, more trees, denser grass reaching further, sharper texture filtering at grazing angles, and moat reflections at higher resolution redrawn every frame
  
  It is never picked automatically; choose it in Settings.
- Settings › Colour picks the grade: **Vibrant** (the default) lifts the turf, the heraldry and the sky, **Natural** is neutral, and **Muted** is the grim, washed-out look.
- Dynamic resolution (on by default) lowers the render scale while frames run long and raises it again when there is headroom.
- Press **F3** in battle for a frame profiler: frame rate, time per stage, draw calls and triangles.

### A note on photorealism

Everything you see is generated in the browser: no 3D models or photographed textures are downloaded, apart from the five sky HDRIs. The lighting is physically based and image-based from real skies, with filmic tone mapping, shadows and AO, so the look is grounded in real light. Close up, the procedural armour and stone show their nature, though, and it is not film-grade photorealism. The biggest further steps would be scanned or sculpted knight models with motion-captured animation, and photogrammetry materials for the stone.

## Credits

The sky HDRIs are from [Poly Haven](https://polyhaven.com) under CC0: Aristea Wreck (Pure Sky), Syferfontein 18d Clear, Kiara 1 Dawn, Quarry 01 and Noon Grass. `tools/process_sky.py` turns them into lighting and background maps.

The fonts are Cinzel, Cinzel Decorative and IM Fell English (SIL Open Font License), via Fontsource.

All other art, sound and music is procedural.
