import { useMemo } from 'react';
import { toast, type ExternalToast } from 'sonner';

type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

interface UseToastOptions {
  defaultDuration?: number;
  defaultPosition?: ToastPosition;
}

type ToastOptions = ExternalToast;

interface ToastPromiseOptions<T> {
  loading: string;
  success: string | ((data: T) => string);
  error: string | ((error: Error) => string);
}

type PromiseResult<T> = (string | number) & { unwrap: () => Promise<T> };

interface UseToastReturn {
  toast: (message: string, options?: ToastOptions) => string | number;
  success: (message: string, options?: ToastOptions) => string | number;
  error: (message: string, options?: ToastOptions) => string | number;
  warning: (message: string, options?: ToastOptions) => string | number;
  info: (message: string, options?: ToastOptions) => string | number;
  loading: (message: string, options?: ToastOptions) => string | number;
  promise: <T>(promise: Promise<T> | (() => Promise<T>), options: ToastPromiseOptions<T>) => PromiseResult<T>;
  dismiss: (toastId?: string | number) => void;
}

/**
 * Hook for displaying toast notifications using Sonner.
 * Provides typed methods for common toast variants with optional default configuration.
 *
 * @param options - Optional default configuration for all toasts from this hook instance
 * @returns Object with methods: toast, success, error, warning, info, loading, promise, dismiss
 *
 * @example
 * const { success, error, promise } = useToast();
 *
 * success("Saved successfully!");
 * error("Something went wrong");
 * promise(saveData(), {
 *   loading: "Saving...",
 *   success: "Saved!",
 *   error: "Failed to save"
 * });
 */
export function useToast(options: UseToastOptions = {}): UseToastReturn {
  const { defaultDuration, defaultPosition } = options;

  return useMemo(() => {
    const mergeDefaults = (opts?: ToastOptions): ToastOptions => ({
      duration: defaultDuration,
      position: defaultPosition,
      ...opts,
    });

    return {
      toast: (message: string, opts?: ToastOptions) =>
        toast(message, mergeDefaults(opts)),

      success: (message: string, opts?: ToastOptions) =>
        toast.success(message, mergeDefaults(opts)),

      error: (message: string, opts?: ToastOptions) =>
        toast.error(message, mergeDefaults(opts)),

      warning: (message: string, opts?: ToastOptions) =>
        toast.warning(message, mergeDefaults(opts)),

      info: (message: string, opts?: ToastOptions) =>
        toast.info(message, mergeDefaults(opts)),

      loading: (message: string, opts?: ToastOptions) =>
        toast.loading(message, mergeDefaults(opts)),

      promise: <T>(
        promiseOrFn: Promise<T> | (() => Promise<T>),
        opts: ToastPromiseOptions<T>
      ) => toast.promise(promiseOrFn, opts) as PromiseResult<T>,

      dismiss: (toastId?: string | number) => toast.dismiss(toastId),
    };
  }, [defaultDuration, defaultPosition]);
}

export type { UseToastOptions, UseToastReturn, ToastOptions, ToastPromiseOptions, PromiseResult };
