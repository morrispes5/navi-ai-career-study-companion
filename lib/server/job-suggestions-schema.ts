import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const jobSuggestionSchema = z.object({
  title: text(120),
  companyType: text(120),
  seniority: z.enum(["intern", "junior", "mid", "senior"]),
  location: text(80),
  matchReason: text(400),
  matchedSkills: z.array(text(60)).max(8),
  missingSkills: z.array(text(60)).max(8),
  searchQuery: text(120),
});
export const jobSuggestionsSchema = z.object({ suggestions: z.array(jobSuggestionSchema).max(8) });
export type JobSuggestion = z.infer<typeof jobSuggestionSchema>;
export type JobSuggestionsResult = z.infer<typeof jobSuggestionsSchema>;

/** Public job-board search link built from the query (no scraping, no fabricated listings). */
export function jobSearchUrl(query: string, location: string) {
  const p = new URLSearchParams({ keywords: query, location: location || "Indonesia" });
  return `https://www.linkedin.com/jobs/search/?${p.toString()}`;
}
