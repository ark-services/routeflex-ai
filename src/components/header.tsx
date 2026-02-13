import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";

export function Header({
  companyName,
  companyId,
}: {
  companyName?: string;
  companyId?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-stone-200/60 py-4 mb-12">
      <div className="flex items-center gap-8">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-stone-900"
        >
          RouteFlex AI
        </Link>
        <nav className="hidden sm:flex items-center gap-5 text-sm">
          <Link
            href="/"
            className="text-stone-500 hover:text-stone-900 transition-colors"
          >
            Companies
          </Link>
          {companyId && (
            <Link
              href={`/dashboard/${companyId}`}
              className="text-stone-500 hover:text-stone-900 transition-colors"
            >
              Dashboard
            </Link>
          )}
          {companyId && (
            <Link
              href={`/dashboard/${companyId}/jobs`}
              className="text-stone-500 hover:text-stone-900 transition-colors"
            >
              Jobs
            </Link>
          )}
          {companyId && (
            <Link
              href={`/dashboard/${companyId}/applicants`}
              className="text-stone-500 hover:text-stone-900 transition-colors"
            >
              Applicants
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {companyName && <Badge>{companyName}</Badge>}
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
