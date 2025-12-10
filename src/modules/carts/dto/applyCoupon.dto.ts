import { z } from 'zod';

export const applyCouponSchema = z.object({
  code: z.string().nonempty(),
});

export type applyCouponDto = Required<z.infer<typeof applyCouponSchema>>;