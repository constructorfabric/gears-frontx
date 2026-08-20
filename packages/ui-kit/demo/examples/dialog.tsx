import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DirectionProvider,
} from '@gears-frontx/ui-kit';

import { CloseIcon, Row, Section } from '../shared';

const longParagraphs = Array.from({ length: 12 }, (_, index) => (
  <p key={index}>
    Paragraph {index + 1}. This action cannot be undone. This will permanently delete the project and
    remove its data from our servers.
  </p>
));

export default function DialogExample() {
  return (
    <>
      <Section title="Default">
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete project?</DialogTitle>
              <DialogDescription>This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <DialogClose render={<Button variant="destructive">Delete</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Custom close button">
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <DialogTitle>Share link</DialogTitle>
                <DialogClose render={<Button variant="ghost" icon={<CloseIcon />} aria-label="Close" />} />
              </Row>
              <DialogDescription>Anyone with this link can view this document.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button>Done</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="No close button">
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Processing payment</DialogTitle>
              <DialogDescription>Please wait, this will only take a moment.</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Scrollable content">
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Terms of service</DialogTitle>
              <DialogDescription>Read the full agreement before continuing.</DialogDescription>
            </DialogHeader>
            <div style={{ maxHeight: '16rem', overflowY: 'auto', display: 'grid', gap: 'var(--space-3)' }}>
              {longParagraphs}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Decline</Button>} />
              <DialogClose render={<Button>Accept</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Sticky footer">
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Terms of service</DialogTitle>
              <DialogDescription>Scroll to read the full agreement.</DialogDescription>
            </DialogHeader>
            {longParagraphs}
            <DialogFooter style={{ position: 'sticky', bottom: 0, background: 'var(--popover)' }}>
              <DialogClose render={<Button variant="outline">Decline</Button>} />
              <DialogClose render={<Button>Accept</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="RTL">
        <DirectionProvider direction="rtl">
          <Dialog>
            <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete project?</DialogTitle>
                <DialogDescription>This action cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline">Cancel</Button>} />
                <DialogClose render={<Button variant="destructive">Delete</Button>} />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DirectionProvider>
      </Section>
    </>
  );
}
