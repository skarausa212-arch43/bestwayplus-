import { Badge } from "@/components/ui/misc";

const DEMO = ["parent@modu.demo", "collector@modu.demo", "admin@modu.demo", "partner@modu.demo"];

/** Shown only when demo mode is enabled. Demo accounts are flagged is_demo in the database. */
export function DemoAccounts({ title, text }: { title: string; text: string }) {
  if (process.env.DEMO_MODE === "false") return null;
  return (
    <div className="card mx-auto w-full max-w-lg p-5 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Badge tone="demo">DEMO</Badge> {title}
      </div>
      <p className="mt-1 text-muted">{text}</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-xs text-cream/80">
        {DEMO.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
