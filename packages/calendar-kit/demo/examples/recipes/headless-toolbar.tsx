import { useCalendarToolbarController } from "@gears-frontx/calendar-kit";
import type { CalendarDate, CalendarView } from "@gears-frontx/calendar-kit";

export const PillToolbar = ({
  date,
  view,
  onViewChange,
}: {
  readonly date: CalendarDate;
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
}) => {
  const toolbar = useCalendarToolbarController({
    activeView: view,
    currentDate: date,
    direction: "ltr",
    locale: "en-US",
    onViewChange,
  });

  return (
    <header>
      <h2>
        {toolbar.titleMonth} {toolbar.titleYear}
      </h2>
      <div role="radiogroup" aria-label="View">
        {toolbar.availableViews.map((option, index) => (
          <button
            key={option}
            ref={(element) => {
              toolbar.registerRadio(option, element);
            }}
            type="button"
            role="radio"
            aria-checked={option === toolbar.activeView}
            tabIndex={option === toolbar.activeView ? 0 : -1}
            onClick={() => {
              toolbar.selectView(option);
            }}
            onKeyDown={(event) => {
              toolbar.handleViewKeyDown(event, index);
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </header>
  );
};
