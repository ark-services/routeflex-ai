"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  settings: Record<string, any>;
};

type QuestionSettingsPanelProps = {
  field: FormField | null;
  onUpdate: (updates: Partial<FormField>) => Promise<void>;
  onClose: () => void;
};

export default function QuestionSettingsPanel({
  field,
  onUpdate,
  onClose,
}: QuestionSettingsPanelProps) {
  const [required, setRequired] = useState(field?.required || false);
  const [placeholder, setPlaceholder] = useState(field?.settings?.placeholder || "");
  const [options, setOptions] = useState<string[]>(
    field?.settings?.options || ["Option 1", "Option 2"]
  );
  const [defaultChecked, setDefaultChecked] = useState(
    field?.settings?.defaultChecked ?? false
  );
  const [hidden, setHidden] = useState(field?.settings?.hidden ?? false);
  const [imageUrl, setImageUrl] = useState<string>(field?.settings?.imageUrl || "");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Update local state when field changes
  useEffect(() => {
    if (field) {
      setRequired(field.required);
      setPlaceholder(field.settings?.placeholder || "");
      setOptions(field.settings?.options || ["Option 1", "Option 2"]);
      setDefaultChecked(field.settings?.defaultChecked ?? false);
      setHidden(field.settings?.hidden ?? false);
      setImageUrl(field.settings?.imageUrl || "");
    }
  }, [field]);

  if (!field) return null;

  const handleRequiredToggle = async () => {
    const newRequired = !required;
    setRequired(newRequired);
    await onUpdate({ required: newRequired });
  };

  const handlePlaceholderSave = async () => {
    await onUpdate({
      settings: { ...field.settings, placeholder },
    });
  };

  const handleOptionsUpdate = async (newOptions: string[]) => {
    setOptions(newOptions);
    await onUpdate({
      settings: { ...field.settings, options: newOptions },
    });
  };

  const addOption = () => {
    const newOptions = [...options, `Option ${options.length + 1}`];
    handleOptionsUpdate(newOptions);
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const deleteOption = (index: number) => {
    if (options.length > 1) {
      const newOptions = options.filter((_, i) => i !== index);
      handleOptionsUpdate(newOptions);
    }
  };

  const handleDefaultCheckedToggle = async () => {
    const newVal = !defaultChecked;
    setDefaultChecked(newVal);
    await onUpdate({ settings: { ...field.settings, defaultChecked: newVal } });
  };

  const handleHiddenToggle = async () => {
    const newVal = !hidden;
    setHidden(newVal);
    await onUpdate({ settings: { ...field.settings, hidden: newVal } });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageUrl(dataUrl);
      await onUpdate({ settings: { ...field.settings, imageUrl: dataUrl } });
    };
    reader.readAsDataURL(file);
  };

  const handleImageRemove = async () => {
    setImageUrl("");
    if (imageInputRef.current) imageInputRef.current.value = "";
    await onUpdate({ settings: { ...field.settings, imageUrl: "" } });
  };

  const supportsPlaceholder = ["text", "textarea", "email", "phone", "number", "location"].includes(field.type);
  const supportsOptions = ["radio", "checkbox", "select"].includes(field.type);
  const supportsDefaultChecked = field.type === "checkbox";

  return (
    <div className="w-80 bg-white border-l border-gray-200 sticky top-0 h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <h3 className="text-lg font-semibold text-gray-900">Question Settings</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Settings Content (scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Required Toggle */}
        <div>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-gray-700">Required Field</span>
            <div
              onClick={handleRequiredToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                required ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  required ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </div>
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Applicants must answer this question
          </p>
        </div>

        {/* Hidden toggle */}
        <div>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Hidden from Form</span>
            </div>
            <div
              onClick={handleHiddenToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                hidden ? "bg-amber-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  hidden ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </div>
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Question won&apos;t appear on the form but the board column is preserved
          </p>
        </div>

        {/* Selected by default (checkbox only) */}
        {supportsDefaultChecked && (
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium text-gray-700">Selected by Default</span>
              <div
                onClick={handleDefaultCheckedToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  defaultChecked ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    defaultChecked ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </div>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Checkbox will be pre-checked when the form loads
            </p>
          </div>
        )}

        {/* Placeholder (for text-based fields) */}
        {supportsPlaceholder && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Placeholder Text
            </label>
            <input
              type="text"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              onBlur={handlePlaceholderSave}
              placeholder="Enter placeholder text..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Hint text shown in the input field
            </p>
          </div>
        )}

        {/* Options (for radio, checkbox, select) */}
        {supportsOptions && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Answer Options
            </label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    onBlur={() => handleOptionsUpdate(options)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  {options.length > 1 && (
                    <button
                      onClick={() => deleteOption(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addOption}
              className="mt-3 w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              + Add Option
            </button>
          </div>
        )}

        {/* Question Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Question Image
          </label>
          {imageUrl ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Question image preview"
                  className="w-full object-contain max-h-48 bg-gray-50"
                />
              </div>
              <button
                onClick={handleImageRemove}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove image
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 px-3 py-5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 10.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM18 12h.008v.008H18V12z" />
                </svg>
                Upload image
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1.5">
            Displayed below the question description
          </p>
        </div>

        {/* Field Type Info */}
        <div className="pt-4 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Question Type
          </label>
          <div className="px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-900 font-medium capitalize">
              {field.type}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            To change the question type, create a new question
          </p>
        </div>
      </div>

      {/* Footer - Sticky at bottom */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
        <Button
          variant="secondary"
          onClick={onClose}
          className="w-full"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
