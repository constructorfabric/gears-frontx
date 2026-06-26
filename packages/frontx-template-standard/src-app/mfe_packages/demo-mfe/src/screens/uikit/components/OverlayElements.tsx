/**
 * Overlay Elements Category
 *
 * Demonstrates: Dialog, Modal, Drawer, Popover
 */

import React, { useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '../../../components/ui/drawer';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '../../../components/ui/popover';
import { Button } from '../../../components/ui/button';
import { ButtonVariant } from '../../../components/types';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

interface OverlayElementsProps {
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

export const OverlayElements: React.FC<OverlayElementsProps> = ({ t }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div id="category-overlays" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.overlays')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Dialog */}
      <ElementDemo
        id="element-dialog"
        title={t('element.dialog.title')}
        description={t('element.dialog.description')}
      >
        <div className="flex flex-wrap gap-4">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
                <DialogDescription>
                  Make changes to your profile here. Click save when you're done.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Enter your name" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="Enter your email" />
                </div>
              </div>
              <DialogFooter>
                <Button variant={ButtonVariant.Outline} onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant={ButtonVariant.Destructive}>Delete Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove
                  your data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </ElementDemo>

      {/* Modal */}
      <ElementDemo
        id="element-modal"
        title={t('element.modal.title')}
        description={t('element.modal.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>Modal is an alias for Dialog in UIKit.</p>
          <p className="mt-2">See the Dialog example above for modal usage.</p>
          <p className="mt-2">
            Both Dialog and AlertDialog provide modal overlays with different use cases.
          </p>
        </div>
      </ElementDemo>

      {/* Drawer */}
      <ElementDemo
        id="element-drawer"
        title={t('element.drawer.title')}
        description={t('element.drawer.description')}
      >
        <div className="flex flex-wrap gap-4">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant={ButtonVariant.Outline}>Open Drawer</Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Drawer Title</DrawerTitle>
                <DrawerDescription>
                  This is a drawer that slides in from the bottom. Commonly used on mobile.
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4">
                <p className="text-sm text-muted-foreground">
                  Drawer content goes here. It can include forms, lists, or any other components.
                </p>
              </div>
              <DrawerFooter>
                <Button>Submit</Button>
                <DrawerClose asChild>
                  <Button variant={ButtonVariant.Outline}>Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </ElementDemo>

      {/* Popover */}
      <ElementDemo
        id="element-popover"
        title={t('element.popover.title')}
        description={t('element.popover.description')}
      >
        <div className="flex flex-wrap gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={ButtonVariant.Outline}>Open Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="space-y-2">
                <h4 className="font-medium">Dimensions</h4>
                <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="width">Width</Label>
                    <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="maxWidth">Max. width</Label>
                    <Input id="maxWidth" defaultValue="300px" className="col-span-2 h-8" />
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="height">Height</Label>
                    <Input id="height" defaultValue="25px" className="col-span-2 h-8" />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button>Side Popover</Button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start">
              <p className="text-sm">This popover opens to the right of the trigger.</p>
            </PopoverContent>
          </Popover>
        </div>
      </ElementDemo>
    </div>
  );
};

OverlayElements.displayName = 'OverlayElements';
