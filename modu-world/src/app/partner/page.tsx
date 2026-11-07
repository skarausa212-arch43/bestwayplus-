import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { tl, dateFmt } from "@/i18n/format";
import { listCoupons } from "@/server/rewards";
import { Badge, Notice } from "@/components/ui/misc";
import { CouponRedeemForm } from "./redeem-coupon-form";

export const metadata = { title: "Partner desk" };
export const dynamic = "force-dynamic";

export default async function PartnerPage() {
  const user = await requireRole("partner", "/partner");
  const { t, locale } = await getDict();
  const coupons = user.partnerId ? await listCoupons(user.id, 30) : [];
  return (
    <div className="container-x max-w-3xl pb-10 pt-10">
      <h1 className="text-4xl font-extrabold">{t.partner.title}</h1>
      <p className="mt-2 text-cream/70">{t.partner.text}</p>
      {!user.partnerId ? (
        <Notice tone="warning" className="mt-6">{t.partner.noPartner}</Notice>
      ) : (
        <>
          <div className="card mt-8 p-6">
            <CouponRedeemForm labels={{ code: t.partner.code, redeem: t.partner.redeem }} />
          </div>
          <h2 className="mt-10 text-xl font-bold">{t.partner.recent}</h2>
          <ul className="mt-4 grid gap-2">
            {coupons.map((c) => (
              <li key={c.id} className="card flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-mono font-bold">{c.code}</span> · {tl(c.title, locale)}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {dateFmt(c.redeemed_at ?? c.created_at, locale, true)}
                  <Badge tone={c.status === "issued" ? "success" : "neutral"}>{t.dashboard.couponStatus[c.status as keyof typeof t.dashboard.couponStatus]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
