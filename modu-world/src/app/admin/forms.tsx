"use client";

import { useActionState, useState } from "react";
import { Download } from "lucide-react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import type { ActionState } from "@/lib/utils";
import type { IssuedTag } from "@/server/admin";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Labels = Record<string, any>;

import { createBatchAction, reviewAction, adjustPointsAction, reissueCodeAction, saveRewardAction, savePartnerAction, setRolesAction } from "./actions";

function csv(rows: IssuedTag[]) {
  const head = "serial,url,activation_code,ndef_record";
  return [head, ...rows.map((r) => `${r.serial},${r.url},${r.activationCode},URI`)].join("\n") + "\n";
}

export function BatchForm({
  characters,
  labels,
}: {
  characters: { id: string; name: string }[];
  labels: Labels;
}) {
  const [state, action] = useActionState(createBatchAction, null);
  const download = () => {
    if (!state?.issued) return;
    const url = URL.createObjectURL(new Blob([csv(state.issued)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `modu-batch-${state.code}-codes.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="characterId">{labels.character}</label>
          <select id="characterId" name="characterId" className="field">
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="quantity">{labels.quantity}</label>
          <input id="quantity" name="quantity" type="number" min={1} max={500} defaultValue={3} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="code">{labels.batchCode}</label>
          <input id="code" name="code" required pattern="[A-Za-z0-9-]{3,24}" placeholder="GEN-2026-01" className="field uppercase" />
        </div>
        <div>
          <label className="label" htmlFor="edition">{labels.edition}</label>
          <select id="edition" name="edition" className="field">
            <option value="standard">standard</option>
            <option value="collector">collector</option>
            <option value="prototype">prototype</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tagType">{labels.tagType}</label>
          <select id="tagType" name="tagType" className="field" defaultValue="ntag215">
            <option value="ntag213">NTAG213</option>
            <option value="ntag215">NTAG215</option>
            <option value="ntag216">NTAG216</option>
            <option value="ntag424_dna">NTAG 424 DNA (future SUN)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="notes">{labels.notes}</label>
          <input id="notes" name="notes" maxLength={200} className="field" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isDemo" className="size-4 accent-[#f4b58d]" /> {labels.isDemo}
        </label>
        <div className="sm:col-span-2">
          <SubmitButton>{labels.create}</SubmitButton>
        </div>
      </form>
      {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && state.issued && (
        <div className="rounded-3xl border border-gold/40 bg-gold/5 p-5" data-testid="issued-batch">
          <h3 className="font-sans font-bold text-gold">{labels.issuedTitle}</h3>
          <p className="mt-1 text-sm text-cream/75">{labels.issuedText}</p>
          <Button onClick={download} variant="gold" size="sm" className="mt-4">
            <Download /> {labels.downloadCsv}
          </Button>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <tbody>
                {state.issued.map((r) => (
                  <tr key={r.token} className="border-t border-line" data-testid="issued-row">
                    <td className="py-2 pr-3 font-mono">{r.serial}</td>
                    <td className="py-2 pr-3 font-mono text-peach" data-testid="issued-code">{r.activationCode}</td>
                    <td className="py-2 font-mono">
                      <a href={r.url} className="underline decoration-dotted" data-testid="issued-url">{r.url}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewForm({ id, suggested, labels }: { id: string; suggested: number; labels: Labels }) {
  const [state, action] = useActionState(reviewAction, null);
  if (state?.ok) return <ActionMessage state={state} />;
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[100px_1fr_auto_auto] sm:items-end">
      <input type="hidden" name="achievementId" value={id} />
      <div>
        <label className="text-xs text-muted" htmlFor={`p-${id}`}>{labels.points}</label>
        <input id={`p-${id}`} name="points" type="number" min={0} max={500} defaultValue={suggested} className="field py-2" />
      </div>
      <div>
        <label className="text-xs text-muted" htmlFor={`c-${id}`}>{labels.comment}</label>
        <input id={`c-${id}`} name="comment" maxLength={280} className="field py-2" />
      </div>
      <SubmitButton size="sm" name="decision" value="approved">{labels.approve}</SubmitButton>
      <SubmitButton size="sm" variant="danger" name="decision" value="rejected">{labels.reject}</SubmitButton>
      <div className="sm:col-span-4"><ActionMessage state={state} /></div>
    </form>
  );
}

export function AdjustForm({ accountId, labels }: { accountId: string; labels: Labels }) {
  const [state, action] = useActionState(adjustPointsAction, null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <form
      action={async (fd) => {
        await action(fd);
        setKey(crypto.randomUUID());
      }}
      className="grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-end"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input name="amount" type="number" required placeholder="±100" aria-label={labels.amount} className="field py-2" />
      <input name="note" required minLength={3} placeholder={labels.reason} aria-label={labels.reason} className="field py-2" />
      <SubmitButton size="sm">{labels.apply}</SubmitButton>
      <div className="sm:col-span-3"><ActionMessage state={state} /></div>
    </form>
  );
}

export function ReissueForm({ toyId, serial, label }: { toyId: string; serial: string; label: string }) {
  const [state, action] = useActionState(reissueCodeAction, null);
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="toyId" value={toyId} />
      <input type="hidden" name="serial" value={serial} />
      <SubmitButton size="sm" variant="ghost">{label}</SubmitButton>
      <ActionMessage state={state as ActionState} />
    </form>
  );
}

type RewardDefaults = Partial<Record<string, string | number | boolean | null>>;

export function RewardForm({ defaults, partners, labels }: { defaults?: RewardDefaults; partners: { id: string; name: string }[]; labels: Labels }) {
  const [state, action] = useActionState(saveRewardAction, null);
  const d = defaults ?? {};
  const v = (k: string) => (d[k] === null || d[k] === undefined ? "" : String(d[k]));
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {d.id ? <input type="hidden" name="id" value={v("id")} /> : null}
      <input name="slug" required defaultValue={v("slug")} placeholder={labels.slug} aria-label={labels.slug} className="field py-2" />
      <select name="partnerId" defaultValue={v("partnerId")} aria-label={labels.partner} className="field py-2">
        <option value="">{labels.none}</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <input name="titleRu" required defaultValue={v("titleRu")} placeholder={labels.titleRu} aria-label={labels.titleRu} className="field py-2" />
      <input name="titleEn" required defaultValue={v("titleEn")} placeholder={labels.titleEn} aria-label={labels.titleEn} className="field py-2" />
      <input name="descriptionRu" defaultValue={v("descriptionRu")} placeholder={labels.descriptionRu} aria-label={labels.descriptionRu} className="field py-2" />
      <input name="descriptionEn" defaultValue={v("descriptionEn")} placeholder={labels.descriptionEn} aria-label={labels.descriptionEn} className="field py-2" />
      <select name="category" defaultValue={v("category") || "merch"} aria-label={labels.category} className="field py-2">
        {["merch", "toys", "partner", "digital"].map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <input name="costPoints" type="number" min={1} required defaultValue={v("costPoints")} placeholder={labels.cost} aria-label={labels.cost} className="field py-2" />
      <input name="stock" type="number" min={0} defaultValue={v("stock")} placeholder={labels.stock} aria-label={labels.stock} className="field py-2" />
      <input name="perUserLimit" type="number" min={1} defaultValue={v("perUserLimit")} placeholder={labels.perUser} aria-label={labels.perUser} className="field py-2" />
      <label className="text-xs text-muted">
        {labels.validUntil}
        <input name="validUntil" type="date" defaultValue={v("validUntil")} className="field mt-1 py-2" />
      </label>
      <label className="text-xs text-muted">
        {labels.ttl}
        <input name="couponTtlDays" type="number" min={1} max={365} defaultValue={v("couponTtlDays") || 30} className="field mt-1 py-2" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={d.isActive !== false} className="size-4 accent-[#f4b58d]" /> {labels.active}
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <SubmitButton size="sm">{labels.save}</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function PartnerForm({ labels }: { labels: Labels }) {
  const [state, action] = useActionState(savePartnerAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input name="slug" required placeholder={labels.slug} aria-label={labels.slug} className="field py-2" />
      <input name="name" required placeholder={labels.name} aria-label={labels.name} className="field py-2" />
      <input name="website" type="url" placeholder={labels.website} aria-label={labels.website} className="field py-2" />
      <input name="descriptionRu" placeholder={labels.descriptionRu} aria-label={labels.descriptionRu} className="field py-2" />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="isConcept" defaultChecked className="size-4 accent-[#f4b58d]" /> {labels.isConcept}
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <SubmitButton size="sm">{labels.save}</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function RolesForm({
  userId,
  roles,
  partnerId,
  partners,
  labels,
}: {
  userId: string;
  roles: string[];
  partnerId: string | null;
  partners: { id: string; name: string }[];
  labels: Labels;
}) {
  const [state, action] = useActionState(setRolesAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="userId" value={userId} />
      {["parent", "collector", "partner", "admin"].map((r) => (
        <label key={r} className="flex items-center gap-1 rounded-full border border-line px-2 py-1">
          <input type="checkbox" name={`role_${r}`} defaultChecked={roles.includes(r)} className="accent-[#f4b58d]" /> {r}
        </label>
      ))}
      <select name="partnerId" defaultValue={partnerId ?? ""} aria-label="partner" className="rounded-full border border-line bg-ink px-2 py-1">
        <option value="">—</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <SubmitButton size="sm" variant="ghost">{labels.save}</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
