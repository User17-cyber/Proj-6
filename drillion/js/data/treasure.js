/* DRILLION data: sunken treasure (gemstones and money).
   Gems: name | aliases | usual colours | tags | fame
     colours: R red, B blue, G green, P purple, Y yellow/orange, W white/clear, K black, N pink
     tags: m birthstone, o made by a living thing
   Coins: name | aliases | tags | fame      tags: h historic (no longer in use) */
window.DRILLION = window.DRILLION || {};
window.DRILLION.gemsRaw = `
Diamond||W|m|100
Ruby||R|m|95
Sapphire||B|m|90
Emerald||G|m|90
Pearl||W|mo|85
Opal||W|m|70
Amethyst||P|m|70
Topaz||YB|m|65
Jade|jadeite;nephrite|G||70
Garnet||R|m|60
Turquoise||BG|m|65
Quartz|rock crystal;clear quartz|W||55
Rose quartz||N||35
Smoky quartz||K||12
Aquamarine||B|m|55
Onyx||K||50
Amber||Y|o|60
Peridot||G|m|40
Citrine||Y|m|40
Tanzanite||BP|m|35
Tourmaline||GNRB|m|35
Moonstone||W|m|40
Lapis lazuli|lapis|B||40
Obsidian||K||45
Agate||||40
Jasper||R||30
Malachite||G||30
Zircon||BW|m|30
Alexandrite||GP|m|25
Spinel||RN|m|20
Beryl||G||20
Morganite||N||20
Kunzite||NP||8
Iolite||BP||8
Chrysoberyl||Y||8
Larimar||B||8
Labradorite||B||20
Carnelian||RY||15
Bloodstone|heliotrope|GR|m|15
Sunstone||Y||12
Rhodochrosite||N||6
Sodalite||B||8
Fluorite||PG||12
Hematite||K||15
Pyrite|fool's gold;fools gold|Y||25
Coral|red coral|RN|o|35
Jet||K|o|15
Ivory||W|o|25
Mother of pearl|nacre|W|o|25
Ammolite|||o|6
Tiger's eye|tigers eye;tiger eye|Y||25
Cat's eye|cats eye|Y||10
Aventurine||G||10
Chrysoprase||G||8
Moldavite||G||10
Tsavorite||G||5
Demantoid|demantoid garnet|G||4
Rubellite||RN||5
Sardonyx||R|m|8
Chalcedony||BW||8
Amazonite||GB||8
Azurite||B||6
Benitoite||B||3
Painite||R||8
Taaffeite||P||3
Grandidierite||B||2
Red beryl|bixbite|R||4
Kyanite||B||5
Apatite||B||4
Andalusite||G||3
Rhodolite||RP||4
Prehnite||G||4
Howlite||W||5
Charoite||P||3
Ametrine||PY||5
Star sapphire||B||8
`;

window.DRILLION.coinsRaw = `
Dollar|us dollar;american dollar|  |100
Euro||  |90
Pound|pound sterling;british pound;sterling|  |85
Yen|japanese yen|  |75
Yuan|renminbi;chinese yuan|  |60
Rupee|indian rupee|  |60
Peso||  |65
Franc|swiss franc|  |55
Ruble|rouble|  |50
Real|brazilian real|  |30
Rand||  |30
Won||  |30
Lira|turkish lira|  |35
Krona|swedish krona|  |30
Krone|danish krone;norwegian krone|  |25
Dinar||  |30
Dirham||  |25
Riyal|rial|  |25
Shekel||  |25
Baht||  |25
Ringgit||  |12
Rupiah||  |12
Dong||  |15
Zloty||  |15
Forint||  |12
Koruna|czech koruna|  |8
Leu||  |8
Lev||  |6
Hryvnia||  |6
Tenge||  |6
Lari||  |4
Naira||  |10
Cedi||  |6
Shilling||  |20
Birr||  |5
Kwacha||  |5
Kwanza||  |4
Metical||  |3
Pula||  |3
Ariary||  |2
Dalasi||  |2
Quetzal||  |6
Lempira||  |3
Colon|colón|  |5
Cordoba|córdoba|  |3
Balboa||  |4
Bolivar|bolívar|  |6
Sol|peruvian sol|  |5
Boliviano||  |4
Guarani|guaraní|  |3
Gourde||  |3
Vatu||  |2
Kina||  |2
Tala||  |2
Paanga|pa'anga|  |1
Rufiyaa||  |2
Ngultrum||  |1
Tugrik|togrog|  |2
Kyat||  |2
Kip||  |2
Taka||  |3
Afghani||  |3
Som||  |2
Somoni||  |1
Manat||  |2
Dram||  |2
Denar||  |2
Lek||  |3
Doubloon||h|30
Piece of eight|pieces of eight|h|25
Ducat||h|15
Florin||h|15
Guilder||h|12
Drachma||h|20
Deutsche Mark|mark;deutschmark;german mark|h|20
Peseta||h|15
Escudo||h|8
Sovereign||h|10
Groat||h|5
Denarius||h|12
Sestertius||h|5
Talent||h|5
Thaler|taler|h|6
Farthing||h|8
Guinea||h|10
Crown||h|10
Sou||h|4
Kuna||h|4
Markka||h|3
Schilling||h|4
Punt|irish pound|h|3
Cowrie shell|cowrie|h|6
Wampum||h|5
`;
