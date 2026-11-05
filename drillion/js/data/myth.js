/* DRILLION data: gods, heroes and monsters.
   name | aliases | culture | kind | domains | fame
   culture: greek roman norse egyptian hindu japanese aztec celtic mesopotamian polynesian other
   kind: god (god or goddess), titan, hero, creature
   domains: sea sky war love underworld sun moon wisdom harvest fire olympian water flying */
window.DRILLION = window.DRILLION || {};
window.DRILLION.mythRaw = `
Zeus||greek|god|sky olympian|100
Hera||greek|god|olympian love|70
Poseidon||greek|god|sea olympian|95
Demeter||greek|god|harvest olympian|50
Athena|athene;pallas athena|greek|god|wisdom war olympian|85
Apollo||greek|god|sun olympian|80
Artemis||greek|god|moon olympian|65
Ares||greek|god|war olympian|75
Aphrodite||greek|god|love olympian|80
Hephaestus|hephaistos|greek|god|fire olympian|45
Hermes||greek|god|olympian|75
Hestia||greek|god|fire olympian|30
Dionysus|dionysos|greek|god|harvest olympian|55
Hades||greek|god|underworld|90
Persephone||greek|god|underworld harvest|55
Eros||greek|god|love|40
Nike||greek|god|war|30
Helios||greek|god|sun|35
Selene||greek|god|moon|25
Eos||greek|god|sky|15
Nyx||greek|god|sky|20
Gaia|gaea|greek|god||40
Uranus|ouranos|greek|god|sky|30
Pontus|pontos|greek|god|sea|8
Oceanus|okeanos|greek|titan|sea water|20
Tethys||greek|titan|sea water|8
Triton||greek|god|sea|30
Nereus||greek|god|sea|10
Proteus||greek|god|sea|10
Amphitrite||greek|god|sea|15
Thetis||greek|god|sea|15
Phorcys||greek|god|sea|4
Ceto||greek|god|sea|4
Glaucus||greek|god|sea|5
Thanatos||greek|god|underworld|30
Hypnos||greek|god||15
Hecate|hekate|greek|god|underworld moon|30
Pan||greek|god||40
Iris||greek|god|sky|15
Nemesis||greek|god||20
Tyche||greek|god||8
Asclepius|asklepios|greek|god||12
Morpheus||greek|god||25
Aeolus||greek|god|sky|12
Boreas||greek|god|sky|10
Charon||greek|creature|underworld|35
Cronus|kronos;cronos|greek|titan|harvest|45
Rhea||greek|titan||20
Hyperion||greek|titan|sun|15
Theia||greek|titan||8
Coeus||greek|titan||4
Phoebe||greek|titan|moon|6
Mnemosyne||greek|titan||10
Themis||greek|titan||10
Crius||greek|titan||4
Iapetus||greek|titan||5
Atlas||greek|titan|sky|50
Prometheus||greek|titan|fire|50
Epimetheus||greek|titan||12
Leto||greek|titan||10
Metis||greek|titan|wisdom|8
Heracles|hercules;herakles|greek|hero||95
Achilles||greek|hero|war|75
Perseus||greek|hero||55
Odysseus|ulysses|greek|hero||65
Jason||greek|hero|sea|50
Theseus||greek|hero||45
Ajax|aias|greek|hero|war|25
Hector||greek|hero|war|35
Bellerophon||greek|hero|flying|12
Orpheus||greek|hero|underworld|30
Atalanta||greek|hero||15
Aeneas||greek|hero||20
Patroclus||greek|hero|war|15
Diomedes||greek|hero|war|10
Agamemnon||greek|hero|war|25
Menelaus||greek|hero|war|15
Castor||greek|hero||10
Pollux|polydeuces|greek|hero||10
Cadmus||greek|hero||8
Oedipus||greek|hero||25
Hippolyta||greek|hero|war|15
Icarus||greek|hero|flying|40
Daedalus||greek|hero||20
Pandora||greek|hero||40
Medusa||greek|creature||80
Minotaur|the minotaur|greek|creature||75
Cyclops|polyphemus;cyclopes|greek|creature||65
Hydra|lernaean hydra|greek|creature|water|60
Cerberus|kerberos|greek|creature|underworld|65
Pegasus||greek|creature|flying|75
Centaur||greek|creature||55
Chimera|chimaera|greek|creature||35
Siren|sirens|greek|creature|sea flying|50
Harpy|harpies|greek|creature|flying|30
Scylla||greek|creature|sea|25
Charybdis||greek|creature|sea|20
Satyr||greek|creature||30
Gorgon|gorgons|greek|creature||30
Sphinx||greek|creature||50
Griffin|gryphon;griffon|greek|creature|flying|45
Cetus|ketos|greek|creature|sea|10
Hippocampus|hippocamp|greek|creature|sea|10
Nereid|nereids|greek|creature|sea water|10
Naiad|naiads|greek|creature|water|10
Nymph|nymphs|greek|creature|water|30
Typhon||greek|creature||15
Echidna||greek|creature||8
Ladon||greek|creature||5
Talos||greek|creature||8
Phoenix||greek|creature|flying fire|65
Jupiter|jove|roman|god|sky|60
Juno||roman|god|love|40
Neptune||roman|god|sea|60
Minerva||roman|god|wisdom war|35
Mars||roman|god|war|55
Venus||roman|god|love|55
Mercury||roman|god||45
Vulcan||roman|god|fire|35
Ceres||roman|god|harvest|25
Diana||roman|god|moon|35
Bacchus||roman|god|harvest|35
Pluto|dis pater;dis|roman|god|underworld|40
Proserpina|proserpine|roman|god|underworld|12
Vesta||roman|god|fire|20
Janus||roman|god||30
Saturn||roman|god|harvest|25
Cupid|amor|roman|god|love|55
Aurora||roman|god|sky|15
Sol||roman|god|sun|15
Luna||roman|god|moon|15
Bellona||roman|god|war|6
Faunus||roman|god||8
Fortuna||roman|god||15
Victoria||roman|god|war|8
Quirinus||roman|god|war|4
Romulus||roman|hero||35
Remus||roman|hero||25
Odin|woden;wotan|norse|god|war wisdom sky|90
Thor||norse|god|sky war|95
Loki||norse|god|fire|90
Frigg|frigga|norse|god|love|30
Freya|freyja|norse|god|love war|40
Freyr|frey|norse|god|harvest sun|20
Baldur|balder;baldr|norse|god|sun|30
Tyr|tiw|norse|god|war|25
Heimdall|heimdallr|norse|god|sky|35
Hel||norse|god|underworld|35
Njord|njordr|norse|god|sea|12
Aegir|aegir|norse|god|sea|12
Ran||norse|god|sea underworld|8
Bragi||norse|god||8
Idun|idunn;iduna|norse|god|harvest|8
Sif||norse|god|harvest|12
Vidar||norse|god|war|6
Vali||norse|god||5
Forseti||norse|god||4
Ullr|ull|norse|god||4
Hodr|hod;hoder|norse|god||5
Skadi||norse|god||8
Mimir||norse|god|wisdom|10
Sol|sunna|norse|god|sun|6
Mani||norse|god|moon|6
Valkyrie|valkyries|norse|creature|war flying|45
Fenrir|fenris wolf;fenris|norse|creature||40
Jormungandr|midgard serpent;world serpent|norse|creature|sea|30
Sleipnir||norse|creature||20
Nidhogg|nidhoggr|norse|creature|underworld|8
Ymir||norse|creature||10
Draugr|draugar|norse|creature|underworld|6
Ra|re;amun-ra;amun ra|egyptian|god|sun|85
Osiris||egyptian|god|underworld harvest|60
Isis||egyptian|god|love|55
Horus||egyptian|god|sky war|60
Anubis||egyptian|god|underworld|85
Set|seth|egyptian|god|war|40
Thoth||egyptian|god|wisdom moon|35
Bastet|bast|egyptian|god||40
Sekhmet||egyptian|god|war sun|25
Hathor||egyptian|god|love|25
Ptah||egyptian|god||12
Amun|amon;amen|egyptian|god|sky|25
Aten||egyptian|god|sun|20
Nut||egyptian|god|sky|12
Geb||egyptian|god|harvest|10
Shu||egyptian|god|sky|8
Tefnut||egyptian|god|water|6
Nephthys||egyptian|god|underworld|10
Sobek||egyptian|god|water|20
Khnum||egyptian|god|water|6
Maat|ma'at|egyptian|god|wisdom|15
Taweret||egyptian|god||6
Bes||egyptian|god||6
Khepri||egyptian|god|sun|8
Atum||egyptian|god|sun|10
Hapi||egyptian|god|water harvest|6
Khonsu||egyptian|god|moon|8
Mut||egyptian|god||6
Montu||egyptian|god|war|4
Apep|apophis|egyptian|creature|underworld|15
Brahma||hindu|god||30
Vishnu||hindu|god||40
Shiva|siva|hindu|god||45
Ganesha|ganesh|hindu|god|wisdom|40
Kali||hindu|god|war underworld|35
Lakshmi||hindu|god|love|20
Saraswati||hindu|god|wisdom|15
Hanuman||hindu|god||20
Krishna||hindu|god|love|35
Rama||hindu|hero||20
Indra||hindu|god|sky war|20
Agni||hindu|god|fire|15
Surya||hindu|god|sun|15
Varuna||hindu|god|sea water|10
Yama||hindu|god|underworld|12
Durga||hindu|god|war|15
Parvati||hindu|god|love|12
Kartikeya|murugan|hindu|god|war|8
Garuda||hindu|creature|flying|15
Naga|nagas|hindu|creature|water|15
Makara||hindu|creature|sea water|5
Amaterasu||japanese|god|sun|25
Susanoo|susanoo-no-mikoto|japanese|god|sea|12
Tsukuyomi||japanese|god|moon|10
Izanagi||japanese|god||8
Izanami||japanese|god|underworld|8
Raijin||japanese|god|sky|12
Fujin||japanese|god|sky|8
Ryujin||japanese|god|sea|8
Inari||japanese|god|harvest|10
Hachiman||japanese|god|war|5
Kitsune||japanese|creature||25
Tengu||japanese|creature|flying|15
Kappa||japanese|creature|water|15
Oni||japanese|creature||15
Umibozu||japanese|creature|sea|5
Ningyo||japanese|creature|sea|4
Quetzalcoatl||aztec|god|sky wisdom|40
Huitzilopochtli||aztec|god|sun war|15
Tlaloc||aztec|god|water|15
Tezcatlipoca||aztec|god||10
Tonatiuh||aztec|god|sun|6
Mictlantecuhtli||aztec|god|underworld|6
Xipe Totec||aztec|god|harvest|5
Chalchiuhtlicue||aztec|god|water|4
Ahuizotl||aztec|creature|water|4
Dagda|the dagda|celtic|god|harvest|10
Brigid|brigit|celtic|god|fire|10
Lugh||celtic|god|sun|10
Morrigan|the morrigan|celtic|god|war|15
Manannan mac Lir|manannan|celtic|god|sea|8
Cernunnos||celtic|god||10
Cu Chulainn|cuchulainn|celtic|hero|war|12
Banshee||celtic|creature||40
Leprechaun||celtic|creature||45
Selkie|selkies|celtic|creature|sea|20
Kelpie|kelpies|celtic|creature|water|15
Pooka|puca|celtic|creature||5
Marduk||mesopotamian|god|war|15
Tiamat||mesopotamian|god|sea water|15
Enki|ea|mesopotamian|god|water wisdom|10
Ishtar|inanna|mesopotamian|god|love war|20
Shamash|utu|mesopotamian|god|sun|8
Ereshkigal||mesopotamian|god|underworld|6
Nergal||mesopotamian|god|underworld war|5
Gilgamesh||mesopotamian|hero||35
Enkidu||mesopotamian|hero||10
Maui||polynesian|hero|sea|35
Tangaroa|tangaloa;kanaloa|polynesian|god|sea|10
Pele||polynesian|god|fire|20
Taniwha||polynesian|creature|water sea|5
Kraken|the kraken|other|creature|sea|70
Leviathan||other|creature|sea|50
Mermaid|mermaids|other|creature|sea|85
Merman|mermen|other|creature|sea|25
Dragon|dragons|other|creature|flying fire|90
Unicorn|unicorns|other|creature||85
Basilisk||other|creature||30
Manticore||other|creature||20
Wyvern||other|creature|flying|20
Golem||other|creature||25
Yeti|abominable snowman|other|creature||45
Bigfoot|sasquatch|other|creature||45
Loch Ness Monster|nessie|other|creature|water|50
Chupacabra||other|creature||20
Wendigo||other|creature||20
Thunderbird||other|creature|flying sky|15
Roc||other|creature|flying|8
Djinn|genie;jinn|other|creature||35
Vampire|vampires|other|creature||50
Werewolf|werewolves|other|creature||50
Rusalka||other|creature|water|5
Sea serpent|sea serpents|other|creature|sea|25
Bunyip||other|creature|water|6
Lorelei||other|creature|water|6
Vodyanoy||other|creature|water|3
Undine|undines|other|creature|water|5
Nix|nixie;nixies;nokken|other|creature|water|5
Bakunawa||other|creature|sea|3
Lusca||other|creature|sea|3
Ogopogo||other|creature|water|5
Hippogriff||other|creature|flying|20
Gargoyle||other|creature|flying|15
Baba Yaga||other|creature||20
Fairy|fairies|other|creature|flying|40
Troll|trolls|other|creature||40
Ogre|ogres|other|creature||25
Goblin|goblins|other|creature||30
`;
