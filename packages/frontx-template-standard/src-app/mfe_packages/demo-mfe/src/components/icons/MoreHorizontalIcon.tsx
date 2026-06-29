/**
 * More Horizontal Icon
 * Used in pagination ellipsis
 * Replaces lucide-react MoreHorizontalIcon for tree-shaking
 */
export const MoreHorizontalIcon = ({ className = '' }: { className?: string }) => {
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
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
};
