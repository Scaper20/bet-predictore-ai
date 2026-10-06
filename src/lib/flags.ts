/**
 * National team name → flag code, for teams the feeds send without a crest.
 *
 * International fixtures (Nations League, qualifiers, AFCON, friendlies)
 * usually arrive with no badge at all, so they rendered as initials ("B" v
 * "F"). A country's flag is the badge people expect there. Codes are ISO
 * 3166-1 alpha-2, plus flagcdn's gb-eng / gb-sct / gb-wls / gb-nir for the
 * home nations.
 */
const CODES: Record<string, string> = {
  afghanistan: "af", albania: "al", algeria: "dz", andorra: "ad", angola: "ao", "antigua and barbuda": "ag",
  argentina: "ar", armenia: "am", aruba: "aw", australia: "au", austria: "at", azerbaijan: "az",
  bahamas: "bs", bahrain: "bh", bangladesh: "bd", barbados: "bb", belarus: "by", belgium: "be", belize: "bz",
  benin: "bj", bermuda: "bm", bhutan: "bt", bolivia: "bo", "bosnia and herzegovina": "ba", "bosnia-herzegovina": "ba",
  botswana: "bw", brazil: "br", brunei: "bn", bulgaria: "bg", "burkina faso": "bf", burundi: "bi",
  cambodia: "kh", cameroon: "cm", canada: "ca", "cape verde": "cv", "cabo verde": "cv", "cayman islands": "ky",
  "central african republic": "cf", chad: "td", chile: "cl", china: "cn", "china pr": "cn", "chinese taipei": "tw",
  colombia: "co", comoros: "km", congo: "cg", "congo dr": "cd", "dr congo": "cd", "democratic republic of the congo": "cd",
  "cook islands": "ck", "costa rica": "cr", croatia: "hr", cuba: "cu", curacao: "cw", "curaçao": "cw", cyprus: "cy",
  "czech republic": "cz", czechia: "cz", denmark: "dk", djibouti: "dj", dominica: "dm", "dominican republic": "do",
  ecuador: "ec", egypt: "eg", "el salvador": "sv", england: "gb-eng", "equatorial guinea": "gq", eritrea: "er",
  estonia: "ee", eswatini: "sz", ethiopia: "et", "faroe islands": "fo", fiji: "fj", finland: "fi", france: "fr",
  gabon: "ga", gambia: "gm", "the gambia": "gm", georgia: "ge", germany: "de", ghana: "gh", gibraltar: "gi",
  greece: "gr", grenada: "gd", guam: "gu", guatemala: "gt", guinea: "gn", "guinea-bissau": "gw", guyana: "gy",
  haiti: "ht", honduras: "hn", "hong kong": "hk", hungary: "hu", iceland: "is", india: "in", indonesia: "id",
  iran: "ir", "ir iran": "ir", iraq: "iq", ireland: "ie", "republic of ireland": "ie", israel: "il", italy: "it",
  "ivory coast": "ci", "cote d'ivoire": "ci", "côte d'ivoire": "ci", jamaica: "jm", japan: "jp", jordan: "jo",
  kazakhstan: "kz", kenya: "ke", kosovo: "xk", kuwait: "kw", kyrgyzstan: "kg", "kyrgyz republic": "kg",
  laos: "la", latvia: "lv", lebanon: "lb", lesotho: "ls", liberia: "lr", libya: "ly", liechtenstein: "li",
  lithuania: "lt", luxembourg: "lu", macau: "mo", madagascar: "mg", malawi: "mw", malaysia: "my", maldives: "mv",
  mali: "ml", malta: "mt", mauritania: "mr", mauritius: "mu", mexico: "mx", moldova: "md", mongolia: "mn",
  montenegro: "me", montserrat: "ms", morocco: "ma", mozambique: "mz", myanmar: "mm", namibia: "na", nepal: "np",
  netherlands: "nl", "new caledonia": "nc", "new zealand": "nz", nicaragua: "ni", niger: "ne", nigeria: "ng",
  "north korea": "kp", "korea dpr": "kp", "north macedonia": "mk", "northern ireland": "gb-nir", norway: "no",
  oman: "om", pakistan: "pk", palestine: "ps", panama: "pa", "papua new guinea": "pg", paraguay: "py", peru: "pe",
  philippines: "ph", poland: "pl", portugal: "pt", "puerto rico": "pr", qatar: "qa", romania: "ro", russia: "ru",
  rwanda: "rw", "saint kitts and nevis": "kn", "saint lucia": "lc", "saint vincent and the grenadines": "vc",
  samoa: "ws", "san marino": "sm", "sao tome and principe": "st", "saudi arabia": "sa", scotland: "gb-sct",
  senegal: "sn", serbia: "rs", seychelles: "sc", "sierra leone": "sl", singapore: "sg", slovakia: "sk",
  slovenia: "si", "solomon islands": "sb", somalia: "so", "south africa": "za", "south korea": "kr",
  "korea republic": "kr", "south sudan": "ss", spain: "es", "sri lanka": "lk", sudan: "sd", suriname: "sr",
  sweden: "se", switzerland: "ch", syria: "sy", tahiti: "pf", tajikistan: "tj", tanzania: "tz", thailand: "th",
  "timor-leste": "tl", togo: "tg", tonga: "to", "trinidad and tobago": "tt", tunisia: "tn", turkey: "tr",
  "türkiye": "tr", turkiye: "tr", turkmenistan: "tm", uganda: "ug", ukraine: "ua", "united arab emirates": "ae",
  uae: "ae", "united states": "us", usa: "us", uruguay: "uy", uzbekistan: "uz", vanuatu: "vu", venezuela: "ve",
  vietnam: "vn", wales: "gb-wls", yemen: "ye", zambia: "zm", zimbabwe: "zw",
};

/** Age-group and women's sides share the senior flag: "Nigeria U20", "France Women". */
const SUFFIX = /\s+(?:u-?\d{2}|under[- ]\d{2}|women|w|olympic|b)$/i;

export function flagCode(teamName: string): string | null {
  const key = teamName.trim().toLowerCase().replace(SUFFIX, "").trim();
  return CODES[key] ?? null;
}

/** A flag image for a national team, or null when the name is not a country. */
export function flagUrl(teamName: string, width: 40 | 80 | 160 = 80): string | null {
  const code = flagCode(teamName);
  return code ? `https://flagcdn.com/w${width}/${code}.png` : null;
}
