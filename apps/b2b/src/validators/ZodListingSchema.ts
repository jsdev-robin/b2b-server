import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const ZodListingSchema = z.object({
  title: z
    .string()
    .nonempty('Service Title is required')
    .max(100, 'Title is too long'),
  price: z.string().min(1, 'Price is required').transform(Number),
  category: z
    .string()
    .nonempty('Category is required')
    .max(50, 'Category is too long'),
  description: z
    .string()
    .nonempty('Description is required')
    .max(1000, 'Description is too long'),
});

export const ZodId = z.object({
  id: z
    .string()
    .optional()
    .refine((val) => isValidObjectId(val), {
      message: 'Invalid ObjectId',
    }),
});
