export interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  page: number;
}
export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
  ayahs: Ayah[];
}
export interface DailyAyah extends Ayah {
  surah: Omit<Surah, 'ayahs'>;
}
let library: Promise<Surah[]> | undefined;
export function loadQuran(): Promise<Surah[]> {
  library ??= fetch('/quran-uthmani.json')
    .then(async (response) => {
      if (!response.ok) throw new Error('Quran unavailable');
      const json = await response.json();
      if (json.code !== 200 || !Array.isArray(json.data?.surahs) || json.data.surahs.length !== 114)
        throw new Error('Invalid Quran data');
      return (json.data.surahs as Surah[]).map((surah) => ({
        ...surah,
        numberOfAyahs: surah.ayahs.length,
      }));
    })
    .catch((error) => {
      library = undefined;
      throw error;
    });
  return library;
}
export async function fetchDailyAyah(): Promise<DailyAyah> {
  // Accept-Encoding is controlled by the browser; do not send a forbidden header.
  const response = await fetch('https://api.alquran.cloud/v1/ayah/random', {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Ayah service unavailable');
  const json = await response.json();
  const data = json.data;
  if (
    json.code !== 200 ||
    typeof data?.text !== 'string' ||
    !Number.isInteger(data?.number) ||
    !Number.isInteger(data?.surah?.number) ||
    !Number.isInteger(data?.numberInSurah) ||
    data.edition?.language !== 'ar'
  )
    throw new Error('Invalid ayah');
  // Use the same local Uthmani edition as the reader for consistent Arabic typography.
  const surahs = await loadQuran();
  const surah = surahs.find((item) => item.number === data.surah.number);
  const ayah = surah?.ayahs.find((item) => item.number === data.number);
  if (!surah || !ayah) throw new Error('Unknown ayah');
  return { ...ayah, surah: { ...surah, ayahs: undefined } } as DailyAyah;
}
