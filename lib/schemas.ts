import { z } from "zod";

export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  setting: z.string().optional(),
  shotList: z.array(z.string()).optional(),
  hook: z.string().optional(),
});

export const scenarioResponseSchema = z.object({
  scenarios: z.array(scenarioSchema).min(1, "At least one scenario is required"),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export const generationSettingsSchema = z.object({
  focusOnProduct: z.number().min(1).max(5),
  shots: z.number().min(1).max(12),
  visualStyle: z.string(),
  tone: z.string(),
  orientation: z.string(),
  quality: z.string(),
  addMotion: z.boolean().optional(),
  retouchProduct: z.boolean().optional(),
  includeCaptions: z.boolean().optional(),
});

export type GenerationSettings = z.infer<typeof generationSettingsSchema>;
