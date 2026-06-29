import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { Skeleton } from './skeleton';

describe('UI primitives', () => {
  it('renders card primitives with their base classes and ref props', () => {
    const cardRef = createRef<HTMLDivElement>();
    const headerRef = createRef<HTMLDivElement>();
    const titleRef = createRef<HTMLDivElement>();
    const descriptionRef = createRef<HTMLDivElement>();
    const contentRef = createRef<HTMLDivElement>();
    const footerRef = createRef<HTMLDivElement>();

    render(
      <Card ref={cardRef} data-testid="card" className="custom-card">
        <CardHeader ref={headerRef} data-testid="card-header" className="custom-header">
          <CardTitle ref={titleRef} data-testid="card-title" className="custom-title">
            Title
          </CardTitle>
          <CardDescription
            ref={descriptionRef}
            data-testid="card-description"
            className="custom-description"
          >
            Description
          </CardDescription>
        </CardHeader>
        <CardContent ref={contentRef} data-testid="card-content" className="custom-content">
          Body
        </CardContent>
        <CardFooter ref={footerRef} data-testid="card-footer" className="custom-footer">
          Footer
        </CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card').className).toContain('rounded-xl');
    expect(screen.getByTestId('card').className).toContain('custom-card');
    expect(screen.getByTestId('card-header').className).toContain('space-y-1.5');
    expect(screen.getByTestId('card-header').className).toContain('custom-header');
    expect(screen.getByTestId('card-title').className).toContain('tracking-tight');
    expect(screen.getByTestId('card-title').className).toContain('custom-title');
    expect(screen.getByTestId('card-description').className).toContain('text-muted-foreground');
    expect(screen.getByTestId('card-description').className).toContain('custom-description');
    expect(screen.getByTestId('card-content').className).toContain('pt-0');
    expect(screen.getByTestId('card-content').className).toContain('custom-content');
    expect(screen.getByTestId('card-footer').className).toContain('items-center');
    expect(screen.getByTestId('card-footer').className).toContain('custom-footer');

    expect(cardRef.current).toBe(screen.getByTestId('card'));
    expect(headerRef.current).toBe(screen.getByTestId('card-header'));
    expect(titleRef.current).toBe(screen.getByTestId('card-title'));
    expect(descriptionRef.current).toBe(screen.getByTestId('card-description'));
    expect(contentRef.current).toBe(screen.getByTestId('card-content'));
    expect(footerRef.current).toBe(screen.getByTestId('card-footer'));
  });

  it('renders skeleton variants for default and inherited colors', () => {
    render(
      <>
        <Skeleton data-testid="default-skeleton" className="h-4 w-8" />
        <Skeleton data-testid="current-color-skeleton" inheritColor className="h-4 w-8" />
      </>
    );

    expect(screen.getByTestId('default-skeleton').className).toContain('animate-pulse');
    expect(screen.getByTestId('default-skeleton').className).toContain('bg-muted');
    expect(screen.getByTestId('current-color-skeleton').className).toContain('bg-current');
    expect(screen.getByTestId('current-color-skeleton').className).toContain('opacity-20');
  });
});
