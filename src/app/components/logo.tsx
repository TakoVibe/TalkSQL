export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="14" fill="#205b43" />
      <path d="M14 24a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-9l-10 9v-9h-1a8 8 0 0 1-8-8z" fill="#fff" />
      <rect x="21" y="28" width="5" height="10" rx="2" fill="#205b43" />
      <rect x="29.5" y="22" width="5" height="16" rx="2" fill="#205b43" />
      <rect x="38" y="25" width="5" height="13" rx="2" fill="#205b43" />
    </svg>
  );
}
