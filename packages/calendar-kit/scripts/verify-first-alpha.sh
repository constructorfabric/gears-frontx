#!/usr/bin/env bash

set -u
set -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd -- "$PACKAGE_DIR/../.." && pwd)"
cd "$REPO_ROOT"
EVIDENCE_DIR="${EVIDENCE_DIR:-${TMPDIR:-/tmp}/calendar-kit-first-alpha-evidence}"
REPORT="$EVIDENCE_DIR/REPORT.md"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/calendar-kit-first-alpha.XXXXXX")"
PACKAGE_NAME='@gears-frontx/calendar-kit'
EXPECTED_VERSION="$(node -p "require('$PACKAGE_DIR/package.json').version")"
FAILURES=0

mkdir -p "$EVIDENCE_DIR"
exec > >(tee "$REPORT") 2>&1

finish() {
  local exit_code=$?

  rm -rf "$WORKDIR"

  if [ "$FAILURES" -gt 0 ]; then
    printf '\nRESULT: FAIL (%s failed assertion(s)); scratch files removed\n' "$FAILURES" >> "$REPORT"
    exit 1
  fi

  printf '\nRESULT: PASS; scratch files removed\n' >> "$REPORT"
  exit "$exit_code"
}

trap finish EXIT

fail() {
  printf 'FAIL: %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

pass() {
  printf 'PASS: %s\n' "$1"
}

run_step() {
  local label="$1"
  shift
  local status

  printf '\nCOMMAND [%s]:' "$label"
  printf ' %q' "$@"
  printf '\n'
  "$@"
  status=$?

  if [ "$status" -ne 0 ]; then
    fail "$label exited with status $status"
    return 0
  fi

  pass "$label"
}

assert_tar_file() {
  local path="$1"
  local label="$2"

  if printf '%s\n' "$TAR_CONTENTS" | grep -Fqx "package/$path"; then
    pass "$label"
  else
    fail "$label (package/$path)"
  fi
}

assert_tar_pattern() {
  local pattern="$1"
  local label="$2"

  if printf '%s\n' "$TAR_CONTENTS" | grep -Eq "$pattern"; then
    pass "$label"
  else
    fail "$label (pattern: $pattern)"
  fi
}

assert_tar_absent() {
  local pattern="$1"
  local label="$2"

  if printf '%s\n' "$TAR_CONTENTS" | grep -Eq "$pattern"; then
    fail "$label (pattern: $pattern)"
  else
    pass "$label"
  fi
}

assert_count() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [ "$actual" = "$expected" ]; then
    pass "$label ($actual)"
  else
    fail "$label (expected $expected, got $actual)"
  fi
}

printf '# First-alpha pack/install verification\n\n'
printf '%s\n' "Package: $PACKAGE_NAME@$EXPECTED_VERSION"
printf '%s\n' "Repository: $REPO_ROOT"
printf '%s\n' "Scratch: $WORKDIR"

if [ ! -d "$REPO_ROOT" ]; then
  fail "repository root is unavailable"
fi

if [ ! -f "$PACKAGE_DIR/package.json" ]; then
  fail "calendar-kit package manifest is unavailable"
fi

run_step 'build calendar-kit first-alpha target' npm run build --workspace="$PACKAGE_NAME"
run_step 'type-check calendar-kit first-alpha target' npm run type-check --workspace="$PACKAGE_NAME"

CALENDAR_PACK_DIR="$WORKDIR/calendar-pack"
mkdir -p "$CALENDAR_PACK_DIR"

run_step 'pack calendar-kit tarball from workspace' npm pack --workspace="$PACKAGE_NAME" --pack-destination "$CALENDAR_PACK_DIR"

TARBALL="$(find "$CALENDAR_PACK_DIR" -type f -name 'gears-frontx-calendar-kit-*.tgz' -print -quit)"

if [ -z "$TARBALL" ]; then
  fail 'calendar-kit pack did not produce a tarball'
else
  pass "calendar-kit tarball produced ($TARBALL)"
fi

TAR_CONTENTS=''
if [ -n "$TARBALL" ] && TAR_CONTENTS="$(tar -tzf "$TARBALL")"; then
  pass 'calendar-kit tarball is readable'
else
  fail 'calendar-kit tarball is unreadable'
fi

assert_tar_file 'package.json' 'manifest is published'
assert_tar_file 'README.md' 'README is published'
assert_tar_file 'llms.txt' 'llms documentation is published'
assert_tar_file 'CHANGELOG.md' 'CHANGELOG is published'
assert_tar_file 'LICENSE' 'LICENSE is published'
assert_tar_file 'NOTICE' 'NOTICE is published'
assert_tar_file 'dist/index.js' 'root JavaScript entry is published'
assert_tar_file 'dist/index.d.ts' 'root declaration entry is published'

for entry in core react agenda-view availability-grid calendar-list calendar-side-panel calendar-toolbar conflict-indicator create-event day-grid event-card event-detail-panel grid month-grid month-navigator search-results time-zone-list week-grid world-clocks; do
  assert_tar_file "dist/$entry.js" "$entry JavaScript entry is published"
  assert_tar_file "dist/$entry.d.ts" "$entry declaration entry is published"
done

assert_tar_file 'dist/theme.css' 'calendar theme stylesheet is published'
assert_tar_file 'dist/reset.css' 'calendar reset stylesheet is published'
assert_tar_file 'dist/docs/create-event.md' 'create-event documentation uses the emitted entry name'
assert_tar_file 'dist/docs/event-detail-panel.md' 'event-detail-panel documentation uses the emitted entry name'
assert_tar_absent '^package/dist/docs/create-event-popover\.md$' 'obsolete create-event-popover documentation is absent'
assert_tar_absent '^package/dist/docs/detail-panel\.md$' 'obsolete detail-panel documentation is absent'

for family in agenda-view availability-grid calendar-list calendar-side-panel calendar-toolbar conflict-indicator create-event day-grid event-card event-detail-panel grid month-grid month-navigator search-results time-zone-list week-grid world-clocks; do
  assert_tar_pattern "^package/dist/chunks/${family}\\.[^/]+\\.css$" "$family compiled CSS is published"
done

assert_tar_absent '^package/src/' 'source tree is not published'
assert_tar_absent '^package/(src/|.*vite-env\.d\.ts$)' 'vite-env declaration is not published'
assert_tar_absent '^package/(src/|.*__test-utils__|.*\.(test|unit|spec)\.)' 'test internals are not published'

if [ -n "$TARBALL" ]; then
  PACKAGE_JSON_FROM_TARBALL="$(tar -xOzf "$TARBALL" package/package.json 2>/dev/null)"
else
  PACKAGE_JSON_FROM_TARBALL=''
fi

if printf '%s\n' "$PACKAGE_JSON_FROM_TARBALL" | grep -Fqx '  "name": "@gears-frontx/calendar-kit",'; then
  pass 'tarball package name is correct'
else
  fail 'tarball package name is incorrect'
fi

if printf '%s\n' "$PACKAGE_JSON_FROM_TARBALL" | grep -Fqx "  \"version\": \"$EXPECTED_VERSION\","; then
  pass "tarball package version is $EXPECTED_VERSION"
else
  fail "tarball package version is not $EXPECTED_VERSION"
fi

CONSUMER="$WORKDIR/consumer"
mkdir -p "$CONSUMER/src"
cat > "$CONSUMER/package.json" <<'EOF'
{
  "name": "calendar-kit-first-alpha-consumer",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test:render": "vitest --run src/render-smoke.test.tsx"
  }
}
EOF

cat > "$CONSUMER/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

cat > "$CONSUMER/vite.config.js" <<'EOF'
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [react()] });
EOF

cat > "$CONSUMER/src/styles.d.ts" <<'EOF'
declare module '*.css';
EOF

cat > "$CONSUMER/vitest.config.js" <<'EOF'
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    testTimeout: 15000,
    server: {
      deps: {
        // ui-kit dist imports per-chunk CSS; Node chokes unless it is inlined.
        inline: ['@gears-frontx/calendar-kit', '@gears-frontx/ui-kit'],
      },
    },
  },
});
EOF

cat > "$CONSUMER/src/main.tsx" <<'EOF'
import '@gears-frontx/calendar-kit/theme.css';
import '@gears-frontx/calendar-kit/reset.css';

import { createRoot } from 'react-dom/client';
import type { CalendarEvent, CalendarTranslate } from '@gears-frontx/calendar-kit/core';
import { CalendarGrid } from '@gears-frontx/calendar-kit/grid';
import { ConflictIndicator } from '@gears-frontx/calendar-kit/conflict-indicator';
import { EventCard } from '@gears-frontx/calendar-kit/event-card';
import { EventDetailPanel } from '@gears-frontx/calendar-kit/event-detail-panel';
import { WeekGrid } from '@gears-frontx/calendar-kit/week-grid';
import { calendarDate, parseIanaTimeZone, parseLocalTime, utcInstant } from '@gears-frontx/calendar-kit/core';

const timeZone = parseIanaTimeZone('UTC');
const date = calendarDate('2026-08-24');
const event: CalendarEvent = {
  id: 'consumer-event',
  title: 'Consumer event',
  colorFamily: 'purple',
  timeZone,
  allDay: false,
  startDate: date,
  endDate: date,
  startTime: parseLocalTime('09:00'),
  endTime: parseLocalTime('10:00'),
  start: utcInstant('2026-08-24T09:00:00.000Z'),
  end: utcInstant('2026-08-24T10:00:00.000Z'),
};
const t: CalendarTranslate = (key) => key;

void [CalendarGrid, ConflictIndicator, EventCard, EventDetailPanel];

const root = document.getElementById('root');

if (!root) throw new Error('Consumer root element is missing');

createRoot(root).render(
  <WeekGrid
    date={date}
    events={[event]}
    locale="en-US"
    timeZone={timeZone}
    direction="ltr"
    t={t}
  />,
);
EOF

cat > "$CONSUMER/src/exports.ts" <<'EOF'
import {
  AgendaView,
  AvailabilityGrid,
  CalendarGrid,
  CalendarList,
  CalendarSidePanel,
  CalendarToolbar,
  ConflictIndicator,
  CreateEventPopover,
  DayGrid,
  EventCard,
  EventDetailPanel,
  MonthGrid,
  MonthNavigator,
  SearchResults,
  TimeZoneList,
  WeekGrid,
  WorldClocks,
} from '@gears-frontx/calendar-kit';
import type {
  AgendaViewProps,
  AvailabilityGridProps,
  CalendarGridProps,
  CalendarListProps,
  CalendarSidePanelProps,
  CalendarToolbarProps,
  CreateEventPopoverProps,
  DayGridProps,
  EventCardProps,
  EventDetailPanelProps,
  MonthGridData,
  MonthGridProps,
  MonthNavigatorProps,
  SearchResultsProps,
  TimeZoneListProps,
  WorldClocksProps,
} from '@gears-frontx/calendar-kit';

import {
  AgendaView as FlatAgendaView,
  type AgendaViewProps as FlatAgendaViewProps,
} from '@gears-frontx/calendar-kit/agenda-view';
import {
  AvailabilityGrid as FlatAvailabilityGrid,
  type AvailabilityGridProps as FlatAvailabilityGridProps,
} from '@gears-frontx/calendar-kit/availability-grid';
import {
  CalendarList as FlatCalendarList,
  type CalendarListProps as FlatCalendarListProps,
} from '@gears-frontx/calendar-kit/calendar-list';
import {
  CalendarSidePanel as FlatCalendarSidePanel,
  type CalendarSidePanelProps as FlatCalendarSidePanelProps,
} from '@gears-frontx/calendar-kit/calendar-side-panel';
import {
  CalendarToolbar as FlatCalendarToolbar,
  type CalendarToolbarProps as FlatCalendarToolbarProps,
} from '@gears-frontx/calendar-kit/calendar-toolbar';
import {
  ConflictIndicator as FlatConflictIndicator,
  type ConflictIndicatorProps,
} from '@gears-frontx/calendar-kit/conflict-indicator';
import {
  CreateEventPopover as FlatCreateEventPopover,
  type CreateEventPopoverProps as FlatCreateEventPopoverProps,
} from '@gears-frontx/calendar-kit/create-event';
import {
  DayGrid as FlatDayGrid,
  type DayGridProps as FlatDayGridProps,
} from '@gears-frontx/calendar-kit/day-grid';
import {
  EventCard as FlatEventCard,
  type EventCardProps as FlatEventCardProps,
} from '@gears-frontx/calendar-kit/event-card';
import {
  EventDetailPanel as FlatEventDetailPanel,
  type EventDetailPanelProps as FlatEventDetailPanelProps,
} from '@gears-frontx/calendar-kit/event-detail-panel';
import {
  CalendarGrid as FlatCalendarGrid,
  type CalendarGridProps as FlatCalendarGridProps,
} from '@gears-frontx/calendar-kit/grid';
import {
  MonthGrid as FlatMonthGrid,
  type MonthGridProps as FlatMonthGridProps,
} from '@gears-frontx/calendar-kit/month-grid';
import {
  MonthNavigator as FlatMonthNavigator,
  type MonthNavigatorProps as FlatMonthNavigatorProps,
} from '@gears-frontx/calendar-kit/month-navigator';
import {
  SearchResults as FlatSearchResults,
  type SearchResultsProps as FlatSearchResultsProps,
} from '@gears-frontx/calendar-kit/search-results';
import {
  TimeZoneList as FlatTimeZoneList,
  type TimeZoneListProps as FlatTimeZoneListProps,
} from '@gears-frontx/calendar-kit/time-zone-list';
import {
  WeekGrid as FlatWeekGrid,
  type WeekGridProps as FlatWeekGridProps,
} from '@gears-frontx/calendar-kit/week-grid';
import {
  WorldClocks as FlatWorldClocks,
  type WorldClocksProps as FlatWorldClocksProps,
} from '@gears-frontx/calendar-kit/world-clocks';
import {
  useAgendaViewController,
  useAvailabilityGridController,
  useCalendarSidePanelController,
  useCalendarToolbarController,
  useCreateEventController,
  useDayGridController,
  useMonthGridController,
  useMonthNavigatorController,
  useSearchResultsController,
  useWorldClocksController,
  useControlledValue,
  useInteractionController,
  useWeekGridController,
} from '@gears-frontx/calendar-kit/react';
import type { CalendarEvent, UtcInstant } from '@gears-frontx/calendar-kit';
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from '@gears-frontx/calendar-kit/core';
import type { CalendarEvent as CoreCalendarEvent } from '@gears-frontx/calendar-kit/core';

export const resolvedExports = [
  AgendaView,
  AvailabilityGrid,
  CalendarGrid,
  CalendarList,
  CalendarSidePanel,
  CalendarToolbar,
  ConflictIndicator,
  CreateEventPopover,
  DayGrid,
  EventCard,
  EventDetailPanel,
  MonthGrid,
  MonthNavigator,
  SearchResults,
  TimeZoneList,
  WeekGrid,
  WorldClocks,
  FlatAgendaView,
  FlatAvailabilityGrid,
  FlatCalendarGrid,
  FlatCalendarList,
  FlatCalendarSidePanel,
  FlatCalendarToolbar,
  FlatConflictIndicator,
  FlatCreateEventPopover,
  FlatDayGrid,
  FlatEventCard,
  FlatEventDetailPanel,
  FlatMonthGrid,
  FlatMonthNavigator,
  FlatSearchResults,
  FlatTimeZoneList,
  FlatWeekGrid,
  FlatWorldClocks,
  useAgendaViewController,
  useAvailabilityGridController,
  useCalendarSidePanelController,
  useCalendarToolbarController,
  useCreateEventController,
  useDayGridController,
  useMonthGridController,
  useMonthNavigatorController,
  useSearchResultsController,
  useWorldClocksController,
  useControlledValue,
  useInteractionController,
  useWeekGridController,
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
] as const;

export type FirstAlphaTypes = {
  readonly event: CalendarEvent;
  readonly instant: UtcInstant;
  readonly coreEvent: CoreCalendarEvent;
  readonly agenda: AgendaViewProps;
  readonly availability: AvailabilityGridProps;
  readonly calendarGrid: CalendarGridProps;
  readonly calendarList: CalendarListProps;
  readonly calendarSidePanel: CalendarSidePanelProps;
  readonly calendarToolbar: CalendarToolbarProps;
  readonly createEvent: CreateEventPopoverProps;
  readonly day: DayGridProps;
  readonly eventCard: EventCardProps;
  readonly eventDetail: EventDetailPanelProps;
  readonly monthData: MonthGridData;
  readonly month: MonthGridProps;
  readonly monthNavigator: MonthNavigatorProps;
  readonly search: SearchResultsProps;
  readonly timeZoneList: TimeZoneListProps;
  readonly worldClocks: WorldClocksProps;
  readonly flatAgenda: FlatAgendaViewProps;
  readonly flatAvailability: FlatAvailabilityGridProps;
  readonly flatCalendarGrid: FlatCalendarGridProps;
  readonly flatCalendarList: FlatCalendarListProps;
  readonly flatCalendarSidePanel: FlatCalendarSidePanelProps;
  readonly flatCalendarToolbar: FlatCalendarToolbarProps;
  readonly flatCreateEvent: FlatCreateEventPopoverProps;
  readonly flatDay: FlatDayGridProps;
  readonly flatEventCard: FlatEventCardProps;
  readonly flatEventDetail: FlatEventDetailPanelProps;
  readonly flatMonth: FlatMonthGridProps;
  readonly flatMonthNavigator: FlatMonthNavigatorProps;
  readonly flatSearch: FlatSearchResultsProps;
  readonly flatTimeZoneList: FlatTimeZoneListProps;
  readonly flatWeek: FlatWeekGridProps;
  readonly flatWorldClocks: FlatWorldClocksProps;
};
EOF

cat > "$CONSUMER/src/internal.ts" <<'EOF'
import type { CalendarDate } from '@gears-frontx/calendar-kit/core/model';
import type { CalendarLocalizedProps } from '@gears-frontx/calendar-kit/react/slots';

export type InternalTypes = CalendarDate & CalendarLocalizedProps;
EOF

cat > "$CONSUMER/tsconfig.base.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "jsx": "react-jsx",
    "skipLibCheck": false,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/main.tsx", "src/exports.ts", "src/styles.d.ts"]
}
EOF

cat > "$CONSUMER/tsconfig.nodenext.json" <<'EOF'
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
EOF

cat > "$CONSUMER/tsconfig.bundler.json" <<'EOF'
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
EOF

cat > "$CONSUMER/tsconfig.internal.json" <<'EOF'
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["src/internal.ts", "src/styles.d.ts"]
}
EOF

REACT_VERSION="$(node -p "require('$REPO_ROOT/node_modules/react/package.json').version")"
REACT_DOM_VERSION="$(node -p "require('$REPO_ROOT/node_modules/react-dom/package.json').version")"
VITE_VERSION="$(node -p "require('$REPO_ROOT/node_modules/vite/package.json').version")"
PLUGIN_REACT_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@vitejs/plugin-react/package.json').version")"
TYPESCRIPT_VERSION="$(node -p "require('$REPO_ROOT/node_modules/typescript/package.json').version")"
VITEST_VERSION="$(node -p "require('$REPO_ROOT/node_modules/vitest/package.json').version")"
TESTING_LIBRARY_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@testing-library/react/package.json').version")"
TESTING_DOM_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@testing-library/dom/package.json').version")"
JSDOM_VERSION="$(node -p "require('$REPO_ROOT/node_modules/jsdom/package.json').version")"
TYPES_NODE_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@types/node/package.json').version")"
TYPES_REACT_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@types/react/package.json').version")"
TYPES_REACT_DOM_VERSION="$(node -p "require('$REPO_ROOT/node_modules/@types/react-dom/package.json').version")"

printf '\nConsumer dependency pins: React=%s ReactDOM=%s Vite=%s TypeScript=%s Vitest=%s\n' "$REACT_VERSION" "$REACT_DOM_VERSION" "$VITE_VERSION" "$TYPESCRIPT_VERSION" "$VITEST_VERSION"

cd "$CONSUMER"

if [ -n "$TARBALL" ]; then
  run_step 'clean consumer install from calendar tarball' npm install --no-audit --no-fund "$TARBALL" "react@$REACT_VERSION" "react-dom@$REACT_DOM_VERSION"
  run_step 'install clean consumer verification tools' npm install --no-audit --no-fund --save-dev "vite@$VITE_VERSION" "@vitejs/plugin-react@$PLUGIN_REACT_VERSION" "typescript@$TYPESCRIPT_VERSION" "vitest@$VITEST_VERSION" "@testing-library/react@$TESTING_LIBRARY_VERSION" "@testing-library/dom@$TESTING_DOM_VERSION" "jsdom@$JSDOM_VERSION" "@types/node@$TYPES_NODE_VERSION" "@types/react@$TYPES_REACT_VERSION" "@types/react-dom@$TYPES_REACT_DOM_VERSION"
else
  fail 'consumer install skipped because the calendar tarball is missing'
fi

cd "$CONSUMER"

PACKAGE_INSTALL="$CONSUMER/node_modules/$PACKAGE_NAME"

if [ -L "$PACKAGE_INSTALL" ]; then
  fail 'calendar-kit is a workspace link in the clean consumer'
elif [ -d "$PACKAGE_INSTALL" ]; then
  case "$(cd "$PACKAGE_INSTALL" && pwd -P)" in
    "$REPO_ROOT"/*) fail 'calendar-kit resolves into the workspace instead of the packed tarball' ;;
    *) pass 'calendar-kit is installed as a non-workspace package' ;;
  esac
else
  fail 'calendar-kit is missing from the clean consumer'
fi

REACT_INSTALLED_FILES=( $(find "$CONSUMER/node_modules" -type f -path '*/node_modules/react/package.json' -print 2>/dev/null) )
assert_count "${#REACT_INSTALLED_FILES[@]}" '1' 'clean consumer has one React installation'

run_step 'clean consumer dependency tree' npm ls --depth=0
run_step 'vite consumer build' npm run build

if [ -d "$CONSUMER/dist" ]; then
  if grep -rq -- '--cal-color-surface' "$CONSUMER/dist"; then
    pass 'calendar theme aliases are present in the Vite bundle'
  else
    fail 'calendar theme aliases are missing from the Vite bundle'
  fi

  if grep -rq -- '--primary' "$CONSUMER/dist"; then
    pass 'calendar theme host color tokens are present in the Vite bundle'
  else
    fail 'calendar theme host color tokens are missing from the Vite bundle'
  fi
else
  fail 'Vite consumer build produced no dist directory'
fi

count_source_imports() {
  grep -RhoF -- "$1" "$CONSUMER/src" | wc -l | tr -d ' '
}

CALENDAR_THEME_IMPORTS="$(count_source_imports '@gears-frontx/calendar-kit/theme.css')"
assert_count "$CALENDAR_THEME_IMPORTS" '1' 'consumer imports calendar-kit theme once'

run_step 'nodenext export/type resolution' npx tsc -p tsconfig.nodenext.json
run_step 'bundler export/type resolution' npx tsc -p tsconfig.bundler.json

if npx tsc -p tsconfig.internal.json > "$WORKDIR/internal-type-check.log" 2>&1; then
  fail 'internal declaration modules are exposed to consumers (core/model and react/slots type imports compile)'
else
  pass 'internal declaration modules are rejected by the package export map'
  printf 'DECISIVE: internal type-check rejection\n'
  sed -n '1,12p' "$WORKDIR/internal-type-check.log"
fi

for specifier in \
  "$PACKAGE_NAME/src/core/model" \
  "$PACKAGE_NAME/chunks/temporal" \
  "$PACKAGE_NAME/__test-utils__/setup" \
  "$PACKAGE_NAME/core/model" \
  "$PACKAGE_NAME/react/slots"; do
  if node --input-type=module -e 'await import(process.argv[1])' "$specifier" > "$WORKDIR/export-check.log" 2>&1; then
    fail "private or internal export unexpectedly resolves ($specifier)"
  else
    pass "private or internal export is blocked ($specifier)"
  fi
done

if node --input-type=module -e '
  const core = await import(`${process.argv[1]}/core`);

  for (const name of ["calendarDate", "parseIanaTimeZone", "parseLocalTime", "utcInstant"]) {
    if (typeof core[name] !== "function") {
      throw new Error(`missing core export: ${name}`);
    }
  }

  console.log("DECISIVE: raw Node core runtime exports resolve");
' "$PACKAGE_NAME"; then
  pass 'core family runtime exports resolve through raw Node'
else
  fail 'core family runtime exports do not resolve through raw Node'
fi

printf 'Runtime split: root component exports are asserted through the Vite/jsdom consumer smoke; raw Node is reserved for the CSS-free core entry.\n'

CORE_CONSUMER="$WORKDIR/core-consumer"
mkdir -p "$CORE_CONSUMER"
cat > "$CORE_CONSUMER/package.json" <<'EOF'
{
  "name": "calendar-kit-core-first-alpha-consumer",
  "private": true,
  "type": "module"
}
EOF

cd "$CORE_CONSUMER"
if [ -n "$TARBALL" ]; then
  run_step 'clean core-only consumer install from calendar tarball' npm install --no-audit --no-fund --omit=peer "$TARBALL"
else
  fail 'core-only consumer install skipped because the calendar tarball is missing'
fi

CORE_REACT_FILES=( $(find "$CORE_CONSUMER/node_modules" -type f -path '*/node_modules/react/package.json' -print 2>/dev/null) )
assert_count "${#CORE_REACT_FILES[@]}" '0' 'core-only consumer has no React installation'

if node --input-type=module -e '
  const core = await import("@gears-frontx/calendar-kit/core");
  const date = core.calendarDate("2026-08-24");
  if (date !== "2026-08-24") throw new Error("core date parsing failed");
  if (typeof core.parseIanaTimeZone !== "function") throw new Error("core export missing");
  console.log("DECISIVE: core import resolved without React");
'; then
  pass 'core JavaScript entry imports without React'
else
  fail 'core JavaScript entry does not import without React'
fi

cd "$CONSUMER"

cat > "$CONSUMER/src/render-smoke.test.tsx" <<'EOF'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgendaView,
  AvailabilityGrid,
  CalendarGrid,
  CalendarList,
  CalendarSidePanel,
  CalendarToolbar,
  ConflictIndicator,
  CreateEventPopover,
  DayGrid,
  EventCard,
  EventDetailPanel,
  MonthGrid,
  MonthNavigator,
  SearchResults,
  TimeZoneList,
  WeekGrid,
  WorldClocks,
} from '@gears-frontx/calendar-kit';

import { AgendaView as FlatAgendaView } from '@gears-frontx/calendar-kit/agenda-view';
import { AvailabilityGrid as FlatAvailabilityGrid } from '@gears-frontx/calendar-kit/availability-grid';
import { CalendarList as FlatCalendarList } from '@gears-frontx/calendar-kit/calendar-list';
import { CalendarSidePanel as FlatCalendarSidePanel } from '@gears-frontx/calendar-kit/calendar-side-panel';
import { CalendarToolbar as FlatCalendarToolbar } from '@gears-frontx/calendar-kit/calendar-toolbar';
import { ConflictIndicator as FlatConflictIndicator } from '@gears-frontx/calendar-kit/conflict-indicator';
import { CreateEventPopover as FlatCreateEventPopover } from '@gears-frontx/calendar-kit/create-event';
import { DayGrid as FlatDayGrid } from '@gears-frontx/calendar-kit/day-grid';
import { EventDetailPanel as FlatEventDetailPanel } from '@gears-frontx/calendar-kit/event-detail-panel';
import { EventCard as FlatEventCard } from '@gears-frontx/calendar-kit/event-card';
import { CalendarGrid as FlatCalendarGrid } from '@gears-frontx/calendar-kit/grid';
import { MonthGrid as FlatMonthGrid } from '@gears-frontx/calendar-kit/month-grid';
import { MonthNavigator as FlatMonthNavigator } from '@gears-frontx/calendar-kit/month-navigator';
import { SearchResults as FlatSearchResults } from '@gears-frontx/calendar-kit/search-results';
import { TimeZoneList as FlatTimeZoneList } from '@gears-frontx/calendar-kit/time-zone-list';
import { WeekGrid as FlatWeekGrid } from '@gears-frontx/calendar-kit/week-grid';
import { WorldClocks as FlatWorldClocks } from '@gears-frontx/calendar-kit/world-clocks';
import { calendarDate, parseIanaTimeZone, parseLocalTime, utcInstant, type CalendarConflict, type CalendarEvent, type CalendarQuickCreatePayload } from '@gears-frontx/calendar-kit/core';
import { useControlledValue, useInteractionController, useWeekGridController } from '@gears-frontx/calendar-kit/react';
import type { CalendarDetailRenderer, CalendarEventRenderer } from '@gears-frontx/calendar-kit/react';

const timeZone = parseIanaTimeZone('UTC');
const date = calendarDate('2026-08-24');

function event(id: string, title: string, startTime: string, endTime: string, available = true): CalendarEvent {
  return {
    id,
    title,
    colorFamily: 'purple',
    timeZone,
    allDay: false,
    startDate: date,
    endDate: date,
    startTime: parseLocalTime(startTime),
    endTime: parseLocalTime(endTime),
    start: utcInstant(`2026-08-24T${startTime}:00.000Z`),
    end: utcInstant(`2026-08-24T${endTime}:00.000Z`),
    available,
    conflicts: available ? [{ id: `${id}-conflict`, dimension: 'instructor', label: 'Dr. Smith' }] : [{ id: `${id}-conflict`, dimension: 'classroom', label: 'Room B12' }],
  };
}

const events = [
  event('event-1', 'Chemistry', '09:00', '10:00'),
  event('event-2', 'Physics', '10:00', '11:00', false),
  event('event-3', 'Mathematics', '11:00', '12:00'),
];

const t = (key: string): string => key;

function cellAt(time: string): HTMLElement {
  // Row gutter cells expose a bare time label ("13:00") and come first in DOM order,
  // so scope the query to the dated timed cell instead of the first time match.
  return screen.getByRole('gridcell', {
    name: new RegExp(`^Monday, August 24, 2026 ${time}`, 'u'),
  });
}

describe('first-alpha installed consumer', () => {
  afterEach(cleanup);

  it('renders WeekGrid modes, custom events, conflicts, and the detail slot', () => {
    const quickCreates: CalendarQuickCreatePayload[] = [];
    const renderEvent: CalendarEventRenderer = ({ event: currentEvent }) => <span>{currentEvent.title}</span>;
    const renderDetail: CalendarDetailRenderer = ({ event: currentEvent, close }) => (
      <aside aria-label="Consumer details">
        <h2>{currentEvent.title}</h2>
        <button type="button" onClick={close}>Close detail</button>
      </aside>
    );

    render(
      <FlatWeekGrid
        date={date}
        events={events}
        locale="en-US"
        timeZone={timeZone}
        direction="ltr"
        t={t}
        interactionMode="quick-create"
        selectedEventId="event-1"
        onQuickCreate={(payload) => quickCreates.push(payload)}
        renderEvent={renderEvent}
        renderConflict={(conflict) => <span>{conflict.dimension}: {conflict.label}</span>}
        renderDetail={renderDetail}
      />,
    );

    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chemistry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Physics' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText('instructor: Dr. Smith')).toHaveLength(2);
    expect(screen.getByText('classroom: Room B12')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Consumer details' })).toBeTruthy();

    fireEvent.keyDown(cellAt('13:00'), { key: 'Enter' });
    expect(quickCreates).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    expect(screen.queryByRole('complementary', { name: 'Consumer details' })).toBeNull();

    cleanup();

    const readOnlyCreates: CalendarQuickCreatePayload[] = [];
    render(
      <FlatWeekGrid
        date={date}
        events={events}
        locale="en-US"
        timeZone={timeZone}
        direction="ltr"
        t={t}
        interactionMode="read-only"
        onQuickCreate={(payload) => readOnlyCreates.push(payload)}
        renderEvent={renderEvent}
      />,
    );

    fireEvent.keyDown(cellAt('13:00'), { key: 'Enter' });
    expect(readOnlyCreates).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Chemistry' }).getAttribute('aria-description')).toMatch(/read[- ]?only/i);
  });

  it('renders EventCard and ConflictIndicator from installed family entries', () => {
    const conflicts: readonly CalendarConflict[] = [
      { id: 'c1', dimension: 'program/section', label: 'BSc CS / Section 2' },
      { id: 'c2', dimension: 'classroom', label: 'Room B12' },
    ];

    render(
      <FlatEventCard
        event={events[0]}
        locale="en-US"
        timeZone={timeZone}
        direction="ltr"
        t={t}
        conflicts={conflicts}
        past
        readOnly
      />,
    );

    const card = screen.getByRole('button', { name: /^Chemistry/ });
    expect(card.getAttribute('data-event-id')).toBe('event-1');
    expect(card.getAttribute('aria-describedby')).toBeTruthy();
    expect(card.textContent).toContain('program/section');

    cleanup();
    render(<FlatConflictIndicator conflicts={conflicts} direction="ltr" t={t} />);
    expect(screen.getByText('program/section')).toBeTruthy();
    expect(screen.getByText('BSc CS / Section 2')).toBeTruthy();
    expect(screen.getByText('classroom')).toBeTruthy();
  });

  it('loads every first-alpha family entry at runtime', () => {
    expect(typeof FlatCalendarGrid).toBe('function');
    expect(typeof FlatWeekGrid).toBe('function');
    expect(typeof FlatEventCard).toBe('function');
    expect(typeof FlatConflictIndicator).toBe('function');
    expect(typeof FlatEventDetailPanel).toBe('function');
    expect(typeof useControlledValue).toBe('function');
    expect(typeof useInteractionController).toBe('function');
    expect(typeof useWeekGridController).toBe('function');
  });

  it('loads every group-1 family from the root entry at runtime', () => {
    expect(typeof CalendarGrid).toBe('function');
    expect(typeof WeekGrid).toBe('function');
    expect(typeof EventCard).toBe('function');
    expect(typeof ConflictIndicator).toBe('function');
    expect(typeof EventDetailPanel).toBe('function');
  });

  it('loads every group-2 family from root and flat entries at runtime', () => {
    expect(typeof AgendaView).toBe('function');
    expect(typeof AvailabilityGrid).toBe('function');
    expect(typeof CalendarList).toBe('function');
    expect(typeof CalendarSidePanel).toBe('function');
    expect(typeof CalendarToolbar).toBe('function');
    expect(typeof CreateEventPopover).toBe('function');
    expect(typeof DayGrid).toBe('function');
    expect(typeof MonthGrid).toBe('function');
    expect(typeof MonthNavigator).toBe('function');
    expect(typeof SearchResults).toBe('function');
    expect(typeof TimeZoneList).toBe('function');
    expect(typeof WorldClocks).toBe('function');
    expect(typeof FlatAgendaView).toBe('function');
    expect(typeof FlatAvailabilityGrid).toBe('function');
    expect(typeof FlatCalendarList).toBe('function');
    expect(typeof FlatCalendarSidePanel).toBe('function');
    expect(typeof FlatCalendarToolbar).toBe('function');
    expect(typeof FlatCreateEventPopover).toBe('function');
    expect(typeof FlatDayGrid).toBe('function');
    expect(typeof FlatMonthGrid).toBe('function');
    expect(typeof FlatMonthNavigator).toBe('function');
    expect(typeof FlatSearchResults).toBe('function');
    expect(typeof FlatTimeZoneList).toBe('function');
    expect(typeof FlatWorldClocks).toBe('function');
  });
});
EOF

SMOKE_STARTED_MS="$(node -p 'Date.now()')"
run_step 'installed React/jsdom render smoke' npm run test:render
SMOKE_FINISHED_MS="$(node -p 'Date.now()')"
printf 'Installed React/jsdom render smoke duration: %sms\n' "$((SMOKE_FINISHED_MS - SMOKE_STARTED_MS))"

printf '\nVERIFICATION SUMMARY\n'
printf 'Tarball: %s\n' "${TARBALL:-missing}"
if [ -n "$TARBALL" ]; then
  printf 'Tarball SHA256: '
  shasum -a 256 "$TARBALL" | awk '{print $1}'
fi
printf 'Assertions recorded: %s failure(s)\n' "$FAILURES"
