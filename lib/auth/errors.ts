type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

export function authErrorMessage(error: AuthErrorLike, action: "login" | "signup" | "recovery" | "password") {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD": return "Email atau password belum tepat.";
    case "USER_ALREADY_EXISTS": case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL": return "Email ini sudah terdaftar. Gunakan halaman Masuk atau reset password.";
    case "PASSWORD_TOO_SHORT": return "Password minimal 8 karakter.";
    case "PASSWORD_TOO_LONG": return "Password terlalu panjang.";
    case "INVALID_TOKEN": return "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.";
  }
  if (error?.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (action === "login") return "Akun belum dapat masuk. Periksa email dan password, lalu coba lagi.";
  if (action === "signup") return "Akun belum dapat dibuat. Coba lagi beberapa saat lagi.";
  if (action === "recovery") return "Tautan reset belum dapat dikirim. Coba beberapa saat lagi.";
  return "Password belum dapat diperbarui. Minta tautan reset baru.";
}
