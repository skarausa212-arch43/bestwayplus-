import "server-only";
import { z } from "zod";
import { callFn, withUser, type FnResult } from "@/lib/db";
import { achievementSchema, reviewSchema, EVIDENCE_MAX_BYTES } from "@/lib/validation";
import { deleteEvidence, putEvidence, sniffType } from "./storage";

export type Achievement = {
  id: string;
  child_id: string;
  child_name: string;
  kind: string;
  subject: string;
  period: string;
  previous_value: string | null;
  current_value: string | null;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  points_awarded: number;
  has_evidence: boolean;
  evidence_deleted: boolean;
  suggested_points: number;
  review_comment: string | null;
  created_at: string;
};

export async function submitAchievement(
  userId: string,
  input: z.input<typeof achievementSchema>,
  file?: File | null,
): Promise<FnResult<{ achievement_id: string; suggested_points: number }>> {
  const data = achievementSchema.parse(input);
  let evidenceKey: string | null = null;
  if (file && file.size > 0) {
    if (file.size > EVIDENCE_MAX_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
    const buf = await file.arrayBuffer();
    const type = sniffType(new Uint8Array(buf));
    if (!type) return { ok: false, error: "FILE_TYPE" };
    evidenceKey = (await putEvidence(buf, type)).key;
  }
  const res = await callFn<{ achievement_id: string; suggested_points: number }>(userId, "submit_achievement", [
    data.childId,
    data.kind,
    data.subject,
    data.period,
    data.kind === "improvement" ? (data.previousValue ?? null) : null,
    data.kind === "grade" || data.kind === "improvement" ? (data.currentValue ?? null) : null,
    data.description || null,
    evidenceKey,
  ]);
  if (!res.ok && evidenceKey) await deleteEvidence(evidenceKey);
  return res;
}

const SELECT = `
  select a.id, a.child_id, p.display_name as child_name, a.kind, a.subject, a.period, a.previous_value, a.current_value,
         a.description, a.status, a.points_awarded, (a.evidence_path is not null) as has_evidence,
         (a.evidence_deleted_at is not null) as evidence_deleted,
         app.suggest_achievement_points(a.kind, a.previous_value, a.current_value) as suggested_points,
         r.comment as review_comment, a.created_at
    from school_achievements a join profiles p on p.user_id = a.child_id
    left join achievement_reviews r on r.achievement_id = a.id`;

export async function listForGuardian(userId: string): Promise<Achievement[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(`${SELECT} where app.is_guardian_of(a.child_id) order by a.created_at desc limit 100`);
    return rows;
  });
}

export async function deleteAchievement(userId: string, id: string) {
  return withUser(userId, async (db) => {
    // RLS: only the guardian may delete; approved points stay in the ledger (they were already earned).
    const { rows } = await db.query("delete from school_achievements where id = $1 returning evidence_path", [id]);
    if (!rows.length) return { ok: false as const, error: "NOT_FOUND" };
    await db.query("select app.audit('achievement.delete', 'school_achievement', $1)", [id]);
    return { ok: true as const, evidence: rows[0].evidence_path as string | null };
  }).then(async (r) => {
    if (r.ok && r.evidence) await deleteEvidence(r.evidence);
    return r;
  });
}

export async function reviewQueue(adminId: string, status: "pending" | "reviewed" = "pending"): Promise<Achievement[]> {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `${SELECT} where app.is_admin() and ${status === "pending" ? "a.status = 'pending'" : "a.status <> 'pending'"}
       order by a.created_at ${status === "pending" ? "asc" : "desc"} limit 100`,
    );
    return rows;
  });
}

export async function evidenceKeyFor(adminId: string, id: string): Promise<string | null> {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      "select evidence_path from school_achievements where id = $1 and app.is_admin() and status = 'pending'",
      [id],
    );
    return rows[0]?.evidence_path ?? null;
  });
}

export async function reviewAchievement(adminId: string, input: z.input<typeof reviewSchema>) {
  const data = reviewSchema.parse(input);
  const res = await callFn<{ points: number; evidence_path: string | null }>(adminId, "review_achievement", [
    data.achievementId,
    data.decision,
    data.decision === "approved" ? (data.points ?? null) : 0,
    data.comment || null,
  ]);
  if (res.ok && res.evidence_path) await deleteEvidence(res.evidence_path);
  return res;
}
