import {
  CheckCircle2,
  Info,
  Loader2,
  XOctagon,
  AlertTriangle,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <Info className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <XOctagon className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      {...props}
    />
  )
}

export { Toaster }
