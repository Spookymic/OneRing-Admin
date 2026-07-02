"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateSharedMailboxDialog } from "@/components/mailboxes/create-shared-mailbox-dialog";
import { MailboxDelegationsSheet } from "@/components/mailboxes/mailbox-delegations-sheet";
import { useAdminSettings } from "@/lib/admin-settings";
import { apiFetch } from "@/lib/api";
import { useSort } from "@/lib/use-sort";
import { SortableHead } from "@/components/ui/sortable-head";
import type { SharedMailbox } from "@/services/exchange/shared-mailboxes";

type MbxSortCol = "displayName" | "mail";

export default function MailboxesPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<SharedMailbox | null>(null);
  const { settings } = useAdminSettings();

  const { data: mailboxes, isLoading, error } = useQuery<SharedMailbox[]>({
    queryKey: ["shared-mailboxes"],
    queryFn: () => apiFetch<SharedMailbox[]>("/api/mailboxes"),
  });

  const filtered = mailboxes?.filter(
    (m) =>
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (m.mail ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const { sorted, col, dir, toggle } = useSort<SharedMailbox, MbxSortCol>(
    filtered ?? [],
    (m, c) => (c === "mail" ? m.mail ?? "" : m.displayName)
  );

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Boîtes partagées</h2>
        <div className="rounded-md border bg-red-50 border-red-200 p-4 text-red-700 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Boîtes partagées</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered?.length ?? 0} / {mailboxes?.length ?? 0}</Badge>
          {!settings.hideGroupCreation && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Nouvelle boîte partagée
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Rechercher une boîte..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Nom"   col="displayName" activeCol={col} dir={dir} onToggle={toggle} />
              <SortableHead label="Email" col="mail"        activeCol={col} dir={dir} onToggle={toggle} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <div className="py-10"><Loader label="Chargement des boîtes partagées…" /></div>
                    </TableCell>
                  </TableRow>
                )
              : sorted.map((m) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer hover:bg-foreground/5"
                    onClick={() => setSelected(m)}
                  >
                    <TableCell className="font-medium">{m.displayName}</TableCell>
                    <TableCell className="text-gray-500">{m.mail ?? "-"}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      <CreateSharedMailboxDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <MailboxDelegationsSheet
        mailbox={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
