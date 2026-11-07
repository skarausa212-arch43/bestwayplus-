import Link from "next/link";
import Image from "next/image";
import { getDict } from "@/i18n";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getDict();
  return (
    <div className="container-x flex flex-col items-center py-20 text-center">
      <div className="relative size-48">
        <Image src="/assets/modu/rabbit.webp" alt="" fill sizes="192px" className="object-contain opacity-80" />
      </div>
      <h1 className="mt-6 text-4xl font-extrabold">404 · {t.common.notFound}</h1>
      <p className="mt-3 max-w-md text-cream/70">{t.common.notFoundText}</p>
      <Button asChild className="mt-8">
        <Link href="/">{t.common.toHome}</Link>
      </Button>
    </div>
  );
}
