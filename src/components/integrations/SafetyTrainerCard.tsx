"use client";

import { useState, useRef, useEffect } from "react";
import {
  ClipboardCheck,
  Check,
  X,
  Pencil,
  Loader2,
  AlertCircle,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";
import {
  upsertSafetyTrainerConnection,
  deleteSafetyTrainerConnection,
  updateSafetyTrainerEnabled,
  type SafetyTrainerConnectionData,
} from "./safety-trainer-actions";

// ── types ─────────────────────────────────────────────────────────────────────

type CardMode = "view" | "edit";

interface Props {
  companyId: string;
  accountId: string;
  initialConnection: SafetyTrainerConnectionData | null;
}

// ── SignaturePad ──────────────────────────────────────────────────────────────
// Canvas-based drawing pad. Supports:
//   • Draw with mouse / touch
//   • Upload a PNG/JPEG file
//   • Clear
// Returns base64 data URL via onSave.

function SignaturePad({
  hasExisting,
  onSave,
  onClear,
}: {
  hasExisting: boolean;
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialise canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawn(true);
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    // Auto-save to parent
    const canvas = canvasRef.current!;
    onSave(canvas.toDataURL("image/png"));
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onClear();
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Scale image to fit canvas while preserving aspect ratio
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        setHasDrawn(true);
        onSave(canvas.toDataURL("image/png"));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be selected again
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-rf-ink-100 rounded-lg overflow-hidden bg-rf-surface-card cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          className="w-full touch-none select-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-rf-text-muted pointer-events-none select-none">
            Draw signature here
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-rf-ink-500 bg-rf-surface-page border border-rf-border rounded-lg hover:bg-rf-surface-page transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-rf-ink-500 bg-rf-surface-page border border-rf-border rounded-lg hover:bg-rf-surface-page transition-colors"
        >
          <Upload className="w-3 h-3" />
          Upload image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="hidden"
          onChange={handleFileUpload}
        />
        {hasExisting && !hasDrawn && (
          <span className="text-xs text-rf-text-muted italic">
            Leave blank to keep existing signature
          </span>
        )}
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export function SafetyTrainerCard({
  companyId,
  accountId,
  initialConnection,
}: Props) {
  const confirm = useConfirmDialog();
  const [connection, setConnection] = useState<SafetyTrainerConnectionData | null>(
    initialConnection
  );
  const [mode, setMode] = useState<CardMode>(initialConnection ? "view" : "edit");
  const [isExpanded, setIsExpanded] = useState(
    !initialConnection || !initialConnection.isConfigComplete
  );

  // Form state
  const [trainerName, setTrainerName] = useState(initialConnection?.trainerName ?? "");
  const [trainerEmail, setTrainerEmail] = useState(initialConnection?.trainerEmail ?? "");
  const [trainerFedexId, setTrainerFedexId] = useState(initialConnection?.trainerFedexId ?? "");
  const [companyEntityId, setCompanyEntityId] = useState(initialConnection?.companyEntityId ?? "");
  const [companyName, setCompanyName] = useState(initialConnection?.companyName ?? "");
  const [isEnabled, setIsEnabled] = useState(initialConnection?.isEnabled ?? true);

  // Signature: null = keep existing, string = new data URL
  const [newSignatureDataUrl, setNewSignatureDataUrl] = useState<string | null>(null);

  // Password: empty = keep existing, non-empty = replace
  const [trainerPassword, setTrainerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  // ── enter edit ───────────────────────────────────────────────────────────────
  function enterEdit() {
    setTrainerName(connection?.trainerName ?? "");
    setTrainerEmail(connection?.trainerEmail ?? "");
    setTrainerFedexId(connection?.trainerFedexId ?? "");
    setCompanyEntityId(connection?.companyEntityId ?? "");
    setCompanyName(connection?.companyName ?? "");
    setIsEnabled(connection?.isEnabled ?? true);
    setNewSignatureDataUrl(null);
    setTrainerPassword("");
    setShowPassword(false);
    setMode("edit");
  }

  // ── save ─────────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await upsertSafetyTrainerConnection(companyId, accountId, {
        trainerName: trainerName.trim(),
        trainerEmail: trainerEmail.trim(),
        trainerFedexId: trainerFedexId.trim(),
        companyEntityId: companyEntityId.trim(),
        companyName: companyName.trim(),
        signatureDataUrl: newSignatureDataUrl, // null = keep existing
        trainerPassword, // empty string = keep existing
        isEnabled,
      });

      if (!result.success) {
        showToast(result.error ?? "Failed to save", "error");
        return;
      }

      showToast(
        connection
          ? "Impact Solutions Safety Trainer Hub updated"
          : "Impact Solutions Safety Trainer Hub configured",
        "success"
      );
      setNewSignatureDataUrl(null);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  // ── toggle enabled ───────────────────────────────────────────────────────────
  async function handleToggleEnabled() {
    if (!connection) return;
    const newEnabled = !connection.isEnabled;
    setTogglingEnabled(true);
    try {
      const result = await updateSafetyTrainerEnabled(companyId, accountId, newEnabled);
      if (!result.success) {
        showToast(result.error ?? "Failed to update", "error");
        return;
      }
      setConnection({ ...connection, isEnabled: newEnabled });
      setIsEnabled(newEnabled);
      showToast(
        newEnabled
          ? "Impact Solutions Safety Trainer Hub enabled"
          : "Impact Solutions Safety Trainer Hub disabled",
        "success"
      );
    } finally {
      setTogglingEnabled(false);
    }
  }

  // ── disconnect ───────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    if (
      !await confirm({ title: "Remove Safety Trainer Hub", description: "All stored trainer data and signature will be deleted and automations using this integration will stop working.", confirmLabel: "Remove", variant: "destructive" })
    )
      return;
    setDisconnecting(true);
    try {
      const result = await deleteSafetyTrainerConnection(companyId, accountId);
      if (!result.success) {
        showToast(result.error ?? "Failed to disconnect", "error");
        return;
      }
      showToast("Impact Solutions Safety Trainer Hub integration removed", "success");
      window.location.reload();
    } finally {
      setDisconnecting(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  const configIncomplete = connection && !connection.isConfigComplete;

  // Collapse header badge
  const collapseBadge = connection ? (
    !connection.isConfigComplete ? (
      <span className="shrink-0 px-2 py-0.5 text-xs bg-rf-warning-bg text-rf-warning rounded-full border border-amber-200">
        Incomplete
      </span>
    ) : connection.isEnabled ? (
      <span className="shrink-0 px-2 py-0.5 text-xs bg-rf-success-bg text-rf-success rounded-full border border-green-200">
        Enabled
      </span>
    ) : (
      <span className="shrink-0 px-2 py-0.5 text-xs bg-rf-warning-bg text-rf-warning rounded-full border border-amber-200">
        Disabled
      </span>
    )
  ) : (
    <span className="shrink-0 px-2 py-0.5 text-xs bg-rf-ink-100 text-rf-text-secondary rounded-full border border-rf-border">
      Not configured
    </span>
  );

  return (
    <>
      <Card className="overflow-hidden">
        {/* ── Toggle header — always visible ──────────────────────────── */}
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-rf-surface-page transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-rf-success-bg flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-5 h-5 text-rf-success" />
            </div>
            <span className="text-sm font-semibold text-rf-text-primary">
              Impact Solutions Safety Trainer Hub
            </span>
            {collapseBadge}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-rf-text-muted shrink-0 transition-transform duration-150 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* ── Expanded content ─────────────────────────────────────────── */}
        {isExpanded && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-rf-ink-100">
            {/* Description + action buttons */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-4">
              <div>
                <p className="text-sm text-rf-ink-500">
                  Driver certification — automatically submit training forms with trainer signature
                </p>

                {/* Status badge */}
                {connection && mode === "view" && (
                  <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                    {connection.isConfigComplete ? (
                      <>
                        <Check className="w-4 h-4 text-rf-success flex-shrink-0" />
                        <span className="text-rf-success font-medium">Configured</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rf-warning flex-shrink-0" />
                        <span className="text-rf-warning font-medium">Incomplete</span>
                      </>
                    )}
                    <span className="text-rf-text-muted">•</span>
                    <span className="text-rf-text-secondary text-xs">
                      {connection.trainerName || <em className="text-rf-text-muted not-italic">Trainer name not set</em>}
                    </span>
                    {!connection.isEnabled && (
                      <span className="ml-1 px-2 py-0.5 bg-rf-warning-bg text-rf-warning text-xs rounded-full border border-amber-200">
                        Disabled
                      </span>
                    )}
                  </div>
                )}

                {configIncomplete && mode === "view" && (
                  <p className="mt-1 text-xs text-rf-warning">
                    All fields, a signature, and a login password are required before submissions can be sent.
                  </p>
                )}
              </div>

              {/* Action buttons (view mode, connected) */}
              {connection && mode === "view" && (
                <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
                  <button
                    onClick={enterEdit}
                    className="px-3 py-2 text-sm font-medium text-rf-ink-700 bg-rf-surface-page border border-rf-border rounded-lg hover:bg-rf-surface-page transition-colors flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-3 py-2 text-sm font-medium text-red-700 bg-rf-danger-bg border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
              <div className="mt-5 pt-5 border-t border-rf-ink-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Trainer Name
                  </p>
                  <p className="text-sm text-rf-text-primary">
                    {connection.trainerName || <span className="text-rf-text-muted italic">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Trainer Email
                  </p>
                  <p className="text-sm text-rf-text-primary">
                    {connection.trainerEmail || <span className="text-rf-text-muted italic">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Trainer FedEx ID
                  </p>
                  <p className="text-sm font-mono text-rf-text-primary">
                    {connection.trainerFedexId || <span className="text-rf-text-muted italic not-italic font-sans">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Login Password
                  </p>
                  <p className="text-sm text-rf-text-primary">
                    {connection.hasPassword ? (
                      <span className="flex items-center gap-1.5 text-rf-ink-500">
                        <Lock className="w-3.5 h-3.5 text-rf-text-muted" />
                        ••••••••••••
                      </span>
                    ) : (
                      <span className="text-rf-text-muted italic">Not set</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Company Entity ID
                  </p>
                  <p className="text-sm font-mono text-rf-text-primary">
                    {connection.companyEntityId || <span className="text-rf-text-muted italic not-italic font-sans">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Company Name
                  </p>
                  <p className="text-sm text-rf-text-primary">
                    {connection.companyName || <span className="text-rf-text-muted italic">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-rf-text-secondary uppercase tracking-wide mb-1">
                    Signature
                  </p>
                  <p className="text-sm text-rf-text-primary">
                    {connection.hasSignature ? (
                      <span className="flex items-center gap-1.5 text-rf-success">
                        <Check className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    ) : (
                      <span className="text-rf-text-muted italic">Not set</span>
                    )}
                  </p>
                </div>

                {/* Enabled toggle */}
                <div className="sm:col-span-2 flex items-center gap-3 pt-2 border-t border-rf-ink-100">
                  <button
                    role="switch"
                    aria-checked={connection.isEnabled}
                    onClick={handleToggleEnabled}
                    disabled={togglingEnabled}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2 disabled:opacity-50 ${
                      connection.isEnabled ? "bg-rf-success" : "bg-rf-ink-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                        connection.isEnabled ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-rf-ink-700">
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
                className="mt-5 pt-5 border-t border-rf-ink-100 space-y-4"
              >
                {/* ── Trainer Info ── */}
                <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wide">
                  Trainer Info
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                      Trainer Full Name<span className="text-rf-danger ml-0.5">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Jane Smith"
                      value={trainerName}
                      onChange={(e) => setTrainerName(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                      Trainer Email<span className="text-rf-danger ml-0.5">*</span>
                    </label>
                    <Input
                      type="email"
                      placeholder="trainer@company.com"
                      value={trainerEmail}
                      onChange={(e) => setTrainerEmail(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                      Trainer FedEx ID<span className="text-rf-danger ml-0.5">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="FedEx contractor ID"
                      value={trainerFedexId}
                      onChange={(e) => setTrainerFedexId(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                      Site Password<span className="text-rf-danger ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={connection?.hasPassword ? "Enter to replace saved password" : "Enter site password"}
                        value={trainerPassword}
                        onChange={(e) => setTrainerPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rf-text-muted hover:text-rf-ink-500 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {connection?.hasPassword && (
                      <p className="mt-1 text-xs text-rf-text-muted">
                        Leave blank to keep the saved password.
                      </p>
                    )}
                    {!connection?.hasPassword && (
                      <p className="mt-1 text-xs text-rf-text-muted">
                        Used to log in to safetytrainer.kellyandersongroup.com
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Company/Contract Info ── */}
                <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wide pt-2">
                  Company / Contract Info
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                      Company Entity ID<span className="text-rf-danger ml-0.5">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. 12345"
                      value={companyEntityId}
                      onChange={(e) => setCompanyEntityId(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                      Company Name<span className="text-rf-danger ml-0.5">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Acme Logistics LLC"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>

                {/* ── Signature ── */}
                <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wide pt-2">
                  Trainer Signature
                  <span className="ml-1 text-red-400 normal-case font-normal">
                    (required)
                  </span>
                </p>
                <p className="text-xs text-rf-text-muted -mt-2">
                  Draw your signature in the box below, or upload a PNG/JPEG image of your signature.
                </p>
                <SignaturePad
                  hasExisting={!!connection?.hasSignature}
                  onSave={(dataUrl) => setNewSignatureDataUrl(dataUrl)}
                  onClear={() => setNewSignatureDataUrl(null)}
                />

                {/* Enabled toggle */}
                <div className="flex items-center gap-3 pt-2 border-t border-rf-ink-100">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() => setIsEnabled((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue ${
                        isEnabled ? "bg-rf-success" : "bg-rf-ink-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                          isEnabled ? "translate-x-4" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm text-rf-ink-700">
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
                  {connection && (
                    <Button
                      type="button"
                      variant="tertiary"
                      onClick={() => setMode("view")}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}
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
