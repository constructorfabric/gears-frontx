"use client"

import * as React from "react"
import { format } from "date-fns"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { CalendarIcon } from "../icons/CalendarIcon"
import { ChevronDownIcon } from "../icons/ChevronDownIcon"
import { ButtonVariant } from "../types"

// Context for sharing state between DatePicker components
interface DatePickerContextValue {
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  open: boolean
  setOpen: (open: boolean) => void
  formatDate: (date: Date) => string
}

const DatePickerContext = React.createContext<DatePickerContextValue | null>(null)

function useDatePickerContext() {
  const context = React.useContext(DatePickerContext)
  if (!context) {
    throw new Error("DatePicker components must be used within a DatePicker")
  }
  return context
}

// Default date formatter
function defaultFormatDate(date: Date): string {
  return format(date, "PPP")
}

// Main DatePicker wrapper
interface DatePickerProps {
  children: React.ReactNode
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  defaultDate?: Date
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  formatDate?: (date: Date) => string
}

function DatePicker({
  children,
  date: controlledDate,
  onDateChange,
  defaultDate,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  formatDate: formatDateProp = defaultFormatDate,
}: DatePickerProps) {
  const [uncontrolledDate, setUncontrolledDate] = React.useState<Date | undefined>(defaultDate)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)

  const isDateControlled = controlledDate !== undefined
  const isOpenControlled = controlledOpen !== undefined

  const date = isDateControlled ? controlledDate : uncontrolledDate
  const open = isOpenControlled ? controlledOpen : uncontrolledOpen

  const setDate = React.useCallback((newDate: Date | undefined) => {
    if (!isDateControlled) {
      setUncontrolledDate(newDate)
    }
    onDateChange?.(newDate)
  }, [isDateControlled, onDateChange])

  const setOpen = React.useCallback((newOpen: boolean) => {
    if (!isOpenControlled) {
      setUncontrolledOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }, [isOpenControlled, onOpenChange])

  const contextValue = React.useMemo(() => ({
    date,
    setDate,
    open,
    setOpen,
    formatDate: formatDateProp,
  }), [date, setDate, open, setOpen, formatDateProp])

  return (
    <DatePickerContext.Provider value={contextValue}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </DatePickerContext.Provider>
  )
}

// Trigger button for DatePicker
interface DatePickerTriggerProps extends Omit<React.ComponentProps<typeof Button>, "children"> {
  placeholder?: string
  icon?: "calendar" | "chevron"
  children?: React.ReactNode
}

function DatePickerTrigger({
  className,
  placeholder = "Pick a date",
  icon = "calendar",
  children,
  ...props
}: DatePickerTriggerProps) {
  const { date, formatDate } = useDatePickerContext()

  return (
    <PopoverTrigger asChild>
      <Button
        variant={ButtonVariant.Outline}
        data-slot="date-picker-trigger"
        data-empty={!date}
        className={cn(
          "w-[280px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            {icon === "calendar" && <CalendarIcon className="mr-2 size-4" />}
            {date ? formatDate(date) : <span>{placeholder}</span>}
            {icon === "chevron" && <ChevronDownIcon className="ml-auto size-4" />}
          </>
        )}
      </Button>
    </PopoverTrigger>
  )
}

// Content wrapper for DatePicker (contains Calendar)
interface DatePickerContentProps extends Omit<React.ComponentProps<typeof PopoverContent>, "children"> {
  calendarProps?: Omit<React.ComponentProps<typeof Calendar>, "mode" | "selected" | "onSelect">
  children?: React.ReactNode
}

function DatePickerContent({
  className,
  calendarProps,
  children,
  align = "start",
  ...props
}: DatePickerContentProps) {
  const { date, setDate, setOpen } = useDatePickerContext()

  return (
    <PopoverContent
      data-slot="date-picker-content"
      className={cn("w-auto overflow-hidden p-0", className)}
      align={align}
      {...props}
    >
      {children ?? (
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            setDate(newDate)
            setOpen(false)
          }}
          {...calendarProps}
        />
      )}
    </PopoverContent>
  )
}

// Input variant with calendar icon trigger
interface DatePickerInputProps {
  className?: string
  inputProps?: Omit<React.ComponentProps<typeof Input>, "value" | "onChange">
  placeholder?: string
  id?: string
}

function DatePickerInput({
  className,
  inputProps,
  placeholder = "Select date",
  id,
}: DatePickerInputProps) {
  const { date, setDate, setOpen, formatDate } = useDatePickerContext()
  const [inputValue, setInputValue] = React.useState(date ? formatDate(date) : "")
  const [month, setMonth] = React.useState<Date | undefined>(date)

  // Sync input value when date changes externally
  React.useEffect(() => {
    setInputValue(date ? formatDate(date) : "")
  }, [date, formatDate])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    // Try to parse the date
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      setDate(parsed)
      setMonth(parsed)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
    }
  }

  const handleCalendarSelect = (newDate: Date | undefined) => {
    setDate(newDate)
    setInputValue(newDate ? formatDate(newDate) : "")
    setOpen(false)
  }

  return (
    <div className={cn("relative flex gap-2", className)} data-slot="date-picker-input">
      <Input
        id={id}
        value={inputValue}
        placeholder={placeholder}
        className="bg-background pr-10"
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        {...inputProps}
      />
      <PopoverTrigger asChild>
        <Button
          variant={ButtonVariant.Ghost}
          className="absolute top-1/2 right-2 size-6 -translate-y-1/2 p-0"
          aria-label="Select date"
        >
          <CalendarIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto overflow-hidden p-0"
        align="end"
        alignOffset={-8}
        sideOffset={10}
      >
        <Calendar
          mode="single"
          selected={date}
          captionLayout="dropdown"
          month={month}
          onMonthChange={setMonth}
          onSelect={handleCalendarSelect}
        />
      </PopoverContent>
    </div>
  )
}

export {
  DatePicker,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerInput,
}
