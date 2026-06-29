/**
 * Check Icon
 * Used in menu checkbox items (context-menu, menubar, dropdown-menu)
 * Replaces lucide-react CheckIcon for tree-shaking
 */
export const CheckIcon = ({ className = '' }: { className?: string }) => {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
};
