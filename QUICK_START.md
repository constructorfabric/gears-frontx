# FrontX Quick Start Guide

> **TARGET AUDIENCE:** Humans
> **PURPOSE:** Quick start guide for developers

This guide will help you get started with FrontX development.

## Installation

1. **Install dependencies**
   ```bash
   npm ci
   ```

2. **Build packages**
   ```bash
   npm run build:packages
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open browser**
   Navigate to `http://localhost:5173`

## Project Structure Overview

```text
packages/                           # Workspace packages
├── state/                          # SDK L1: Event bus and state primitives
├── screensets/                     # SDK L1: Screenset and MFE contracts
├── api/                            # SDK L1: API services and protocols
├── i18n/                           # SDK L1: Internationalization
├── framework/                      # L2: Plugin system and registries
├── react/                          # L3: React bindings and hooks
├── studio/                         # Development overlay (dev only)
└── cli/                            # CLI tool for project scaffolding

src/
├── app/                            # Host application shell
│   ├── components/ui/              # App-owned UI primitives
│   ├── layout/                     # Layout components
│   └── themes/                     # Theme tokens and registries
└── mfe_packages/                   # Demo and blank MFE packages
```

## Creating Your First Screen

1. **Create a new screen file**
   ```bash
   # Create in a screenset directory
   touch src/screensets/my-screenset/MyScreen.tsx
   ```

2. **Write your screen component**
   ```typescript
   import React from 'react';

   export const MyScreen: React.FC = () => {
     return (
       <div className="p-6">
         <h1 className="text-2xl font-bold">My Screen</h1>
         <p>Content goes here</p>
       </div>
     );
   };
   ```

3. **Use it in App.tsx**
   ```typescript
   import { MyScreen } from '@/screensets/my-screenset/MyScreen';

   // In your CoreLayout children
   <MyScreen />
   ```

## Using Layout Components

### Header
```typescript
<Header
  logo={<Logo />}
  actions={<UserMenu />}
/>
```

### Menu
```typescript
const menuItems: MenuItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: <HomeIcon />,
  },
];

<Menu items={menuItems} collapsed={false} />
```

### Sidebar
```typescript
<Sidebar
  position="left"
  title="Sidebar Title"
  collapsed={false}
>
  <div>Sidebar content</div>
</Sidebar>
```

### Popup
```typescript
const [open, setOpen] = useState(false);

<Popup
  open={open}
  onClose={() => setOpen(false)}
  title="My Popup"
>
  <div>Popup content</div>
</Popup>
```

## Using Redux State

### Read state
```typescript
import { useAppSelector } from '@gears-frontx/react';

const MyComponent = () => {
  const collapsed = useAppSelector(state => state['layout/menu'].collapsed);

  return <div>Menu collapsed: {collapsed}</div>;
};
```

### Use event-driven actions (recommended)
```typescript
import { useGears FrontXActions } from '@gears-frontx/react';

const MyComponent = () => {
  const { toggleMenu } = useGears FrontXActions();
  return <button onClick={toggleMenu}>Toggle Menu</button>;
};
```

FrontX uses event-driven architecture. Prefer action creators that emit events over direct dispatch.

## Styling with Tailwind

FrontX uses Tailwind CSS with custom theme tokens:

```typescript
<div className="bg-background text-foreground">
  <h1 className="text-2xl font-bold text-primary">Title</h1>
  <p className="text-muted-foreground">Description</p>
</div>
```

### Available Theme Colors
- `background` - Main background
- `foreground` - Main text color
- `primary` - Primary brand color
- `secondary` - Secondary color
- `accent` - Accent color
- `muted` - Muted color
- `border` - Border color

## Adding a New UI Component

1. **Create component file**
   ```bash
   touch src/app/components/ui/button.tsx
   ```

2. **Implement component**
   ```typescript
   import React from 'react';
   import { cn } from '@/lib/utils';

   export interface ButtonProps {
     children: React.ReactNode;
     onClick?: () => void;
     variant?: 'primary' | 'secondary';
     className?: string;
   }

   export const Button: React.FC<ButtonProps> = ({
     children,
     onClick,
     variant = 'primary',
     className,
   }) => {
     return (
       <button
         onClick={onClick}
         className={cn(
           'px-4 py-2 rounded font-medium transition-colors',
           variant === 'primary' && 'bg-primary text-primary-foreground',
           variant === 'secondary' && 'bg-secondary text-secondary-foreground',
           className
         )}
       >
         {children}
       </button>
     );
   };
   ```

3. **Import it where needed**
   ```typescript
   import { Button } from '@/components/ui/button';
   ```

## Creating a Screenset

Screensets are vertical slices of your application. Use the FrontX CLI to create them:

```bash
# Create a new screenset
frontx screenset create my-screenset

# Or copy an existing one with transformed IDs
frontx screenset copy demo myDemo
```

### Example Screenset Structure:
```
my-screenset/
├── ids.ts                # All IDs centralized here
├── screens/              # Screen components
│   └── home/
│       ├── HomeScreen.tsx
│       └── i18n/         # Per-screen translations
├── i18n/                 # Screenset-level translations
├── components/ui/        # Local UI primitives (optional)
└── myScreensetScreenset.tsx  # Self-registering config
```

Screensets auto-register via Vite glob pattern - no manual import needed.

## Development Best Practices

1. **Always use TypeScript types**
   - No `any` types
   - Explicit function return types
   - Proper generics

2. **Use local UI components**
   - Don't create custom components inline
   - Extract reusable logic to `components/ui`

3. **Follow Redux patterns**
   - Actions for all state changes
   - Selectors for computed state
   - Keep state normalized

4. **Keep screensets isolated**
   - No cross-screenset dependencies
   - Use global state for shared data

5. **Use Tailwind utilities**
   - Avoid custom CSS when possible
   - Use theme tokens for colors
   - Follow spacing conventions

## Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run build:packages   # Build workspace packages only
npm run preview          # Preview production build

# Validation (run before commits)
npm run lint             # Run ESLint
npm run type-check:all   # Check host app, workspace packages, and nested MFEs
npm run type-check       # Check the host app root tsconfig only
npm run arch:check       # Architecture tests (must pass)
npm run arch:deps        # Dependency rules check
npm run test:unit        # All unit tests (host + workspaces + nested MFEs via monorepo runner)
npm run test:unit:watch  # Same, watch mode (defaults to host when not narrowed)

# Clean
npm run clean:deps       # Remove node_modules + reinstall
npm run clean:build      # Clean + build from scratch
```

### Unit tests (host vs packages/MFEs)

- **`npm run test:unit`** — runs the repo-wide runner; it fans out to the **host app** (repo root Vitest), **workspace packages** under `packages/*`, and **nested MFEs** under `src/mfe_packages/*` that define a `test:unit` script.
- To run tests for a single workspace package while iterating: `npm run test:unit --workspace=@gears-frontx/<package>`.
- Full contract, narrowing options, and internal root-only aliases are documented in [`.ai/project/targets/UNIT_TESTING.md`](.ai/project/targets/UNIT_TESTING.md).

## Next Steps

- Read [AI Guidelines](./.ai/GUIDELINES.md) for AI coding rules and patterns
- Review [PRD.md](./architecture/PRD.md) for project philosophy
- Explore the existing components in `src/app/components/ui/`
- Build your first screen in `src/screensets/my-screenset/`

## Getting Help

- Check documentation in `/docs`
- Review existing components for patterns
- Refer to TypeScript types for API details
