"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { acceptInviteLink } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function AcceptInviteClient({
  token,
  accountName,
  role,
}: {
  token: string;
  accountName: string;
  role: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await acceptInviteLink(token);

      if ("error" in result) {
        if (result.error === "seat_limit") {
          setError(
            "This account has reached its seat limit. Contact the account admin to upgrade."
          );
        } else if (result.error === "invalid") {
          setError("This invite link has expired or is no longer valid.");
        } else {
          setError(result.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Already a member or just joined — redirect to the app
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-rf-surface-page p-4">
      <Card className="max-w-md w-full p-10">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <p className="text-sm font-semibold tracking-tight text-rf-text-muted">
            RouteFlex AI
          </p>
        </div>

        <div className="text-center space-y-2 mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-semibold text-rf-text-primary">
            You&apos;re invited!
          </h1>
          <p className="text-rf-ink-500">
            Join{" "}
            <span className="font-semibold text-rf-text-primary">{accountName}</span>{" "}
            on RouteFlex as a{" "}
            <span className="font-semibold text-rf-text-primary">
              {ROLE_LABELS[role] ?? role}
            </span>
            .
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rf-danger-bg border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <Button
          onClick={handleAccept}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Joining..." : `Join ${accountName}`}
        </Button>
      </Card>
    </div>
  );
}
