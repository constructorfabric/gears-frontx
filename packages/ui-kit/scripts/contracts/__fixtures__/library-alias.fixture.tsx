// Fixture for compile.test.ts: a component the kit re-exposes whole from a
// library whose types admit React's ARIA attributes and name no element. The
// callable is declared here rather than imported, standing for a library's
// own declaration: the kit writes no body for it, so nothing in the kit's
// source says where those attributes go.
import type { AriaAttributes, FC } from 'react';

declare const LibraryLegend: FC<AriaAttributes & { align?: 'left' | 'right' }>;

export const Legendish = LibraryLegend;
