import Image from "next/image";

export function AuthShell({ title, text, children, aside }: { title: string; text: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-2 lg:py-16">
      <div className="card mx-auto w-full max-w-md p-6 sm:p-8">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mb-6 mt-2 text-sm text-cream/65">{text}</p>
        {children}
      </div>
      <div className="hidden flex-col justify-center gap-6 lg:flex">
        <div className="relative mx-auto aspect-[644/420] w-full max-w-lg overflow-hidden rounded-[2rem]">
          <Image src="/assets/modu/hero-trio.webp" alt="" fill sizes="40vw" className="object-cover" />
        </div>
        {aside}
      </div>
    </div>
  );
}
