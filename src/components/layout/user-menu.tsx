"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { logout } from "@/app/(auth)/actions";

interface UserMenuProps {
  userEmail: string;
  accountId: string | null;
  isAdmin: boolean;
}

export function UserMenu({ userEmail, accountId, isAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const initials = userEmail
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  // Capture the trigger button's position whenever the menu opens.
  useEffect(() => {
    if (open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    setLoggingOut(true);
    try {
      await logout();
      // Server action calls redirect("/login"); navigation is handled by Next.js.
      // If somehow execution continues here, fall back to client-side navigation.
      router.push("/login");
    } catch {
      // Catch any unexpected error and redirect client-side as a fallback.
      router.push("/login");
    }
  };

  // Portal dropdown — rendered into document.body so it escapes any stacking
  // context created by sticky group headers, overflow containers, or transforms
  // in the board layout. Positioned with `fixed` coords derived from the trigger
  // button's bounding rect so scroll has no effect on placement.
  const dropdown =
    open && rect
      ? createPortal(
          <>
            {/* Invisible full-screen backdrop to catch outside clicks */}
            <div
              className="fixed inset-0 z-[1000]"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[1001] w-56 rounded-lg border border-rf-border bg-rf-surface-card shadow-lg"
              style={{
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right,
              }}
            >
              <div className="px-4 py-3 border-b border-rf-ink-100">
                <p className="text-sm text-rf-text-secondary truncate">{userEmail}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    router.push("/profile");
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors"
                >
                  My Profile
                </button>
                {isAdmin && accountId && (
                  <button
                    onClick={() => {
                      router.push(`/admin/${accountId}`);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors"
                  >
                    Administration
                  </button>
                )}
                <div className="my-1 border-t border-rf-border" />
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full text-left px-4 py-2 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-2 rounded-full"
      >
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </button>

      {dropdown}
    </div>
  );
}
