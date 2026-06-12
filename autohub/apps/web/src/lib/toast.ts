import { toast as sonnerToast } from "sonner";

/**
 * Thin wrapper over sonner so callers import from one place and we can tune
 * defaults centrally. Mutations across the app surface feedback through this.
 */
export const toast = {
  success: (message: string, description?: string) => sonnerToast.success(message, { description }),
  error: (message: string, description?: string) => sonnerToast.error(message, { description }),
  info: (message: string, description?: string) => sonnerToast(message, { description }),
  /** Resolve a promise with toast states (loading → success/error). */
  promise: sonnerToast.promise,
};
