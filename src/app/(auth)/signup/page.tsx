import Link from "next/link";
import { signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const { error, redirectTo } = await searchParams;

  return (
    <Card className="mx-auto w-full max-w-sm p-8">
      <div className="mb-8 flex flex-col items-center gap-5">
        <RouteFlexLogo size="default" />
        <h1 className="text-2xl font-semibold tracking-tight text-rf-text-primary">
          Create your account
        </h1>
      </div>
      {error && (
        <p className="text-sm text-rf-danger text-center mb-6">{error}</p>
      )}
      <form action={signup} className="space-y-4">
        {redirectTo && (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        )}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-rf-ink-700 mb-1.5"
          >
            Email
          </label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-rf-ink-700 mb-1.5"
          >
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
          />
        </div>
        <Button type="submit" className="w-full">
          Sign up
        </Button>
      </form>
      <p className="text-sm text-rf-text-secondary text-center mt-6">
        Already have an account?{" "}
        <Link
          href={
            redirectTo
              ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
              : "/login"
          }
          className="text-rf-text-primary hover:text-rf-ink-700 font-medium"
        >
          Log in
        </Link>
      </p>
    </Card>
  );
}
