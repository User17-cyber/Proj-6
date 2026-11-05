/* DRILLION data: sovereign countries.
   name | aliases | continents | capitals | land neighbours | flags | population (millions) | fame (1-100)
   flags: L landlocked, I island nation, S Spanish official, F French official,
          P Portuguese official, A Arabic official, B ten largest by area, s ten smallest by area
   Neighbours include borders made by overseas territories (France-Brazil via French Guiana,
   Spain-UK via Gibraltar, Canada-Denmark on Hans Island, etc). */
window.DRILLION = window.DRILLION || {};
window.DRILLION.countriesRaw = `
Afghanistan||AS|Kabul|China;Iran;Pakistan;Tajikistan;Turkmenistan;Uzbekistan|L|42|70
Albania||EU|Tirana=Tirane|Greece;Kosovo;Montenegro;North Macedonia||2.8|45
Algeria||AF|Algiers=Alger|Libya;Mali;Mauritania;Morocco;Niger;Tunisia|AB|46|55
Andorra||EU|Andorra la Vella|France;Spain|L|0.08|40
Angola||AF|Luanda|DR Congo;Namibia;Republic of the Congo;Zambia|P|37|45
Antigua and Barbuda|Antigua|NA|Saint John's=St Johns|-|I|0.09|20
Argentina||SA|Buenos Aires|Bolivia;Brazil;Chile;Paraguay;Uruguay|SB|46|85
Armenia||AS,EU|Yerevan|Azerbaijan;Georgia;Iran;Turkey|L|3|40
Australia||OC|Canberra|-|IB|27|95
Austria||EU|Vienna=Wien|Czechia;Germany;Hungary;Italy;Liechtenstein;Slovakia;Slovenia;Switzerland|L|9|70
Azerbaijan||AS,EU|Baku|Armenia;Georgia;Iran;Russia;Turkey|L|10|35
Bahamas|The Bahamas|NA|Nassau|-|I|0.4|45
Bahrain||AS|Manama|-|IA|1.5|30
Bangladesh||AS|Dhaka=Dacca|India;Myanmar||173|50
Barbados||NA|Bridgetown|-|I|0.28|35
Belarus||EU|Minsk|Latvia;Lithuania;Poland;Russia;Ukraine|L|9.2|45
Belgium||EU|Brussels=Bruxelles|France;Germany;Luxembourg;Netherlands|F|11.8|70
Belize||NA|Belmopan|Guatemala;Mexico||0.41|30
Benin||AF|Porto-Novo;Cotonou|Burkina Faso;Niger;Nigeria;Togo|F|14|20
Bhutan||AS|Thimphu|China;India|L|0.78|35
Bolivia||SA|Sucre;La Paz|Argentina;Brazil;Chile;Paraguay;Peru|LS|12|55
Bosnia and Herzegovina|Bosnia;Bosnia-Herzegovina|EU|Sarajevo|Croatia;Montenegro;Serbia||3.2|40
Botswana||AF|Gaborone|Namibia;South Africa;Zambia;Zimbabwe|L|2.6|30
Brazil||SA|Brasilia=Brasília|Argentina;Bolivia;Colombia;France;Guyana;Paraguay;Peru;Suriname;Uruguay;Venezuela|PB|212|95
Brunei||AS|Bandar Seri Begawan|Malaysia|I|0.45|30
Bulgaria||EU|Sofia|Greece;North Macedonia;Romania;Serbia;Turkey||6.4|45
Burkina Faso|Burkina|AF|Ouagadougou|Benin;Ghana;Ivory Coast;Mali;Niger;Togo|LF|23|30
Burundi||AF|Gitega;Bujumbura|DR Congo;Rwanda;Tanzania|LF|13|20
Cambodia||AS|Phnom Penh|Laos;Thailand;Vietnam||17|45
Cameroon||AF|Yaounde=Yaoundé|Central African Republic;Chad;Equatorial Guinea;Gabon;Nigeria;Republic of the Congo|F|29|40
Canada||NA|Ottawa|Denmark;United States|FB|40|95
Cape Verde|Cabo Verde|AF|Praia|-|IP|0.6|25
Central African Republic|CAR|AF|Bangui|Cameroon;Chad;DR Congo;Republic of the Congo;South Sudan;Sudan|LF|5.5|25
Chad||AF|N'Djamena=Ndjamena|Cameroon;Central African Republic;Libya;Niger;Nigeria;Sudan|LFA|19|35
Chile||SA|Santiago|Argentina;Bolivia;Peru|S|19.5|75
China|PRC;People's Republic of China|AS|Beijing=Peking|Afghanistan;Bhutan;India;Kazakhstan;Kyrgyzstan;Laos;Mongolia;Myanmar;Nepal;North Korea;Pakistan;Russia;Tajikistan;Vietnam|B|1410|100
Colombia||SA|Bogota=Bogotá|Brazil;Ecuador;Panama;Peru;Venezuela|S|52|75
Comoros||AF|Moroni|-|IFA|0.85|15
Republic of the Congo|Congo;Congo-Brazzaville;Congo Brazzaville;Congo Republic|AF|Brazzaville|Angola;Cameroon;Central African Republic;DR Congo;Gabon|F|6|30
DR Congo|Democratic Republic of the Congo;Democratic Republic of Congo;DRC;Congo-Kinshasa;Congo Kinshasa;Zaire;Congo|AF|Kinshasa|Angola;Burundi;Central African Republic;Republic of the Congo;Rwanda;South Sudan;Tanzania;Uganda;Zambia|F|110|50
Costa Rica||NA|San Jose|Nicaragua;Panama|S|5.2|55
Croatia||EU|Zagreb|Bosnia and Herzegovina;Hungary;Montenegro;Serbia;Slovenia||3.9|55
Cuba||NA|Havana=La Habana|-|IS|11|75
Cyprus||EU,AS|Nicosia|United Kingdom|I|1.3|45
Czechia|Czech Republic;Czech|EU|Prague=Praha|Austria;Germany;Poland;Slovakia|L|10.9|55
Denmark||EU|Copenhagen|Canada;Germany||5.9|65
Djibouti||AF|Djibouti=Djibouti City|Eritrea;Ethiopia;Somalia|FA|1.1|25
Dominica||NA|Roseau|-|I|0.07|15
Dominican Republic|DR|NA|Santo Domingo|Haiti|IS|11|45
Ecuador||SA|Quito|Colombia;Peru|S|18|55
Egypt||AF,AS|Cairo|Israel;Libya;Palestine;Sudan|A|114|85
El Salvador|Salvador|NA|San Salvador|Guatemala;Honduras|S|6.3|40
Equatorial Guinea||AF|Malabo|Cameroon;Gabon|SFP|1.7|20
Eritrea||AF|Asmara|Djibouti;Ethiopia;Sudan|A|3.7|20
Estonia||EU|Tallinn|Latvia;Russia||1.37|40
Eswatini|Swaziland|AF|Mbabane;Lobamba|Mozambique;South Africa|L|1.2|20
Ethiopia||AF|Addis Ababa|Djibouti;Eritrea;Kenya;Somalia;South Sudan;Sudan|L|128|55
Fiji||OC|Suva|-|I|0.93|45
Finland||EU|Helsinki|Norway;Russia;Sweden||5.6|60
France||EU|Paris|Andorra;Belgium;Brazil;Germany;Italy;Luxembourg;Monaco;Netherlands;Spain;Suriname;Switzerland|F|68|100
Gabon||AF|Libreville|Cameroon;Equatorial Guinea;Republic of the Congo|F|2.4|25
Gambia|The Gambia|AF|Banjul|Senegal||2.7|25
Georgia||AS,EU|Tbilisi|Armenia;Azerbaijan;Russia;Turkey||3.7|45
Germany||EU|Berlin|Austria;Belgium;Czechia;Denmark;France;Luxembourg;Netherlands;Poland;Switzerland||84|100
Ghana||AF|Accra|Burkina Faso;Ivory Coast;Togo||34|50
Greece||EU|Athens|Albania;Bulgaria;North Macedonia;Turkey||10.4|80
Grenada||NA|Saint George's=St Georges|-|I|0.13|20
Guatemala||NA|Guatemala City|Belize;El Salvador;Honduras;Mexico|S|18|45
Guinea||AF|Conakry|Guinea-Bissau;Ivory Coast;Liberia;Mali;Senegal;Sierra Leone|F|14|25
Guinea-Bissau|Guinea Bissau|AF|Bissau|Guinea;Senegal|P|2.1|15
Guyana||SA|Georgetown|Brazil;Suriname;Venezuela||0.8|30
Haiti||NA|Port-au-Prince|Dominican Republic|IF|11.7|45
Honduras||NA|Tegucigalpa|El Salvador;Guatemala;Nicaragua|S|10.6|40
Hungary||EU|Budapest|Austria;Croatia;Romania;Serbia;Slovakia;Slovenia;Ukraine|L|9.6|55
Iceland||EU|Reykjavik=Reykjavík|-|I|0.39|60
India||AS|New Delhi=Delhi|Bangladesh;Bhutan;China;Myanmar;Nepal;Pakistan|B|1440|95
Indonesia||AS,OC|Jakarta|Malaysia;Papua New Guinea;Timor-Leste|I|280|65
Iran|Persia|AS|Tehran=Teheran|Afghanistan;Armenia;Azerbaijan;Iraq;Pakistan;Turkey;Turkmenistan||90|70
Iraq||AS|Baghdad|Iran;Jordan;Kuwait;Saudi Arabia;Syria;Turkey|A|46|65
Ireland|Eire;Republic of Ireland|EU|Dublin|United Kingdom|I|5.2|70
Israel||AS|Jerusalem|Egypt;Jordan;Lebanon;Palestine;Syria||9.9|70
Italy||EU|Rome=Roma|Austria;France;San Marino;Slovenia;Switzerland;Vatican City||59|95
Ivory Coast|Cote d'Ivoire;Cote dIvoire|AF|Yamoussoukro;Abidjan|Burkina Faso;Ghana;Guinea;Liberia;Mali|F|31|30
Jamaica||NA|Kingston|-|I|2.8|60
Japan||AS|Tokyo|-|I|124|95
Jordan||AS|Amman|Iraq;Israel;Palestine;Saudi Arabia;Syria|A|11.5|50
Kazakhstan||AS,EU|Astana=Nur-Sultan|China;Kyrgyzstan;Russia;Turkmenistan;Uzbekistan|LB|20|45
Kenya||AF|Nairobi|Ethiopia;Somalia;South Sudan;Tanzania;Uganda||55|60
Kiribati||OC|Tarawa=South Tarawa|-|I|0.13|20
Kosovo||EU|Pristina=Prishtina|Albania;Montenegro;North Macedonia;Serbia|L|1.6|35
Kuwait||AS|Kuwait City|Iraq;Saudi Arabia|A|4.3|45
Kyrgyzstan|Kirghizia;Kyrgyz Republic|AS|Bishkek|China;Kazakhstan;Tajikistan;Uzbekistan|L|7|30
Laos|Lao PDR|AS|Vientiane|Cambodia;China;Myanmar;Thailand;Vietnam|L|7.6|35
Latvia||EU|Riga|Belarus;Estonia;Lithuania;Russia||1.9|40
Lebanon||AS|Beirut|Israel;Syria|A|5.4|50
Lesotho||AF|Maseru|South Africa|L|2.3|20
Liberia||AF|Monrovia|Guinea;Ivory Coast;Sierra Leone||5.4|30
Libya||AF|Tripoli|Algeria;Chad;Egypt;Niger;Sudan;Tunisia|A|7|50
Liechtenstein||EU|Vaduz|Austria;Switzerland|Ls|0.04|40
Lithuania||EU|Vilnius|Belarus;Latvia;Poland;Russia||2.9|40
Luxembourg||EU|Luxembourg=Luxembourg City|Belgium;France;Germany|LF|0.67|50
Madagascar||AF|Antananarivo|-|IF|30|60
Malawi||AF|Lilongwe|Mozambique;Tanzania;Zambia|L|21|30
Malaysia||AS|Kuala Lumpur;Putrajaya|Brunei;Indonesia;Thailand||34|50
Maldives||AS|Male|-|Is|0.52|45
Mali||AF|Bamako|Algeria;Burkina Faso;Guinea;Ivory Coast;Mauritania;Niger;Senegal|LF|23|40
Malta||EU|Valletta|-|Is|0.54|45
Marshall Islands||OC|Majuro|-|Is|0.04|15
Mauritania||AF|Nouakchott|Algeria;Mali;Senegal|A|4.9|25
Mauritius||AF|Port Louis|-|I|1.26|35
Mexico||NA|Mexico City|Belize;Guatemala;United States|S|130|90
Micronesia|Federated States of Micronesia|OC|Palikir|-|I|0.11|15
Moldova||EU|Chisinau=Chișinău|Romania;Ukraine|L|2.5|30
Monaco||EU|Monaco|France|Fs|0.04|55
Mongolia||AS|Ulaanbaatar=Ulan Bator|China;Russia|L|3.5|45
Montenegro||EU|Podgorica|Albania;Bosnia and Herzegovina;Croatia;Kosovo;Serbia||0.62|35
Morocco||AF|Rabat|Algeria;Spain|A|37|60
Mozambique||AF|Maputo|Eswatini;Malawi;South Africa;Tanzania;Zambia;Zimbabwe|P|34|35
Myanmar|Burma|AS|Naypyidaw=Nay Pyi Taw=Naypyitaw|Bangladesh;China;India;Laos;Thailand||54|40
Namibia||AF|Windhoek|Angola;Botswana;South Africa;Zambia||2.6|35
Nauru||OC|Yaren|-|Is|0.013|15
Nepal||AS|Kathmandu|China;India|L|30|50
Netherlands|Holland;The Netherlands|EU|Amsterdam;The Hague|Belgium;France;Germany||17.9|75
New Zealand|Aotearoa|OC|Wellington|-|I|5.2|80
Nicaragua||NA|Managua|Costa Rica;Honduras|S|7|40
Niger||AF|Niamey|Algeria;Benin;Burkina Faso;Chad;Libya;Mali;Nigeria|LF|27|35
Nigeria||AF|Abuja|Benin;Cameroon;Chad;Niger||225|60
North Korea|DPRK;Korea|AS|Pyongyang|China;Russia;South Korea||26|65
North Macedonia|Macedonia|EU|Skopje|Albania;Bulgaria;Greece;Kosovo;Serbia|L|1.8|30
Norway||EU|Oslo|Finland;Russia;Sweden||5.5|65
Oman||AS|Muscat|Saudi Arabia;United Arab Emirates;Yemen|A|5|35
Pakistan||AS|Islamabad|Afghanistan;China;India;Iran||240|60
Palau||OC|Ngerulmud|-|I|0.018|15
Palestine|State of Palestine|AS|Ramallah;East Jerusalem|Egypt;Israel;Jordan|A|5.4|45
Panama||NA|Panama City|Colombia;Costa Rica|S|4.5|55
Papua New Guinea|PNG|OC|Port Moresby|Indonesia|I|10|35
Paraguay||SA|Asuncion=Asunción|Argentina;Bolivia;Brazil|LS|6.9|40
Peru||SA|Lima|Bolivia;Brazil;Chile;Colombia;Ecuador|S|34|65
Philippines|The Philippines|AS|Manila|-|I|115|60
Poland||EU|Warsaw=Warszawa|Belarus;Czechia;Germany;Lithuania;Russia;Slovakia;Ukraine||37.6|75
Portugal||EU|Lisbon=Lisboa|Spain|P|10.4|75
Qatar||AS|Doha|Saudi Arabia|A|2.7|50
Romania||EU|Bucharest|Bulgaria;Hungary;Moldova;Serbia;Ukraine||19|55
Russia|Russian Federation|EU,AS|Moscow|Azerbaijan;Belarus;China;Estonia;Finland;Georgia;Kazakhstan;Latvia;Lithuania;Mongolia;North Korea;Norway;Poland;Ukraine|B|144|100
Rwanda||AF|Kigali|Burundi;DR Congo;Tanzania;Uganda|LF|14|35
Saint Kitts and Nevis|St Kitts and Nevis;St Kitts;Saint Kitts|NA|Basseterre|-|Is|0.047|12
Saint Lucia|St Lucia|NA|Castries|-|I|0.18|20
Saint Vincent and the Grenadines|St Vincent and the Grenadines;St Vincent;Saint Vincent|NA|Kingstown|-|I|0.1|12
Samoa||OC|Apia|-|I|0.22|25
San Marino||EU|San Marino|Italy|Ls|0.034|40
Sao Tome and Principe|Sao Tome|AF|Sao Tome|-|IP|0.23|10
Saudi Arabia||AS|Riyadh|Iraq;Jordan;Kuwait;Oman;Qatar;United Arab Emirates;Yemen|A|36|70
Senegal||AF|Dakar|Gambia;Guinea;Guinea-Bissau;Mali;Mauritania|F|18|40
Serbia||EU|Belgrade=Beograd|Bosnia and Herzegovina;Bulgaria;Croatia;Hungary;Kosovo;Montenegro;North Macedonia;Romania|L|6.6|45
Seychelles||AF|Victoria|-|IF|0.12|25
Sierra Leone||AF|Freetown|Guinea;Liberia||8.6|30
Singapore||AS|Singapore|-|I|6|65
Slovakia||EU|Bratislava|Austria;Czechia;Hungary;Poland;Ukraine|L|5.4|40
Slovenia||EU|Ljubljana|Austria;Croatia;Hungary;Italy||2.1|40
Solomon Islands||OC|Honiara|-|I|0.74|15
Somalia||AF|Mogadishu|Djibouti;Ethiopia;Kenya|A|18|45
South Africa||AF|Pretoria;Cape Town;Bloemfontein|Botswana;Eswatini;Lesotho;Mozambique;Namibia;Zimbabwe||63|75
South Korea|Korea;Republic of Korea;ROK|AS|Seoul|North Korea||51.7|75
South Sudan||AF|Juba|Central African Republic;DR Congo;Ethiopia;Kenya;Sudan;Uganda|L|11|25
Spain||EU|Madrid|Andorra;France;Morocco;Portugal;United Kingdom|S|48.6|90
Sri Lanka|Ceylon|AS|Sri Jayawardenepura Kotte=Kotte;Colombo|-|I|22|50
Sudan||AF|Khartoum|Central African Republic;Chad;Egypt;Eritrea;Ethiopia;Libya;South Sudan|A|50|45
Suriname|Surinam|SA|Paramaribo|Brazil;France;Guyana||0.62|25
Sweden||EU|Stockholm|Finland;Norway||10.5|75
Switzerland||EU|Bern=Berne|Austria;France;Germany;Italy;Liechtenstein|LF|8.9|80
Syria||AS|Damascus|Iraq;Israel;Jordan;Lebanon;Turkey|A|23|55
Taiwan|Republic of China;ROC|AS|Taipei|-|I|23.4|55
Tajikistan||AS|Dushanbe|Afghanistan;China;Kyrgyzstan;Uzbekistan|L|10|30
Tanzania||AF|Dodoma;Dar es Salaam|Burundi;DR Congo;Kenya;Malawi;Mozambique;Rwanda;Uganda;Zambia||67|45
Thailand|Siam|AS|Bangkok|Cambodia;Laos;Malaysia;Myanmar||72|70
Timor-Leste|East Timor;Timor Leste|AS|Dili|Indonesia|IP|1.4|20
Togo||AF|Lome|Benin;Burkina Faso;Ghana|F|9|25
Tonga||OC|Nuku'alofa=Nukualofa|-|I|0.1|20
Trinidad and Tobago|Trinidad|NA|Port of Spain|-|I|1.5|35
Tunisia||AF|Tunis|Algeria;Libya|A|12.4|45
Turkey|Turkiye|AS,EU|Ankara|Armenia;Azerbaijan;Bulgaria;Georgia;Greece;Iran;Iraq;Syria||86|80
Turkmenistan||AS|Ashgabat=Ashkhabad|Afghanistan;Iran;Kazakhstan;Uzbekistan|L|7|25
Tuvalu||OC|Funafuti|-|Is|0.011|15
Uganda||AF|Kampala|DR Congo;Kenya;Rwanda;South Sudan;Tanzania|L|49|40
Ukraine||EU|Kyiv=Kiev|Belarus;Hungary;Moldova;Poland;Romania;Russia;Slovakia||37|75
United Arab Emirates|UAE;Emirates;The Emirates|AS|Abu Dhabi|Oman;Saudi Arabia|A|10|60
United Kingdom|UK;Britain;Great Britain;The United Kingdom|EU|London|Cyprus;Ireland;Spain|I|69|95
United States|USA;US;United States of America;America;The United States;The US;The USA|NA|Washington=Washington DC=Washington D.C.|Canada;Mexico|B|340|100
Uruguay||SA|Montevideo|Argentina;Brazil|S|3.4|50
Uzbekistan||AS|Tashkent|Afghanistan;Kazakhstan;Kyrgyzstan;Tajikistan;Turkmenistan|L|36|35
Vanuatu||OC|Port Vila|-|IF|0.33|20
Vatican City|Vatican;Holy See;The Vatican|EU|Vatican City|Italy|Ls|0.0008|55
Venezuela||SA|Caracas|Brazil;Colombia;Guyana|S|28|65
Vietnam|Viet Nam|AS|Hanoi=Ha Noi|Cambodia;China;Laos||100|70
Yemen||AS|Sanaa=Sana'a|Oman;Saudi Arabia|A|34|45
Zambia||AF|Lusaka|Angola;Botswana;DR Congo;Malawi;Mozambique;Namibia;Tanzania;Zimbabwe|L|21|35
Zimbabwe||AF|Harare|Botswana;Mozambique;South Africa;Zambia|L|16.6|45
`;

/* Famous places that are NOT sovereign countries (players often try these). */
window.DRILLION.notCountries = `England;Scotland;Wales;Northern Ireland;Greenland;Puerto Rico;Hong Kong;Macau;Macao;Tibet;Catalonia;Antarctica;Gibraltar;Guam;Bermuda;Faroe Islands;French Guiana;Western Sahara;Somaliland;Transnistria;Abkhazia;Northern Cyprus;Kurdistan;Hawaii;Alaska;Siberia;Europe;Africa;Asia;Tahiti;Aruba;Curacao;New Caledonia;Cayman Islands;Bali;Sicily;Sardinia;Corsica;Crete;Zanzibar;Texas;California;Quebec;Yugoslavia;Soviet Union;USSR;Czechoslovakia;Prussia;Rhodesia;Ottoman Empire;Atlantis`;

/* Famous cities that are NOT national capitals, with the country players tend to pair them with. */
window.DRILLION.notCapitals = `New York|United States;Los Angeles|United States;Chicago|United States;San Francisco|United States;Miami|United States;Sydney|Australia;Melbourne|Australia;Toronto|Canada;Vancouver|Canada;Montreal|Canada;Istanbul|Turkey;Rio de Janeiro|Brazil;Sao Paulo|Brazil;Mumbai|India;Bombay|India;Kolkata|India;Calcutta|India;Shanghai|China;Hong Kong|China;Dubai|United Arab Emirates;Zurich|Switzerland;Geneva|Switzerland;Barcelona|Spain;Milan|Italy;Venice|Italy;Naples|Italy;Munich|Germany;Hamburg|Germany;Frankfurt|Germany;Saint Petersburg|Russia;St Petersburg|Russia;Auckland|New Zealand;Johannesburg|South Africa;Durban|South Africa;Lagos|Nigeria;Karachi|Pakistan;Almaty|Kazakhstan;Tel Aviv|Israel;Casablanca|Morocco;Marrakesh|Morocco;Marrakech|Morocco;Ho Chi Minh City|Vietnam;Saigon|Vietnam;Osaka|Japan;Kyoto|Japan;Edinburgh|United Kingdom;Cardiff|United Kingdom;Belfast|United Kingdom;Manchester|United Kingdom;Glasgow|United Kingdom;Lyon|France;Marseille|France;Nice|France;Porto|Portugal;Krakow|Poland;Alexandria|Egypt;Jeddah|Saudi Arabia;Mecca|Saudi Arabia;Guangzhou|China;Shenzhen|China;Busan|South Korea;Rotterdam|Netherlands;Antwerp|Belgium;Gothenburg|Sweden;Bergen|Norway;Salzburg|Austria;Thessaloniki|Greece;Kraków|Poland;Medellin|Colombia;Guadalajara|Mexico;Cancun|Mexico;Cusco|Peru;Valparaiso|Chile;Cordoba|Argentina;Mombasa|Kenya;Zanzibar|Tanzania;Bali|Indonesia;Phuket|Thailand;Chiang Mai|Thailand;Lahore|Pakistan;Kandahar|Afghanistan;Basra|Iraq;Aleppo|Syria;Odessa|Ukraine;Odesa|Ukraine;Lviv|Ukraine;Calgary|Canada;Quebec City|Canada;Perth|Australia;Brisbane|Australia;Christchurch|New Zealand`;
