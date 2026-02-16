"use client";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  settings: Record<string, any>;
};

type FormBuilderSidebarProps = {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
};

export default function FormBuilderSidebar({
  fields,
  selectedFieldId,
  onSelectField,
}: FormBuilderSidebarProps) {
  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full overflow-y-auto flex flex-col">
      {/* Sidebar Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Form Structure
        </h3>
      </div>

      {/* Form Structure */}
      <div className="flex-1 py-2">
        {/* Welcome Page (Future) */}
        <div className="px-4 py-2 text-sm text-gray-400 cursor-not-allowed">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>Welcome Page</span>
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-6">Coming soon</p>
        </div>

        {/* Page 1 */}
        <div className="mt-3 mb-2 px-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Page 1
          </div>
        </div>

        {/* Field List */}
        <div className="space-y-0.5 px-2">
          {fields.length === 0 ? (
            <div className="px-2 py-3 text-sm text-gray-400 italic">
              No questions yet
            </div>
          ) : (
            fields.map((field, index) => (
              <button
                key={field.id}
                onClick={() => onSelectField(field.id)}
                className={`w-full flex items-start gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                  selectedFieldId === field.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="text-xs font-medium text-gray-400 mt-0.5 flex-shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {field.label}
                  </div>
                  <div className="text-xs text-gray-500 capitalize mt-0.5">
                    {field.type}
                    {field.required && (
                      <span className="ml-1 text-red-600">*</span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Thank You Page (Future) */}
        <div className="mt-6 px-4 py-2 text-sm text-gray-400 cursor-not-allowed">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Thank You Page</span>
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-6">Coming soon</p>
        </div>
      </div>

      {/* Sidebar Footer Info */}
      <div className="border-t border-gray-200 px-4 py-3">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between mb-1">
            <span>Total Questions:</span>
            <span className="font-semibold text-gray-900">{fields.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Required:</span>
            <span className="font-semibold text-gray-900">
              {fields.filter((f) => f.required).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
