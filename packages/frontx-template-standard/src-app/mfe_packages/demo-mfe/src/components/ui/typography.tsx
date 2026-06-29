import * as React from 'react';

import { cn } from '../../lib/utils';

function TypographyH1({
  className,
  ...props
}: React.ComponentProps<'h1'>) {
  return (
    <h1
      data-slot="typography-h1"
      className={cn(
        'scroll-m-20 text-4xl font-extrabold tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function TypographyH2({
  className,
  ...props
}: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="typography-h2"
      className={cn(
        'scroll-m-20 text-3xl font-semibold tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function TypographyH3({
  className,
  ...props
}: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="typography-h3"
      className={cn(
        'scroll-m-20 text-2xl font-semibold tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function TypographyH4({
  className,
  ...props
}: React.ComponentProps<'h4'>) {
  return (
    <h4
      data-slot="typography-h4"
      className={cn(
        'scroll-m-20 text-xl font-semibold tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function TypographyP({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="typography-p"
      className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}
      {...props}
    />
  );
}

function TypographyBlockquote({
  className,
  ...props
}: React.ComponentProps<'blockquote'>) {
  return (
    <blockquote
      data-slot="typography-blockquote"
      className={cn('mt-6 border-l-2 pl-6 italic', className)}
      {...props}
    />
  );
}

function TypographyList({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="typography-list"
      className={cn('my-6 ml-6 list-disc [&>li]:mt-2', className)}
      {...props}
    />
  );
}

function TypographyInlineCode({
  className,
  ...props
}: React.ComponentProps<'code'>) {
  return (
    <code
      data-slot="typography-inline-code"
      className={cn(
        'bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
        className
      )}
      {...props}
    />
  );
}

function TypographyLarge({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="typography-large"
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  );
}

function TypographySmall({
  className,
  ...props
}: React.ComponentProps<'small'>) {
  return (
    <small
      data-slot="typography-small"
      className={cn('text-sm leading-none font-medium', className)}
      {...props}
    />
  );
}

function TypographyMuted({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="typography-muted"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyP,
  TypographyBlockquote,
  TypographyList,
  TypographyInlineCode,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
};
