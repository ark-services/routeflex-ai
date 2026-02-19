"use client";

import { useState } from "react";
import {
  Shield,
  Check,
  Eye,
  EyeOff,
  X,
  Pencil,
  Loader2,
  FlaskConical,
  AlertCircle,
  Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import {
  upsertFadvConnection,
  deleteFadvConnection,
  updateFadvEnabled,
  testFadvConnection,
  type FadvConnectionData,
} from "./fadv-actions";

// ── types ─────────────────────────────────────────────────────────────────────

type CardMode = "view" | "edit" | "test";

interface Props {
  companyId: string;
  accountId: string;
  initialConnection: FadvConnectionData | null;
}

// ── PasswordInput ─────────────────────────────────────────────────────────────

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete ?? "new-password"}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
        tabIndex={-1}
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export function FadvCard({ companyId, accountId, initialConnection }: Props) {
  const [connection, setConnection] = useState<FadvConnectionData | null>(
    initialConnection
  );
  const [mode, setMode] = useState<CardMode>(
    initialConnection ? "view" : "edit"
  );

  // Form state — populated on enter-edit
  const [cspId, setCspId] = useState(initialConnection?.cspId ?? "");
  const [companyIdValue, setCompanyIdValue] = useState(
    initialConnection?.companyIdValue ?? ""
  );
  const [clientId, setClientId] = useState(initialConnection?.clientId ?? "");
  const [username, setUsername] = useState(initialConnection?.username ?? "");
  // Secrets are NEVER pre-filled — empty means "keep existing value"
  const [password, setPassword] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [isEnabled, setIsEnabled] = useState(
    initialConnection?.isEnabled ?? true
  );
  const [saving, setSaving] = useState(false);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  // Toggle enabled
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  // Disconnect
  const [disconnecting, setDisconnecting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  // ── enter edit ─────────────────────────────────────────────────────────────

  function enterEdit() {
    setCspId(connection?.cspId ?? "");
    setCompanyIdValue(connection?.companyIdValue ?? "");
    setClientId(connection?.clientId ?? "");
    setUsername(connection?.username ?? "");
    // Secrets intentionally not restored
    setPassword("");
    setSecurityAnswer("");
    setIsEnabled(connection?.isEnabled ?? true);
    setMode("edit");
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await upsertFadvConnection(
        companyId,
        accountId,
        cspId.trim(),
        companyIdValue.trim(),
        clientId.trim(),
        username.trim(),
        password,
        securityAnswer,
        isEnabled
      );

      if (!result.success) {
        showToast(result.error ?? "Failed to save", "error");
        return;
      }

      showToast(
        connection
          ? "First Advantage integration updated"
          : "First Advantage integration configured",
        "success"
      );
      // Clear secrets from state — never kept after save
      setPassword("");
      setSecurityAnswer("");
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  // ── toggle enabled ────────────────────────────────────────────────────────

  async function handleToggleEnabled() {
    if (!connection) return;
    const newEnabled = !connection.isEnabled;
    setTogglingEnabled(true);
    try {
      const result = await updateFadvEnabled(companyId, accountId, newEnabled);
      if (!result.success) {
        showToast(result.error ?? "Failed to update", "error");
        return;
      }
      setConnection({ ...connection, isEnabled: newEnabled });
      setIsEnabled(newEnabled);
      showToast(
        newEnabled
          ? "First Advantage integration enabled"
          : "First Advantage integration disabled",
        "success"
      );
    } finally {
      setTogglingEnabled(false);
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    if (
      !confirm(
        "Remove First Advantage configuration? All stored credentials will be deleted and submissions to FADV will stop working."
      )
    )
      return;
    setDisconnecting(true);
    try {
      const result = await deleteFadvConnection(companyId, accountId);
      if (!result.success) {
        showToast(result.error ?? "Failed to disconnect", "error");
        return;
      }
      showToast("First Advantage integration removed", "success");
      window.location.reload();
    } finally {
      setDisconnecting(false);
    }
  }

  // ── test connection ───────────────────────────────────────────────────────

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testFadvConnection(companyId, accountId);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const configIncomplete = connection && !connection.isConfigComplete;

  return (
    <>
      <Card className="p-4 sm:p-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-stone-900">
                First Advantage
              </h3>
              <p className="text-sm text-stone-600 mt-1">
                Background screening integration — submit applicants directly to FADV
              </p>

              {/* Status badge */}
              {connection && mode === "view" && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  {connection.isConfigComplete ? (
                    <>
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-green-700 font-medium">Configured</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-amber-700 font-medium">Incomplete</span>
                    </>
                  )}
                  <span className="text-stone-400">•</span>
                  <span className="text-stone-500 font-mono text-xs">
                    CSP: {connection.cspId || <em className="text-stone-400 not-italic">not set</em>}
                  </span>
                  {!connection.isEnabled && (
                    <span className="ml-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200">
                      Disabled
                    </span>
                  )}
                </div>
              )}

              {configIncomplete && mode === "view" && (
                <p className="mt-1 text-xs text-amber-600">
                  All fields are required before submissions can be sent.
                </p>
              )}
            </div>
          </div>

          {/* Action buttons (view mode, connected) */}
          {connection && mode === "view" && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
              <button
                onClick={() => {
                  setTestResult(null);
                  setMode("test");
                }}
                className="px-3 py-2 text-sm font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors flex items-center gap-1.5"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Test Config
              </button>
              <button
                onClick={enterEdit}
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
                {disconnecting ? "Removing…" : "Remove"}
              </button>
            </div>
          )}

          {/* Configure button (not yet set up) */}
          {!connection && mode === "view" && (
            <Button
              variant="secondary"
              onClick={() => setMode("edit")}
              className="sm:flex-shrink-0"
            >
              Configure
            </Button>
          )}
        </div>

        {/* Detail view */}
        {connection && mode === "view" && (
          <div className="mt-5 pt-5 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                CSP ID
              </p>
              <p className="text-sm font-mono text-stone-800">
                {connection.cspId || <span className="text-stone-400 italic">Not set</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                Company ID
              </p>
              <p className="text-sm font-mono text-stone-800">
                {connection.companyIdValue || <span className="text-stone-400 italic">Not set</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                Client ID
              </p>
              <p className="text-sm font-mono text-stone-800">
                {connection.clientId || <span className="text-stone-400 italic">Not set</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                User ID
              </p>
              <p className="text-sm text-stone-800">
                {connection.username || <span className="text-stone-400 italic">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                Password
              </p>
              <p className="text-sm font-mono text-stone-800 tracking-widest flex items-center gap-1.5">
                {connection.hasPassword ? (
                  <>
                    <Lock className="w-3 h-3 text-stone-400 flex-shrink-0" />
                    <span>••••••••••••</span>
                  </>
                ) : (
                  <span className="text-stone-400 italic not-italic font-sans tracking-normal">Not set</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">
                Security Answer
              </p>
              <p className="text-sm font-mono text-stone-800 tracking-widest flex items-center gap-1.5">
                {connection.hasSecurityAnswer ? (
                  <>
                    <Lock className="w-3 h-3 text-stone-400 flex-shrink-0" />
                    <span>••••••••••••</span>
                  </>
                ) : (
                  <span className="text-stone-400 italic not-italic font-sans tracking-normal">Not set</span>
                )}
              </p>
            </div>

            {/* Enabled toggle */}
            <div className="sm:col-span-3 flex items-center gap-3 pt-2 border-t border-stone-100">
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

        {/* Edit / Configure form */}
        {mode === "edit" && (
          <form
            onSubmit={handleSave}
            className="mt-5 pt-5 border-t border-stone-100 space-y-4"
          >
            {/* ── Submission config ── */}
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
              Submission Config
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CSP ID */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  CSP ID<span className="text-red-500 ml-0.5">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 12345"
                  value={cspId}
                  onChange={(e) => setCspId(e.target.value)}
                  autoComplete="off"
                  required
                />
                <p className="mt-1 text-xs text-stone-400">
                  Required for all background check submissions
                </p>
              </div>

              {/* Company ID */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Company ID<span className="text-red-500 ml-0.5">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. ACME001"
                  value={companyIdValue}
                  onChange={(e) => setCompanyIdValue(e.target.value)}
                  autoComplete="off"
                  required
                />
                <p className="mt-1 text-xs text-stone-400">
                  Required for all background check submissions
                </p>
              </div>
            </div>

            {/* ── Login credentials ── */}
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide pt-2">
              Login Credentials
              {isEnabled && <span className="ml-1 text-red-400 normal-case font-normal">(required when enabled)</span>}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Client ID */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Client ID
                  {isEnabled && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <Input
                  type="text"
                  placeholder="FADV Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-stone-400">
                  Not secret — stored as provided
                </p>
              </div>

              {/* User ID */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  User ID
                  {isEnabled && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <Input
                  type="text"
                  placeholder="FADV User ID"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Password
                  {isEnabled && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder={
                    connection?.hasPassword
                      ? "Enter to replace saved password"
                      : "FADV password"
                  }
                />
                <p className="mt-1 text-xs text-stone-400 flex items-center gap-1">
                  <Lock className="w-3 h-3 flex-shrink-0" />
                  Password stored encrypted — never shown after saving
                </p>
              </div>

              {/* Security Answer */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Security Answer
                  {isEnabled && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <PasswordInput
                  value={securityAnswer}
                  onChange={setSecurityAnswer}
                  placeholder={
                    connection?.hasSecurityAnswer
                      ? "Enter to replace saved answer"
                      : "FADV security answer"
                  }
                />
                <p className="mt-1 text-xs text-stone-400 flex items-center gap-1">
                  <Lock className="w-3 h-3 flex-shrink-0" />
                  Security Answer stored encrypted — never shown after saving
                </p>
              </div>
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
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

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="secondary" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {connection ? "Updating…" : "Saving…"}
                  </>
                ) : connection ? (
                  "Update"
                ) : (
                  "Save Configuration"
                )}
              </Button>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => setMode("view")}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Test connection */}
        {mode === "test" && (
          <div className="mt-5 pt-5 border-t border-stone-100 space-y-4">
            <p className="text-sm text-stone-600">
              Attempts the full two-step FADV login to verify your credentials are correct.
            </p>

            {testResult && (
              <div
                className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                  testResult.success
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                )}
                <span>{testResult.success ? testResult.message : testResult.error}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Testing…
                  </>
                ) : (
                  <>
                    <FlaskConical className="w-4 h-4 mr-2" />
                    Run Test
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => setMode("view")}
                disabled={testing}
              >
                Back
              </Button>
            </div>
          </div>
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
