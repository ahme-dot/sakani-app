import AccountPage from "@/components/account-page";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

type AccountParams = Promise<{ mode?: string; role?: string; next?: string }>;

export default async function EnglishAccountPage({ searchParams }: { searchParams: AccountParams }) {
  const { mode, role, next } = await searchParams;
  return (
    <AccountPage
      locale="en"
      initialMode={mode === "signup" ? "signup" : "login"}
      initialRole={role === "guest" || role === "host" ? role : null}
      next={next ?? null}
    />
  );
}
