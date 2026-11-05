/* DRILLION data: sea life.
   name | aliases | group | tags | fame
   group: shark ray whale dolphin pinniped sirenian mammal reptile bird ceph crust mollusc cnid echino invert fish
   tags: r coral reef, d deep sea, v venomous or poisonous, h shell, t tentacles,
         p polar waters, a named after a different animal, x extinct */
window.DRILLION = window.DRILLION || {};
window.DRILLION.marineRaw = `
Great white shark|great white;white shark|shark||100
Hammerhead shark|hammerhead;great hammerhead;scalloped hammerhead|shark||85
Tiger shark|tiger|shark|a|70
Whale shark||shark|a|75
Bull shark||shark|a|55
Mako shark|mako;shortfin mako|shark||45
Nurse shark||shark|r|50
Blue shark||shark||30
Lemon shark||shark||30
Basking shark||shark||40
Megalodon|megalodon shark|shark|x|80
Goblin shark||shark|d|35
Greenland shark||shark|dp|35
Thresher shark|thresher|shark||35
Frilled shark||shark|d|25
Cookiecutter shark|cookie cutter shark|shark|d|20
Angel shark|angelshark|shark||15
Wobbegong|wobbegong shark;carpet shark|shark|r|15
Sand tiger shark|sand tiger;grey nurse shark|shark|a|20
Blacktip reef shark|blacktip shark;blacktip|shark|r|30
Whitetip reef shark|whitetip shark|shark|r|25
Oceanic whitetip shark|oceanic whitetip|shark||20
Leopard shark||shark|a|25
Zebra shark||shark|ra|15
Bonnethead|bonnethead shark|shark||10
Porbeagle|porbeagle shark|shark||10
Salmon shark||shark|a|10
Sixgill shark|bluntnose sixgill|shark|d|10
Sevengill shark|broadnose sevengill|shark||8
Spiny dogfish|dogfish;spurdog|shark|a|20
Catshark|cat shark;swell shark|shark|a|10
Horn shark||shark||10
Port Jackson shark||shark||8
Sawshark|saw shark|shark||10
Lantern shark|lanternshark|shark|d|8
Megamouth shark|megamouth|shark|d|20
Silky shark||shark||8
Galapagos shark||shark||8
Caribbean reef shark|reef shark|shark|r|20
Epaulette shark|walking shark|shark|r|8
Sleeper shark|pacific sleeper shark|shark|dp|6
Bramble shark||shark|d|4
Dusky shark||shark||6
Sandbar shark||shark||6
Manta ray|manta;giant manta ray|ray|r|75
Stingray|sting ray;southern stingray|ray|rv|80
Eagle ray|spotted eagle ray|ray|ra|35
Electric ray|torpedo ray|ray||30
Sawfish|smalltooth sawfish|ray||30
Guitarfish||ray||10
Skate||ray||30
Devil ray|mobula ray;mobula|ray||15
Cownose ray||ray|a|15
Blue-spotted stingray|bluespotted ribbontail ray;blue spotted stingray|ray|rva|15
Bat ray||ray|a|10
Butterfly ray||ray|a|8
Blue whale||whale||95
Humpback whale|humpback|whale||85
Orca|killer whale|whale|p|90
Sperm whale|cachalot|whale|d|70
Beluga|beluga whale;white whale|whale|p|65
Narwhal||whale|p|70
Gray whale|grey whale|whale||40
Right whale|north atlantic right whale;southern right whale|whale||30
Bowhead whale|bowhead|whale|p|25
Fin whale|finback|whale||30
Sei whale||whale||12
Minke whale|minke|whale||30
Bryde's whale|brydes whale|whale||8
Pilot whale|long-finned pilot whale;short-finned pilot whale|whale||25
Cuvier's beaked whale|beaked whale;cuviers beaked whale|whale|d|12
False killer whale||whale||12
Pygmy sperm whale||whale||8
Omura's whale|omuras whale|whale||4
Melon-headed whale|melon headed whale|whale||4
Bottlenose dolphin|dolphin;bottlenose|dolphin||95
Common dolphin||dolphin||40
Spinner dolphin||dolphin||30
Spotted dolphin|atlantic spotted dolphin|dolphin||20
Risso's dolphin|rissos dolphin|dolphin||10
Dusky dolphin||dolphin||8
Hector's dolphin|hectors dolphin|dolphin||8
Commerson's dolphin|commersons dolphin|dolphin||6
Irrawaddy dolphin||dolphin||8
White-sided dolphin|pacific white-sided dolphin;atlantic white-sided dolphin|dolphin||8
Harbour porpoise|harbor porpoise;porpoise|dolphin||40
Vaquita||dolphin||25
Dall's porpoise|dalls porpoise|dolphin||6
Maui dolphin||dolphin||5
Seal|harbor seal;harbour seal;common seal|pinniped||85
Sea lion|california sea lion|pinniped|a|75
Walrus||pinniped|p|75
Elephant seal||pinniped|a|45
Leopard seal||pinniped|pa|40
Fur seal||pinniped||25
Grey seal|gray seal|pinniped||25
Harp seal||pinniped|p|25
Monk seal|hawaiian monk seal|pinniped||20
Weddell seal||pinniped|p|12
Ringed seal||pinniped|p|10
Crabeater seal||pinniped|pa|10
Hooded seal||pinniped|p|8
Steller sea lion||pinniped|a|10
Bearded seal||pinniped|p|8
Manatee|sea cow|sirenian||70
Dugong||sirenian||40
Steller's sea cow|stellers sea cow|sirenian|xa|10
Sea otter|otter|mammal||70
Polar bear||mammal|p|80
Marine otter||mammal||4
Sea turtle|turtle;green sea turtle;green turtle|reptile|rh|90
Loggerhead turtle|loggerhead;loggerhead sea turtle|reptile|h|35
Leatherback turtle|leatherback;leatherback sea turtle|reptile|h|30
Hawksbill turtle|hawksbill;hawksbill sea turtle|reptile|rha|25
Kemp's ridley turtle|kemps ridley;kemp's ridley|reptile|h|10
Olive ridley turtle|olive ridley|reptile|h|8
Flatback turtle|flatback sea turtle|reptile|h|5
Sea snake|banded sea krait;sea krait|reptile|rv|40
Marine iguana||reptile||30
Saltwater crocodile|saltie;estuarine crocodile;crocodile|reptile||45
Penguin||bird|p|90
Emperor penguin||bird|p|60
King penguin||bird|p|35
Adelie penguin||bird|p|20
Gentoo penguin||bird|p|20
Chinstrap penguin||bird|p|15
Macaroni penguin||bird|p|12
Rockhopper penguin||bird|p|15
Little blue penguin|little penguin;fairy penguin;blue penguin|bird||10
African penguin|jackass penguin|bird||10
Galapagos penguin||bird||10
Humboldt penguin||bird||8
Magellanic penguin||bird||8
Albatross|wandering albatross|bird||60
Pelican|brown pelican|bird||65
Puffin|atlantic puffin|bird||60
Seagull|gull;herring gull;sea gull|bird||75
Tern|arctic tern|bird||30
Cormorant||bird||30
Gannet|northern gannet|bird||20
Blue-footed booby|booby;blue footed booby|bird||30
Frigatebird|frigate bird;magnificent frigatebird|bird||20
Petrel|storm petrel|bird||15
Shearwater||bird||10
Skua||bird|p|10
Guillemot|murre|bird||10
Razorbill||bird||6
Kittiwake||bird||6
Octopus|common octopus|ceph|rt|95
Giant Pacific octopus||ceph|t|30
Blue-ringed octopus|blue ringed octopus|ceph|rtv|40
Mimic octopus||ceph|rt|20
Dumbo octopus||ceph|dt|30
Squid||ceph|t|85
Giant squid||ceph|dt|65
Colossal squid||ceph|dtp|35
Humboldt squid|jumbo squid|ceph|t|12
Vampire squid||ceph|dt|30
Firefly squid||ceph|dt|8
Bobtail squid||ceph|t|5
Cuttlefish||ceph|rt|50
Nautilus|chambered nautilus|ceph|ht|45
Argonaut|paper nautilus|ceph|ht|6
Crab||crust|rh|90
Hermit crab||crust|rh|55
King crab|red king crab|crust|hp|35
Japanese spider crab|spider crab|crust|ha|25
Blue crab||crust|h|20
Dungeness crab||crust|h|15
Coconut crab|robber crab|crust|h|15
Fiddler crab||crust|h|15
Ghost crab||crust|h|10
Yeti crab||crust|dh|10
Decorator crab||crust|rh|8
Horseshoe crab||crust|h|35
Lobster||crust|h|85
Spiny lobster|rock lobster|crust|rh|25
Slipper lobster||crust|h|5
Shrimp|prawn|crust||80
Mantis shrimp||crust|ra|45
Pistol shrimp|snapping shrimp|crust|r|15
Cleaner shrimp||crust|r|12
Krill|antarctic krill|crust|p|55
Barnacle||crust|h|50
Copepod||crust||12
Giant isopod|isopod|crust|d|25
Amphipod||crust|d|8
Clam||mollusc|h|70
Giant clam||mollusc|rh|40
Oyster||mollusc|h|70
Mussel||mollusc|h|55
Scallop||mollusc|h|50
Cockle||mollusc|h|20
Conch|queen conch|mollusc|rh|40
Whelk||mollusc|h|15
Abalone||mollusc|h|20
Limpet||mollusc|h|20
Cowrie|cowry|mollusc|rh|12
Cone snail|cone shell|mollusc|rhv|20
Sea snail|snail|mollusc|h|35
Periwinkle||mollusc|h|10
Murex||mollusc|h|5
Triton snail|tritons trumpet;triton's trumpet|mollusc|rh|5
Nudibranch|sea slug|mollusc|r|35
Sea hare||mollusc|a|10
Chiton||mollusc|h|6
Sea butterfly|pteropod|mollusc|ha|5
Geoduck||mollusc|h|10
Jellyfish|jelly|cnid|tv|95
Box jellyfish|sea wasp|cnid|tv|45
Moon jellyfish|moon jelly|cnid|t|20
Lion's mane jellyfish|lions mane jellyfish;lion's mane;lions mane|cnid|tvpa|25
Irukandji jellyfish|irukandji|cnid|tv|10
Upside-down jellyfish|upside down jellyfish|cnid|rt|5
Portuguese man o' war|portuguese man of war;man o war;man of war;bluebottle|cnid|tv|40
Sea anemone|anemone|cnid|rt|60
Coral|brain coral;staghorn coral|cnid|r|75
Sea pen||cnid|d|8
Sea fan|gorgonian|cnid|r|10
By-the-wind sailor|velella|cnid||4
Fire coral||cnid|rv|8
Starfish|sea star|echino|r|90
Crown-of-thorns starfish|crown of thorns|echino|rv|20
Brittle star||echino||15
Sea urchin|urchin|echino|r|60
Sand dollar||echino||35
Sea cucumber||echino|r|45
Sea pig||echino|da|15
Sea lily|crinoid;feather star|echino|r|8
Basket star||echino|d|5
Sponge|sea sponge|invert|r|60
Sea squirt|tunicate|invert|r|15
Comb jelly|ctenophore|invert|t|10
Giant tube worm|tube worm;tubeworm|invert|d|25
Christmas tree worm||invert|r|10
Bristle worm|fireworm|invert|r|8
Feather duster worm|feather duster|invert|r|8
Bobbit worm||invert|r|10
Sea mouse||invert|a|5
Sea spider||invert|da|10
Salp||invert||6
Pyrosome||invert||5
Clownfish|clown fish;anemonefish;nemo|fish|r|95
Blue tang|regal tang;dory|fish|r|60
Yellow tang||fish|r|25
Parrotfish|parrot fish|fish|ra|40
Angelfish|angel fish;queen angelfish|fish|r|40
Butterflyfish|butterfly fish|fish|ra|25
Grouper|giant grouper;goliath grouper|fish|r|40
Moray eel|moray|fish|r|50
Lionfish|lion fish|fish|rva|45
Triggerfish|trigger fish|fish|r|25
Wrasse|cleaner wrasse|fish|r|20
Damselfish||fish|r|12
Goby||fish|r|15
Blenny||fish|r|10
Pufferfish|puffer fish;puffer;blowfish;fugu|fish|rv|70
Porcupinefish|porcupine fish|fish|rva|15
Boxfish|box fish|fish|r|12
Cowfish||fish|ra|10
Trumpetfish||fish|r|10
Barracuda||fish|r|50
Snapper|red snapper|fish|r|35
Sweetlips||fish|r|5
Cardinalfish||fish|ra|6
Surgeonfish||fish|r|10
Unicornfish||fish|r|8
Rabbitfish||fish|rva|6
Frogfish||fish|ra|12
Scorpionfish||fish|rva|15
Stonefish||fish|rv|35
Seahorse|sea horse|fish|ra|85
Pipefish||fish|r|10
Leafy sea dragon|sea dragon;leafy seadragon;weedy sea dragon|fish|r|20
Moorish idol||fish|r|12
Mandarinfish|mandarin fish;mandarin dragonet|fish|r|8
Batfish||fish|ra|6
Hogfish||fish|ra|5
Squirrelfish||fish|ra|5
Goatfish||fish|ra|5
Sergeant major||fish|r|5
Tuna|bluefin tuna;yellowfin tuna|fish||85
Swordfish||fish||60
Marlin|blue marlin|fish||45
Sailfish||fish||35
Mahi-mahi|mahi mahi;dorado;dolphinfish|fish|a|25
Salmon|atlantic salmon|fish||70
Cod|atlantic cod|fish||60
Haddock||fish||30
Halibut||fish||30
Flounder||fish||35
Sole||fish||20
Plaice||fish||12
Turbot||fish||12
Mackerel||fish||40
Herring||fish||40
Sardine|pilchard|fish||45
Anchovy||fish||40
Sprat||fish||8
Mullet||fish||15
Sea bass|bass|fish||30
Tarpon||fish||12
Flying fish|flyingfish|fish||40
Ocean sunfish|sunfish;mola mola;mola|fish||40
Oarfish||fish|d|25
Opah|moonfish|fish||8
Remora|suckerfish|fish||20
Wahoo||fish||8
Pollock||fish||15
Hake||fish||12
Monkfish|goosefish|fish||20
John Dory||fish||10
Wolf eel||fish|a|8
Atlantic wolffish|wolffish;wolf fish|fish|pa|8
Eel|conger eel;conger|fish||50
Garden eel||fish||10
Needlefish||fish||6
Garibaldi||fish||6
Sheepshead||fish|a|5
Cobia||fish||4
Bluefish||fish||8
Rockfish||fish||8
Lumpfish||fish||5
Icefish|crocodile icefish|fish|p|6
Patagonian toothfish|toothfish;chilean sea bass|fish|p|8
Coelacanth||fish|d|35
Toadfish||fish|a|5
Lizardfish||fish|ra|5
Mudskipper||fish||15
Anglerfish|angler fish;angler;deep sea anglerfish|fish|d|75
Gulper eel|pelican eel|fish|da|25
Viperfish||fish|da|20
Fangtooth||fish|d|15
Hatchetfish||fish|d|10
Lanternfish||fish|d|15
Barreleye|barreleye fish|fish|d|15
Black swallower||fish|d|6
Dragonfish||fish|d|10
Bristlemouth||fish|d|5
Blobfish||fish|d|55
Snailfish|mariana snailfish|fish|da|10
Tripod fish|tripodfish|fish|d|6
Grenadier|rattail|fish|d|5
Hagfish||fish|d|20
Chimaera|ghost shark;ratfish|fish|d|12
Cusk eel||fish|d|4
Football fish|footballfish|fish|d|4
Stoplight loosejaw||fish|d|3
`;

/* Animals people try that do not live in the sea. */
window.DRILLION.notMarine = `goldfish;piranha;trout;carp;pike;catfish;koi;guppy;betta;tetra;axolotl;alligator;hippo;hippopotamus;frog;platypus;beaver;river otter;duck;swan;crayfish;electric eel;river dolphin;tilapia;perch;minnow;lion;elephant;dog;cat;horse;cow;flamingo;heron;kingfisher;newt;salamander;tortoise;snake;bear;fish;mermaid;kraken;sea monkey;sea monkeys;leech;water strider;arowana;oscar;angel;nessie;loch ness monster`;
