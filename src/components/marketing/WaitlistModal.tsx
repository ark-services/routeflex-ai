"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Check } from "lucide-react";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";
import { joinWaitlist } from "@/app/(marketing)/actions";

export function WaitlistModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const openModal = useCallback(() => {
    setState("idle");
    setErrorMsg("");
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Listen for the custom event dispatched by WaitlistButton
  useEffect(() => {
    window.addEventListener("open-waitlist", openModal);
    return () => window.removeEventListener("open-waitlist", openModal);
  }, [openModal]);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    const result = await joinWaitlist(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setState("error");
    } else {
      setState("success");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        data-theme="dark"
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "#0F1623",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          animation: "wm-pop 0.2s ease-out both",
        }}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors z-10"
          style={{ color: "#9BAABB" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "#F0F4FF"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#9BAABB"; }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Radial glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "400px",
            height: "300px",
            top: "-100px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(ellipse at center, rgba(29,111,255,0.1) 0%, transparent 70%)",
          }}
        />

        <div className="relative px-8 py-10 text-center">
          <div className="flex justify-center mb-6">
            <RouteFlexLogo size="default" />
          </div>

          <h2 className="text-2xl font-black tracking-tight mb-2" style={{ color: "#F0F4FF" }}>
            Get early access
          </h2>
          <p className="text-sm mb-8" style={{ color: "#9BAABB" }}>
            Join the waitlist and be the first to know when we launch.
          </p>

          {state === "success" ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(22,163,74,0.15)" }}
              >
                <Check className="h-6 w-6" style={{ color: "#16A34A" }} />
              </div>
              <p className="text-base font-bold" style={{ color: "#F0F4FF" }}>
                You&apos;re on the list.
              </p>
              <p className="text-sm" style={{ color: "#9BAABB" }}>
                We&apos;ll be in touch when we launch.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                name="email"
                required
                placeholder="you@company.com"
                className="w-full h-11 px-4 rounded-lg text-sm font-medium outline-none transition-all placeholder:opacity-40"
                style={{
                  backgroundColor: "#1A2035",
                  color: "#F0F4FF",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(29,111,255,0.5)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,111,255,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                disabled={state === "loading"}
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="w-full h-11 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{
                  backgroundColor: "#1D6FFF",
                  boxShadow: "0 2px 12px rgba(29,111,255,0.25)",
                }}
                onMouseEnter={(e) => {
                  if (state !== "loading") {
                    e.currentTarget.style.backgroundColor = "#0A4FCC";
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(29,111,255,0.35)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#1D6FFF";
                  e.currentTarget.style.boxShadow = "0 2px 12px rgba(29,111,255,0.25)";
                }}
              >
                {state === "loading" ? "Joining..." : "Join Waitlist"}
              </button>

              {state === "error" && errorMsg && (
                <p className="text-xs font-medium" style={{ color: "#EF4444" }}>
                  {errorMsg}
                </p>
              )}
            </form>
          )}
        </div>

        <style>{`
          @keyframes wm-pop {
            from { opacity: 0; transform: scale(0.95) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
