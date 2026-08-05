/**
 * Human-like random email local-part generator.
 * Combines two Indonesian word lists + optional number suffix.
 * Ported from the original tempmail VPS project, then expanded.
 */

const FIRST = [
  // Alam / nature
  'langit', 'senja', 'pagi', 'malam', 'kopi', 'hujan', 'bulan', 'bintang', 'angin', 'awan',
  'nusa', 'rasa', 'jalan', 'teman', 'cerita', 'warna', 'nadi', 'cahya', 'putra', 'putri',
  'bagas', 'adit', 'arya', 'dimas', 'fajar', 'rizky', 'galih', 'bayu', 'bima', 'nanda',
  'mega', 'surya', 'gunung', 'lembah', 'samudra', 'rimba', 'danau', 'pelangi', 'gemericik', 'embun',
  'pelita', 'akhasa', 'sahara', 'karang', 'rawa', 'gurun', 'pantai', 'matahari', 'rembulan', 'galaksi',
  // Hewan / animals
  'elang', 'macan', 'rajawali', 'garuda', 'merak', 'kancil', 'naga', 'kuda', 'cendrawasih', 'lumba',
  'harimau', 'cicak', 'jalak', 'tekukur', 'kenari', 'merpati', 'kumbang', 'lebah', 'kupu', 'belalang',
  // Tumbuhan / plants
  'melati', 'mawar', 'anggrek', 'teratai', 'cemara', 'pinus', 'jati', 'rotan', 'randu', 'mangga',
  'durian', 'rambutan', 'nangka', 'pisang', 'nanas', 'salak', 'duku', 'pepaya', 'sirsak', 'manggis',
  // Nama orang / people
  'ananta', 'arjuna', 'bisma', 'dewa', 'dewi', 'galuh', 'kresna', 'sinta', 'wibawa', 'wisesa',
  'agung', 'abimanyu', 'cakra', 'dananjaya', 'prabu', 'ratna', 'sakti', 'satria', 'wira', 'widya',
];

const SECOND = [
  // Warna / colors
  'biru', 'jingga', 'ungu', 'merah', 'kuning', 'hijau', 'putih', 'emas', 'perak', 'abuabu',
  'nila', 'merona', 'kelabu', 'keemasan', 'kebiruan', 'lembayung', 'merjan', 'dadumuda', 'coklat', 'krem',
  // Sifat / traits
  'manis', 'tenang', 'indah', 'muda', 'asri', 'jaya', 'lucu', 'syahdu', 'harum', 'utama',
  'cerdas', 'cepat', 'lembut', 'hangat', 'murni', 'setia', 'mulia', 'ramah', 'santun', 'gembira',
  'perkasa', 'ganas', 'kencang', 'sabar', 'ikhlas', 'tabah', 'cermat', 'cekatan', 'lapang', 'damai',
  // Alam / nature 2
  'laut', 'hutan', 'cerah', 'pagi', 'malam', 'kecil', 'besar', 'dedaunan', 'samudra', 'rimbun',
  'gunung', 'lembah', 'sawah', 'kali', 'pulau', 'tebing', 'gua', 'padang', 'rawa', 'bukit',
  // Benda / objects
  'aji', 'wira', 'ayu', 'sari', 'nugraha', 'permata', 'lestari', 'mahesa', 'karya', 'puspa',
  'rasa', 'bakti', 'citra', 'daya', 'dharma', 'gita', 'jiwa', 'karsa', 'kencana', 'loka',
  'mustika', 'nirmala', 'bentala', 'gerhana', 'kirana', 'mahkota', 'mentari', 'nusantara', 'purnama', 'sejati',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomLocalPart(): string {
  const useNumber = Math.random() < 0.8;
  const suffix = useNumber ? String(Math.floor(Math.random() * 90) + 10) : '';
  return `${pick(FIRST)}${pick(SECOND)}${suffix}`;
}

export async function generateUniqueAddress(
  exists: (addr: string) => Promise<boolean>,
  domain: string
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const address = `${randomLocalPart()}@${domain}`;
    if (!(await exists(address))) {
      return address;
    }
  }

  // Fallback: add timestamp suffix for uniqueness
  const fallback = `${randomLocalPart()}${Date.now().toString().slice(-4)}@${domain}`;
  if (!(await exists(fallback))) {
    return fallback;
  }

  throw new Error('Failed to generate unique inbox address');
}
