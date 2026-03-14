"use client";

import { useState, useRef } from "react";
import { Camera, X, User, Mail, Lock, Bell, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  updateDisplayName,
  updateEmail,
  updatePasswordFromProfile,
  uploadAvatar,
  removeAvatar,
  updateNotificationPreferences,
  deactivateAccount,
  type NotificationPreferences,
} from "./actions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  notificationPrefs: NotificationPreferences;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ProfileClient({ email, displayName, avatarUrl, notificationPrefs }: Props) {
  return (
    <div className="space-y-8 pb-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
          My Profile
        </h1>
        <p className="mt-2 text-rf-text-secondary">Manage your account settings</p>
      </div>

      <AvatarSection initialUrl={avatarUrl} displayName={displayName} />
      <DisplayNameSection initialName={displayName} />
      <EmailSection currentEmail={email} />
      <PasswordSection />
      <NotificationSection initialPrefs={notificationPrefs} />
      <DangerZoneSection />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Avatar Section                                                     */
/* ------------------------------------------------------------------ */

function AvatarSection({
  initialUrl,
  displayName,
}: {
  initialUrl: string | null;
  displayName: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const result = await uploadAvatar(fd);
      setUrl(result.url);
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      await removeAvatar();
      setUrl(null);
    } catch (err: any) {
      setError(err.message ?? "Failed to remove avatar");
    }
  }

  return (
    <section className="rounded-lg border border-rf-border bg-rf-surface-card p-6">
      <h2 className="text-sm font-semibold text-rf-ink-700 mb-4 flex items-center gap-2">
        <User className="h-4 w-4" /> Profile Photo
      </h2>
      <div className="flex items-center gap-5">
        <div className="relative">
          {url ? (
            <img
              src={url}
              alt="Avatar"
              className="h-20 w-20 rounded-full object-cover border-2 border-rf-border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-rf-blue-tint text-rf-blue flex items-center justify-center text-xl font-semibold border-2 border-rf-border">
              {initials}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs"
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Uploading..." : "Upload Photo"}
            </Button>
            {url && (
              <Button variant="tertiary" onClick={handleRemove} className="text-xs">
                <X className="h-3.5 w-3.5 mr-1.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-rf-text-muted">
            JPEG, PNG, GIF, or WebP. Max 2MB.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleUpload}
          className="hidden"
        />
      </div>
      {error && <p className="mt-3 text-xs text-rf-danger">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Display Name Section                                               */
/* ------------------------------------------------------------------ */

function DisplayNameSection({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateDisplayName(name);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-rf-border bg-rf-surface-card p-6">
      <h2 className="text-sm font-semibold text-rf-ink-700 mb-4 flex items-center gap-2">
        <User className="h-4 w-4" /> Display Name
      </h2>
      <form onSubmit={handleSave} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-rf-text-secondary mb-1">Full Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={saving || name === initialName}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-rf-danger">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Email Section                                                      */
/* ------------------------------------------------------------------ */

function EmailSection({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateEmail(newEmail);
      setMessage(result.message);
      setNewEmail("");
    } catch (err: any) {
      setError(err.message ?? "Failed to update email");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-rf-border bg-rf-surface-card p-6">
      <h2 className="text-sm font-semibold text-rf-ink-700 mb-4 flex items-center gap-2">
        <Mail className="h-4 w-4" /> Email Address
      </h2>
      <p className="text-sm text-rf-text-primary mb-4">
        Current email: <span className="font-medium">{currentEmail}</span>
      </p>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-rf-text-secondary mb-1">New Email</label>
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={saving || !newEmail}>
          {saving ? "Updating..." : "Update Email"}
        </Button>
      </form>
      {message && (
        <p className="mt-2 text-xs text-green-600">{message}</p>
      )}
      {error && <p className="mt-2 text-xs text-rf-danger">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Password Section                                                   */
/* ------------------------------------------------------------------ */

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updatePasswordFromProfile(current, newPw, confirm);
      setSaved(true);
      setCurrent("");
      setNewPw("");
      setConfirm("");
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message ?? "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-rf-border bg-rf-surface-card p-6">
      <h2 className="text-sm font-semibold text-rf-ink-700 mb-4 flex items-center gap-2">
        <Lock className="h-4 w-4" /> Change Password
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-rf-text-secondary mb-1">
            Current Password
          </label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-rf-text-secondary mb-1">
            New Password
          </label>
          <Input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="block text-xs text-rf-text-secondary mb-1">
            Confirm New Password
          </label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={saving || !current || !newPw || !confirm}
        >
          {saving ? "Updating..." : saved ? "Password Updated!" : "Update Password"}
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-rf-danger">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Notification Preferences Section                                   */
/* ------------------------------------------------------------------ */

const PREF_LABELS: Record<keyof NotificationPreferences, { label: string; desc: string }> = {
  email_system_notifications: {
    label: "System Notifications",
    desc: "Errors, validation failures, and important system alerts",
  },
  email_automation_alerts: {
    label: "Automation Alerts",
    desc: "When automations trigger, fail, or complete",
  },
  email_weekly_digest: {
    label: "Weekly Digest",
    desc: "A weekly summary of activity across your jobs",
  },
};

function NotificationSection({
  initialPrefs,
}: {
  initialPrefs: NotificationPreferences;
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof NotificationPreferences) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateNotificationPreferences(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      // Revert on error
      setPrefs(prefs);
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-rf-border bg-rf-surface-card p-6">
      <h2 className="text-sm font-semibold text-rf-ink-700 mb-4 flex items-center gap-2">
        <Bell className="h-4 w-4" /> Email Notifications
      </h2>
      <div className="space-y-4">
        {(Object.keys(PREF_LABELS) as (keyof NotificationPreferences)[]).map((key) => (
          <label key={key} className="flex items-center justify-between cursor-pointer group">
            <div>
              <p className="text-sm font-medium text-rf-text-primary">
                {PREF_LABELS[key].label}
              </p>
              <p className="text-xs text-rf-text-muted">{PREF_LABELS[key].desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[key]}
              onClick={() => toggle(key)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2 disabled:opacity-50 ${
                prefs[key] ? "bg-rf-blue" : "bg-rf-ink-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  prefs[key] ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        ))}
      </div>
      {saved && (
        <p className="mt-3 text-xs text-green-600">Preferences saved</p>
      )}
      {error && <p className="mt-3 text-xs text-rf-danger">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Danger Zone                                                        */
/* ------------------------------------------------------------------ */

function DangerZoneSection() {
  const confirm = useConfirmDialog();
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    const ok = await confirm({
      title: "Deactivate Account",
      description:
        "Your account will be deactivated and you will be signed out. Your company data will be preserved. You can reactivate by signing in again.",
      confirmLabel: "Deactivate",
      variant: "destructive",
    });
    if (!ok) return;

    setDeactivating(true);
    setError(null);
    try {
      await deactivateAccount();
    } catch (err: any) {
      setError(err.message ?? "Failed to deactivate account");
      setDeactivating(false);
    }
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/50 p-6">
      <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Danger Zone
      </h2>
      <p className="text-xs text-red-600/80 mb-4">
        Deactivating your account will sign you out and restrict access to your
        dashboard. Your company data will be preserved and you can reactivate at any time.
      </p>
      <Button
        variant="destructive"
        onClick={handleDeactivate}
        disabled={deactivating}
      >
        {deactivating ? "Deactivating..." : "Deactivate Account"}
      </Button>
      {error && <p className="mt-2 text-xs text-rf-danger">{error}</p>}
    </section>
  );
}
