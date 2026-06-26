import * as React from "react"
import { cn } from "../../lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Enable auto-resize behavior (adjusts height based on content)
   */
  autoResize?: boolean;
  /**
   * Minimum height in pixels when auto-resize is enabled (default: 50)
   */
  minHeight?: number;
  /**
   * Maximum height in pixels when auto-resize is enabled (default: 350)
   */
  maxHeight?: number;
  /**
   * Size variant (affects min-height)
   * - sm: min-h-11 (44px / 2.75rem)
   * - default: min-h-[60px] (3.75rem)
   * - lg: min-h-20 (80px / 5rem)
   */
  size?: 'sm' | 'default' | 'lg';
}

const Textarea = (
  {
    ref,
    className,
    autoResize = false,
    minHeight = 50,
    maxHeight = 350,
    size = 'default',
    onChange,
    ...props
  }: TextareaProps & {
    ref?: React.Ref<HTMLTextAreaElement>;
  }
) => {
  const internalRef = React.useRef<HTMLTextAreaElement>(null);

  // Merge external ref with internal ref
  React.useImperativeHandle(ref, () => internalRef.current as HTMLTextAreaElement);

  // Map size to min-height classes
  const sizeClasses = {
    sm: 'min-h-11 h-11',      // 44px / 2.75rem - exact height
    default: 'min-h-[60px]', // 60px / 3.75rem
    lg: 'min-h-20',      // 80px / 5rem
  };

  // Padding varies by size - sm uses py-3 (12px) for proper centering in 44px height
  const paddingClasses = {
    sm: 'py-3',       // 12px top + 12px bottom + 20px line-height = 44px
    default: 'py-2',  // 8px top + 8px bottom (default)
    lg: 'py-2',       // 8px top + 8px bottom (default)
  };

  const handleResize = React.useCallback(() => {
    // Don't auto-resize for 'sm' size - it has a fixed height
    if (autoResize && size !== 'sm' && internalRef.current) {
      const textarea = internalRef.current;
      // Reset height to get accurate scrollHeight
      textarea.style.height = 'auto';
      // Calculate the actual content height
      const scrollHeight = textarea.scrollHeight;
      // Set height with constraints
      textarea.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
    }
  }, [autoResize, size, minHeight, maxHeight]);

  // Auto-resize on mount and value changes
  React.useEffect(() => {
    handleResize();
  }, [handleResize, props.value]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleResize();
      onChange?.(e);
    },
    [onChange, handleResize]
  );

  return (
    <textarea
      className={cn(
        "flex w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        sizeClasses[size],
        paddingClasses[size],
        className
      )}
      ref={internalRef}
      onChange={handleChange}
      {...props}
    />
  )
}
Textarea.displayName = "Textarea"

export { Textarea }
