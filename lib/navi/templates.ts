export type NaviProfileInput = {
  role: string;
  level: string;
  hours: string;
  timeline: string;
  preference: string;
};

export type TaskTemplate = {
  key: string;
  title: string;
  description: string;
  minutes: number;
};

export type MilestoneTemplate = {
  key: string;
  title: string;
  description: string;
  tasks: TaskTemplate[];
};

type RoleTemplate = Omit<MilestoneTemplate, "key">[];

const paths: Record<string, RoleTemplate> = {
  "Frontend Developer": [
    { title: "Fondasi antarmuka", description: "Bangun halaman yang rapi, responsif, dan mudah dibaca.", tasks: [{ key: "semantic-layout", title: "Buat layout semantic", description: "Susun struktur halaman dengan header, main, section, dan footer.", minutes: 60 }, { key: "responsive-css", title: "Rapikan CSS responsif", description: "Gunakan Flexbox atau Grid untuk dua ukuran layar.", minutes: 75 }, { key: "git-first-commit", title: "Simpan proyek dengan Git", description: "Buat repository dan tulis commit pertama yang jelas.", minutes: 30 }] },
    { title: "JavaScript yang berguna", description: "Tambahkan interaksi kecil yang membuat produk terasa hidup.", tasks: [{ key: "dom-state", title: "Buat state sederhana", description: "Tambahkan filter atau toggle dengan JavaScript.", minutes: 75 }, { key: "form-feedback", title: "Validasi form", description: "Berikan feedback yang jelas saat form belum lengkap.", minutes: 60 }, { key: "api-render", title: "Tampilkan data dari API", description: "Ambil satu data publik dan tampilkan sebagai card.", minutes: 90 }] },
    { title: "React dan komponen", description: "Pecah antarmuka menjadi komponen yang mudah dirawat.", tasks: [{ key: "react-components", title: "Pecah halaman menjadi komponen", description: "Buat komponen card, tombol, dan navigasi.", minutes: 75 }, { key: "react-state", title: "Kelola state pengguna", description: "Gunakan state untuk daftar atau form sederhana.", minutes: 75 }, { key: "react-project", title: "Selesaikan mini dashboard", description: "Gabungkan komponen menjadi satu mini proyek.", minutes: 120 }] },
    { title: "Portofolio siap cerita", description: "Ubah latihan menjadi bukti kemampuan yang mudah dijelaskan.", tasks: [{ key: "polish-project", title: "Poles satu proyek", description: "Rapikan loading, empty state, dan tampilan mobile.", minutes: 90 }, { key: "write-case-study", title: "Tulis studi kasus singkat", description: "Jelaskan masalah, keputusan, dan hasil proyekmu.", minutes: 60 }, { key: "portfolio-review", title: "Review portofolio", description: "Pilih dua proyek dan catat perbaikan berikutnya.", minutes: 45 }] }
  ],
  "Backend Developer": [
    { title: "Fondasi server", description: "Pahami request, response, dan struktur API yang bersih.", tasks: [{ key: "http-basics", title: "Buat endpoint pertama", description: "Buat endpoint GET dengan response JSON yang jelas.", minutes: 60 }, { key: "route-validation", title: "Validasi input", description: "Tolak request yang tidak lengkap dengan pesan yang aman.", minutes: 75 }, { key: "api-readme", title: "Dokumentasikan endpoint", description: "Tulis contoh request dan response singkat.", minutes: 40 }] },
    { title: "Data dan database", description: "Simpan data dengan struktur yang aman dan mudah dipakai.", tasks: [{ key: "schema-design", title: "Rancang schema kecil", description: "Tentukan tabel, id, dan relasi untuk satu fitur.", minutes: 60 }, { key: "crud-api", title: "Bangun CRUD sederhana", description: "Buat create, read, update, dan delete untuk data latihan.", minutes: 100 }, { key: "error-handling", title: "Tangani error API", description: "Bedakan error validasi, tidak ditemukan, dan server.", minutes: 60 }] },
    { title: "Auth dan keamanan", description: "Lindungi data pengguna dengan pola dasar yang benar.", tasks: [{ key: "auth-flow", title: "Pahami alur login", description: "Petakan kapan session dibuat dan divalidasi.", minutes: 60 }, { key: "ownership-check", title: "Terapkan ownership check", description: "Pastikan pengguna hanya membaca datanya sendiri.", minutes: 75 }, { key: "security-review", title: "Review data sensitif", description: "Pastikan key dan password tidak tampil di browser.", minutes: 45 }] },
    { title: "Proyek API", description: "Satukan endpoint menjadi layanan yang dapat didemokan.", tasks: [{ key: "backend-project", title: "Selesaikan API mini", description: "Buat API untuk satu masalah nyata yang kecil.", minutes: 120 }, { key: "integration-test", title: "Uji alur utama", description: "Coba happy path dan dua error penting.", minutes: 60 }, { key: "deploy-notes", title: "Tulis catatan deploy", description: "Dokumentasikan env variable dan cara menjalankan proyek.", minutes: 45 }] }
  ],
  "UI/UX Designer": [
    { title: "Memahami masalah pengguna", description: "Mulai dari kebutuhan, bukan langsung dari warna dan komponen.", tasks: [{ key: "user-problem", title: "Tulis masalah pengguna", description: "Rangkum satu masalah yang ingin dibantu produk.", minutes: 45 }, { key: "user-flow", title: "Gambar user flow", description: "Susun langkah pengguna dari masuk sampai selesai.", minutes: 60 }, { key: "content-priority", title: "Tentukan prioritas konten", description: "Pilih informasi yang wajib muncul di layar pertama.", minutes: 45 }] },
    { title: "Struktur dan wireframe", description: "Bentuk alur yang jelas sebelum memoles visual.", tasks: [{ key: "lowfi-wireframe", title: "Buat wireframe low-fi", description: "Sketsa satu flow utama tanpa detail visual.", minutes: 75 }, { key: "empty-error-states", title: "Rancang state penting", description: "Tambahkan empty, loading, dan error state.", minutes: 60 }, { key: "responsive-wireframe", title: "Adaptasi ke mobile", description: "Pastikan flow tetap nyaman di lebar 360px.", minutes: 60 }] },
    { title: "Visual dan sistem", description: "Buat keputusan visual yang konsisten dan dapat dipakai ulang.", tasks: [{ key: "type-color", title: "Tentukan type dan color", description: "Pilih hierarchy teks dan warna dengan kontras aman.", minutes: 60 }, { key: "component-states", title: "Buat komponen dengan state", description: "Rancang tombol, input, dan card untuk kondisi penting.", minutes: 75 }, { key: "prototype-flow", title: "Hubungkan prototype", description: "Buat prototype untuk flow utama pengguna.", minutes: 75 }] },
    { title: "Studi kasus portofolio", description: "Ceritakan keputusan desain, bukan hanya hasil visual.", tasks: [{ key: "usability-notes", title: "Catat temuan usability", description: "Minta satu orang mencoba flow dan catat hambatan.", minutes: 45 }, { key: "iterate-design", title: "Iterasi satu masalah", description: "Perbaiki satu bagian berdasarkan temuan tadi.", minutes: 60 }, { key: "design-case-study", title: "Tulis studi kasus desain", description: "Rangkum konteks, proses, dan keputusan penting.", minutes: 75 }] }
  ],
  "Data Analyst": [
    { title: "Fondasi data", description: "Pahami pertanyaan bisnis sebelum menghitung angka.", tasks: [{ key: "question-frame", title: "Rumuskan pertanyaan data", description: "Tulis satu pertanyaan yang dapat dijawab dengan data.", minutes: 45 }, { key: "spreadsheet-clean", title: "Bersihkan data kecil", description: "Rapikan missing value dan format yang tidak konsisten.", minutes: 75 }, { key: "basic-metrics", title: "Hitung metrik dasar", description: "Buat ringkasan mean, total, dan tren sederhana.", minutes: 60 }] },
    { title: "SQL dan eksplorasi", description: "Ambil jawaban dari data secara sistematis.", tasks: [{ key: "sql-select", title: "Tulis query SELECT", description: "Ambil kolom dan filter sesuai pertanyaan.", minutes: 60 }, { key: "sql-group", title: "Kelompokkan data", description: "Gunakan GROUP BY untuk membaca pola sederhana.", minutes: 75 }, { key: "sql-join", title: "Hubungkan dua tabel", description: "Gunakan JOIN untuk menjawab satu pertanyaan lanjutan.", minutes: 75 }] },
    { title: "Visualisasi dan cerita", description: "Ubah angka menjadi penjelasan yang mudah dipahami.", tasks: [{ key: "chart-choice", title: "Pilih grafik yang tepat", description: "Bandingkan dua jenis chart untuk satu insight.", minutes: 45 }, { key: "dashboard-draft", title: "Buat dashboard mini", description: "Tampilkan tiga metrik utama dan satu insight.", minutes: 90 }, { key: "insight-writing", title: "Tulis rekomendasi", description: "Jelaskan apa yang berubah dan tindakan berikutnya.", minutes: 45 }] },
    { title: "Portofolio analisis", description: "Tunjukkan proses analisis dari pertanyaan hingga rekomendasi.", tasks: [{ key: "analysis-project", title: "Selesaikan analisis end-to-end", description: "Gunakan dataset kecil dari awal sampai visualisasi.", minutes: 120 }, { key: "quality-check", title: "Cek kualitas temuan", description: "Tinjau asumsi dan keterbatasan analisismu.", minutes: 45 }, { key: "analyst-case-study", title: "Tulis studi kasus", description: "Susun pertanyaan, metode, temuan, dan rekomendasi.", minutes: 75 }] }
  ]
};

const roleFallback = "Frontend Developer";
const numberFromLabel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 6) || 6;

export function buildPlanTemplate(profile: NaviProfileInput): MilestoneTemplate[] {
  const hours = numberFromLabel(profile.hours);
  const pace = hours <= 3 ? 1.35 : hours >= 15 ? 0.72 : hours >= 10 ? 0.86 : 1;
  const preferenceSuffix = profile.preference === "Belajar dari materi visual"
    ? " Catat satu referensi visual yang membantumu memahami latihan ini."
    : profile.preference === "Belajar sambil diskusi"
      ? " Siapkan satu pertanyaan untuk didiskusikan dengan mentor atau teman."
      : profile.preference === "Belajar terstruktur langkah demi langkah"
        ? " Tulis checklist kecil sebelum memulai."
        : " Jadikan hasil latihan ini bagian dari proyek kecilmu.";

  return (paths[profile.role] ?? paths[roleFallback]).map((milestone, milestoneIndex) => ({
    key: `${profile.role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${milestoneIndex + 1}`,
    title: milestone.title,
    description: milestone.description,
    tasks: milestone.tasks.map((task) => ({
      ...task,
      minutes: Math.max(25, Math.round(task.minutes * pace / 5) * 5),
      description: `${task.description}${preferenceSuffix}`
    }))
  }));
}

export function rangeLabel(position: number, weeklyHours: number) {
  const weeksPerMilestone = weeklyHours <= 3 ? 4 : weeklyHours >= 15 ? 2 : weeklyHours >= 10 ? 2.5 : 3;
  const start = Math.floor(position * weeksPerMilestone) + 1;
  const end = Math.max(start, Math.floor((position + 1) * weeksPerMilestone));
  return `Minggu ${start}-${end}`;
}
