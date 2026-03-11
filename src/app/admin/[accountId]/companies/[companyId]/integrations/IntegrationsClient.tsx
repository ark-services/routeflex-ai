"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/toast";

export function IntegrationsClient({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    const email = searchParams.get("email");

    if (success === "gmail_connected" && email) {
      setToast({
        message: `Gmail connected: ${decodeURIComponent(email)}`,
        type: "success",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("email");
      window.history.replaceState({}, "", url.toString());
    }

    if (success === "adobe_sign_connected") {
      setToast({
        message: `Adobe Sign connected${email ? `: ${decodeURIComponent(email)}` : ""}`,
        type: "success",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("email");
      window.history.replaceState({}, "", url.toString());
    }

    const error = searchParams.get("error");
    const details = searchParams.get("details");

    if (error) {
      const errorMessages: Record<string, string> = {
        oauth_denied: "Gmail connection cancelled",
        oauth_failed: "Gmail connection failed",
        csrf_failed: "Security check failed. Please try again.",
        invalid_state: "Invalid OAuth state. Please try again.",
        token_exchange_failed: "Failed to exchange OAuth token",
        userinfo_failed: "Failed to get user info from Google",
        no_email: "No email address found in Google account",
        storage_failed: "Failed to store Gmail connection",
        callback_failed: "OAuth callback failed",
      };

      const msg = errorMessages[error] ?? "Connection failed";
      setToast({
        message: details ? `${msg}: ${decodeURIComponent(details)}` : msg,
        type: "error",
      });

      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      url.searchParams.delete("details");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  return (
    <>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
