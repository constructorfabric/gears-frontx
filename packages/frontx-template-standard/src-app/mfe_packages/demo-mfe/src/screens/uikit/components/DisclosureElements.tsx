/**
 * Disclosure Elements Category
 *
 * Demonstrates: Accordion, TreeView
 */

import React from 'react';
import { Separator } from '../../../components/ui/separator';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../../../components/ui/accordion';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '../../../components/ui/collapsible';
import { Button } from '../../../components/ui/button';
import { ButtonVariant } from '../../../components/types';

interface DisclosureElementsProps {
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

export const DisclosureElements: React.FC<DisclosureElementsProps> = ({ t }) => {
  return (
    <div id="category-disclosure" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.disclosure')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Accordion */}
      <ElementDemo
        id="element-accordion"
        title={t('element.accordion.title')}
        description={t('element.accordion.description')}
      >
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>Is it accessible?</AccordionTrigger>
            <AccordionContent>
              Yes. It adheres to the WAI-ARIA design pattern and uses Radix UI primitives.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Is it styled?</AccordionTrigger>
            <AccordionContent>
              Yes. It comes with default styles that you can customize using Tailwind CSS.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>Is it animated?</AccordionTrigger>
            <AccordionContent>
              Yes. The accordion expands and collapses with smooth animations powered by Radix UI.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Separator className="my-6" />

        <div>
          <h4 className="text-sm font-semibold mb-4">Multiple Accordion (type="multiple")</h4>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="multi-1">
              <AccordionTrigger>Section 1</AccordionTrigger>
              <AccordionContent>Content for section 1. Multiple sections can be open at once.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="multi-2">
              <AccordionTrigger>Section 2</AccordionTrigger>
              <AccordionContent>Content for section 2.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="multi-3">
              <AccordionTrigger>Section 3</AccordionTrigger>
              <AccordionContent>Content for section 3.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <Separator className="my-6" />

        <div>
          <h4 className="text-sm font-semibold mb-4">Collapsible (alternative)</h4>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant={ButtonVariant.Outline} className="w-full">
                Toggle Details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 p-4 border border-border rounded-lg">
              <p className="text-sm">
                This is a Collapsible component. It's similar to Accordion but designed for
                individual expand/collapse sections rather than groups.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ElementDemo>

      {/* TreeView */}
      <ElementDemo
        id="element-tree_view"
        title={t('element.tree_view.title')}
        description={t('element.tree_view.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated TreeView component.</p>
          <p className="mt-2">
            Tree structures can be built using nested Collapsible or Accordion components:
          </p>
          <div className="mt-4">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant={ButtonVariant.Ghost} className="w-full justify-start">
                  <span className="mr-2">📁</span> Documents
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-6 space-y-1">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant={ButtonVariant.Ghost} className="w-full justify-start text-sm">
                      <span className="mr-2">📁</span> Projects
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-6 space-y-1">
                    <Button variant={ButtonVariant.Ghost} className="w-full justify-start text-sm">
                      <span className="mr-2">📄</span> Project A
                    </Button>
                    <Button variant={ButtonVariant.Ghost} className="w-full justify-start text-sm">
                      <span className="mr-2">📄</span> Project B
                    </Button>
                  </CollapsibleContent>
                </Collapsible>
                <Button variant={ButtonVariant.Ghost} className="w-full justify-start text-sm">
                  <span className="mr-2">📄</span> README.md
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </ElementDemo>
    </div>
  );
};

DisclosureElements.displayName = 'DisclosureElements';
