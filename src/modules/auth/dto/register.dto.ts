import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().nonempty(),
  email: z.string().email().nonempty(),
  password: z.string().nonempty(),
});

export type registerDto = Required<z.infer<typeof registerSchema>>;