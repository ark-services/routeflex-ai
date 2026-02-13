import Link from "next/link";
import { signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-sm p-8">
        <div className="text-center space-y-1 mb-8">
          <p className="text-sm font-semibold tracking-tight text-stone-400">
            RouteFlex AI
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            Sign up
          </h1>
        </div>
        {error && (
          <p className="text-sm text-red-600 text-center mb-6">{error}</p>
        )}
        <form action={signup} className="space-y-4">
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
            Sign up
          </Button>
        </form>
        <p className="text-sm text-stone-500 text-center mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-stone-900 hover:text-stone-700 font-medium"
          >
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
