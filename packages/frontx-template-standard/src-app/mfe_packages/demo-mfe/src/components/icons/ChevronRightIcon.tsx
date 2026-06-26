/**
 * Chevron Right Icon
 * Used in menu sub-triggers (context-menu, menubar, dropdown-menu)
 * Replaces lucide-react ChevronRightIcon for tree-shaking
 */
export const ChevronRightIcon = ({ className = '' }: { className?: string }) => {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
};
