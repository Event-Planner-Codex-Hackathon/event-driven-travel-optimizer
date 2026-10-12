/** A rounded P with a destination dot, shared by both navigation headers. */
export function PookieMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9 26V13a7 7 0 1 1 7 7H9"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="13" r="2" fill="currentColor" />
    </svg>
  );
}
