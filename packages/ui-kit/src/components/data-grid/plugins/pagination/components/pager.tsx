import { memo } from 'react';

import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNextButton,
  PaginationPreviousButton,
} from '../../../../pagination/public.js';
import { ToggleGroupItem } from '../../../../toggle-group/public.js';
import { Segment } from '../../../components/segment';
import { messages } from '../../../messages';
import { usePaginationItems } from '../services/pagination-items';
import styles from './pager.module.css';

interface PagerProps {
  /** Total number of items. */
  total: number;
  /** Current page, 1-based. */
  page: number;
  /** Items per page. */
  limit: number;
  /** The page sizes on offer. The selector is drawn only when there is more than one. */
  limits: number[];
  /** Hides the whole pager while everything fits on one page of the smallest size. */
  autoHide?: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

/**
 * The grid's pager: a page-size selector, the "page x of y" text and the page buttons, on the
 * kit's Pagination parts. Controlled only, because the pagination plugin owns page and limit.
 */
export const Pager = memo(function Pager({
  total,
  page,
  limit,
  limits,
  autoHide,
  onPageChange,
  onLimitChange,
}: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const limitOptions = limits.length > 0 ? limits : [limit];

  const items = usePaginationItems(page, totalPages);

  function handlePageChange(newPage: number) {
    const validatedPage = Math.max(1, Math.min(newPage, totalPages));

    if (validatedPage === page) {
      return;
    }

    onPageChange(validatedPage);
  }

  function handleLimitChange(newLimit: number) {
    if (newLimit === limit) {
      return;
    }

    // A new page size restarts at the first page, which the owner learns about before the new
    // limit, as two separate changes.
    if (page !== 1) {
      onPageChange(1);
    }

    onLimitChange(newLimit);
  }

  if (autoHide) {
    const lowestLimit = Math.min(...limitOptions);
    if (totalPages <= 1 || total <= lowestLimit) {
      return null;
    }
  }

  const showLimitSelector = limits.length > 1;

  return (
    <Pagination aria-label={messages.pagination.ariaLabel} className={styles.pager}>
      {showLimitSelector && (
        <Segment
          size="sm"
          className={styles.limit}
          value={String(limit)}
          onValueChange={(value) => {
            if (value !== undefined) {
              handleLimitChange(Number(value));
            }
          }}
          aria-label={messages.pagination.limitSelectorAriaLabel}
        >
          {limits.map((l) => (
            <ToggleGroupItem key={l} value={String(l)}>
              {l}
            </ToggleGroupItem>
          ))}
        </Segment>
      )}

      <span className={styles.info}>{messages.pagination.pageInfo(page, totalPages, total)}</span>

      <PaginationContent>
        <PaginationItem>
          <PaginationPreviousButton
            aria-label={messages.pagination.previousPage}
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          />
        </PaginationItem>

        {items.map((item, index) => (
          <PaginationItem key={item.type === 'page' ? item.page : `ellipsis-${index}`}>
            {item.type === 'page' ? (
              <PaginationButton
                isActive={item.page === page}
                aria-label={messages.pagination.goToPage(item.page)}
                onClick={() => handlePageChange(item.page)}
              >
                {item.page}
              </PaginationButton>
            ) : (
              <PaginationEllipsis />
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNextButton
            aria-label={messages.pagination.nextPage}
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
});
