"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCompany } from "./actions";

interface CreateCompanyModalProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
}

export function CreateCompanyModal({
  open,
  onClose,
  accountId,
}: CreateCompanyModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("accountId", accountId);

      const result = await createCompany(formData);

      if (result.error) {
        setError(result.error);
      } else if (result.companyId) {
        setName("");
        onClose();
        router.push(`/dashboard/${result.companyId}`);
        router.refresh();
      }
    } catch (err) {
      setError("Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new company</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="company-name" className="block text-sm font-medium text-stone-700 mb-2">
              Company name
            </label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create company"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
