"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastType = "success" | "error";

export function Toast({
  message,
  type = "success",
  onClose,
}: {
  message: string;
  type?: ToastType;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: {
      bg: "bg-rf-success-bg",
      border: "border-green-200",
      text: "text-rf-success",
      icon: CheckCircle2,
    },
    error: {
      bg: "bg-rf-danger-bg",
      border: "border-red-200",
      text: "text-rf-danger",
      icon: XCircle,
    },
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-2 duration-300">
      <div
        className={`flex items-center gap-3 ${style.bg} ${style.border} border rounded-lg px-4 py-3 shadow-lg min-w-[320px]`}
      >
        <Icon className={`w-5 h-5 ${style.text} flex-shrink-0`} />
        <span className={`text-sm font-medium ${style.text} flex-1`}>
          {message}
        </span>
        <button
          onClick={onClose}
          className={`${style.text} hover:opacity-70 transition-opacity`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
