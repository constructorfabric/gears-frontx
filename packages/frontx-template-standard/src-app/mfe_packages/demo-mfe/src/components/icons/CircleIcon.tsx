/**
 * Circle Icon
 * Used in menu radio items (context-menu, menubar, dropdown-menu)
 * Replaces lucide-react CircleIcon for tree-shaking
 */
export const CircleIcon = ({ className = '' }: { className?: string }) => {
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
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
};
