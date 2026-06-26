import React from 'react';

/**
 * Chevron Down Icon
 * Used in native select dropdowns, accordion, navigation-menu, select
 * Replaces lucide-react ChevronDownIcon for tree-shaking
 */
export const ChevronDownIcon = ({
  className = '',
  ...props
}: React.SVGProps<SVGSVGElement>) => {
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
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
};
