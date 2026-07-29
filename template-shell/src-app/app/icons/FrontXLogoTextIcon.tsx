import React from 'react';

/**
 * FrontX Logo Text Icon
 * App-level branding text used by Menu layout component
 */
export const FrontXLogoTextIcon: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 72 24"
      fill="currentColor"
    >
      <text
        x="0"
        y="18"
        fontFamily="inherit"
        fontSize="16"
        fontWeight="600"
        letterSpacing="0.5"
      >
        FrontX
      </text>
    </svg>
  );
};
