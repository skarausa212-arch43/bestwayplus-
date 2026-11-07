import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SECRET_PEPPER: z.string().min(32, "SECRET_PEPPER must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/uploads"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("school-evidence"),
  WEB3_CHAIN_ID: z.coerce.number().default(11155111),
  WEB3_RPC_URL: z.string().url().optional(),
  MODU_TOKEN_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  MODU_CERTIFICATE_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  CERTIFICATE_MINTER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  SECURE_COOKIES: z.enum(["true", "false"]).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const clean = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(clean);
  if (!parsed.success) {
    throw new Error(
      "Invalid environment: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  cached = parsed.data;
  return cached;
}
