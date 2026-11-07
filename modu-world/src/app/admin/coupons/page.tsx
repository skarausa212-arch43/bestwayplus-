import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { tl, dateFmt } from "@/i18n/format";
import { listCoupons } from "@/server/rewards";
import { Badge } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/form";
import { cancelRedemptionAction, adminRedeemCouponAction } from "../actions";

export default async function CouponsPage() {
  const user = await requireRole("admin");
  const { t, locale } = await getDict();
  const coupons = await listCoupons(user.id, 200);
  return (
    <div>
      <h1 className="text-2xl font-bold">{t.admin.couponsTitle}</h1>
      <div className="mt-4 overflow-x-auto rounded-3xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-line first:border-0">
                <td className="px-4 py-2 font-mono">{c.code}</td>
                <td className="px-4 py-2">{tl(c.title, locale)}<div className="text-xs text-muted">{c.partner_name ?? "MODU"}</div></td>
                <td className="px-4 py-2"><Badge tone={c.status === "issued" ? "success" : "neutral"}>{c.status}</Badge></td>
                <td className="px-4 py-2 text-xs text-muted">{dateFmt(c.created_at, locale, true)} → {dateFmt(c.expires_at, locale)}</td>
                <td className="px-4 py-2">
                  {c.status === "issued" && (
                    <div className="flex gap-1">
                      <ActionButton action={adminRedeemCouponAction} fields={{ code: c.code }} size="sm" variant="ghost">{t.admin.redeemCoupon}</ActionButton>
                      <ActionButton action={cancelRedemptionAction} fields={{ redemptionId: c.redemption_id }} size="sm" variant="danger" confirm="?">{t.admin.cancelCoupon}</ActionButton>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
