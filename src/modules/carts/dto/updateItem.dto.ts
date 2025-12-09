import { z } from 'zod';

export const updateItemSchema = z.object({
  quantity: z.number().min(1),
});

export type UpdateItemDto = Required<z.infer<typeof updateItemSchema>>;