"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Bold, Italic, List, Heading2 } from "lucide-react";

// ── Inline format renderer ───────────────────────────────────────────────────
// Renders **bold** and _italic_ markdown tokens as <strong> / <em>.
function renderFormattedText(text: string): ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|_.*?_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// ── Description parser (mirrors PublicApplicationForm) ────────────────────────
// Handles both inline ("TITLE: * a * b") and multiline ("* a\n* b") bullet formats.
// Also handles ## heading lines.
function parseDescription(text: string): {
  title: string;
  bullets: string[];
  footer: string;
} | null {
  let normalized = text;
  if (!text.includes("\n") && text.includes(" * ")) {
    normalized = text.replace(/ \* /g, "\n* ");
  }
  const lines = normalized.split("\n");
  const titleParts: string[] = [];
  const bullets: string[] = [];
  const footerParts: string[] = [];
  let seenBullet = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^##\s/.test(line)) {
      const headingText = line.replace(/^##\s+/, "");
      if (!seenBullet) {
        titleParts.push(headingText);
      } else {
        footerParts.push(headingText);
      }
    } else if (/^[*-]\s/.test(line)) {
      seenBullet = true;
      bullets.push(line.replace(/^[*-]\s+/, ""));
    } else if (!seenBullet) {
      titleParts.push(line);
    } else {
      footerParts.push(line);
    }
  }
  if (bullets.length === 0) return null;
  return {
    title: titleParts.join(" ").replace(/:$/, "").trim(),
    bullets,
    footer: footerParts.join(" ").trim(),
  };
}

function DescriptionPreview({ text }: { text: string }) {
  const parsed = parseDescription(text);

  if (!parsed) {
    return (
      <div className="rounded-xl border border-rf-ink-100 bg-rf-surface-page px-5 py-4">
        <p className="text-sm text-rf-text-secondary leading-relaxed whitespace-pre-line">{renderFormattedText(text)}</p>
      </div>
    );
  }

  const { title, bullets, footer } = parsed;
  return (
    <div className="rounded-xl border border-rf-ink-100 bg-rf-surface-page overflow-hidden">
      {title && (title.length <= 60 ? (
        <div className="flex items-center gap-2 px-5 py-3 border-b border-rf-ink-100">
          <svg
            className="w-4 h-4 text-rf-ink-500 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider text-rf-ink-500">
            {renderFormattedText(title)}
          </span>
        </div>
      ) : (
        <div className="px-5 pt-4 pb-1">
          <p className="text-sm text-rf-text-secondary leading-relaxed">{renderFormattedText(title)}</p>
        </div>
      ))}
      <ul className="px-5 py-4 space-y-3">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-rf-ink-700 leading-relaxed">
            <span className="mt-[5px] w-2 h-2 rounded-full bg-rf-blue/50 flex-shrink-0" />
            <span>{renderFormattedText(bullet)}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="px-5 pb-4 -mt-1">
          <p className="text-sm text-rf-text-secondary leading-relaxed">{renderFormattedText(footer)}</p>
        </div>
      )}
    </div>
  );
}

// ── Selection Toolbar ────────────────────────────────────────────────────────
// Floating toolbar that appears when text is selected in the description textarea.
function SelectionToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const mirrorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const measurePosition = useCallback(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      setShow(false);
      return;
    }

    // Build mirror content up to selection start using safe DOM methods
    const style = window.getComputedStyle(ta);
    mirror.style.font = style.font;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.wordSpacing = style.wordSpacing;
    mirror.style.padding = style.padding;
    mirror.style.width = ta.clientWidth + "px";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflowWrap = "break-word";
    mirror.style.lineHeight = style.lineHeight;

    const textBefore = value.slice(0, start);
    const selectedText = value.slice(start, end);
    // Clear mirror and rebuild with safe DOM methods
    while (mirror.firstChild) mirror.removeChild(mirror.firstChild);
    mirror.appendChild(document.createTextNode(textBefore));
    const marker = document.createElement("span");
    marker.textContent = selectedText || "\u200b";
    mirror.appendChild(marker);

    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    // Position above the selection, centered
    const top = markerRect.top - mirrorRect.top - 44 - ta.scrollTop;
    const left = Math.max(
      8,
      Math.min(
        markerRect.left - mirrorRect.left + markerRect.width / 2 - 80,
        ta.clientWidth - 168
      )
    );

    setPos({ top, left });
    setShow(true);
  }, [textareaRef, value]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handleSelect = () => measurePosition();
    const handleBlur = (e: FocusEvent) => {
      if (toolbarRef.current?.contains(e.relatedTarget as Node)) return;
      setShow(false);
    };
    ta.addEventListener("select", handleSelect);
    ta.addEventListener("mouseup", handleSelect);
    ta.addEventListener("keyup", handleSelect);
    ta.addEventListener("blur", handleBlur);
    return () => {
      ta.removeEventListener("select", handleSelect);
      ta.removeEventListener("mouseup", handleSelect);
      ta.removeEventListener("keyup", handleSelect);
      ta.removeEventListener("blur", handleBlur);
    };
  }, [textareaRef, measurePosition]);

  const applyFormat = (type: "bold" | "italic" | "bullet" | "heading") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value;
    let newText = text;
    let cursorPos = end;

    if (type === "bold") {
      if (start === end) {
        newText = text.slice(0, start) + "****" + text.slice(end);
        cursorPos = start + 2;
      } else {
        newText = text.slice(0, start) + "**" + text.slice(start, end) + "**" + text.slice(end);
        cursorPos = end + 4;
      }
    } else if (type === "italic") {
      if (start === end) {
        newText = text.slice(0, start) + "__" + text.slice(end);
        cursorPos = start + 1;
      } else {
        newText = text.slice(0, start) + "_" + text.slice(start, end) + "_" + text.slice(end);
        cursorPos = end + 2;
      }
    } else if (type === "bullet" || type === "heading") {
      const prefix = type === "bullet" ? "* " : "## ";
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const linePrefix = text.slice(lineStart, lineStart + prefix.length);
      if (linePrefix === prefix) {
        newText = text.slice(0, lineStart) + text.slice(lineStart + prefix.length);
        cursorPos = Math.max(start - prefix.length, lineStart);
      } else {
        newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
        cursorPos = start + prefix.length;
      }
    }

    onChange(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  };

  const btnCls =
    "p-1.5 rounded-md hover:bg-white/20 transition-colors text-white/90 hover:text-white";

  return (
    <>
      {/* Hidden mirror div for position measurement */}
      <div
        ref={mirrorRef}
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      {show && (
        <div
          ref={toolbarRef}
          className="absolute z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
          style={{ top: pos.top, left: pos.left, backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.15)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            className={btnCls}
            title="Bold (**text**)"
            onClick={() => applyFormat("bold")}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            className={btnCls}
            title="Italic (_text_)"
            onClick={() => applyFormat("italic")}
          >
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <button
            className={btnCls}
            title="Bullet list (* item)"
            onClick={() => applyFormat("bullet")}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            className={btnCls}
            title="Heading (## text)"
            onClick={() => applyFormat("heading")}
          >
            <Heading2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
import {
  createFormField,
  updateFormField,
  deleteFormField,
  updateFormMeta,
  reconcileSyncedColumns,
  reorderFormFields,
} from "./actions";
import FieldCard from "./FieldCard";
import FieldTypePicker from "./FieldTypePicker";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import QuestionSettingsPanel from "./QuestionSettingsPanel";
import FormBuilderSidebar from "./FormBuilderSidebar";
import DesignPanel, { DesignSettings } from "./DesignPanel";
import SettingsPanel, { FormSettingsType } from "./SettingsPanel";
import Toast from "./Toast";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  settings: Record<string, any>;
};

type Form = {
  id: string;
  public_token: string;
  title: string;
  description: string;
  settings: Record<string, any> | null;
};

type ActiveTab = "edit" | "design" | "settings";

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "design", label: "Design" },
  { id: "settings", label: "Settings" },
];

export default function FormBuilder({
  companyId,
  jobId,
  form,
  fields: initialFields,
  jobTitle,
  logoSignedUrl = "",
}: {
  companyId: string;
  jobId: string;
  form: Form;
  fields: FormField[];
  jobTitle: string;
  /** Fresh 1-hour signed URL generated server-side from the stored logoPath. */
  logoSignedUrl?: string;
}) {
  const confirm = useConfirmDialog();
  const toast = useToast();

  // ─── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("edit");

  // ─── Fields state ─────────────────────────────────────────────────────────
  const [fields, setFields] = useState(initialFields);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [addFieldAt, setAddFieldAt] = useState<number | null>(null);

  // ─── Public URL ───────────────────────────────────────────────────────────
  const [publicUrl, setPublicUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublicUrl(
        `${window.location.origin}/apply/${jobId}/${form.public_token}`
      );
    }
  }, [jobId, form.public_token]);

  // ─── Toast ────────────────────────────────────────────────────────────────
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Copied!");

  const showCopiedToast = (msg = "Copied!") => {
    setToastMessage(msg);
    setShowToast(true);
  };

  // ─── Sync reconcile ───────────────────────────────────────────────────────
  // Runs whenever sync is ON to guarantee every question has a board column.
  const runReconcile = async () => {
    try {
      const { created, linked } = await reconcileSyncedColumns(
        companyId,
        jobId,
        form.id
      );
      const total = created + linked;
      if (total > 0) {
        showCopiedToast(
          `Sync restored ${total} missing board column${total === 1 ? "" : "s"}`
        );
      }
    } catch {
      // Non-fatal — silently ignore reconcile errors to avoid blocking UX
    }
  };

  // Run once on mount when sync is already enabled
  useEffect(() => {
    if (formSettings.syncQuestions) {
      runReconcile();
    }
    // Only on initial mount — formSettings is stable at this point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Share modal ──────────────────────────────────────────────────────────
  const [showShareModal, setShowShareModal] = useState(false);

  // ─── Form title / description (inline-editable) ───────────────────────────
  const [formTitle, setFormTitle] = useState(form.title || "Application Form");
  const [formDescription, setFormDescription] = useState(form.description || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      const el = descriptionRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      el.focus();
    }
  }, [isEditingDescription]);

  const handleTitleSave = async () => {
    const trimmed = formTitle.trim();
    if (!trimmed) {
      setFormTitle(form.title || "Application Form");
      setIsEditingTitle(false);
      return;
    }
    setIsEditingTitle(false);
    if (trimmed !== form.title) {
      await updateFormMeta(companyId, jobId, form.id, { title: trimmed });
    }
  };

  const handleDescriptionSave = async () => {
    setIsEditingDescription(false);
    if (formDescription !== (form.description || "")) {
      await updateFormMeta(companyId, jobId, form.id, {
        description: formDescription,
      });
    }
  };

  // ─── Settings (design + form) ─────────────────────────────────────────────
  // Keep a merged copy of the full settings object so writes never lose keys.
  const initialSettings = form.settings || {};

  const [currentSettings, setCurrentSettings] = useState<Record<string, any>>(initialSettings);

  const [designSettings, setDesignSettings] = useState<DesignSettings>({
    backgroundColor: initialSettings.design?.backgroundColor ?? "#f9fafb",
    // logoPath is the persistent storage key (saved to DB).
    // logoUrl is ephemeral (signed URL, not saved); we seed it from the
    // server-generated prop so it's always valid on first render.
    logoPath: initialSettings.design?.logoPath ?? "",
    logoUrl: logoSignedUrl,
  });

  const [formSettings, setFormSettings] = useState<FormSettingsType>({
    tags: initialSettings.tags ?? [],
    syncQuestions: initialSettings.syncQuestions ?? true,
  });

  const handleDesignChange = async (newDesign: DesignSettings) => {
    setDesignSettings(newDesign);
    // Only persist stable values: backgroundColor and logoPath.
    // logoUrl is a short-lived signed URL — storing it in the DB would be
    // misleading once it expires (typically after 1 hour).
    const persistDesign = {
      backgroundColor: newDesign.backgroundColor,
      logoPath: newDesign.logoPath,
    };
    const merged = { ...currentSettings, design: persistDesign };
    setCurrentSettings(merged);
    await updateFormMeta(companyId, jobId, form.id, { settings: merged });
  };

  const handleFormSettingsChange = async (newFs: FormSettingsType) => {
    const syncToggledOn = newFs.syncQuestions && !formSettings.syncQuestions;
    setFormSettings(newFs);
    const merged = {
      ...currentSettings,
      tags: newFs.tags,
      syncQuestions: newFs.syncQuestions,
    };
    setCurrentSettings(merged);
    await updateFormMeta(companyId, jobId, form.id, { settings: merged });

    // When the user turns sync ON, immediately repair any missing board columns
    if (syncToggledOn) {
      await runReconcile();
    }
  };

  // ─── Field operations ─────────────────────────────────────────────────────
  const handleAddFieldType = async (type: string) => {
    const defaultLabels: Record<string, string> = {
      text: "Short Answer",
      textarea: "Long Answer",
      email: "Email Address",
      phone: "Phone Number",
      number: "Number",
      date: "Date",
      file: "Upload File",
      radio: "Choose One",
      checkbox: "Select All That Apply",
      select: "Select from Dropdown",
      location: "Home Address",
    };

    try {
      const label = defaultLabels[type] || "New Question";
      const key = `${type}_${Date.now()}`.toLowerCase();
      const newField = await createFormField(companyId, jobId, form.id, {
        key,
        label,
        type,
        required: false,
      });
      setFields([...fields, newField]);
      setAddFieldAt(null);
      setSelectedFieldId(newField.id);
    } catch {
      toast.error("Failed to create field");
    }
  };

  const handleUpdateField = async (
    fieldId: string,
    updates: Partial<FormField>
  ) => {
    try {
      await updateFormField(
        companyId,
        jobId,
        fieldId,
        updates,
        formSettings.syncQuestions
      );
      setFields(fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
    } catch {
      toast.error("Failed to update field");
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (
      !await confirm({
        title: "Delete Field",
        description: "This will hide the field but preserve existing applicant data.",
        confirmLabel: "Delete",
        variant: "destructive",
      })
    )
      return;
    try {
      await deleteFormField(companyId, jobId, fieldId);
      setFields(fields.filter((f) => f.id !== fieldId));
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
        setShowSettingsPanel(false);
      }
    } catch {
      toast.error("Failed to delete field");
    }
  };

  const handleDuplicateField = async (fieldId: string) => {
    const src = fields.find((f) => f.id === fieldId);
    if (!src) return;
    try {
      const newField = await createFormField(companyId, jobId, form.id, {
        key: `${src.key}_copy_${Date.now()}`,
        label: `${src.label} (Copy)`,
        type: src.type,
        required: src.required,
        settings: { ...src.settings },
      });
      setFields([...fields, newField]);
      setSelectedFieldId(newField.id);
    } catch {
      toast.error("Failed to duplicate field");
    }
  };

  const handleReorderFields = async (reorderedFields: FormField[]) => {
    // Optimistically update local state immediately
    setFields(reorderedFields);
    try {
      await reorderFormFields(companyId, jobId, reorderedFields.map((f) => f.id));
    } catch {
      // Revert on failure
      setFields(fields);
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <div className="bg-rf-surface-card border-b border-rf-border px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        {/* Left: breadcrumb-style label */}
        <div className="flex-shrink-0 min-w-0">
          <h1 className="text-base font-semibold text-rf-ink-900 truncate">
            Application Form
          </h1>
          <p className="text-xs text-rf-text-muted truncate">{jobTitle}</p>
        </div>

        {/* Center: tab switcher */}
        <div className="flex items-center bg-rf-ink-100 rounded-lg p-1 gap-0.5 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? "bg-rf-surface-card text-rf-ink-900 shadow-sm"
                  : "text-rf-text-muted hover:text-rf-ink-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Preview + Share Form */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => publicUrl && window.open(publicUrl, "_blank")}
            disabled={!publicUrl}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-rf-ink-700 border border-rf-border rounded-md hover:bg-rf-surface-page disabled:opacity-40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-md hover:bg-rf-blue-dark transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Form
          </button>
        </div>
      </div>

      {/* ── Main body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <FormBuilderSidebar
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={(id) => {
            setSelectedFieldId(id);
            document
              .getElementById(`field-${id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onReorder={handleReorderFields}
        />

        {/* Canvas — full-page background driven by design settings, matching live page */}
        <div
          className="flex-1 overflow-auto p-6"
          style={{ backgroundColor: designSettings.backgroundColor }}
        >
          <div className="max-w-2xl mx-auto">
            {/* Form header card — two-section layout matching the live apply page:
                 top section: logo + title (border-b divider)
                 bottom section: description (inline-editable) */}
            <div className="mb-5 bg-rf-surface-card rounded-2xl border border-rf-border shadow-[0_2px_16px_rgba(0,0,0,0.08)] overflow-hidden">

              {/* Header section: logo + title */}
              <div className="px-8 pt-8 pb-6 border-b border-rf-ink-100">
                {designSettings.logoUrl && (
                  <img
                    src={designSettings.logoUrl}
                    alt="Form logo"
                    className="max-h-10 object-contain mb-5"
                  />
                )}
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      else if (e.key === "Escape") {
                        setFormTitle(form.title || "Application Form");
                        setIsEditingTitle(false);
                      }
                    }}
                    className="w-full text-2xl font-bold text-rf-text-primary leading-tight border-b-2 border-rf-blue focus:outline-none bg-transparent pb-0.5"
                  />
                ) : (
                  <div
                    className="group/title flex items-center gap-2 cursor-text"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    <h2 className="text-2xl font-bold text-rf-text-primary leading-tight">
                      {formTitle}
                    </h2>
                    <svg
                      className="w-4 h-4 text-rf-text-muted opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Description section — styled preview + auto-growing editor */}
              <div className="px-8 pb-7">
                {isEditingDescription ? (
                  <div className="rounded-xl border border-rf-blue/40 bg-rf-blue-tint/30 overflow-hidden ring-2 ring-rf-blue/15">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-rf-blue-tint border-b border-rf-blue/20">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-rf-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5" />
                        </svg>
                        <span className="text-xs font-semibold text-rf-blue">Description</span>
                      </div>
                      <span className="text-xs text-rf-text-muted">Esc to cancel · click outside to save</span>
                    </div>
                    <div className="relative">
                      <SelectionToolbar
                        textareaRef={descriptionRef}
                        value={formDescription}
                        onChange={(v) => {
                          setFormDescription(v);
                          requestAnimationFrame(() => {
                            const el = descriptionRef.current;
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = el.scrollHeight + "px";
                            }
                          });
                        }}
                      />
                      <textarea
                        ref={descriptionRef}
                        value={formDescription}
                        onChange={(e) => {
                          setFormDescription(e.target.value);
                          e.currentTarget.style.height = "auto";
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
                        }}
                        onBlur={handleDescriptionSave}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setFormDescription(form.description || "");
                            setIsEditingDescription(false);
                          }
                        }}
                        placeholder={"Add requirements or a description for applicants…\n\nTip: use * to create bullets:\nVEHICLE REQUIREMENTS: * Must be 18+ * Valid driver's license"}
                        className="w-full text-sm text-rf-text-secondary leading-relaxed px-4 py-3.5 focus:outline-none bg-transparent resize-none min-h-[100px] placeholder:text-rf-text-muted/60"
                        style={{ height: "auto" }}
                      />
                    </div>
                    <div className="px-4 py-2.5 border-t border-rf-blue/15 flex items-center justify-between">
                      <span className="text-xs text-rf-text-muted">
                        Select text for formatting · <code className="font-mono bg-rf-blue-tint px-1.5 py-0.5 rounded text-rf-blue">* bullet</code> · <code className="font-mono bg-rf-blue-tint px-1.5 py-0.5 rounded text-rf-blue">**bold**</code>
                      </span>
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleDescriptionSave();
                        }}
                        className="text-xs font-semibold text-rf-blue hover:text-rf-blue-dark transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : formDescription ? (
                  <div
                    className="group/desc relative cursor-text"
                    onClick={() => setIsEditingDescription(true)}
                  >
                    <DescriptionPreview text={formDescription} />
                    <div className="absolute inset-0 rounded-xl ring-0 group-hover/desc:ring-2 group-hover/desc:ring-rf-blue/25 transition-all pointer-events-none" />
                    <div className="absolute top-2 right-2 opacity-0 group-hover/desc:opacity-100 transition-opacity">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-rf-surface-card border border-rf-border rounded-md text-xs font-medium text-rf-text-secondary shadow-sm">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Edit
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="w-full text-left group/desc px-5 py-4 rounded-xl border-2 border-dashed border-rf-ink-100 hover:border-rf-blue/40 hover:bg-rf-blue-tint/20 transition-all"
                  >
                    <div className="flex items-center gap-2 text-rf-text-muted group-hover/desc:text-rf-blue transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-sm font-medium">Add description or requirements</span>
                    </div>
                    <p className="text-xs text-rf-text-muted mt-1.5 ml-6">
                      Supports bullet points. Shown to applicants above the form fields.
                    </p>
                  </button>
                )}
              </div>

            </div>

            {/* Field Cards */}
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} id={`field-${field.id}`}>
                  <FieldCard
                    field={field}
                    isSelected={selectedFieldId === field.id}
                    onSelect={() => setSelectedFieldId(field.id)}
                    onUpdate={(updates) => handleUpdateField(field.id, updates)}
                    onDelete={() => handleDeleteField(field.id)}
                    onDuplicate={() => handleDuplicateField(field.id)}
                    onOpenSettings={() => {
                      setSelectedFieldId(field.id);
                      setShowSettingsPanel(true);
                      setActiveTab("edit");
                    }}
                  />

                  {addFieldAt === index && (
                    <div className="my-4">
                      <FieldTypePicker
                        onSelect={handleAddFieldType}
                        onCancel={() => setAddFieldAt(null)}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Add field at end */}
              {addFieldAt === fields.length ? (
                <div className="mt-4">
                  <FieldTypePicker
                    onSelect={handleAddFieldType}
                    onCancel={() => setAddFieldAt(null)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddFieldAt(fields.length)}
                  className="w-full px-6 py-4 border-2 border-dashed border-rf-border rounded-2xl text-rf-text-secondary hover:border-rf-blue-tint hover:text-rf-blue hover:bg-rf-blue-tint/50 transition-all text-sm font-medium"
                >
                  + Add Question
                </button>
              )}
            </div>

            {/* Empty state */}
            {fields.length === 0 && addFieldAt === null && (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-16 w-16 text-rf-border mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-rf-ink-900 mb-2">
                  No questions yet
                </h3>
                <p className="text-sm text-rf-text-muted mb-6">
                  Start building your form by adding questions
                </p>
                <button
                  onClick={() => setAddFieldAt(0)}
                  className="px-6 py-3 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark font-medium"
                >
                  Add Your First Question
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — context-dependent */}
        {activeTab === "edit" && showSettingsPanel && selectedField && (
          <QuestionSettingsPanel
            field={selectedField}
            onUpdate={(updates) => handleUpdateField(selectedField.id, updates)}
            onClose={() => setShowSettingsPanel(false)}
          />
        )}
        {activeTab === "design" && (
          <DesignPanel
            companyId={companyId}
            formId={form.id}
            designSettings={designSettings}
            onChange={handleDesignChange}
          />
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            formSettings={formSettings}
            publicUrl={publicUrl}
            onChange={handleFormSettingsChange}
            onCopyLink={(url) => {
              navigator.clipboard.writeText(url);
              showCopiedToast("Link copied to clipboard");
            }}
          />
        )}
      </div>

      {/* ── Share Modal ────────────────────────────────────────────────────── */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-rf-ink-900/20 flex items-center justify-center z-50"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-rf-surface-card rounded-xl shadow-2xl max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-rf-border flex items-center justify-between">
              <h3 className="text-xl font-semibold text-rf-ink-900">Share Form</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-rf-text-muted hover:text-rf-text-secondary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-rf-text-secondary mb-4">
                This form is public and available to anyone with the link.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicUrl}
                  readOnly
                  onChange={() => {}}
                  className="flex-1 px-4 py-2.5 border border-rf-border rounded-lg bg-rf-surface-page text-sm font-mono text-rf-ink-700 focus:outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    showCopiedToast("Form link copied to clipboard");
                    setShowShareModal(false);
                  }}
                  disabled={!publicUrl}
                  className="px-5 py-2.5 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark font-medium whitespace-nowrap disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {showToast && (
        <Toast message={toastMessage} onClose={() => setShowToast(false)} />
      )}
    </div>
  );
}
