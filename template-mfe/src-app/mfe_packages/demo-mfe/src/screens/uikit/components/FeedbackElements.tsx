/**
 * Feedback Elements Category
 *
 * Demonstrates: Alert, Notification, Toast, Progress, Spinner, Skeleton, Loader, StatusBadge, EmptyState
 */

import React from 'react';
import { Separator } from '../../../components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert';
import { Progress } from '../../../components/ui/progress';
import { Spinner } from '../../../components/ui/spinner';
import { Skeleton } from '../../../components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '../../../components/ui/empty';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ButtonVariant } from '../../../components/types';
import { useToast } from '../../../hooks/useToast';

interface FeedbackElementsProps {
  t: (key: string) => string;
}

const ElementDemo: React.FC<{ id: string; title: string; description: string; children: React.ReactNode }> = ({
  id,
  title,
  description,
  children,
}) => (
  <div id={id} className="scroll-mt-4 mb-8">
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground mb-4">{description}</p>
    <div className="border border-border rounded-lg p-6 bg-background">{children}</div>
  </div>
);

export const FeedbackElements: React.FC<FeedbackElementsProps> = ({ t }) => {
  const { success, error, toast } = useToast();

  return (
    <div id="category-feedback" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.feedback')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Alert */}
      <ElementDemo
        id="element-alert"
        title={t('element.alert.title')}
        description={t('element.alert.description')}
      >
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Default Alert</AlertTitle>
            <AlertDescription>This is a default alert message.</AlertDescription>
          </Alert>

          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Something went wrong. Please try again.</AlertDescription>
          </Alert>
        </div>
      </ElementDemo>

      {/* Notification */}
      <ElementDemo
        id="element-notification"
        title={t('element.notification.title')}
        description={t('element.notification.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated Notification component.</p>
          <p className="mt-2">
            Use Badge for notification counts or Toast for transient notifications.
          </p>
          <div className="mt-4 flex gap-4 items-center">
            <span>Messages</span>
            <Badge variant="destructive">5</Badge>
          </div>
        </div>
      </ElementDemo>

      {/* Toast */}
      <ElementDemo
        id="element-toast"
        title={t('element.toast.title')}
        description={t('element.toast.description')}
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => success('Your action was completed successfully.')}>
            Show Success Toast
          </Button>
          <Button variant={ButtonVariant.Destructive} onClick={() => error('Something went wrong.')}>
            Show Error Toast
          </Button>
          <Button variant={ButtonVariant.Outline} onClick={() => toast('This is an informational message.')}>
            Show Info Toast
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Toast notifications appear at the bottom-right corner and auto-dismiss.
        </p>
      </ElementDemo>

      {/* Progress */}
      <ElementDemo
        id="element-progress"
        title={t('element.progress.title')}
        description={t('element.progress.description')}
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm mb-2">25% Complete</p>
            <Progress value={25} />
          </div>
          <div>
            <p className="text-sm mb-2">50% Complete</p>
            <Progress value={50} />
          </div>
          <div>
            <p className="text-sm mb-2">75% Complete</p>
            <Progress value={75} />
          </div>
          <div>
            <p className="text-sm mb-2">100% Complete</p>
            <Progress value={100} />
          </div>
        </div>
      </ElementDemo>

      {/* Spinner */}
      <ElementDemo
        id="element-spinner"
        title={t('element.spinner.title')}
        description={t('element.spinner.description')}
      >
        <div className="flex flex-wrap gap-4 items-center">
          <Spinner size="sm" />
          <Spinner size="default" />
          <Spinner size="lg" />
        </div>
      </ElementDemo>

      {/* Skeleton */}
      <ElementDemo
        id="element-skeleton"
        title={t('element.skeleton.title')}
        description={t('element.skeleton.description')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Separator />
          <div className="flex items-center space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
      </ElementDemo>

      {/* Loader */}
      <ElementDemo
        id="element-loader"
        title={t('element.loader.title')}
        description={t('element.loader.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated Loader component.</p>
          <p className="mt-2">Use Spinner for loading indicators.</p>
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        </div>
      </ElementDemo>

      {/* StatusBadge */}
      <ElementDemo
        id="element-status_badge"
        title={t('element.status_badge.title')}
        description={t('element.status_badge.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated StatusBadge component.</p>
          <p className="mt-2">Use Badge variants for status indicators:</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Active</Badge>
            <Badge variant="secondary">Pending</Badge>
            <Badge variant="destructive">Inactive</Badge>
            <Badge variant="outline">Draft</Badge>
          </div>
        </div>
      </ElementDemo>

      {/* EmptyState */}
      <ElementDemo
        id="element-empty_state"
        title={t('element.empty_state.title')}
        description={t('element.empty_state.description')}
      >
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No results found</EmptyTitle>
            <EmptyDescription>
              We couldn't find any items matching your criteria.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant={ButtonVariant.Outline}>Clear Filters</Button>
          </EmptyContent>
        </Empty>
      </ElementDemo>
    </div>
  );
};

FeedbackElements.displayName = 'FeedbackElements';
