"use client";

import { useState } from "react";
import { Phone, Check, Eye, EyeOff, X, Send, Pencil, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import {
  upsertTwilioConnection,
  deleteTwilioConnection,
  sendTwilioTestSms,
  updateTwilioEnabled,
  type TwilioConnectionData,
} from "./twilio-actions";

// ── types ─────────────────────────────────────────────────────────────────────

type CardMode = "view" | "edit" | "test";

interface Props {
  companyId: string;
  accountId: string;
  initialConnection: TwilioConnectionData | null;
}

// ── component ─────────────────────────────────────────────────────────────────

export function TwilioCard({ companyId, accountId, initialConnection }: Props) {
  const [connection, setConnection] = useState<TwilioConnectionData | null>(
    initialConnection
  );
  const [mode, setMode] = useState<CardMode>(
    initialConnection ? "view" : "edit"
  );

  // Form state
  const [accountSid, setAccountSid] = useState(
    initialConnection ? "" : "" // always blank — user must enter/re-enter
  );
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState(
    initialConnection?.fromNumber ?? ""
  );
  const [isEnabled, setIsEnabled] = useState(
    initialConnection?.isEnabled ?? true
  );
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test SMS state
  const [toNumber, setToNumber] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testing, setSending] = useState(false);

  // Toggle enabled state
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  // Disconnect state
  const [disconnecting, setDisconnecting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  // ── save / update ───────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await upsertTwilioConnection(
        companyId,
        accountId,
        accountSid.trim(),
        authToken.trim(),
        fromNumber.trim(),
        isEnabled
      );

      if (!result.success) {
        showToast(result.error ?? "Failed to save", "error");
        return;
      }

      showToast(
        connection
          ? "Twilio integration updated"
          : "Twilio integration connected",
        "success"
      );

      // Refresh local state — fetch masked values from server
      // Re-fetch by reloading: triggers server component revalidation
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  // ── toggle enabled ──────────────────────────────────────────────────────────

  async function handleToggleEnabled() {
    if (!connection) return;
    const newEnabled = !connection.isEnabled;
    setTogglingEnabled(true);
    try {
      const result = await updateTwilioEnabled(
        companyId,
        accountId,
        newEnabled
      );
      if (!result.success) {
        showToast(result.error ?? "Failed to update", "error");
        return;
      }
      setConnection({ ...connection, isEnabled: newEnabled });
      setIsEnabled(newEnabled);
      showToast(
        newEnabled
          ? "Twilio integration enabled"
          : "Twilio integration disabled",
        "success"
      );
    } finally {
      setTogglingEnabled(false);
    }
  }

  // ── disconnect ──────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect Twilio? Any automations using Twilio SMS will stop working."
      )
    )
      return;
    setDisconnecting(true);
    try {
      const result = await deleteTwilioConnection(companyId, accountId);
      if (!result.success) {
        showToast(result.error ?? "Failed to disconnect", "error");
        return;
      }
      showToast("Twilio integration disconnected", "success");
      window.location.reload();
    } finally {
      setDisconnecting(false);
    }
  }

  // ── send test SMS ───────────────────────────────────────────────────────────

  async function handleTestSms(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const result = await sendTwilioTestSms(
        companyId,
        accountId,
        toNumber.trim(),
        testMessage.trim() || undefined
      );

      if (result.success) {
        showToast(`Test SMS sent! SID: ${result.sid}`, "success");
        setMode("view");
        setToNumber("");
        setTestMessage("");
      } else {
        showToast(result.error ?? "Failed to send SMS", "error");
      }
    } finally {
      setSending(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="p-4 sm:p-6">
        {/* ── Header row ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <Phone className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Twilio</h3>
              <p className="text-sm text-stone-600 mt-1">
                Send automated SMS messages through your Twilio account
              </p>

              {/* Connected badge */}
              {connection && mode === "view" && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-green-700 font-medium">Connected</span>
                  <span className="text-stone-400">•</span>
                  <span className="text-stone-500 font-mono text-xs">
                    {connection.accountSidMasked}
                  </span>
                  {!connection.isEnabled && (
                    <span className="ml-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200">
                      Disabled
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Action buttons (view mode) ── */}
          {connection && mode === "view" && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
              <button
                onClick={() => setMode("test")}
                className="px-3 py-2 text-sm font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Test SMS
              </button>
              <button
                onClick={() => {
                  setAccountSid("");
                  setAuthToken("");
                  setFromNumber(connection.fromNumber);
                  setIsEnabled(connection.isEnabled);
                  setMode("edit");
                }}
                className="px-3 py-2 text-sm font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {disconnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          )}

          {/* ── Connect button (not connected) ── */}
          {!connection && mode === "view" && (
            <Button
              variant="secondary"
              onClick={() => setMode("edit")}
              className="sm:flex-shrink-0"
            >
              Connect Twilio
            </Button>
          )}
        </div>

        {/* ── Connected detail row (view mode) ── */}
        {connection && mode === "view" && (
          <div className="mt-5 pt-5 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                Account SID
              </p>
              <p className="text-sm font-mono text-stone-800">
                {connection.accountSidMasked}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                Auth Token
              </p>
              <p className="text-sm font-mono text-stone-800 tracking-widest">
                ••••••••••••••••
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                From Number
              </p>
              <p className="text-sm font-mono text-stone-800">
                {connection.fromNumber}
              </p>
            </div>

            {/* Enabled toggle */}
            <div className="sm:col-span-3 flex items-center gap-3 pt-2">
              <button
                role="switch"
                aria-checked={connection.isEnabled}
                onClick={handleToggleEnabled}
                disabled={togglingEnabled}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
                  connection.isEnabled ? "bg-green-500" : "bg-stone-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    connection.isEnabled ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-stone-700">
                {togglingEnabled
                  ? "Updating…"
                  : connection.isEnabled
                  ? "Enabled"
                  : "Disabled"}
              </span>
            </div>
          </div>
        )}

        {/* ── Edit / Connect form ── */}
        {mode === "edit" && (
          <form
            onSubmit={handleSave}
            className="mt-5 pt-5 border-t border-stone-100 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Account SID */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Account SID
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  autoComplete="off"
                  required
                />
                <p className="mt-1 text-xs text-stone-400">
                  Found in your Twilio Console dashboard
                </p>
              </div>

              {/* Auth Token */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Auth Token
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder={
                      connection ? "Enter to update token" : "Your auth token"
                    }
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    tabIndex={-1}
                  >
                    {showToken ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  Stored encrypted — never exposed to the browser after saving
                </p>
              </div>

              {/* From Number */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Default From Number
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <Input
                  type="tel"
                  placeholder="+15551234567"
                  value={fromNumber}
                  onChange={(e) => setFromNumber(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-stone-400">
                  E.164 format — the Twilio number SMS is sent from
                </p>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => setIsEnabled((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isEnabled ? "bg-green-500" : "bg-stone-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        isEnabled ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-stone-700">
                    {isEnabled ? "Enabled" : "Disabled"}
                  </span>
                </label>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="secondary" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {connection ? "Updating…" : "Connecting…"}
                  </>
                ) : connection ? (
                  "Update"
                ) : (
                  "Save & Connect"
                )}
              </Button>
              {(connection || mode === "edit") && (
                <Button
                  type="button"
                  variant="tertiary"
                  onClick={() =>
                    connection ? setMode("view") : setMode("view")
                  }
                  disabled={saving}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        {/* ── Test SMS form ── */}
        {mode === "test" && (
          <form
            onSubmit={handleTestSms}
            className="mt-5 pt-5 border-t border-stone-100 space-y-4"
          >
            <p className="text-sm text-stone-600">
              Send a test SMS to verify your Twilio integration is working.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  To Number
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <Input
                  type="tel"
                  placeholder="+15559876543"
                  value={toNumber}
                  onChange={(e) => setToNumber(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-stone-400">E.164 format</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Message{" "}
                  <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="RouteFlex test SMS — your Twilio integration is working!"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="secondary" disabled={testing}>
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Test SMS
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => setMode("view")}
                disabled={testing}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>

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
