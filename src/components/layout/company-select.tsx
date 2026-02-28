"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, MoreVertical } from "lucide-react";
import type { Company } from "@/lib/types";
import { renameCompany, duplicateCompany, deleteCompany } from "./company-actions";
import { RenameModal } from "@/components/modals/rename-modal";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";
import { DuplicateCompanyModal } from "@/components/modals/duplicate-company-modal";

interface CompanySelectProps {
  companies: Company[];
  currentCompanyId: string;
  canCreateCompany: boolean;
  onCreateCompany: () => void;
  accountId: string;
  userRole: string;
  variant?: "light" | "dark";
}

export function CompanySelect({
  companies,
  currentCompanyId,
  canCreateCompany,
  onCreateCompany,
  accountId,
  userRole,
  variant = "light",
}: CompanySelectProps) {
  const [open, setOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const handleCompanyChange = async (companyId: string) => {
    setOpen(false);
    // Route to the company's default applicants board
    // We'll fetch the first job and redirect there
    router.push(`/dashboard/${companyId}`);
  };

  // Company Actions Handlers
  const openRenameModal = (company: Company) => {
    setSelectedCompany(company);
    setRenameModalOpen(true);
    setCompanyMenuOpen(null);
  };

  const openDuplicateModal = (company: Company) => {
    setSelectedCompany(company);
    setDuplicateModalOpen(true);
    setCompanyMenuOpen(null);
  };

  const openDeleteModal = (company: Company) => {
    setSelectedCompany(company);
    setDeleteModalOpen(true);
    setCompanyMenuOpen(null);
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!selectedCompany) return { error: "No company selected" };
    return await renameCompany(selectedCompany.id, newName);
  };

  const handleDuplicateSubmit = async (includeJobs: boolean) => {
    if (!selectedCompany) return { error: "No company selected" };
    const result = await duplicateCompany(selectedCompany.id, includeJobs);
    if (result.success && result.companyId) {
      // Navigate to the new company
      router.push(`/dashboard/${result.companyId}`);
    }
    return result;
  };

  const handleDeleteSubmit = async () => {
    if (!selectedCompany) return { error: "No company selected" };
    const result = await deleteCompany(selectedCompany.id);
    if (result.success) {
      // After delete, redirect to first available company or dashboard
      const remainingCompanies = companies.filter(c => c.id !== selectedCompany.id);
      if (remainingCompanies.length > 0) {
        router.push(`/dashboard/${remainingCompanies[0].id}`);
      } else {
        router.push(`/dashboard`);
      }
    }
    return result;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-2 ${
          variant === "dark"
            ? "border-white/[0.15] bg-white/[0.08] text-white hover:bg-white/[0.12]"
            : "border-rf-border bg-rf-surface-card text-rf-ink-700 hover:bg-rf-surface-page"
        }`}
      >
        <span>{currentCompany?.name || "Select company"}</span>
        <ChevronDown className={`h-4 w-4 ${variant === "dark" ? "text-white/40" : "text-rf-text-muted"}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-rf-border bg-rf-surface-card shadow-lg z-20">
            <div className="py-1 max-h-64 overflow-y-auto">
              {companies.map((company) => (
                <div key={company.id} className="relative group">
                  {/* Kebab button on LEFT */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompanyMenuOpen(company.id);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-rf-ink-100 rounded transition-opacity z-10"
                  >
                    <MoreVertical className="h-3 w-3 text-rf-ink-500" />
                  </button>

                  {/* Company button */}
                  <button
                    onClick={() => handleCompanyChange(company.id)}
                    className={`w-full text-left px-4 py-2 pl-10 text-sm transition-colors ${
                      company.id === currentCompanyId
                        ? "bg-rf-ink-100 text-rf-text-primary font-medium"
                        : "text-rf-ink-700 hover:bg-rf-surface-page"
                    }`}
                  >
                    {company.name}
                  </button>

                  {/* Dropdown menu */}
                  {companyMenuOpen === company.id && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setCompanyMenuOpen(null)}
                      />
                      <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-rf-border bg-rf-surface-card shadow-lg z-40">
                        <div className="py-1">
                          <button
                            onClick={() => openRenameModal(company)}
                            disabled={isPending || userRole === "viewer"}
                            className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => openDuplicateModal(company)}
                            disabled={isPending || userRole === "viewer"}
                            className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Duplicate
                          </button>
                          <div className="my-1 border-t border-rf-ink-100" />
                          <button
                            onClick={() => openDeleteModal(company)}
                            disabled={isPending || userRole !== "admin"}
                            className="w-full text-left px-4 py-2 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete {userRole !== "admin" && "(Admin only)"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {canCreateCompany && (
              <>
                <div className="border-t border-rf-border" />
                <button
                  onClick={() => {
                    setOpen(false);
                    onCreateCompany();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create company
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Company Action Modals */}
      {selectedCompany && (
        <>
          <RenameModal
            open={renameModalOpen}
            onClose={() => setRenameModalOpen(false)}
            title="Rename Company"
            currentName={selectedCompany.name}
            onRename={handleRenameSubmit}
          />

          <DuplicateCompanyModal
            open={duplicateModalOpen}
            onClose={() => setDuplicateModalOpen(false)}
            companyName={selectedCompany.name}
            onDuplicate={handleDuplicateSubmit}
          />

          <DeleteConfirmationModal
            open={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            title="Delete Company"
            description="This will permanently delete the company and all associated jobs, applicants, boards, and application forms."
            itemName={selectedCompany.name}
            confirmText="DELETE"
            onDelete={handleDeleteSubmit}
          />
        </>
      )}
    </div>
  );
}
