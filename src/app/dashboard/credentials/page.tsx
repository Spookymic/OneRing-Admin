"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/ui/loader";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import { ExportButton } from "@/components/ui/export-button";

interface Cred {
  appObjectId: string;
  appId: string;
  appName: string;
  type: "secret" | "certificate";
  name: string | null;
  endDateTime: string;
  daysLeft: number;
}

export default function CredentialsPage() {
  const [search, setSearch] = useState("");

  // days élevé → renvoie tous les secrets/certificats
  const { data, isLoading, error } = useQuery<{ supported: boolean; credentials: Cred[] }>({
    queryKey: ["all-credentials"],
    queryFn: () => apiFetch<{ supported: boolean; credentials: Cred[] }>("/api/security/expiring-credentials?days=100000"),
    staleTime: 10 * 60 * 1000,
  });

  const creds = (data?.credentials ?? []).filter(
    (c) =>
      c.appName.toLowerCase().includes(search.toLowerCase()) ||
      (c.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const expiredCount = (data?.credentials ?? []).filter((c) => c.daysLeft < 0).length;
  const soonCount = (data?.credentials ?? []).filter((c) => c.daysLeft >= 0 && c.daysLeft <= 30).length;

  if (error) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Secrets &amp; certificats</h2>
        <div className="rounded-md border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 p-4 text-red-700 dark:text-red-300 text-sm">
          Erreur : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold">Secrets &amp; certificats</h2>
          <p className="text-sm text-foreground/50 mt-0.5">
            Identifiants des inscriptions d&apos;applications Azure AD et leur expiration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {expiredCount > 0 && <Badge variant="destructive">{expiredCount} expiré(s)</Badge>}
          {soonCount > 0 && <Badge variant="secondary">{soonCount} ≤ 30 j</Badge>}
          <ExportButton
            fileBase="onering-secrets-certificats"
            disabled={data?.supported === false}
            sheets={() => [{
              name: "Secrets et certificats",
              columns: [
                { header: "Application", key: "app", width: 36 },
                { header: "App ID", key: "appId", width: 38 },
                { header: "Type", key: "type", width: 14 },
                { header: "Identifiant", key: "nom", width: 28 },
                { header: "Expiration", key: "exp", width: 14 },
                { header: "Jours restants", key: "jours", width: 14 },
              ],
              rows: creds.map((c) => ({
                app: c.appName,
                appId: c.appId,
                type: c.type === "certificate" ? "Certificat" : "Secret",
                nom: c.name ?? "",
                exp: format(new Date(c.endDateTime), "dd/MM/yyyy"),
                jours: c.daysLeft,
              })),
            }]}
          />
        </div>
      </div>

      {data?.supported === false ? (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 p-4 text-amber-700 dark:text-amber-300 text-sm">
          Lecture des applications indisponible — le droit Directory/Application est requis sur le compte connecté.
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Rechercher une application ou un identifiant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <th className="p-3 text-sm font-medium text-left">Application</th>
                  <th className="p-3 text-sm font-medium text-left">Type</th>
                  <th className="p-3 text-sm font-medium text-left">Identifiant</th>
                  <th className="p-3 text-sm font-medium text-left">Expiration</th>
                  <th className="p-3 text-sm font-medium text-left">Restant</th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="py-10"><Loader label="Chargement des secrets & certificats…" /></div>
                        </TableCell>
                      </TableRow>
                    )
                  : creds.map((c, i) => (
                      <TableRow key={`${c.appObjectId}-${i}`}>
                        <TableCell className="font-medium">{c.appName}</TableCell>
                        <TableCell>
                          <Badge variant={c.type === "certificate" ? "outline" : "secondary"} className="text-xs">
                            {c.type === "certificate" ? "Certificat" : "Secret"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 dark:text-gray-400">{c.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(c.endDateTime), "dd MMM yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell
                          className={`text-sm font-medium ${
                            c.daysLeft < 0 ? "text-red-600" : c.daysLeft <= 30 ? "text-amber-600" : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {c.daysLeft < 0 ? `expiré depuis ${-c.daysLeft} j` : `${c.daysLeft} j`}
                        </TableCell>
                      </TableRow>
                    ))}
                {!isLoading && creds.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                      Aucun secret / certificat.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
