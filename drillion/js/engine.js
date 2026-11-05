/* DRILLION engine: parses the data, builds prompts, matches answers and scores rarity.
   Rarity model: each entity has a fame score (1-100). Within the answers that fit a prompt,
   the estimated share of divers who would think of an answer is 90% * (fame / topFame)^1.6.
   Points = 100 - that share, so the most obvious answer is worth 10 and the obscure ones near 100. */
(function () {
  'use strict';
  const D = window.DRILLION;

  // ---------- text helpers ----------
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/['’`´ʻ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/^(the|a|an) /, '').replace(/\bst\b/g, 'saint').replace(/\bmt\b/g, 'mount');
  }
  const sq = (s) => norm(s).replace(/ /g, '');
  const list = (s, ch) => (s ? s.split(ch).map((x) => x.trim()).filter(Boolean) : []);
  const rows = (raw) => raw.trim().split('\n').map((l) => l.split('|').map((x) => x.trim()));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const isAbbrev = (a) => !/[a-z]/.test(a); // "USA", "UK", "DRC"

  // Optimal string alignment distance with an early exit once it passes `max`.
  function osa(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null, prev = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      const cur = new Array(lb + 1);
      cur[0] = i; let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }
  const tolerance = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3);

  // ---------- datasets ----------
  function dataset(id, label, entities) {
    const idx = new Map();
    entities.forEach((e, i) => {
      e.id = id + ':' + i; e.ds = id; e.n = norm(e.name);
      for (const a of [e.name, ...(e.aliases || [])]) {
        const k = sq(a); if (!k) continue;
        if (!idx.has(k)) idx.set(k, []);
        const bucket = idx.get(k);
        if (!bucket.some((x) => x.e === e)) bucket.push({ e, a: norm(a), abbrev: isAbbrev(a) });
      }
    });
    return { id, label, entities, idx };
  }

  const countries = rows(D.countriesRaw).map((f) => ({
    name: f[0], aliases: list(f[1], ';'), cont: list(f[2], ','),
    caps: list(f[3], ';').map((c) => list(c, '=')),
    nb: f[4] === '-' ? [] : list(f[4], ';'), flags: f[5] || '', pop: +f[6], fame: +f[7],
  }));
  const byName = new Map(countries.map((c) => [c.name, c]));

  const CAP_FAME = {
    Paris: 100, London: 100, Tokyo: 95, Rome: 95, Washington: 95, Berlin: 90, Moscow: 90, Madrid: 85,
    Beijing: 85, Amsterdam: 80, Athens: 80, Cairo: 80, Dublin: 75, Vienna: 75, 'Mexico City': 75,
    Lisbon: 70, Brussels: 70, Bangkok: 70, Seoul: 70, 'New Delhi': 70, 'Buenos Aires': 70,
    Stockholm: 65, Copenhagen: 65, Prague: 65, Havana: 65, Oslo: 60, Budapest: 60, Warsaw: 60,
    Ottawa: 60, Jerusalem: 60, Singapore: 60, Helsinki: 55, Canberra: 55, Baghdad: 55, Kyiv: 55,
    Wellington: 50, Nairobi: 50, Tehran: 50, Kabul: 50, 'Kuala Lumpur': 50, 'Abu Dhabi': 50,
    'Vatican City': 50, Reykjavik: 45, Lima: 50, Santiago: 45, Bogota: 45, Caracas: 45, Hanoi: 45,
    Manila: 45, Jakarta: 45, Ankara: 45, Brasilia: 45, 'Cape Town': 45, Monaco: 45, Riyadh: 40,
    Doha: 40, Pretoria: 40, Luxembourg: 40, Kingston: 40, Nassau: 40, Bern: 35,
    Ouagadougou: 30, Kathmandu: 40, Damascus: 45, Beirut: 45, Belgrade: 40, Bucharest: 40, Sofia: 35,
    Zagreb: 35, Islamabad: 35, Dhaka: 30, Taipei: 40, Pyongyang: 40, Montevideo: 30, Quito: 30,
    'Panama City': 35, 'San Jose': 25, Tripoli: 35, Tunis: 30, Rabat: 30, Algiers: 30, Accra: 30,
    'Addis Ababa': 35, Khartoum: 30, Mogadishu: 30,
  };
  const SOUTH = new Set(['Buenos Aires', 'Brasilia', 'Santiago', 'Lima', 'La Paz', 'Sucre', 'Asuncion', 'Montevideo', 'Quito', 'Luanda', 'Kinshasa', 'Brazzaville', 'Lusaka', 'Harare', 'Maputo', 'Pretoria', 'Cape Town', 'Bloemfontein', 'Windhoek', 'Gaborone', 'Maseru', 'Mbabane', 'Lobamba', 'Lilongwe', 'Dodoma', 'Dar es Salaam', 'Nairobi', 'Kigali', 'Gitega', 'Bujumbura', 'Antananarivo', 'Port Louis', 'Moroni', 'Victoria', 'Jakarta', 'Dili', 'Canberra', 'Wellington', 'Port Moresby', 'Honiara', 'Port Vila', 'Suva', 'Apia', "Nuku'alofa", 'Funafuti', 'Yaren']);
  // Capitals of countries that span two continents sit in one of them.
  const CAP_CONT = { Jakarta: ['AS'], Moscow: ['EU'], Ankara: ['AS'], Cairo: ['AF'], Astana: ['AS'] };
  const FAR_NORTH = new Set(['Reykjavik', 'Helsinki', 'Oslo', 'Tallinn', 'Stockholm', 'Riga', 'Moscow', 'Copenhagen']);

  const capitals = [];
  countries.forEach((c) => c.caps.forEach((g, i) => {
    const name = g[0];
    const base = Math.round(c.fame * (i === 0 ? 0.6 : 0.4));
    capitals.push({
      name, aliases: g.slice(1), country: c, primary: i === 0, cont: CAP_CONT[name] || c.cont,
      fame: Math.max(2, CAP_FAME[name] != null && CAP_FAME[name] > 0 ? CAP_FAME[name] : base),
      south: SOUTH.has(name), north: FAR_NORTH.has(name),
    });
  }));

  const elements = rows(D.elementsRaw).map((f) => ({
    z: +f[0], sym: f[1], name: f[2], aliases: list(f[3], ';'), cat: f[4], state: f[5], tags: f[6] || '', fame: +f[7],
  }));
  const marine = rows(D.marineRaw).map((f) => ({ name: f[0], aliases: list(f[1], ';'), group: f[2], tags: f[3] || '', fame: +f[4] }));
  const space = rows(D.spaceRaw).map((f) => ({ name: f[0], aliases: list(f[1], ';'), type: f[2], tags: f[3] || '', fame: +f[4] }));
  const myth = rows(D.mythRaw).map((f) => ({ name: f[0], aliases: list(f[1], ';'), culture: f[2], kind: f[3], dom: list(f[4], ' '), fame: +f[5] }));
  const gems = rows(D.gemsRaw).map((f) => ({ name: f[0], aliases: list(f[1], ';'), colors: f[2] || '', tags: f[3] || '', fame: +f[4] }));
  const coins = rows(D.coinsRaw).map((f) => ({ name: f[0], aliases: list(f[1], ';'), tags: (f[2] || '').trim(), fame: +f[3] }));

  const DS = {
    countries: dataset('countries', 'a country', countries),
    capitals: dataset('capitals', 'a capital city', capitals),
    elements: dataset('elements', 'a chemical element', elements),
    marine: dataset('marine', 'a sea creature', marine),
    space: dataset('space', 'a space object or space traveller', space),
    myth: dataset('myth', 'a figure from myth', myth),
    gems: dataset('gems', 'a gemstone', gems),
    coins: dataset('coins', 'a currency', coins),
  };

  // Things players often try that are not in a dataset (they get a retry, not a penalty).
  const DECOYS = {
    countries: new Map(list(D.notCountries, ';').map((x) => [sq(x), `${x} isn't a sovereign country.`])),
    capitals: new Map(list(D.notCapitals, ';').map((x) => {
      const [city, ctry] = x.split('|');
      return [sq(city), `${city} isn't the capital of ${ctry}.`];
    })),
    marine: new Map(list(D.notMarine, ';').map((x) => [sq(x), `${x[0].toUpperCase() + x.slice(1)} isn't in our sea-life log.`])),
  };

  // ---------- labels used in explanations ----------
  const CONT = { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania' };
  const GROUP = {
    shark: 'a shark', ray: 'a ray', whale: 'a whale', dolphin: 'a dolphin or porpoise', pinniped: 'a seal-type mammal',
    sirenian: 'a sea cow', mammal: 'a mammal', reptile: 'a reptile', bird: 'a seabird', ceph: 'a cephalopod',
    crust: 'a crustacean', mollusc: 'a mollusc', cnid: 'a jelly / coral relative', echino: 'an echinoderm',
    invert: 'an invertebrate', fish: 'a fish',
  };
  const ECAT = {
    am: 'an alkali metal', ae: 'an alkaline earth metal', tm: 'a transition metal', pt: 'a post-transition metal',
    md: 'a metalloid', nm: 'a nonmetal', ha: 'a halogen', ng: 'a noble gas', la: 'a lanthanide', ac: 'an actinide',
  };
  const CULT = {
    greek: 'Greek', roman: 'Roman', norse: 'Norse', egyptian: 'Egyptian', hindu: 'Hindu', japanese: 'Japanese',
    aztec: 'Aztec', celtic: 'Celtic', mesopotamian: 'Mesopotamian', polynesian: 'Polynesian', other: 'folklore',
  };
  const KIND = { god: 'deity', titan: 'Titan', hero: 'hero', creature: 'creature' };
  const MOONOF = { E: 'Earth', M: 'Mars', J: 'Jupiter', S: 'Saturn', U: 'Uranus', N: 'Neptune', P: 'Pluto', D: 'a dwarf planet' };
  const STATE = { g: 'a gas', l: 'a liquid', s: 'a solid' };
  const COLOR = { G: 'green', B: 'blue', R: 'red', P: 'purple', K: 'black', W: 'white or clear', N: 'pink', Y: 'yellow or orange' };

  const borders = (c) => (c.nb.length ? `${c.name} borders ${c.nb.length === 1 ? '1 country' : c.nb.length + ' countries'}.` : `${c.name} has no land borders.`);
  const first = (s) => norm(s)[0];
  const letters = (s) => norm(s).replace(/ /g, '');
  const metal = (e) => ['am', 'ae', 'tm', 'pt', 'la', 'ac'].includes(e.cat);
  const godlike = (e) => e.kind === 'god' || e.kind === 'titan';
  const spaceWhat = (e) => (e.type === 'moon' ? `a moon of ${MOONOF[e.tags[0]]}` : e.type === 'constellation' ? 'a constellation' : e.type === 'astronaut' ? 'a space traveller' : e.type === 'dwarf' ? 'a dwarf planet' : e.type === 'sun' ? 'our own star' : 'a ' + e.type);
  const mythWhat = (e) => `${e.name} is a ${CULT[e.culture]} ${KIND[e.kind]}.`;
  const marineWhat = (e) => `${e.name} is ${GROUP[e.group]}.`;

  // Letters that start at least `min` names in a pool.
  function lettersWith(pool, min, key = (e) => e.name) {
    const counts = {};
    pool.forEach((e) => { const l = first(key(e)); counts[l] = (counts[l] || 0) + 1; });
    return Object.keys(counts).filter((l) => counts[l] >= min && /[a-z]/.test(l));
  }

  // ---------- prompt templates ----------
  // Each make() returns { key, text, test(entity, aliasNorm), fact(entity) } or null.
  const T = { marine: [], countries: [], capitals: [], space: [], elements: [], myth: [], treasure: [] };
  const add = (cat, ds, make, weight = 1) => T[cat].push({ ds, make, weight });

  // Coral reef: sea life
  const marineTag = (tag, text, why) => add('marine', 'marine', () => ({ key: 'm-' + tag, text, test: (e) => e.tags.includes(tag), fact: (e) => `${e.name} ${why}.` }));
  const marineGroups = (key, groups, text) => add('marine', 'marine', () => ({ key: 'm-' + key, text, test: (e) => groups.includes(e.group), fact: marineWhat }));
  marineGroups('shark', ['shark'], 'Name a type of shark.');
  marineGroups('mammal', ['whale', 'dolphin', 'pinniped', 'sirenian', 'mammal'], 'Name a marine mammal.');
  marineGroups('cetacean', ['whale', 'dolphin'], 'Name a whale, dolphin or porpoise.');
  marineGroups('bird', ['bird'], 'Name a seabird.');
  marineGroups('ray', ['ray'], 'Name a kind of ray or skate.');
  marineGroups('invert', ['ceph', 'crust', 'mollusc', 'cnid', 'echino', 'invert'], 'Name a sea creature with no backbone.');
  marineGroups('fish', ['fish', 'shark', 'ray'], 'Name a fish that lives in the sea.');
  marineTag('r', 'Name a creature that lives on a coral reef.', "doesn't call the reef home");
  marineTag('d', 'Name a creature of the deep sea.', "isn't a deep-sea dweller");
  marineTag('v', 'Name a sea creature that is venomous or poisonous.', "isn't venomous or poisonous");
  marineTag('h', 'Name a sea creature that has a shell.', "doesn't have a shell");
  marineTag('t', 'Name a sea creature with tentacles.', "doesn't have tentacles");
  marineTag('p', 'Name a creature that lives in icy polar seas.', "doesn't live in polar seas");
  marineTag('a', 'Name a sea creature whose name contains a different animal.', "doesn't have another animal in its name");
  add('marine', 'marine', () => {
    const l = pick(lettersWith(marine, 7));
    return { key: 'm-letter-' + l, text: `Name a sea creature that starts with the letter ${l.toUpperCase()}.`, test: (e, a) => first(e.name) === l || (a && a[0] === l), fact: (e) => `${e.name} starts with ${first(e.name).toUpperCase()}.` };
  });

  // Sunlight zone: countries of the world
  add('countries', 'countries', () => {
    const n = pick([3, 4, 4, 5, 6, 7]);
    return { key: 'c-nb-' + n, text: `Name a country that borders at least ${n} other countries.`, test: (e) => e.nb.length >= n, fact: borders };
  }, 2);
  add('countries', 'countries', () => {
    const x = pick(countries.filter((c) => c.nb.length >= 5 && c.fame >= 40));
    return { key: 'c-nbx-' + x.name, text: `Name a country that shares a land border with ${x.name}.`, test: (e) => e.nb.includes(x.name), fact: (e) => `${e.name} doesn't touch ${x.name}.` };
  }, 3);
  add('countries', 'countries', () => {
    const c = pick(['', '', 'EU', 'AF', 'AS']);
    return { key: 'c-ll-' + c, text: `Name a landlocked country${c ? ' in ' + CONT[c] : ''}.`, test: (e) => e.flags.includes('L') && (!c || e.cont.includes(c)), fact: (e) => (e.flags.includes('L') ? `${e.name} is in ${e.cont.map((k) => CONT[k]).join(' / ')}.` : `${e.name} has a coastline.`) };
  });
  add('countries', 'countries', () => {
    const c = pick(Object.keys(CONT));
    return { key: 'c-cont-' + c, text: `Name a country in ${CONT[c]}.`, test: (e) => e.cont.includes(c), fact: (e) => `${e.name} is in ${e.cont.map((k) => CONT[k]).join(' / ')}.` };
  });
  add('countries', 'countries', () => {
    const l = pick(lettersWith(countries, 7));
    return { key: 'c-start-' + l, text: `Name a country that starts with the letter ${l.toUpperCase()}.`, test: (e, a) => first(e.name) === l || (a && a[0] === l), fact: (e) => `${e.name} starts with ${first(e.name).toUpperCase()}.` };
  });
  add('countries', 'countries', () => {
    const s = pick(['stan', 'land', 'ia', 'o', 'y', 'e']);
    const ok = (t) => letters(t).endsWith(s);
    return { key: 'c-end-' + s, text: `Name a country whose name ends in “-${s.toUpperCase()}”.`, test: (e, a) => ok(e.name) || (a && ok(a)), fact: (e) => `${e.name} doesn't end in “-${s.toUpperCase()}”.` };
  });
  add('countries', 'countries', () => {
    const ok = (t) => { const w = letters(t); return w[0] === w[w.length - 1]; };
    return { key: 'c-same', text: 'Name a country whose name starts and ends with the same letter.', test: (e, a) => ok(e.name) || (a && ok(a)), fact: (e) => `${e.name} starts with ${first(e.name).toUpperCase()} and ends with ${letters(e.name).slice(-1).toUpperCase()}.` };
  });
  add('countries', 'countries', () => ({ key: 'c-words', text: 'Name a country with two or more words in its name.', test: (e) => norm(e.name).includes(' '), fact: (e) => `${e.name} is a single word.` }));
  add('countries', 'countries', () => ({ key: 'c-four', text: 'Name a country with a four-letter name.', test: (e, a) => letters(e.name).length === 4 || (a && a.replace(/ /g, '').length === 4), fact: (e) => `${e.name} has ${letters(e.name).length} letters.` }));
  add('countries', 'countries', () => {
    const l = pick(['z', 'j', 'k', 'w', 'v']);
    const ok = (t) => letters(t).includes(l);
    return { key: 'c-has-' + l, text: `Name a country with the letter ${l.toUpperCase()} in its name.`, test: (e, a) => ok(e.name) || (a && ok(a)), fact: (e) => `There's no ${l.toUpperCase()} in ${e.name}.` };
  });
  add('countries', 'countries', () => {
    const [f, lang] = pick([['S', 'Spanish'], ['F', 'French'], ['P', 'Portuguese'], ['A', 'Arabic']]);
    return { key: 'c-lang-' + f, text: `Name a country where ${lang} is an official language.`, test: (e) => e.flags.includes(f), fact: (e) => `${lang} isn't official in ${e.name}.` };
  });
  add('countries', 'countries', () => ({ key: 'c-island', text: 'Name an island nation.', test: (e) => e.flags.includes('I'), fact: (e) => `${e.name} sits on a continent's mainland.` }));
  add('countries', 'countries', () => {
    const [k, text, test] = pick([
      ['100', 'Name a country with more than 100 million people.', (e) => e.pop >= 95],
      ['200', 'Name a country with more than 200 million people.', (e) => e.pop >= 190],
      ['1', 'Name a country with fewer than 1 million people.', (e) => e.pop < 1],
    ]);
    return { key: 'c-pop-' + k, text, test, fact: (e) => `${e.name} has about ${e.pop >= 1 ? Math.round(e.pop) + ' million' : Math.round(e.pop * 1000) + ' thousand'} people.` };
  });
  add('countries', 'countries', () => {
    const big = Math.random() < 0.5;
    return { key: 'c-area-' + (big ? 'big' : 'small'), text: `Name one of the ten ${big ? 'largest' : 'smallest'} countries by area.`, test: (e) => e.flags.includes(big ? 'B' : 's'), fact: (e) => `${e.name} isn't in the ${big ? 'biggest' : 'smallest'} ten.` };
  });
  add('countries', 'countries', () => {
    const l = pick(lettersWith(capitals, 8));
    return { key: 'c-capl-' + l, text: `Name a country whose capital city starts with the letter ${l.toUpperCase()}.`, test: (e) => e.caps.some((g) => g.some((n) => first(n) === l)), fact: (e) => `${e.name}'s capital is ${e.caps[0][0]}.` };
  });

  // Twilight zone: capital cities
  const capFact = (e) => `${e.name} is the capital of ${e.country.name}.`;
  add('capitals', 'capitals', () => {
    const c = pick(['EU', 'EU', 'AF', 'AS', 'SA', 'NA', 'OC']);
    return { key: 'k-cont-' + c, text: `Name a capital city in ${CONT[c]}.`, test: (e) => e.cont.includes(c), fact: (e) => `${e.name} is in ${e.cont.map((k) => CONT[k]).join(' / ')}.` };
  }, 2);
  add('capitals', 'capitals', () => {
    const l = pick(lettersWith(capitals, 7));
    return { key: 'k-start-' + l, text: `Name a capital city that starts with the letter ${l.toUpperCase()}.`, test: (e, a) => first(e.name) === l || (a && a[0] === l), fact: (e) => `${e.name} starts with ${first(e.name).toUpperCase()}.` };
  });
  add('capitals', 'capitals', () => {
    const l = pick(['a', 'o', 'i', 'n']);
    return { key: 'k-end-' + l, text: `Name a capital city that ends with the letter ${l.toUpperCase()}.`, test: (e, a) => letters(e.name).endsWith(l) || (a && a.endsWith(l)), fact: (e) => `${e.name} ends with ${letters(e.name).slice(-1).toUpperCase()}.` };
  });
  add('capitals', 'capitals', () => ({ key: 'k-words', text: 'Name a capital city with two or more words in its name.', test: (e) => norm(e.name).includes(' '), fact: (e) => `${e.name} is a single word.` }));
  add('capitals', 'capitals', () => ({ key: 'k-ll', text: 'Name the capital of a landlocked country.', test: (e) => e.country.flags.includes('L'), fact: (e) => `${e.country.name}, home of ${e.name}, has a coastline.` }));
  add('capitals', 'capitals', () => ({ key: 'k-island', text: 'Name the capital of an island nation.', test: (e) => e.country.flags.includes('I'), fact: (e) => `${e.country.name} isn't an island nation.` }));
  add('capitals', 'capitals', () => ({ key: 'k-same', text: 'Name a capital city that starts with the same letter as its country.', test: (e) => first(e.name) === first(e.country.name), fact: (e) => `${e.name} is the capital of ${e.country.name}.` }));
  add('capitals', 'capitals', () => ({
    key: 'k-share', text: 'Name a capital city that shares part of its name with its country.',
    test: (e) => { const a = letters(e.name), b = letters(e.country.name); return a.includes(b) || b.includes(a) || [e.name, ...e.aliases].some((x) => b.includes(letters(x))); },
    fact: capFact,
  }));
  add('capitals', 'capitals', () => ({ key: 'k-south', text: 'Name a capital city in the Southern Hemisphere.', test: (e) => e.south, fact: (e) => `${e.name} is north of the equator.` }));
  add('capitals', 'capitals', () => ({ key: 'k-north', text: 'Name a capital city north of 55° latitude.', test: (e) => e.north, fact: (e) => `${e.name} is too far south.` }));
  add('capitals', 'capitals', () => {
    const [f, lang] = pick([['S', 'Spanish'], ['F', 'French'], ['A', 'Arabic']]);
    return { key: 'k-lang-' + f, text: `Name the capital of a country where ${lang} is an official language.`, test: (e) => e.country.flags.includes(f), fact: (e) => `${lang} isn't official in ${e.country.name}.` };
  });

  // Midnight zone: space
  add('space', 'space', () => {
    const p = pick(['J', 'S', 'S', 'U', 'N']);
    return { key: 's-moon-' + p, text: `Name a moon of ${MOONOF[p]}.`, test: (e) => e.type === 'moon' && e.tags.includes(p), fact: (e) => `${e.name} is ${spaceWhat(e)}.` };
  }, 2);
  add('space', 'space', () => ({ key: 's-moon', text: 'Name a moon in our solar system.', test: (e) => e.type === 'moon', fact: (e) => `${e.name} is ${spaceWhat(e)}.` }));
  add('space', 'space', () => ({ key: 's-zodiac', text: 'Name a constellation of the zodiac.', test: (e) => e.type === 'constellation' && e.tags.includes('z'), fact: (e) => `${e.name} is ${spaceWhat(e)}${e.type === 'constellation' ? ', but not on the zodiac belt' : ''}.` }));
  const conTag = (tag, what) => add('space', 'space', () => ({ key: 's-con-' + tag, text: `Name a constellation named after ${what}.`, test: (e) => e.type === 'constellation' && e.tags.includes(tag), fact: (e) => (e.type === 'constellation' ? `${e.name} isn't named after ${what}.` : `${e.name} is ${spaceWhat(e)}.`) }));
  conTag('a', 'an animal or creature');
  conTag('o', 'an object or tool');
  conTag('h', 'a person or mythical figure');
  add('space', 'space', () => ({ key: 's-con', text: 'Name any of the 88 constellations.', test: (e) => e.type === 'constellation', fact: (e) => `${e.name} is ${spaceWhat(e)}.` }));
  add('space', 'space', () => ({ key: 's-star', text: 'Name a star other than the Sun.', test: (e) => e.type === 'star', fact: (e) => `${e.name} is ${spaceWhat(e)}.` }));
  add('space', 'space', () => ({ key: 's-walk', text: 'Name one of the twelve people who walked on the Moon.', test: (e) => e.tags.includes('w') && e.type === 'astronaut', fact: (e) => (e.type === 'astronaut' ? `${e.name} never set foot on the Moon.` : `${e.name} is ${spaceWhat(e)}.`) }));
  add('space', 'space', () => ({ key: 's-astro', text: 'Name an astronaut or cosmonaut.', test: (e) => e.type === 'astronaut', fact: (e) => `${e.name} is ${spaceWhat(e)}.` }));
  add('space', 'space', () => ({ key: 's-women', text: 'Name a woman who has flown in space.', test: (e) => e.type === 'astronaut' && e.tags.includes('f'), fact: (e) => (e.type === 'astronaut' ? `${e.name} isn't a woman.` : `${e.name} is ${spaceWhat(e)}.`) }));
  add('space', 'space', () => {
    const worlds = space.filter((e) => ['planet', 'dwarf', 'moon'].includes(e.type));
    const l = pick(lettersWith(worlds, 7));
    return { key: 's-world-' + l, text: `Name a planet, dwarf planet or moon that starts with the letter ${l.toUpperCase()}.`, test: (e) => ['planet', 'dwarf', 'moon'].includes(e.type) && first(e.name) === l, fact: (e) => `${e.name} is ${spaceWhat(e)} starting with ${first(e.name).toUpperCase()}.` };
  });
  add('space', 'space', () => {
    const l = pick(lettersWith(space.filter((e) => e.type === 'constellation'), 5));
    return { key: 's-conl-' + l, text: `Name a constellation that starts with the letter ${l.toUpperCase()}.`, test: (e) => e.type === 'constellation' && first(e.name) === l, fact: (e) => `${e.name} is ${spaceWhat(e)}.` };
  });

  // Abyssal zone: elements
  const elFact = (e) => `${e.name} (${e.sym}) is element ${e.z}, ${ECAT[e.cat]}.`;
  add('elements', 'elements', () => {
    const a = 1 + Math.floor(Math.random() * 90);
    return { key: 'e-z-' + a, text: `Name an element with an atomic number from ${a} to ${a + 14}.`, test: (e) => e.z >= a && e.z <= a + 14, fact: elFact };
  }, 2);
  add('elements', 'elements', () => ({ key: 'e-sym', text: "Name an element whose symbol starts with a different letter than its name.", test: (e) => e.sym[0].toLowerCase() !== first(e.name), fact: (e) => `${e.name}'s symbol is ${e.sym}.` }));
  const elCat = (key, cats, text) => add('elements', 'elements', () => ({ key: 'e-' + key, text, test: (e) => cats.includes(e.cat), fact: elFact }));
  elCat('noble', ['ng'], 'Name a noble gas.');
  elCat('halogen', ['ha'], 'Name a halogen.');
  elCat('alkali', ['am'], 'Name an alkali metal.');
  elCat('earth', ['ae'], 'Name an alkaline earth metal.');
  elCat('trans', ['tm'], 'Name a transition metal.');
  elCat('act', ['ac'], 'Name an actinide.');
  elCat('metalloid', ['md'], 'Name a metalloid.');
  add('elements', 'elements', () => ({ key: 'e-rare', text: 'Name a rare-earth element.', test: (e) => e.cat === 'la' || e.z === 21 || e.z === 39, fact: elFact }));
  add('elements', 'elements', () => ({ key: 'e-gas', text: 'Name an element that is a gas at room temperature.', test: (e) => e.state === 'g', fact: (e) => `${e.name} is ${STATE[e.state]} at room temperature.` }));
  add('elements', 'elements', () => ({ key: 'e-metal', text: 'Name a metal.', test: metal, fact: elFact }));
  const elTag = (tag, text, why) => add('elements', 'elements', () => ({ key: 'e-t-' + tag, text, test: (e) => e.tags.includes(tag), fact: (e) => `${e.name} ${why}.` }));
  elTag('R', 'Name a radioactive element.', 'has stable forms');
  elTag('P', 'Name an element named after a person.', "isn't named after a person");
  elTag('C', 'Name an element named after a place.', "isn't named after a place");
  elTag('X', 'Name an element named after a planet, moon, star or asteroid.', "isn't named after anything in the sky");
  add('elements', 'elements', () => ({ key: 'e-one', text: 'Name an element with a one-letter symbol.', test: (e) => e.sym.length === 1, fact: (e) => `${e.name}'s symbol is ${e.sym}.` }));
  add('elements', 'elements', () => ({ key: 'e-ium', text: 'Name an element whose name does NOT end in “-IUM”.', test: (e) => !letters(e.name).endsWith('ium') && !e.aliases.some((x) => letters(x).endsWith('ium')), fact: (e) => `${e.name} ends in “-ium”.` }));
  add('elements', 'elements', () => {
    const l = pick(lettersWith(elements, 6));
    return { key: 'e-start-' + l, text: `Name an element that starts with the letter ${l.toUpperCase()}.`, test: (e, a) => first(e.name) === l || (a && a[0] === l), fact: (e) => `${e.name} starts with ${first(e.name).toUpperCase()}.` };
  });

  // Hadal zone (named for Hades): gods, heroes and monsters
  add('myth', 'myth', () => {
    const c = pick(['greek', 'greek', 'roman', 'norse', 'egyptian', 'hindu']);
    return { key: 'y-cult-' + c, text: `Name a ${CULT[c]} god or goddess.`, test: (e) => e.culture === c && godlike(e), fact: mythWhat };
  }, 3);
  const mythDom = (key, dom, text, kinds) => add('myth', 'myth', () => ({ key: 'y-' + key, text, test: (e) => dom.some((d) => e.dom.includes(d)) && (!kinds || kinds.includes(e.kind)), fact: mythWhat }));
  mythDom('sea', ['sea', 'water'], 'Name a god or goddess of the sea or water, from any mythology.', ['god', 'titan']);
  mythDom('war', ['war'], 'Name a god or goddess of war, from any mythology.', ['god', 'titan']);
  mythDom('sun', ['sun'], 'Name a sun god or goddess, from any mythology.', ['god', 'titan']);
  mythDom('moon', ['moon'], 'Name a moon god or goddess, from any mythology.', ['god', 'titan']);
  mythDom('love', ['love'], 'Name a god or goddess of love, from any mythology.', ['god', 'titan']);
  mythDom('under', ['underworld'], 'Name a god, hero or creature tied to the underworld.');
  mythDom('olymp', ['olympian'], 'Name one of the twelve Olympian gods.');
  mythDom('seabeast', ['sea', 'water'], 'Name a mythical creature that lives in water.', ['creature']);
  mythDom('fly', ['flying'], 'Name a mythical creature that can fly.', ['creature']);
  add('myth', 'myth', () => ({ key: 'y-creature', text: 'Name a creature from myth or folklore.', test: (e) => e.kind === 'creature', fact: mythWhat }));
  add('myth', 'myth', () => ({ key: 'y-hero', text: 'Name a hero from Greek myth.', test: (e) => e.kind === 'hero' && e.culture === 'greek', fact: mythWhat }));
  add('myth', 'myth', () => ({ key: 'y-titan', text: 'Name one of the Greek Titans.', test: (e) => e.kind === 'titan', fact: mythWhat }));
  add('myth', 'myth', () => {
    const gods = myth.filter(godlike);
    const l = pick(lettersWith(gods, 8));
    return { key: 'y-start-' + l, text: `Name a god or goddess (any mythology) whose name starts with ${l.toUpperCase()}.`, test: (e) => godlike(e) && first(e.name) === l, fact: (e) => (godlike(e) ? `${e.name} starts with ${first(e.name).toUpperCase()}.` : mythWhat(e)) };
  });

  // Challenger Deep: sunken treasure
  add('treasure', 'gems', () => ({ key: 't-gem', text: 'Name a gemstone.', test: () => true, fact: (e) => `${e.name}?` }));
  add('treasure', 'gems', () => ({ key: 't-birth', text: 'Name a birthstone (any month).', test: (e) => e.tags.includes('m'), fact: (e) => `${e.name} isn't on the birthstone list.` }));
  add('treasure', 'gems', () => {
    const c = pick(['G', 'B', 'R', 'P', 'K']);
    return { key: 't-col-' + c, text: `Name a gemstone that is usually ${COLOR[c]}.`, test: (e) => e.colors.includes(c), fact: (e) => `${e.name} is usually ${e.colors ? e.colors.split('').map((k) => COLOR[k]).join(' or ') : 'banded and many-coloured'}.` };
  }, 2);
  add('treasure', 'gems', () => ({ key: 't-organic', text: 'Name a gem made by a living thing.', test: (e) => e.tags.includes('o'), fact: (e) => `${e.name} is a mineral.` }));
  add('treasure', 'gems', () => {
    const l = pick(lettersWith(gems, 5));
    return { key: 't-start-' + l, text: `Name a gemstone that starts with the letter ${l.toUpperCase()}.`, test: (e, a) => first(e.name) === l || (a && a[0] === l), fact: (e) => `${e.name} starts with ${first(e.name).toUpperCase()}.` };
  });
  add('treasure', 'elements', () => ({ key: 't-metal', text: 'Name a precious metal.', test: (e) => e.tags.includes('M'), fact: (e) => `${e.name} isn't counted as a precious metal.` }));
  add('treasure', 'coins', () => ({ key: 't-coin', text: 'Name a currency, past or present.', test: () => true, fact: (e) => `${e.name}?` }), 2);
  add('treasure', 'coins', () => ({ key: 't-old', text: 'Name a coin or currency that is no longer used.', test: (e) => e.tags.includes('h'), fact: (e) => `The ${e.name.toLowerCase()} is still in use today.` }));

  // ---------- zones ----------
  // Seven zones stacked by depth. Every 100 points of answers drills through one zone,
  // so the zone (and the category of the next prompt) depends on how well you have scored.
  const PTS_PER_ZONE = 100;
  const ZONES = [
    { id: 'reef', name: 'CORAL REEF', top: 0, bottom: 30, cat: 'marine', theme: 'Reef Life', rank: 'CLOWNFISH', blurb: 'Warm, bright water. The reef is crowded with life.' },
    { id: 'sun', name: 'SUNLIGHT ZONE', top: 30, bottom: 200, cat: 'countries', theme: 'The World Above', rank: 'SEA TURTLE', blurb: 'Sunlight still reaches you. Sonar picks up chatter from every nation above.' },
    { id: 'twilight', name: 'TWILIGHT ZONE', top: 200, bottom: 1000, cat: 'capitals', theme: 'City Lights', rank: 'JELLYFISH', blurb: 'The light fades to blue. Far above, the capitals are switching their lights on.' },
    { id: 'midnight', name: 'MIDNIGHT ZONE', top: 1000, bottom: 4000, cat: 'space', theme: 'Starlight', rank: 'ANGLERFISH', blurb: 'Pitch black. Glowing creatures drift past like stars.' },
    { id: 'abyss', name: 'ABYSSAL ZONE', top: 4000, bottom: 6000, cat: 'elements', theme: 'Crushing Elements', rank: 'DUMBO OCTOPUS', blurb: 'Near freezing, 500 times surface pressure. Hope the hull holds.' },
    { id: 'hadal', name: 'HADAL ZONE', top: 6000, bottom: 10000, cat: 'myth', theme: 'Realm of Hades', rank: 'GIANT SQUID', blurb: 'The trenches are named for Hades, lord of the underworld.' },
    { id: 'deep', name: 'CHALLENGER DEEP', top: 10000, bottom: 10935, cat: 'treasure', theme: 'Sunken Treasure', rank: 'LEVIATHAN', blurb: 'The deepest trench on Earth. Something glints in the silt below.' },
  ];
  const fmtM = (m) => Math.round(m).toLocaleString('en-US');
  ZONES.forEach((z, i) => { z.index = i; z.minPts = i * PTS_PER_ZONE; z.range = `${fmtM(z.top)}–${fmtM(z.bottom)} m`; z.the = z.id === 'deep' ? '' : 'the '; });
  const MAX_PTS = ZONES.length * PTS_PER_ZONE;

  // Zone you are in after scoring `points` in total.
  const zoneFor = (points) => ZONES[Math.min(ZONES.length - 1, Math.floor(Math.max(0, points) / PTS_PER_ZONE))];
  // Depth in metres after scoring `points`: linear inside each zone.
  function depthFor(points) {
    const p = Math.max(0, Math.min(MAX_PTS, points));
    if (p >= MAX_PTS) return ZONES[ZONES.length - 1].bottom;
    const z = zoneFor(p), f = (p - z.minPts) / PTS_PER_ZONE;
    return z.top + (z.bottom - z.top) * f;
  }

  function build(cat, avoid) {
    const pool = T[cat];
    const weighted = [];
    pool.forEach((t) => { for (let i = 0; i < t.weight; i++) weighted.push(t); });
    let fallback = null;
    for (let tries = 0; tries < 80; tries++) {
      const t = pick(weighted);
      const p = t.make();
      if (!p) continue;
      const ds = DS[t.ds];
      const valid = ds.entities.filter((e) => p.test(e, null));
      if (valid.length < 5) continue;
      p.ds = t.ds; p.valid = valid; p.fmax = Math.max(...valid.map((e) => e.fame));
      if (!avoid.has(p.key)) return p;
      if (!fallback && !avoid.has('run:' + p.key)) fallback = p;
    }
    return fallback;
  }

  // A fresh prompt for a zone. `recent` = keys from earlier dives (avoided when possible),
  // `inRun` = keys already asked this dive (never repeated).
  function promptFor(zoneIndex, recent, inRun) {
    const z = ZONES[zoneIndex];
    const avoid = new Set(recent || []);
    (inRun || []).forEach((k) => { avoid.add(k); avoid.add('run:' + k); });
    let p = build(z.cat, avoid);
    if (!p) p = build(z.cat, new Set((inRun || []).flatMap((k) => [k, 'run:' + k])));
    return p ? Object.assign({ zone: z }, p) : null;
  }

  // Rebuild a prompt from its saved key (used to resume a dive after the page updates).
  function rebuildOne(zoneIndex, key) {
    const z = ZONES[zoneIndex];
    const prefix = key.split('-').slice(0, 2).join('-');
    for (const t of T[z.cat]) {
      for (let n = 0; n < 400; n++) {
        const p = t.make();
        if (!p) break;
        if (p.key !== key) { if (!p.key.startsWith(prefix)) break; continue; }
        const ds = DS[t.ds];
        p.ds = t.ds; p.valid = ds.entities.filter((e) => p.test(e, null)); p.fmax = Math.max(...p.valid.map((e) => e.fame));
        return Object.assign({ zone: z }, p);
      }
    }
    return null;
  }

  // Exact match on any name or alias (also tries dropping a plural "s"/"es").
  function lookup(ds, input) {
    const k = sq(input);
    if (!k) return null;
    const keys = [k];
    if (k.endsWith('es')) keys.push(k.slice(0, -2));
    if (k.endsWith('s')) keys.push(k.slice(0, -1));
    for (const key of keys) { const hit = ds.idx.get(key); if (hit) return { hits: hit, fuzzy: false }; }
    return null;
  }

  // Typo-tolerant match: closest names within a length-based edit distance.
  function fuzzy(ds, input) {
    const k = sq(input);
    const max = tolerance(k.length);
    if (!max) return null;
    let best = max + 1, hits = [];
    for (const [key, bucket] of ds.idx) {
      const d = osa(k, key, Math.min(best, max));
      if (d < best) { best = d; hits = bucket.slice(); } else if (d === best && d <= max) hits.push(...bucket);
    }
    return best <= max ? { hits, fuzzy: true } : null;
  }

  function score(p, e) {
    const share = 90 * Math.pow(Math.min(1, e.fame / p.fmax), 1.6);
    return { points: Math.max(1, Math.min(100, Math.round(100 - share))), share };
  }

  const TIERS = [
    { min: 90, id: 'legendary', label: 'LEGENDARY' },
    { min: 75, id: 'epic', label: 'EPIC' },
    { min: 55, id: 'rare', label: 'RARE' },
    { min: 30, id: 'uncommon', label: 'UNCOMMON' },
    { min: 1, id: 'common', label: 'COMMON' },
  ];
  const tierFor = (pts) => (pts > 0 ? TIERS.find((t) => pts >= t.min) : { id: 'junk', label: 'OLD BOOT' });

  // status: ok | wrong | retry
  function judge(p, input, used) {
    const raw = String(input || '').trim();
    if (!raw) return { status: 'retry', message: 'Type an answer first, or skip.' };
    const ds = DS[p.ds];
    let m = lookup(ds, raw);
    if (!m) {
      const decoys = DECOYS[p.ds];
      const dk = sq(raw);
      const decoy = decoys && (decoys.get(dk) || decoys.get(dk.replace(/s$/, '')));
      if (decoy) return { status: 'retry', message: decoy + ' Try again.' };
      for (const other of Object.values(DS)) {
        if (other === ds) continue;
        const hit = lookup(other, raw);
        if (hit) return { status: 'retry', message: `${hit.hits[0].e.name} is ${other.label}. We need ${ds.label}.` };
      }
      m = fuzzy(ds, raw);
      if (!m) return { status: 'retry', message: `Sonar can't place “${raw}”. Check the spelling or try another.` };
    }
    const passes = (h) => p.test(h.e, null) || (!h.abbrev && p.test(h.e, h.a));
    const good = m.hits.filter(passes).sort((a, b) => b.e.fame - a.e.fame);
    if (good.length) {
      const h = good.find((x) => !used.has(x.e.id)) || good[0];
      if (used.has(h.e.id)) return { status: 'retry', message: `${h.e.name} is already in your net. Try another.` };
      const s = score(p, h.e);
      return { status: 'ok', entity: h.e, fuzzy: m.fuzzy, points: s.points, share: s.share, tier: tierFor(s.points) };
    }
    const h = m.hits.slice().sort((a, b) => b.e.fame - a.e.fame)[0];
    return { status: 'wrong', entity: h.e, fuzzy: m.fuzzy, points: 0, tier: tierFor(0), message: p.fact(h.e) };
  }

  // Most common and rarest answers for the reveal, skipping the one the diver gave.
  function reveal(p, skip) {
    const seen = new Set();
    const uniq = p.valid.filter((e) => e !== skip && !seen.has(e.name) && seen.add(e.name));
    const sorted = uniq.slice().sort((a, b) => b.fame - a.fame);
    return {
      common: sorted.slice(0, 3).map((e) => ({ name: e.name, points: score(p, e).points })),
      rare: sorted.slice(3).slice(-3).reverse().map((e) => ({ name: e.name, points: score(p, e).points })),
      count: p.valid.length,
    };
  }

  const rankFor = (points) => (points >= MAX_PTS ? 'KING OF THE DEEP' : zoneFor(points).rank);

  D.engine = { ZONES, DS, T, PTS_PER_ZONE, MAX_PTS, zoneFor, depthFor, promptFor, rebuildOne, judge, reveal, tierFor, rankFor, norm, lookup, fuzzy, score };
})();
