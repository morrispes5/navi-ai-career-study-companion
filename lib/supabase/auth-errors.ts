type AuthErrorLike = { code?: string; message?: string };

export function authErrorMessage(error: AuthErrorLike | null | undefined, action: "login" | "signup" | "recovery" | "password") {
  switch (error?.code) {
    case "invalid_credentials": return "Email atau password belum tepat.";
    case "email_not_confirmed": return "Email belum dikonfirmasi. Buka email dari Supabase, lalu coba masuk lagi.";
    case "user_already_exists": case "email_exists": return "Email ini sudah terdaftar. Gunakan halaman Masuk atau reset password.";
    case "weak_password": return "Password masih terlalu lemah. Gunakan minimal 8 karakter dengan kombinasi yang lebih kuat.";
    case "over_request_rate_limit": case "over_email_send_rate_limit": return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    case "signup_disabled": return "Pendaftaran akun sedang dinonaktifkan di Supabase.";
    case "same_password": return "Password baru harus berbeda dari password sebelumnya.";
  }
  if (action === "login") return "Akun belum dapat masuk. Periksa email dan password, lalu coba lagi.";
  if (action === "signup") return "Akun belum dapat dibuat. Coba lagi beberapa saat lagi.";
  if (action === "recovery") return "Tautan reset belum dapat dikirim. Coba beberapa saat lagi.";
  return "Password belum dapat diperbarui. Minta tautan reset baru.";
}
