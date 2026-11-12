package blocklist

// Source describes a blocklist the user can switch on.
type Source struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"` // ads, privacy, security, content
	URL         string `json:"url"`      // empty for the built-in list
	Homepage    string `json:"homepage,omitempty"`
	Default     bool   `json:"default"`
	Large       bool   `json:"large,omitempty"`
	Custom      bool   `json:"custom,omitempty"`
}

// Catalog is the set of well-known lists offered in the app. Lists are
// downloaded on first use and refreshed daily; none are bundled except the
// small built-in essentials list below.
var Catalog = []Source{
	{
		ID: "essentials", Name: "Meridian essentials", Category: "ads", Default: true,
		Description: "Built-in list of the biggest ad networks and trackers. Works offline from the first launch.",
	},
	{
		ID: "stevenblack", Name: "StevenBlack Unified", Category: "ads", Default: true,
		Description: "Ads, trackers and malware hosts from a dozen curated sources. Low false-positive rate.",
		URL:         "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
		Homepage:    "https://github.com/StevenBlack/hosts",
	},
	{
		ID: "hagezi-light", Name: "HaGeZi Light", Category: "ads",
		Description: "Ads, tracking, metrics and telemetry. A gentle list that rarely breaks sites.",
		URL:         "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt",
		Homepage:    "https://github.com/hagezi/dns-blocklists",
	},
	{
		ID: "hagezi-pro", Name: "HaGeZi Pro", Category: "ads",
		Description: "Aggressive ad, tracker and telemetry blocking. Blocks more, may need the odd allow rule.",
		URL:         "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt",
		Homepage:    "https://github.com/hagezi/dns-blocklists",
	},
	{
		ID: "oisd-big", Name: "OISD Big", Category: "ads",
		Description: "Widely used all-in-one list tuned to avoid breaking sites.",
		URL:         "https://big.oisd.nl",
		Homepage:    "https://oisd.nl",
	},
	{
		ID: "hagezi-tif", Name: "Threat intelligence", Category: "security", Large: true,
		Description: "Malware, phishing, scam and crypto-jacking domains from HaGeZi's threat feeds. Very large (over a million domains).",
		URL:         "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.txt",
		Homepage:    "https://github.com/hagezi/dns-blocklists",
	},
	{
		ID: "apple-telemetry", Name: "Apple telemetry", Category: "privacy",
		Description: "Native tracking and telemetry from Apple devices.",
		URL:         "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/native.apple.txt",
		Homepage:    "https://github.com/hagezi/dns-blocklists",
	},
	{
		ID: "windows-telemetry", Name: "Windows telemetry", Category: "privacy",
		Description: "Native tracking and telemetry from Windows and Office.",
		URL:         "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/native.winoffice.txt",
		Homepage:    "https://github.com/hagezi/dns-blocklists",
	},
	{
		ID: "social", Name: "Social networks", Category: "content",
		Description: "Blocks Facebook, Instagram, TikTok, X and other social sites.",
		URL:         "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts",
		Homepage:    "https://github.com/StevenBlack/hosts",
	},
	{
		ID: "gambling", Name: "Gambling", Category: "content",
		Description: "Blocks betting and casino sites.",
		URL:         "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts",
		Homepage:    "https://github.com/StevenBlack/hosts",
	},
	{
		ID: "adult", Name: "Adult content", Category: "content",
		Description: "Blocks pornography sites.",
		URL:         "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts",
		Homepage:    "https://github.com/StevenBlack/hosts",
	},
	{
		ID: "fakenews", Name: "Fake news", Category: "content",
		Description: "Blocks sites known for publishing fabricated news.",
		URL:         "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-only/hosts",
		Homepage:    "https://github.com/StevenBlack/hosts",
	},
}

// essentials is a hand-picked list of large ad, analytics and tracking
// domains. Each entry also blocks its subdomains.
var essentials = []string{
	// Google ads and analytics
	"doubleclick.net", "googlesyndication.com", "googleadservices.com",
	"adservice.google.com", "googletagservices.com", "google-analytics.com",
	"app-measurement.com", "ssl.google-analytics.com", "pagead2.googlesyndication.com",
	"admob.com", "adsense.com",
	// Ad exchanges and networks
	"adnxs.com", "adsrvr.org", "amazon-adsystem.com", "criteo.com", "criteo.net",
	"taboola.com", "outbrain.com", "rubiconproject.com", "pubmatic.com", "openx.net",
	"casalemedia.com", "indexww.com", "adform.net", "adroll.com", "bidswitch.net",
	"smartadserver.com", "yieldmo.com", "teads.tv", "33across.com", "sharethrough.com",
	"contextweb.com", "revcontent.com", "mgid.com", "zedo.com", "popads.net",
	"propellerads.com", "exoclick.com", "adcolony.com", "advertising.com", "adtech.de",
	"adtechus.com", "media.net", "medianet.com", "sovrn.com", "lijit.com", "gumgum.com",
	"triplelift.com", "3lift.com", "spotxchange.com", "springserve.com", "unrulymedia.com",
	"adsafeprotected.com", "moatads.com", "doubleverify.com", "serving-sys.com",
	"flashtalking.com", "eyeota.net", "bluekai.com", "demdex.net", "everesttech.net",
	"krxd.net", "exelator.com", "tapad.com", "agkn.com", "rlcdn.com", "mathtag.com",
	"turn.com", "mookie1.com", "adhigh.net", "yieldlab.net", "stickyadstv.com",
	"inmobi.com", "unityads.unity3d.com", "ads.mopub.com", "applovin.com",
	"vungle.com", "chartboost.com", "supersonicads.com", "ironsrc.mobi",
	// Measurement and tracking
	"scorecardresearch.com", "quantserve.com", "quantcount.com", "chartbeat.com",
	"chartbeat.net", "hotjar.com", "hotjar.io", "mouseflow.com", "crazyegg.com",
	"fullstory.com", "luckyorange.com", "inspectlet.com", "clicktale.net",
	"mixpanel.com", "api.amplitude.com", "api2.amplitude.com", "api.segment.io",
	"cdn.segment.com", "bam.nr-data.net", "js-agent.newrelic.com", "branch.io",
	"app.adjust.com", "adjust.com", "appsflyer.com", "kochava.com", "omtrdc.net",
	"2o7.net", "statcounter.com", "histats.com", "clarity.ms", "bat.bing.com",
	"ads.linkedin.com", "px.ads.linkedin.com", "analytics.twitter.com",
	"ads-twitter.com", "ads-api.twitter.com", "static.ads-twitter.com",
	"an.facebook.com", "pixel.facebook.com", "analytics.tiktok.com",
	"ads.tiktok.com", "business-api.tiktok.com", "ads.yahoo.com", "analytics.yahoo.com",
	"advertising.yahoo.com", "ads.pinterest.com", "ct.pinterest.com",
	"log.pinterest.com", "sc-analytics.appspot.com", "tr.snapchat.com",
	"ads.reddit.com", "events.reddit.com", "pixel.reddit.com",
	"ads.msn.com", "adnexus.net", "adtago.s3.amazonaws.com",
	// Popups, cryptominers and malvertising regulars
	"coinhive.com", "coin-hive.com", "jsecoin.com", "popcash.net", "popmyads.com",
	"adcash.com", "clickadu.com", "hilltopads.net", "trafficjunky.net",
	"juicyads.com", "plugrush.com", "admaven.com", "ad-maven.com",
}

// essentialsRules returns the built-in list as rules.
func essentialsRules() []Rule {
	rules := make([]Rule, 0, len(essentials))
	for _, d := range essentials {
		rules = append(rules, Rule{Domain: d, Kind: Wildcard})
	}
	return rules
}
