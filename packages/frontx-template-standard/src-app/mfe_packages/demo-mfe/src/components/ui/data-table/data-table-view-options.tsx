"use client"

import { type Table } from "@tanstack/react-table"
import { Settings2 } from "lucide-react"
import { ButtonVariant, ButtonSize } from "../../types"

import { Button } from "../button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu"

export interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
  /** Label for the dropdown menu (default: "Toggle columns") */
  label?: string
  /** Button text (default: "View") */
  buttonText?: string
}

export function DataTableViewOptions<TData>({
  table,
  label = "Toggle columns",
  buttonText = "View",
}: DataTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.Outline}
          size={ButtonSize.Sm}
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2 className="size-4" />
          {buttonText}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
