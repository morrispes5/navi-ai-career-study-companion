import type { NaviProfile } from "./types";

const DRAFT_KEY = "navi.onboarding.v3";
export const readOnboardingDraft = (): NaviProfile | null => {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"); } catch { return null; }
};
export const saveOnboardingDraft = (profile: NaviProfile) => { if (typeof window !== "undefined") localStorage.setItem(DRAFT_KEY, JSON.stringify(profile)); };
export const clearOnboardingDraft = () => { if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY); };
