import { useState } from 'react';

// Renders the official POLCAS logo from /logo.png. Until that file is added
// (or if it fails to load) it falls back to a branded SVG badge so the header
// / login never show a broken image.
export default function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/logo.png"
        alt="POLCAS Agritrade Corporation"
        className={`${className} rounded-full object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <svg viewBox="0 0 100 100" className={`${className} rounded-full`} role="img" aria-label="POLCAS Agritrade Corporation">
      <circle cx="50" cy="50" r="50" fill="#5c9121" />
      <circle cx="50" cy="50" r="38" fill="#eaf4d8" />
      <clipPath id="c"><circle cx="50" cy="50" r="38" /></clipPath>
      <g clipPath="url(#c)">
        <rect x="12" y="12" width="76" height="44" fill="#9fd3ec" />
        <circle cx="50" cy="34" r="11" fill="#f6c445" />
        <path d="M12 56 L34 30 L52 56 Z" fill="#4c9a3f" />
        <path d="M40 56 L64 26 L88 56 Z" fill="#3f8a34" />
        <rect x="12" y="56" width="76" height="32" fill="#7a5230" />
        <path d="M50 58 L20 88 H30 L50 62 L70 88 H80 Z" fill="#6cae2e" />
        <path d="M50 58 L40 88 H46 L50 66 L54 88 H60 Z" fill="#6cae2e" />
      </g>
    </svg>
  );
}
