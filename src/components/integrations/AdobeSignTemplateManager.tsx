"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  FileText,
  ChevronDown,
  Users,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import {
  getEsignTemplates,
  saveEsignTemplate,
  deleteEsignTemplate,
  listAdobeSignLibraryDocs,
  getLibraryDocFieldsList,
  type EsignTemplateData,
  type FieldMapping,
  type SignerConfig,
} from "./adobe-sign-actions";

interface Props {
  companyId: string;
}

type EditorMode = "list" | "create" | "edit";

export function AdobeSignTemplateManager({ companyId }: Props) {
  const confirm = useConfirmDialog();
  const toast = useToast();

  const [templates, setTemplates] = useState<EsignTemplateData[]>([]);
  const [mode, setMode] = useState<EditorMode>("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [selectedLibDoc, setSelectedLibDoc] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [signers, setSigners] = useState<SignerConfig[]>([
    { order: 1, role: "SIGNER", label: "Applicant", emailSource: "column", columnName: "" },
  ]);
  const [adobeFields, setAdobeFields] = useState<
    { name: string; displayLabel: string }[]
  >([]);

  // Library documents from Adobe Sign
  const [libraryDocs, setLibraryDocs] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, [companyId]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await getEsignTemplates(companyId);
      setTemplates(data);
    } catch (err: any) {
      toast.error(`Failed to load templates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadLibraryDocs() {
    setLoadingDocs(true);
    try {
      const docs = await listAdobeSignLibraryDocs(companyId);
      setLibraryDocs(docs);
    } catch (err: any) {
      toast.error(`Failed to load Adobe Sign templates: ${err.message}`);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadFields(libDocId: string) {
    setLoadingFields(true);
    try {
      const fields = await getLibraryDocFieldsList(companyId, libDocId);
      setAdobeFields(fields);
      // Auto-create field mappings for each field
      setFieldMappings(
        fields.map((f: any) => ({
          adobeFieldName: f.name,
          source: "column" as const,
          columnName: "",
          staticValue: "",
        }))
      );
    } catch (err: any) {
      toast.error(`Failed to load form fields: ${err.message}`);
      setAdobeFields([]);
    } finally {
      setLoadingFields(false);
    }
  }

  // ── Create / Edit ─────────────────────────────────────────────────────────

  function startCreate() {
    setEditingId(null);
    setDisplayName("");
    setSelectedLibDoc(null);
    setFieldMappings([]);
    setSigners([
      { order: 1, role: "SIGNER", label: "Applicant", emailSource: "column", columnName: "" },
    ]);
    setAdobeFields([]);
    setMode("create");
    loadLibraryDocs();
  }

  function startEdit(template: EsignTemplateData) {
    setEditingId(template.id);
    setDisplayName(template.displayName);
    setSelectedLibDoc({
      id: template.libraryDocumentId,
      name: template.libraryDocumentName,
    });
    setFieldMappings(template.fieldMappings);
    setSigners(
      template.signers.length > 0
        ? template.signers
        : [{ order: 1, role: "SIGNER", label: "Applicant", emailSource: "column", columnName: "" }]
    );
    // Don't re-fetch fields on edit — use existing mappings
    setAdobeFields(
      template.fieldMappings.map((m) => ({
        name: m.adobeFieldName,
        displayLabel: m.adobeFieldName,
      }))
    );
    setMode("edit");
  }

  function cancelEdit() {
    setMode("list");
    setEditingId(null);
  }

  async function handleSave() {
    if (!selectedLibDoc) {
      toast.error("Select an Adobe Sign template");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Enter a display name");
      return;
    }

    setSaving(true);
    try {
      await saveEsignTemplate(companyId, {
        id: editingId || undefined,
        libraryDocumentId: selectedLibDoc.id,
        libraryDocumentName: selectedLibDoc.name,
        displayName: displayName.trim(),
        fieldMappings,
        signers,
      });
      toast.success(editingId ? "Template updated" : "Template created");
      setMode("list");
      setEditingId(null);
      await loadTemplates();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(template: EsignTemplateData) {
    if (
      !(await confirm({
        title: "Delete Template",
        description: `Delete "${template.displayName}"? Automations using this template will fail.`,
        confirmLabel: "Delete",
        variant: "destructive",
      }))
    )
      return;

    try {
      await deleteEsignTemplate(companyId, template.id);
      toast.success("Template deleted");
      await loadTemplates();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  }

  // ── Field mapping helpers ─────────────────────────────────────────────────

  function updateFieldMapping(index: number, updates: Partial<FieldMapping>) {
    setFieldMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...updates } : m))
    );
  }

  function updateSigner(index: number, updates: Partial<SignerConfig>) {
    setSigners((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  }

  function addSigner() {
    setSigners((prev) => [
      ...prev,
      {
        order: prev.length + 1,
        role: "SIGNER",
        label: "",
        emailSource: "static",
        staticEmail: "",
        columnName: "",
      },
    ]);
  }

  function removeSigner(index: number) {
    setSigners((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, order: i + 1 }))
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mt-3 p-4 border border-rf-border rounded-lg bg-rf-surface-card">
        <div className="flex items-center gap-2 text-sm text-rf-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading templates...
        </div>
      </div>
    );
  }

  // ── List mode ───────────────────────────────────────────────────────────────
  if (mode === "list") {
    return (
      <div className="mt-3 border border-rf-border rounded-lg bg-rf-surface-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rf-border">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-rf-text-muted" />
            <span className="text-sm font-medium text-rf-text-primary">
              eSign Templates
            </span>
            <span className="text-xs text-rf-text-muted">
              ({templates.length})
            </span>
          </div>
          <Button variant="tertiary" onClick={startCreate}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-rf-text-muted">
            No eSign templates configured yet. Add one to use in automations.
          </div>
        ) : (
          <div className="divide-y divide-rf-border">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-rf-muted/30 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-rf-text-primary">
                    {t.displayName}
                  </p>
                  <p className="text-xs text-rf-text-muted">
                    {t.libraryDocumentName} &middot;{" "}
                    {t.fieldMappings.length} fields &middot;{" "}
                    {t.signers.length} signer{t.signers.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(t)}
                    className="p-1.5 hover:bg-rf-muted rounded"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5 text-rf-text-muted" />
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="p-1.5 hover:bg-rf-danger-bg rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rf-danger" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Create / Edit mode ──────────────────────────────────────────────────────
  return (
    <div className="mt-3 border border-rf-border rounded-lg bg-rf-surface-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rf-border">
        <span className="text-sm font-medium text-rf-text-primary">
          {editingId ? "Edit Template" : "New eSign Template"}
        </span>
        <button onClick={cancelEdit} className="p-1 hover:bg-rf-muted rounded">
          <X className="w-4 h-4 text-rf-text-muted" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Display name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-rf-text-muted uppercase tracking-wider">
            Template Name
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., AVP Vehicle Agreement"
          />
        </div>

        {/* Adobe Sign library document selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-rf-text-muted uppercase tracking-wider">
            Adobe Sign Document
          </label>
          {mode === "edit" && selectedLibDoc ? (
            <p className="text-sm text-rf-text-primary">
              {selectedLibDoc.name}
            </p>
          ) : (
            <div>
              {loadingDocs ? (
                <div className="flex items-center gap-2 text-sm text-rf-text-muted py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading documents from Adobe Sign...
                </div>
              ) : (
                <select
                  value={selectedLibDoc?.id || ""}
                  onChange={(e) => {
                    const doc = libraryDocs.find((d) => d.id === e.target.value);
                    if (doc) {
                      setSelectedLibDoc(doc);
                      loadFields(doc.id);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-rf-border rounded-lg bg-rf-surface-card focus:outline-none focus:ring-2 focus:ring-rf-blue"
                >
                  <option value="">Select a document...</option>
                  {libraryDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Signers section */}
        {selectedLibDoc && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-rf-text-muted" />
                <label className="text-xs font-medium text-rf-text-muted uppercase tracking-wider">
                  Signers
                </label>
              </div>
              <button
                onClick={addSigner}
                className="text-xs text-rf-blue hover:text-rf-blue-dark flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Signer
              </button>
            </div>

            <div className="space-y-2">
              {signers.map((signer, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 bg-rf-muted/30 rounded-lg"
                >
                  <span className="text-xs text-rf-text-muted mt-2 w-4 shrink-0">
                    {signer.order}.
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={signer.label}
                        onChange={(e) =>
                          updateSigner(i, { label: e.target.value })
                        }
                        placeholder="Label (e.g., Applicant)"
                        className="flex-1 text-sm"
                      />
                      <select
                        value={signer.role}
                        onChange={(e) =>
                          updateSigner(i, {
                            role: e.target.value as "SIGNER" | "APPROVER",
                          })
                        }
                        className="px-2 py-1.5 text-xs border border-rf-border rounded bg-rf-surface-card"
                      >
                        <option value="SIGNER">Signer</option>
                        <option value="APPROVER">Approver</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={signer.emailSource}
                        onChange={(e) =>
                          updateSigner(i, {
                            emailSource: e.target.value as
                              | "column"
                              | "static"
                              | "applicant_email",
                          })
                        }
                        className="px-2 py-1.5 text-xs border border-rf-border rounded bg-rf-surface-card shrink-0"
                      >
                        <option value="applicant_email">
                          Applicant&apos;s email
                        </option>
                        <option value="column">Board column</option>
                        <option value="static">Fixed email</option>
                      </select>
                      {signer.emailSource === "column" && (
                        <Input
                          value={(signer as any).columnName || ""}
                          onChange={(e) =>
                            updateSigner(i, {
                              columnName: e.target.value,
                            } as any)
                          }
                          placeholder="Column name (e.g., Manager Email)"
                          className="flex-1 text-sm"
                        />
                      )}
                      {signer.emailSource === "static" && (
                        <Input
                          value={signer.staticEmail || ""}
                          onChange={(e) =>
                            updateSigner(i, { staticEmail: e.target.value })
                          }
                          placeholder="email@example.com"
                          className="flex-1 text-sm"
                        />
                      )}
                    </div>
                  </div>
                  {signers.length > 1 && (
                    <button
                      onClick={() => removeSigner(i)}
                      className="p-1 mt-1 hover:bg-rf-danger-bg rounded"
                    >
                      <X className="w-3.5 h-3.5 text-rf-danger" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Field mappings section */}
        {selectedLibDoc && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-rf-text-muted" />
              <label className="text-xs font-medium text-rf-text-muted uppercase tracking-wider">
                Field Mappings
              </label>
            </div>

            {loadingFields ? (
              <div className="flex items-center gap-2 text-sm text-rf-text-muted py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading form fields...
              </div>
            ) : fieldMappings.length === 0 ? (
              <p className="text-sm text-rf-text-muted py-2">
                {mode === "edit"
                  ? "No field mappings configured."
                  : "Select an Adobe Sign document to see its form fields."}
              </p>
            ) : (
              <div className="space-y-2">
                {fieldMappings.map((mapping, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 bg-rf-muted/30 rounded-lg"
                  >
                    <span className="text-xs font-mono text-rf-text-secondary w-36 shrink-0 truncate" title={mapping.adobeFieldName}>
                      {mapping.adobeFieldName}
                    </span>
                    <span className="text-xs text-rf-text-muted shrink-0">
                      &larr;
                    </span>
                    <select
                      value={mapping.source}
                      onChange={(e) =>
                        updateFieldMapping(i, {
                          source: e.target.value as "column" | "static",
                        })
                      }
                      className="px-2 py-1 text-xs border border-rf-border rounded bg-rf-surface-card shrink-0"
                    >
                      <option value="column">Board column</option>
                      <option value="static">Static value</option>
                    </select>
                    {mapping.source === "column" ? (
                      <Input
                        value={(mapping as any).columnName || ""}
                        onChange={(e) =>
                          updateFieldMapping(i, {
                            columnName: e.target.value,
                          } as any)
                        }
                        placeholder="Column name"
                        className="flex-1 text-sm"
                      />
                    ) : (
                      <Input
                        value={mapping.staticValue || ""}
                        onChange={(e) =>
                          updateFieldMapping(i, {
                            staticValue: e.target.value,
                          })
                        }
                        placeholder="Fixed value"
                        className="flex-1 text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Save / Cancel buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-rf-border">
          <Button variant="tertiary" onClick={cancelEdit}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !selectedLibDoc || !displayName.trim()}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1" />
            )}
            {editingId ? "Update" : "Save"} Template
          </Button>
        </div>
      </div>
    </div>
  );
}
