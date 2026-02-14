"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import type { Company } from "@/lib/types";

interface CompanySelectProps {
  companies: Company[];
  currentCompanyId: string;
  canCreateCompany: boolean;
  onCreateCompany: () => void;
}

export function CompanySelect({
  companies,
  currentCompanyId,
  canCreateCompany,
  onCreateCompany,
}: CompanySelectProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  const handleCompanyChange = async (companyId: string) => {
    setOpen(false);
    // Route to the company's default applicants board
    // We'll fetch the first job and redirect there
    router.push(`/dashboard/${companyId}`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
      >
        <span>{currentCompany?.name || "Select company"}</span>
        <ChevronDown className="h-4 w-4 text-stone-400" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-stone-200 bg-white shadow-lg z-20">
            <div className="py-1 max-h-64 overflow-y-auto">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleCompanyChange(company.id)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    company.id === currentCompanyId
                      ? "bg-stone-100 text-stone-900 font-medium"
                      : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {company.name}
                </button>
              ))}
            </div>
            {canCreateCompany && (
              <>
                <div className="border-t border-stone-200" />
                <button
                  onClick={() => {
                    setOpen(false);
                    onCreateCompany();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create company
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
