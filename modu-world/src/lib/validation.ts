import { z } from "zod";

// Shared by client forms (React Hook Form) and server actions. The server always re-validates.
const currentYear = new Date().getFullYear();

export const localeSchema = z.enum(["ru", "en", "be", "pl"]);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(10, "min10").max(128),
  displayName: z.string().trim().min(2).max(40),
  locale: localeSchema.optional(),
  acceptTerms: z.literal(true, { message: "terms" }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(128),
});

export const childSchema = z.object({
  displayName: z.string().trim().min(2).max(30),
  birthYear: z.coerce.number().int().min(currentYear - 18).max(currentYear - 3),
  consent: z.literal(true, { message: "consent" }),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  locale: localeSchema,
  publicCollection: z.boolean(),
});

export const activationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  code: z.string().trim().min(8).max(12),
  childId: z.string().uuid().optional().or(z.literal("")),
});

export const transferAcceptSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  code: z.string().trim().min(8).max(16),
});

export const achievementKinds = ["grade", "improvement", "task", "olympiad"] as const;

export const achievementSchema = z
  .object({
    childId: z.string().uuid(),
    kind: z.enum(achievementKinds),
    subject: z.string().trim().min(2).max(40),
    period: z.string().trim().min(2).max(20),
    previousValue: z.coerce.number().min(0).max(10).optional(),
    currentValue: z.coerce.number().min(0).max(10).optional(),
    description: z.string().trim().max(280).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.kind === "grade" || v.kind === "improvement") && v.currentValue === undefined) {
      ctx.addIssue({ code: "custom", path: ["currentValue"], message: "required" });
    }
    if (v.kind === "improvement" && v.previousValue === undefined) {
      ctx.addIssue({ code: "custom", path: ["previousValue"], message: "required" });
    }
  });

export const reviewSchema = z.object({
  achievementId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  points: z.coerce.number().int().min(0).max(500).optional(),
  comment: z.string().trim().max(280).optional(),
});

export const redeemSchema = z.object({
  accountId: z.string().uuid(),
  rewardId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const batchSchema = z.object({
  characterId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(500),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,24}$/),
  edition: z.enum(["standard", "collector", "prototype"]),
  tagType: z.enum(["ntag213", "ntag215", "ntag216", "ntag424_dna"]),
  isDemo: z.boolean(),
  notes: z.string().trim().max(200).optional(),
});

export const rewardSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  partnerId: z.string().uuid().optional().or(z.literal("")),
  titleRu: z.string().trim().min(2).max(80),
  titleEn: z.string().trim().min(2).max(80),
  descriptionRu: z.string().trim().max(400).optional(),
  descriptionEn: z.string().trim().max(400).optional(),
  category: z.enum(["merch", "toys", "partner", "digital"]),
  costPoints: z.coerce.number().int().min(1).max(100000),
  stock: z.coerce.number().int().min(0).optional(),
  perUserLimit: z.coerce.number().int().min(1).optional(),
  validUntil: z.string().optional(),
  couponTtlDays: z.coerce.number().int().min(1).max(365),
  isActive: z.boolean(),
});

export const partnerSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(60),
  website: z.string().url().optional().or(z.literal("")),
  isConcept: z.boolean(),
  descriptionRu: z.string().trim().max(400).optional(),
  descriptionEn: z.string().trim().max(400).optional(),
});

export const adjustPointsSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.coerce.number().int().min(-10000).max(10000).refine((n) => n !== 0),
  note: z.string().trim().min(3).max(200),
  idempotencyKey: z.string().uuid(),
});

export const walletLinkSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  chainId: z.coerce.number().int().positive(),
});

export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
