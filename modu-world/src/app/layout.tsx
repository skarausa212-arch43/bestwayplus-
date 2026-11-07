import type { Metadata, Viewport } from "next";
import { Unbounded, Manrope } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { TabBar } from "@/components/layout/tab-bar";
import { PwaRegister } from "@/components/layout/pwa-register";
import { getDict } from "@/i18n";

const display = Unbounded({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-unbounded" });
const sans = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-manrope" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return {
    title: { default: t.meta.title, template: "%s · MODU WORLD" },
    description: t.meta.description,
    applicationName: "MODU WORLD",
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    openGraph: { title: t.meta.title, description: t.meta.description, images: ["/assets/modu/hero-trio.webp"] },
    appleWebApp: { capable: true, title: "MODU", statusBarStyle: "black-translucent" },
    icons: { icon: "/assets/modu/logo-mark.svg", apple: "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { themeColor: "#151515", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getDict();
  return (
    <html lang={locale} className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh">
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <TabBar
          labels={{ home: t.nav.home, collection: t.nav.collection, scan: t.nav.scan, rewards: t.nav.rewards, profile: t.nav.profile }}
        />
        <PwaRegister />
      </body>
    </html>
  );
}
