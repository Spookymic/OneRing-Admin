"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadXlsx, type XlsxSheet } from "@/lib/xlsx";
import { format } from "date-fns";

interface Props {
  /** Base du nom de fichier (sans extension ni date). */
  fileBase: string;
  /** Feuilles à exporter — thunk évalué au clic (données fraîches). */
  sheets: () => XlsxSheet[];
  disabled?: boolean;
  label?: string;
}

/** Bouton d'export Excel réutilisable pour les écrans en liste. */
export function ExportButton({ fileBase, sheets, disabled, label = "Exporter" }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => downloadXlsx(`${fileBase}-${format(new Date(), "yyyy-MM-dd")}`, sheets())}
      title="Exporter en Excel (.xlsx)"
    >
      <Download className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
}
