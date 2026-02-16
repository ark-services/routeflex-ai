"use client";

import { useState, useEffect } from "react";
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

  // Update local state when field changes
  useEffect(() => {
    if (field) {
      setRequired(field.required);
      setPlaceholder(field.settings?.placeholder || "");
      setOptions(field.settings?.options || ["Option 1", "Option 2"]);
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

  const supportsPlaceholder = ["text", "textarea", "email", "phone", "number"].includes(field.type);
  const supportsOptions = ["radio", "checkbox", "select"].includes(field.type);

  return (
    <div className="w-80 bg-white border-l border-gray-200 h-full overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
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

      {/* Settings Content */}
      <div className="flex-1 px-6 py-4 space-y-6">
        {/* Field Key (readonly) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Field Key
          </label>
          <input
            type="text"
            value={field.key}
            readOnly
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used for data storage (cannot be changed)
          </p>
        </div>

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

      {/* Footer */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
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
