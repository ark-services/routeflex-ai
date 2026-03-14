import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-sm p-8">
        <div className="text-center space-y-1 mb-8">
          <p className="text-sm font-semibold tracking-tight text-rf-text-muted">
            RouteFlex AI
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
            Reset password
          </h1>
        </div>
        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-rf-text-secondary">
              Check your email for a password reset link.
            </p>
            <Link
              href="/login"
              className="text-sm text-rf-text-primary hover:text-rf-ink-700 font-medium"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-sm text-rf-danger text-center mb-6">{error}</p>
            )}
            <p className="text-sm text-rf-text-secondary text-center mb-6">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            <form action={requestPasswordReset} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-rf-ink-700 mb-1.5"
                >
                  Email
                </label>
                <Input id="email" name="email" type="email" required />
              </div>
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
            </form>
            <p className="text-sm text-rf-text-secondary text-center mt-6">
              <Link
                href="/login"
                className="text-rf-text-primary hover:text-rf-ink-700 font-medium"
              >
                Back to log in
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
