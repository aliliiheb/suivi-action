/** Short thematic summaries; each entry links to its primary hadith reference. */
export const SUNNAH_ENTRIES = [
  {
    id: 'duha',
    period: 'morning',
    topic: 'prayer',
    source: 'Sahih Muslim · 720',
    url: 'https://sunnah.com/muslim:720',
  },
  {
    id: 'intention',
    period: 'day',
    topic: 'character',
    source: 'Sahih al-Bukhari · 1',
    url: 'https://sunnah.com/bukhari:1',
  },
  {
    id: 'waking',
    period: 'waking',
    topic: 'remembrance',
    source: 'Sahih al-Bukhari · 6312',
    url: 'https://sunnah.com/bukhari:6312',
  },
  {
    id: 'rawatib',
    period: 'fajr',
    topic: 'prayer',
    source: 'Jamiʿ at-Tirmidhi · 415',
    url: 'https://sunnah.com/tirmidhi:415',
  },
  {
    id: 'food',
    period: 'day',
    topic: 'food',
    source: 'Sahih al-Bukhari · 5376',
    url: 'https://sunnah.com/bukhari:5376',
  },
  {
    id: 'salam',
    period: 'evening',
    topic: 'relations',
    source: 'Sahih Muslim · 54a',
    url: 'https://sunnah.com/muslim:54a',
  },
  {
    id: 'sleep',
    period: 'sleep',
    topic: 'sleep',
    source: 'Sahih al-Bukhari · 6311',
    url: 'https://sunnah.com/bukhari:6311',
  },
  {
    id: 'smile',
    period: 'day',
    topic: 'relations',
    source: 'Jamiʿ at-Tirmidhi · 1956',
    url: 'https://sunnah.com/tirmidhi:1956',
  },
] as const;
export type SunnahId = (typeof SUNNAH_ENTRIES)[number]['id'];
export const SUNNAH_PERIODS = [
  'waking',
  'fajr',
  'morning',
  'day',
  'evening',
  'night',
  'sleep',
] as const;
export const SUNNAH_TOPICS = [
  'prayer',
  'remembrance',
  'food',
  'relations',
  'character',
  'sleep',
] as const;
