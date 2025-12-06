import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number(),
  DATABASE_URL: z.coerce.string(),
  JWT_AUTH_SECRECT: z.coerce.string(),
});

export default envSchema;
