"use client";

import { useState } from "react";
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
  const router = useRouter();

  const initials = userEmail
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 rounded-full"
      >
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-stone-200 bg-white shadow-lg z-20">
            <div className="px-4 py-3 border-b border-stone-100">
              <p className="text-sm text-stone-500 truncate">{userEmail}</p>
            </div>
            <div className="py-1">
              <button
                onClick={() => {
                  router.push("/profile");
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
              >
                My Profile
              </button>
              {isAdmin && accountId && (
                <button
                  onClick={() => {
                    router.push(`/admin/${accountId}`);
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Administration
                </button>
              )}
              <div className="my-1 border-t border-stone-200" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
