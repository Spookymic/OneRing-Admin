import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  /** Bouton d'action dans le toast (ex. « Annuler » pour un rollback immédiat). */
  action?: { label: string; onClick: () => void };
}

export function useToast() {
  function toast({ title, description, variant, action }: ToastOptions) {
    const opts = { description, ...(action ? { action, duration: 10_000 } : {}) };
    if (variant === "destructive") {
      sonnerToast.error(title, opts);
    } else {
      sonnerToast.success(title, opts);
    }
  }

  return { toast };
}
