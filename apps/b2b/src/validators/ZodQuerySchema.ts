import z from 'zod';

export const ZodQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  sort: z.string().optional(),
  fields: z.string().optional(),
});
