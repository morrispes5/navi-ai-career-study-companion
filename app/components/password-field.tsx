"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
};

export function PasswordField({ label, value, onChange, autoComplete, hint, minLength }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return <label className="form-field">{label}{hint && <small>{hint}</small>}<span className="password-input"><input type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} value={value} onChange={(event) => onChange(event.target.value)} required /><button type="button" aria-label={visible ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>;
}
