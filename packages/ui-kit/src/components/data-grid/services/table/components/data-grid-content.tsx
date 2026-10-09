import type { ReactNode } from 'react';

interface DataGridContentProps {
  children?: ReactNode;
}

export function DataGridContent({ children }: DataGridContentProps) {
  return <>{children}</>;
}
