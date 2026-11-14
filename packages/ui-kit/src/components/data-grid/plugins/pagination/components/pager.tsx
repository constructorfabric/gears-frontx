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
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
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
  /**
   * The grid's `label`, when it has one: it names the pager's `nav` "<label> pagination", so two
   * labelled grids on one page do not share the landmark name. Absent keeps the plain
   * "Pagination" name.
   */
  label?: string;
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
  label,
  onPageChange,
  onLimitChange,
}: PagerProps) {
  const messages = useDataGridMessages();
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

    // Only the limit is announced here: a page size change starts at the first page, and the
    // owner's `onLimitChange` is the one change that carries both (the pagination plugin's
    // `setLimit` resets the page itself), so announcing the page first would load twice.
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
    <Pagination
      aria-label={label === undefined ? messages.pagination.ariaLabel : messages.pagination.ariaLabelFor(label)}
      className={styles.pager}
    >
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

      <PaginationContent className={styles.pages}>
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
