import Link from "next/link";
import { login } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const { error, redirectTo } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-sm p-8">
        <div className="text-center space-y-1 mb-8">
          <p className="text-sm font-semibold tracking-tight text-stone-400">
            RouteFlex AI
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            Log in
          </h1>
        </div>
        {error && (
          <p className="text-sm text-red-600 text-center mb-6">{error}</p>
        )}
        <form action={login} className="space-y-4">
          {redirectTo && (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-stone-700 mb-1.5"
            >
              Email
            </label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-stone-700 mb-1.5"
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
            Log in
          </Button>
        </form>
        <p className="text-sm text-stone-500 text-center mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-stone-900 hover:text-stone-700 font-medium"
          >
            Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
