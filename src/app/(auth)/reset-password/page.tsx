import { updatePassword } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-sm p-8">
        <div className="text-center space-y-1 mb-8">
          <p className="text-sm font-semibold tracking-tight text-rf-text-muted">
            RouteFlex AI
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
            New password
          </h1>
        </div>
        {error && (
          <p className="text-sm text-rf-danger text-center mb-6">{error}</p>
        )}
        <form action={updatePassword} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-rf-ink-700 mb-1.5"
            >
              New password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
            />
          </div>
          <div>
            <label
              htmlFor="confirm"
              className="block text-sm font-medium text-rf-ink-700 mb-1.5"
            >
              Confirm password
            </label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full">
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
