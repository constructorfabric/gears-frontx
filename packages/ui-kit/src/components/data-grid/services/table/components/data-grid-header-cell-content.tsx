import type { ReactNode } from 'react';
import styles from './data-grid-header-cell.module.css';

interface DataGridHeaderCellContentProps {
  children?: ReactNode;
}

export function DataGridHeaderCellContent({ children }: DataGridHeaderCellContentProps) {
  return <span className={styles.headerCellContent}>{children}</span>;
}
