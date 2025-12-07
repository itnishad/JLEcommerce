import { z } from 'zod';

export const addItemSchema = z.object({
  productId: z.string().nonempty(),
  quantity: z.number().min(1),
});

export type AddItemDto = Required<z.infer<typeof addItemSchema>>;