/* DRILLION data: space.
   name | aliases | type | tags | fame
   type: planet dwarf moon constellation star astronaut
   moon tags (parent): E Earth, M Mars, J Jupiter, S Saturn, U Uranus, N Neptune, P Pluto, D other dwarf planet
   constellation tags: z zodiac (on the ecliptic), a creature (real or mythical), o object, h person or mythic figure
   astronaut tags: w walked on the Moon, c Soviet or Russian cosmonaut, f woman */
window.DRILLION = window.DRILLION || {};
window.DRILLION.spaceRaw = `
Mercury||planet||95
Venus||planet||95
Earth||planet||100
Mars||planet||100
Jupiter||planet||100
Saturn||planet||95
Uranus||planet||85
Neptune||planet||85
Pluto||dwarf||95
Ceres||dwarf||35
Eris||dwarf||30
Haumea||dwarf||15
Makemake||dwarf||15
Sedna||dwarf||12
Quaoar||dwarf||8
Gonggong||dwarf||4
Orcus||dwarf||6
Moon|the moon;luna;earth's moon|moon|E|100
Phobos||moon|M|50
Deimos||moon|M|40
Io||moon|J|60
Europa||moon|J|65
Ganymede||moon|J|55
Callisto||moon|J|45
Amalthea||moon|J|10
Himalia||moon|J|5
Thebe||moon|J|4
Metis||moon|J|4
Adrastea||moon|J|3
Elara||moon|J|3
Pasiphae||moon|J|3
Carme||moon|J|3
Sinope||moon|J|3
Lysithea||moon|J|2
Ananke||moon|J|2
Leda||moon|J|3
Callirrhoe||moon|J|2
Themisto||moon|J|2
Titan||moon|S|75
Enceladus||moon|S|45
Mimas||moon|S|30
Tethys||moon|S|20
Dione||moon|S|20
Rhea||moon|S|20
Iapetus||moon|S|20
Hyperion||moon|S|12
Phoebe||moon|S|12
Janus||moon|S|8
Epimetheus||moon|S|6
Pan||moon|S|8
Atlas||moon|S|8
Prometheus||moon|S|8
Pandora||moon|S|8
Daphnis||moon|S|3
Helene||moon|S|3
Telesto||moon|S|3
Calypso||moon|S|4
Methone||moon|S|2
Pallene||moon|S|2
Ymir||moon|S|2
Paaliaq||moon|S|2
Tarvos||moon|S|2
Ijiraq||moon|S|2
Kiviuq||moon|S|2
Siarnaq||moon|S|2
Albiorix||moon|S|2
Skathi||moon|S|2
Mundilfari||moon|S|2
Suttungr||moon|S|2
Thrymr||moon|S|2
Erriapus||moon|S|2
Narvi||moon|S|2
Miranda||moon|U|25
Ariel||moon|U|20
Umbriel||moon|U|12
Titania||moon|U|20
Oberon||moon|U|20
Puck||moon|U|10
Cordelia||moon|U|5
Ophelia||moon|U|5
Bianca||moon|U|4
Cressida||moon|U|4
Desdemona||moon|U|4
Juliet||moon|U|5
Portia||moon|U|4
Rosalind||moon|U|4
Belinda||moon|U|4
Perdita||moon|U|3
Mab||moon|U|3
Cupid||moon|U|3
Caliban||moon|U|4
Sycorax||moon|U|4
Prospero||moon|U|3
Setebos||moon|U|2
Stephano||moon|U|2
Trinculo||moon|U|2
Francisco||moon|U|2
Margaret||moon|U|2
Ferdinand||moon|U|2
Triton||moon|N|40
Nereid||moon|N|10
Proteus||moon|N|8
Larissa||moon|N|4
Galatea||moon|N|4
Despina||moon|N|4
Thalassa||moon|N|4
Naiad||moon|N|4
Halimede||moon|N|2
Sao||moon|N|2
Laomedeia||moon|N|2
Psamathe||moon|N|2
Neso||moon|N|2
Hippocamp||moon|N|3
Charon||moon|P|45
Nix||moon|P|8
Hydra||moon|P|8
Kerberos||moon|P|6
Styx||moon|P|6
Dysnomia||moon|D|6
Hiiaka||moon|D|3
Namaka||moon|D|3
Vanth||moon|D|2
Weywot||moon|D|2
Andromeda||constellation|h|60
Antlia|air pump|constellation|o|3
Apus|bird of paradise|constellation|a|3
Aquarius|water bearer|constellation|zh|70
Aquila|the eagle|constellation|a|20
Ara|the altar|constellation|o|3
Aries|the ram|constellation|za|70
Auriga|the charioteer|constellation|h|10
Bootes|the herdsman|constellation|h|10
Caelum|the chisel|constellation|o|2
Camelopardalis|the giraffe|constellation|a|4
Cancer|the crab|constellation|za|70
Canes Venatici|the hunting dogs|constellation|a|4
Canis Major|great dog;the great dog|constellation|a|35
Canis Minor|little dog;lesser dog|constellation|a|15
Capricornus|capricorn;the sea goat|constellation|za|65
Carina|the keel|constellation|o|6
Cassiopeia||constellation|h|45
Centaurus|the centaur|constellation|a|15
Cepheus||constellation|h|10
Cetus|the whale;the sea monster|constellation|a|8
Chamaeleon|chameleon|constellation|a|4
Circinus|the compasses|constellation|o|2
Columba|the dove|constellation|a|4
Coma Berenices|berenice's hair|constellation|h|5
Corona Australis|southern crown|constellation|o|4
Corona Borealis|northern crown|constellation|o|8
Corvus|the crow|constellation|a|5
Crater|the cup|constellation|o|4
Crux|southern cross;the southern cross|constellation|o|25
Cygnus|the swan|constellation|a|25
Delphinus|the dolphin|constellation|a|8
Dorado|the swordfish|constellation|a|4
Draco|the dragon|constellation|a|25
Equuleus|the little horse|constellation|a|3
Eridanus|the river|constellation||4
Fornax|the furnace|constellation|o|3
Gemini|the twins|constellation|zh|70
Grus|the crane|constellation|a|3
Hercules||constellation|h|30
Horologium|the clock|constellation|o|3
Hydra|the water snake|constellation|a|15
Hydrus|the male water snake|constellation|a|3
Indus|the indian|constellation|h|2
Lacerta|the lizard|constellation|a|3
Leo|the lion|constellation|za|75
Leo Minor|the little lion|constellation|a|4
Lepus|the hare|constellation|a|4
Libra|the scales|constellation|zo|65
Lupus|the wolf|constellation|a|5
Lynx||constellation|a|5
Lyra|the lyre|constellation|o|12
Mensa|table mountain|constellation||2
Microscopium|the microscope|constellation|o|2
Monoceros|the unicorn|constellation|a|4
Musca|the fly|constellation|a|3
Norma|the carpenter's square|constellation|o|2
Octans|the octant|constellation|o|3
Ophiuchus|the serpent bearer|constellation|zh|25
Orion|the hunter|constellation|h|75
Pavo|the peacock|constellation|a|3
Pegasus|the winged horse|constellation|a|35
Perseus||constellation|h|25
Phoenix||constellation|a|10
Pictor|the easel|constellation|o|2
Pisces|the fishes|constellation|za|65
Piscis Austrinus|the southern fish|constellation|a|3
Puppis|the stern|constellation|o|3
Pyxis|the mariner's compass|constellation|o|2
Reticulum|the net|constellation|o|2
Sagitta|the arrow|constellation|o|4
Sagittarius|the archer|constellation|zh|65
Scorpius|scorpio;the scorpion|constellation|za|60
Sculptor||constellation|o|2
Scutum|the shield|constellation|o|3
Serpens|the serpent|constellation|a|5
Sextans|the sextant|constellation|o|2
Taurus|the bull|constellation|za|70
Telescopium|the telescope|constellation|o|2
Triangulum|the triangle|constellation|o|5
Triangulum Australe|southern triangle|constellation|o|3
Tucana|the toucan|constellation|a|3
Ursa Major|great bear;the great bear;big dipper;the big dipper|constellation|a|60
Ursa Minor|little bear;the little bear;little dipper;the little dipper|constellation|a|35
Vela|the sails|constellation|o|4
Virgo|the maiden;the virgin|constellation|zh|65
Volans|the flying fish|constellation|a|3
Vulpecula|the little fox|constellation|a|3
Sirius|dog star;the dog star|star||60
Polaris|north star;the north star;pole star|star||55
Betelgeuse||star||55
Rigel||star||35
Vega||star||35
Antares||star||25
Aldebaran||star||25
Arcturus||star||25
Capella||star||15
Deneb||star||20
Altair||star||20
Spica||star||15
Procyon||star||12
Canopus||star||15
Alpha Centauri|rigil kentaurus|star||45
Proxima Centauri|proxima|star||45
Pollux||star||15
Castor||star||15
Regulus||star||15
Fomalhaut||star||10
Bellatrix||star||15
Mira||star||8
Algol|demon star|star||8
Achernar||star||6
Mintaka||star||6
Alnilam||star||5
Alnitak||star||6
Barnard's Star|barnards star|star||10
Eta Carinae||star||8
VY Canis Majoris||star||8
UY Scuti||star||10
Thuban||star||4
Alcyone||star||4
Neil Armstrong|armstrong|astronaut|w|100
Buzz Aldrin|aldrin;edwin aldrin|astronaut|w|90
Pete Conrad|charles conrad|astronaut|w|15
Alan Bean||astronaut|w|12
Alan Shepard|shepard|astronaut|w|35
Edgar Mitchell||astronaut|w|12
David Scott|dave scott|astronaut|w|10
James Irwin|jim irwin|astronaut|w|8
John Young||astronaut|w|12
Charles Duke|charlie duke|astronaut|w|10
Eugene Cernan|gene cernan;cernan|astronaut|w|15
Harrison Schmitt|jack schmitt;schmitt|astronaut|w|10
Yuri Gagarin|gagarin|astronaut|c|85
Valentina Tereshkova|tereshkova|astronaut|cf|35
Alexei Leonov|leonov|astronaut|c|20
Gherman Titov|titov|astronaut|c|5
Valeri Polyakov|polyakov|astronaut|c|5
Sergei Krikalev|krikalev|astronaut|c|5
Svetlana Savitskaya|savitskaya|astronaut|cf|4
Sally Ride||astronaut|f|55
Michael Collins||astronaut||40
John Glenn|glenn|astronaut||45
Chris Hadfield|hadfield|astronaut||35
Mae Jemison|jemison|astronaut|f|25
Scott Kelly||astronaut||25
Mark Kelly||astronaut||15
Peggy Whitson|whitson|astronaut|f|12
Jim Lovell|james lovell;lovell|astronaut||35
Gus Grissom|virgil grissom;grissom|astronaut||20
Ed White|edward white|astronaut||12
Christa McAuliffe|mcauliffe|astronaut|f|20
Kalpana Chawla|chawla|astronaut|f|15
Eileen Collins||astronaut|f|10
Sunita Williams|suni williams|astronaut|f|20
Butch Wilmore|barry wilmore|astronaut||10
Tim Peake|peake|astronaut||15
Samantha Cristoforetti|cristoforetti|astronaut|f|8
Thomas Pesquet|pesquet|astronaut||8
Yang Liwei||astronaut||8
Frank Borman|borman|astronaut||8
Bill Anders|william anders|astronaut||8
Gordon Cooper||astronaut||10
Scott Carpenter||astronaut||8
Wally Schirra|schirra|astronaut||8
Deke Slayton|slayton|astronaut||6
Jack Swigert|swigert|astronaut||8
Fred Haise|haise|astronaut||8
Ken Mattingly|mattingly|astronaut||6
Christina Koch||astronaut|f|10
Jessica Meir||astronaut|f|5
Victor Glover||astronaut||8
Reid Wiseman||astronaut||6
Jeremy Hansen||astronaut||5
Bob Behnken|behnken|astronaut||5
Doug Hurley||astronaut||5
Judith Resnik|resnik|astronaut|f|8
Ronald McNair|mcnair|astronaut||6
Ellison Onizuka|onizuka|astronaut||5
Rakesh Sharma||astronaut||5
Ilan Ramon||astronaut||5
Liu Yang||astronaut|f|4
Wang Yaping||astronaut|f|4
Jared Isaacman|isaacman|astronaut||8
Sun|the sun;sol|sun||100
`;
