import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gears-frontx/ui-kit';

import { CloseIcon, DemoIcon, Row, Section } from './shared';

const REGIONS = [
  { value: 'eu-central', label: 'Frankfurt' },
  { value: 'eu-west', label: 'Dublin' },
  { value: 'us-east', label: 'Virginia' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}));

function MagnifierIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LoadingDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={() => {
        setBusy(true);
        setTimeout(() => setBusy(false), 1500);
      }}
    >
      Click me
    </Button>
  );
}

export function ComponentsPage() {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  return (
    <>
      <Section title="Button">
        <Row>
          <Button>default</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="outline">outline</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="destructive">destructive</Button>
          <Button variant="link">link</Button>
        </Row>
        <Row>
          <Button size="sm">sm</Button>
          <Button>default</Button>
          <Button size="lg">lg</Button>
          <Button disabled>disabled</Button>
        </Row>
        <Row>
          <Button icon={<DemoIcon />}>with icon</Button>
          <Button size="sm" icon={<DemoIcon />} aria-label="icon-only sm" />
          <Button icon={<DemoIcon />} aria-label="icon-only default" />
          <Button size="lg" icon={<DemoIcon />} aria-label="icon-only lg" />
          <Button size="lg" variant="secondary" icon={<DemoIcon />} aria-label="secondary icon" />
        </Row>
        <Row>
          <Button loading>loading</Button>
          <Button variant="secondary" loading>
            loading
          </Button>
          <Button variant="outline" loading icon={<DemoIcon />} aria-label="loading icon-only" />
          <LoadingDemo />
        </Row>
      </Section>

      <Section title="Badge">
        <Row>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="info">info</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge>muted</Badge>
        </Row>
        <Row>
          <Badge variant="success" shape="plain" dot>
            success
          </Badge>
          <Badge variant="warning" shape="plain" dot>
            warning
          </Badge>
          <Badge variant="info" shape="plain" dot>
            info
          </Badge>
          <Badge variant="danger" shape="plain" dot>
            danger
          </Badge>
          <Badge shape="plain" dot>muted</Badge>
        </Row>
        <Row>
          <Badge variant="success" dot>
            with dot
          </Badge>
          <Badge variant="info" icon={<DemoIcon />}>
            with icon
          </Badge>
        </Row>
      </Section>

      <Section title="Form controls">
        <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 420 }}>
          <Field name="email">
            <FieldLabel>Email</FieldLabel>
            <Input type="email" required placeholder="you@company.com" />
            <FieldDescription>We only use it for the invoice.</FieldDescription>
            <FieldError match="valueMissing">Email is required.</FieldError>
          </Field>
          <Field name="broken" invalid>
            <FieldLabel>Invalid state</FieldLabel>
            <Input defaultValue="wrong value" aria-invalid />
            <FieldError match>Server rejected this value.</FieldError>
          </Field>
          <Field name="query">
            <FieldLabel>Search</FieldLabel>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search projects…"
              icon={<MagnifierIcon />}
              end={<Button variant="ghost" size="sm" icon={<CloseIcon />} aria-label="Clear search" onClick={() => setQuery('')} />}
            />
          </Field>
          <Field name="notes">
            <FieldLabel>Notes</FieldLabel>
            <Textarea placeholder="Multi-line text…" />
          </Field>
          <Row>
            <Select value={region} onValueChange={setRegion} items={REGIONS}>
              <SelectTrigger aria-label="Region">
                <SelectValue placeholder="Pick a region" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={REGIONS}>
              <SelectTrigger aria-label="Region filter" variant="filter">
                <SelectValue placeholder="Filter · 2" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="18" items={HOURS}>
              <SelectTrigger aria-label="Hour">
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Hours</SelectLabel>
                  {HOURS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
          <Row>
            <Label>
              <Checkbox defaultChecked /> Checkbox
            </Label>
            <Label>
              <Switch defaultChecked /> Switch
            </Label>
            <Label>
              <Switch size="sm" /> Switch sm
            </Label>
          </Row>
          <RadioGroup defaultValue="a" style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <Label>
              <RadioGroupItem value="a" /> Option A
            </Label>
            <Label>
              <RadioGroupItem value="b" /> Option B
            </Label>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Card">
        <Card style={{ maxWidth: 420 }}>
          <CardHeader>
            <CardTitle>Project Amber</CardTitle>
            <CardDescription>Updated 2 hours ago</CardDescription>
            <CardAction>
              <Badge variant="success">active</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>Surfaces sit on --card with --border; hover state is up to the consumer.</CardContent>
          <CardFooter>
            <Button size="sm">Open</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">Default one</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
            <TabsTrigger value="three" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel.</TabsContent>
          <TabsContent value="two">Second panel.</TabsContent>
        </Tabs>
        <Tabs defaultValue="one">
          <TabsList variant="line">
            <TabsTrigger value="one">Line one</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel.</TabsContent>
          <TabsContent value="two">Second panel.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Region</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>gears-api</TableCell>
              <TableCell>
                <Badge variant="success">running</Badge>
              </TableCell>
              <TableCell>eu-central</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>gears-worker</TableCell>
              <TableCell>
                <Badge variant="danger">failed</Badge>
              </TableCell>
              <TableCell>us-east</TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell>gears-scheduler (selected)</TableCell>
              <TableCell>
                <Badge variant="success">running</Badge>
              </TableCell>
              <TableCell>eu-west</TableCell>
            </TableRow>
            <TableRow data-state="stale">
              <TableCell>gears-connector (stale)</TableCell>
              <TableCell>
                <Badge variant="warning">needs action</Badge>
              </TableCell>
              <TableCell>eu-central</TableCell>
            </TableRow>
            <TableRow data-state="restricted">
              <TableCell>gears-vault (restricted)</TableCell>
              <TableCell>
                <Badge shape="plain" dot>no access</Badge>
              </TableCell>
              <TableCell>—</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Table density="compact">
          <TableBody>
            <TableRow>
              <TableCell>compact density</TableCell>
              <TableCell>row one</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>compact density</TableCell>
              <TableCell>row two</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Overlays & feedback">
        <Row>
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
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline">Dropdown</Button>} />
            <DropdownMenuContent>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost">Hover me</Button>} />
            <TooltipContent>Visual-only hint.</TooltipContent>
          </Tooltip>
          <Button
            variant="secondary"
            onClick={() =>
              toast.add({ title: 'Saved', description: 'Palette applied.', type: 'success' })
            }
          >
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.add({ title: 'Failed', description: 'Try again.', type: 'error' })}
          >
            Error toast
          </Button>
        </Row>
      </Section>

      <Section title="Skeleton">
        <Row>
          <Skeleton style={{ width: 220, height: 16 }} />
          <Skeleton style={{ width: 44, height: 44, borderRadius: '50%' }} />
        </Row>
      </Section>
    </>
  );
}
