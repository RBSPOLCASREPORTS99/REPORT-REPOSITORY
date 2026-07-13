import { useState } from 'react';

// A numeric input that displays its value with comma thousands separators
// (Excel accounting format) when idle, and lets the user type freely (no commas,
// so decimals and edits behave) while focused. Emits the parsed number.
export default function NumberInput({
  value,
  onChange,
  className = '',
  placeholder = '0',
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  const formatted = value != null && !Number.isNaN(value)
    ? value.toLocaleString('en-PH', { maximumFractionDigits: 20 })
    : '';
  const display = focused ? text : formatted;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onFocus={() => { setFocused(true); setText(value != null ? String(value) : ''); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, '');
        setText(raw);
        if (raw === '' || raw === '-' || raw === '.') { onChange(0); return; }
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className={className}
    />
  );
}
