import type { PickableField } from "../../shared/messages";

interface FieldWithPickerProps {
  field: PickableField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  isPicking: boolean;
  onStartPicking: (field: PickableField) => void;
}

export default function FieldWithPicker({
  field,
  label,
  value,
  onChange,
  placeholder,
  multiline,
  isPicking,
  onStartPicking,
}: FieldWithPickerProps) {
  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor={field}>{label}</label>
        <button
          type="button"
          data-field={field}
          className={`pick-btn${isPicking ? " picking" : ""}`}
          onClick={() => onStartPicking(field)}
          disabled={isPicking}
        >
          {isPicking ? "Click text on page…" : "Select from Page"}
        </button>
      </div>
      {multiline ? (
        <textarea
          id={field}
          rows={4}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={field}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
