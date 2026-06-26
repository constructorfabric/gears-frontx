import React from 'react';

/**
 * Chevron Up Icon
 * Used in select scroll buttons
 * Replaces lucide-react ChevronUpIcon for tree-shaking
 */
export const ChevronUpIcon = ({
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
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
};
