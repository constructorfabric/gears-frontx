import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@gears-frontx/ui-kit';

import { Measure, Section } from '../shared';

export default function PaginationExample() {
  return (
    <>
      {/* A full row with the active page in the middle, plus the compact and
          the minimal arrangements below. Everything in the row sits on the
          same 28px box; only the prev/next pair trades the square for
          horizontal padding. */}
      <Section title="Default">
        <Measure
          of={{
            'inactive item': '#pg-full [href="#3"]',
            'active item': '#pg-full [aria-current=page]',
            previous: '#pg-full [aria-label="Go to previous page"]',
            ellipsis: '#pg-full li > span[aria-hidden]',
            row: '#pg-full ul',
            'prev icon': '#pg-full [aria-label="Go to previous page"] svg',
          }}
        >
          <Pagination id="pg-full">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#1">1</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#2" isActive>
                  2
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#3">3</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Measure>
      </Section>

      <Section title="Simple">
        <Pagination>
          <PaginationContent>
            {[1, 2, 3, 4, 5].map((page) => (
              <PaginationItem key={page}>
                <PaginationLink href="#" isActive={page === 1}>
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
          </PaginationContent>
        </Pagination>
      </Section>

      <Section title="Icons only">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" text="" />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" text="" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Section>
    </>
  );
}
