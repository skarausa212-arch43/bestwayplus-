"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession } from "@/lib/auth";
import { LOCALE_COOKIE, isLocale } from "@/i18n";

export async function setLocaleAction(fd: FormData) {
  const locale = fd.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
