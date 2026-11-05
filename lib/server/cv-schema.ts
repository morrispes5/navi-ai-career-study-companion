import { z } from "zod";

const item = z.string().trim().min(1).max(400);
export const cvReviewSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(800),
  strengths: z.array(item).min(1).max(8),
  weaknesses: z.array(item).min(1).max(8),
  keywordGaps: z.array(z.string().trim().min(1).max(80)).max(20),
  rewrites: z.array(z.object({ original: z.string().trim().min(1).max(500), suggestion: z.string().trim().min(1).max(500) })).max(8),
});
export type CvReviewResult = z.infer<typeof cvReviewSchema>;
