"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/ui/export-button";
import { ArrowRight, CheckCircle, Inbox, Info, MinusCircle, Undo2, Users, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import type { M365User, M365UserGroup } from "@/services/graph/users";
import {
  GROUP_COPY_STATUS_LABELS,
  getNonCopyableReason,
  isExchangeManaged,
  type GroupCopyReport,
  type GroupCopyStatus,
} from "@/lib/group-copy";
import {
  DELEGATION_LABELS,
  delegationsOf,
  type MailboxCopyReport,
  type UserMailboxAccess,
} from "@/lib/mailbox-access";
import { useUserSharedMailboxes } from "@/hooks/use-user-shared-mailboxes";
import { IndexProgress } from "@/components/mailboxes/index-progress";

interface Props {
  /** Utilisateur source (dont on copie les accès) */
  user: M365User;
  open: boolean;
  onClose: () => void;
  /** Accès copiés : groupes (onglet Groupes) ou délégations sur boîtes partagées (onglet Boîtes partagées) */
  scope: CopyScope;
}

export type CopyScope = "groups" | "mailboxes";

type Step = "pick" | "preview" | "report";

const STATUS_STYLE: Record<GroupCopyStatus, { icon: typeof CheckCircle; className: string }> = {
  added: { icon: CheckCircle, className: "text-green-600 dark:text-green-400" },
  already: { icon: Info, className: "text-blue-600 dark:text-blue-400" },
  skipped: { icon: MinusCircle, className: "text-amber-600 dark:text-amber-400" },
  error: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
};

const STATUS_ORDER: GroupCopyStatus[] = ["added", "already", "skipped", "error"];

/** Ligne de rapport commune aux groupes et aux boîtes partagées */
interface ReportRow {
  key: string;
  label: string;
  detail?: string;
  status: GroupCopyStatus;
  reason?: string;
}

const groupKey = (groupId: string) => `g:${groupId}`;
const mailboxKey = (mail: string, type: string) => `m:${mail.toLowerCase()}:${type}`;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function CopyAccessDialog({ user, open, onClose, scope }: Props) {
  const withGroups = scope === "groups";
  const withMailboxes = scope === "mailboxes";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("pick");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<M365User | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [groupReport, setGroupReport] = useState<GroupCopyReport | null>(null);
  const [mailboxReport, setMailboxReport] = useState<MailboxCopyReport | null>(null);
  const [copyErrors, setCopyErrors] = useState<string[]>([]);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [rolledBack, setRolledBack] = useState<Set<string>>(new Set());

  // Réinitialisation à chaque ouverture
  useEffect(() => {
    if (open) {
      setStep("pick");
      setSearch("");
      setTarget(null);
      setGroupReport(null);
      setMailboxReport(null);
      setCopyErrors([]);
      setConfirmRollback(false);
      setRolledBack(new Set());
    }
  }, [open]);

  const { data: users } = useQuery<M365User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<M365User[]>("/api/users"),
    enabled: open,
  });

  // ── Groupes ──
  const { data: sourceGroups } = useQuery<M365UserGroup[]>({
    queryKey: ["user-groups", user.id],
    queryFn: () => apiFetch<M365UserGroup[]>(`/api/users/${user.id}/groups`),
    enabled: open && withGroups,
  });

  const { data: targetGroups, isLoading: targetGroupsLoading } = useQuery<M365UserGroup[]>({
    queryKey: ["user-groups", target?.id],
    queryFn: () => apiFetch<M365UserGroup[]>(`/api/users/${target!.id}/groups`),
    enabled: open && withGroups && !!target && step !== "pick",
  });

  // ── Boîtes partagées (pont Exchange — peut être lent, réservé aux admins Exchange) ──
  // L'index des délégations est commun à tous les utilisateurs : une fois construit pour la source,
  // la lecture de la cible est instantanée.
  const sourceMbx = useUserSharedMailboxes(user.id, open && withMailboxes);
  const sourceMailboxes: UserMailboxAccess[] | undefined = sourceMbx.mailboxes;
  const sourceMailboxesLoading = sourceMbx.isLoading || sourceMbx.indexing;
  const sourceMailboxesError = sourceMbx.error;

  const mailboxesAvailable = !sourceMailboxesError;

  const targetMbx = useUserSharedMailboxes(
    target?.id,
    open && withMailboxes && !!target && step !== "pick" && mailboxesAvailable
  );
  const targetMailboxes: UserMailboxAccess[] | undefined = targetMbx.mailboxes;
  const targetMailboxesLoading = targetMbx.isLoading || targetMbx.indexing;
  const targetMailboxesError = targetMbx.error;
  const indexProgress = sourceMbx.indexing ? sourceMbx.data : targetMbx.indexing ? targetMbx.data : undefined;

  const mailboxesUnavailableReason = sourceMailboxesError
    ? errorMessage(sourceMailboxesError) === "exchange_forbidden"
      ? "Un rôle Exchange Administrator est requis pour copier les boîtes partagées."
      : `Boîtes partagées indisponibles : ${errorMessage(sourceMailboxesError)}`
    : targetMailboxesError
      ? `Boîtes partagées de la cible indisponibles : ${errorMessage(targetMailboxesError)}`
      : null;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (users ?? [])
      .filter(
        (u) =>
          u.id !== user.id &&
          (u.displayName.toLowerCase().includes(q) || u.userPrincipalName.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [users, search, user.id]);

  // Classement prévisionnel des groupes source par rapport à la cible
  const groupPreview = useMemo(() => {
    const targetIds = new Set((targetGroups ?? []).map((g) => g.id));
    return (sourceGroups ?? []).map((g) => ({
      group: g,
      already: targetIds.has(g.id),
      nonCopyable: getNonCopyableReason(g),
      exchange: isExchangeManaged(g),
    }));
  }, [sourceGroups, targetGroups]);

  // Classement prévisionnel des boîtes partagées : délégations manquantes chez la cible
  const mailboxPreview = useMemo(() => {
    const targetByMail = new Map((targetMailboxes ?? []).map((m) => [m.mail.toLowerCase(), m]));
    return (sourceMailboxes ?? []).map((m) => {
      const existing = targetByMail.get(m.mail.toLowerCase());
      const types = delegationsOf(m);
      return {
        mailbox: m,
        types,
        missing: types.filter((t) => !existing?.[t]),
        held: types.filter((t) => existing?.[t]),
      };
    });
  }, [sourceMailboxes, targetMailboxes]);

  const copyableGroups = groupPreview.filter((p) => !p.already && !p.nonCopyable);
  const copyableMailboxes = mailboxPreview.filter((p) => p.missing.length > 0);
  const mailboxStepReady =
    !withMailboxes || !mailboxesAvailable || !!targetMailboxesError || (!!sourceMailboxes && !!targetMailboxes);
  const canCopyMailboxes = withMailboxes && mailboxesAvailable && !targetMailboxesError && !!targetMailboxes;

  // Présélection : tout ce qui est copiable
  useEffect(() => {
    if (step === "preview" && targetGroups) {
      setSelectedGroups(new Set(copyableGroups.map((p) => p.group.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, targetGroups]);

  useEffect(() => {
    if (step === "preview" && targetMailboxes) {
      setSelectedMailboxes(new Set(copyableMailboxes.map((p) => p.mailbox.mail)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, targetMailboxes]);

  function toggle(setter: typeof setSelectedGroups, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const delegationsToAdd = copyableMailboxes
    .filter((p) => selectedMailboxes.has(p.mailbox.mail))
    .reduce((n, p) => n + p.missing.length, 0);

  async function handleCopy() {
    if (!target) return;
    setCopying(true);
    const errors: string[] = [];
    let gReport: GroupCopyReport | null = null;
    let mReport: MailboxCopyReport | null = null;

    // 1. Groupes — on transmet aussi les « déjà attribués » / non copiables pour le rapport final.
    if (withGroups && groupPreview.length > 0) {
      const excluded = new Set(copyableGroups.filter((p) => !selectedGroups.has(p.group.id)).map((p) => p.group.id));
      const groupIds = groupPreview.filter((p) => !excluded.has(p.group.id)).map((p) => p.group.id);
      try {
        gReport = await apiFetch<GroupCopyReport>(`/api/users/${user.id}/groups/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: target.id, groupIds }),
        });
      } catch (err) {
        errors.push(`Groupes : ${errorMessage(err)}`);
      }
    }

    // 2. Boîtes partagées — idem, les boîtes déjà entièrement détenues figurent au rapport.
    if (canCopyMailboxes && mailboxPreview.length > 0) {
      const excluded = new Set(
        copyableMailboxes.filter((p) => !selectedMailboxes.has(p.mailbox.mail)).map((p) => p.mailbox.mail)
      );
      const mailboxes = mailboxPreview.filter((p) => !excluded.has(p.mailbox.mail)).map((p) => p.mailbox.mail);
      try {
        mReport = await apiFetch<MailboxCopyReport>(`/api/users/${user.id}/shared-mailboxes/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: target.id, mailboxes }),
        });
      } catch (err) {
        const msg = errorMessage(err);
        errors.push(`Boîtes partagées : ${msg === "exchange_forbidden" ? "rôle Exchange Administrator requis" : msg}`);
      }
    }

    setGroupReport(gReport);
    setMailboxReport(mReport);
    setCopyErrors(errors);
    setStep("report");
    setCopying(false);
    queryClient.invalidateQueries({ queryKey: ["user-groups", target.id] });
    queryClient.invalidateQueries({ queryKey: ["user-shared-mailboxes", target.id] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });

    const added =
      (gReport?.results.filter((r) => r.status === "added").length ?? 0) +
      (mReport?.results.filter((r) => r.status === "added").length ?? 0);
    const failed =
      errors.length +
      (gReport?.results.filter((r) => r.status === "error").length ?? 0) +
      (mReport?.results.filter((r) => r.status === "error").length ?? 0);
    toast({
      title: failed > 0 ? "Copie partielle" : "Copie terminée",
      description: `${added} accès ajouté(s) à ${target.displayName}${failed > 0 ? ` · ${failed} erreur(s)` : ""}`,
      variant: failed > 0 ? "destructive" : undefined,
    });
  }

  // ── Rapport final ──
  const groupRows: ReportRow[] = (groupReport?.results ?? []).map((r) => ({
    key: groupKey(r.groupId),
    label: r.groupName,
    status: r.status,
    reason: r.reason,
  }));
  const mailboxRows: ReportRow[] = (mailboxReport?.results ?? []).map((r) => ({
    key: mailboxKey(r.mailbox, r.type),
    label: r.mailboxName,
    detail: DELEGATION_LABELS[r.type],
    status: r.status,
    reason: r.reason,
  }));

  const pendingRollback = [...groupRows, ...mailboxRows].filter(
    (r) => r.status === "added" && !rolledBack.has(r.key)
  ).length;

  async function handleRollback() {
    if (!target) return;
    setRollingBack(true);
    const done = new Set(rolledBack);
    const failures: string[] = [];

    for (const r of (groupReport?.results ?? []).filter((x) => x.status === "added" && !done.has(groupKey(x.groupId)))) {
      try {
        await apiFetch(`/api/users/${target.id}/groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: r.groupId, action: "remove", role: "member" }),
        });
        done.add(groupKey(r.groupId));
      } catch (err) {
        failures.push(`${r.groupName} : ${errorMessage(err)}`);
      }
    }

    for (const r of (mailboxReport?.results ?? []).filter(
      (x) => x.status === "added" && !done.has(mailboxKey(x.mailbox, x.type))
    )) {
      try {
        await apiFetch(`/api/mailboxes/${encodeURIComponent(r.mailbox)}/permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member: target.userPrincipalName, type: r.type, action: "remove" }),
        });
        done.add(mailboxKey(r.mailbox, r.type));
      } catch (err) {
        failures.push(`${r.mailboxName} (${DELEGATION_LABELS[r.type]}) : ${errorMessage(err)}`);
      }
    }

    setRolledBack(done);
    setRollingBack(false);
    setConfirmRollback(false);
    queryClient.invalidateQueries({ queryKey: ["user-groups", target.id] });
    queryClient.invalidateQueries({ queryKey: ["user-shared-mailboxes", target.id] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
    if (failures.length > 0) {
      toast({ title: "Annulation partielle", description: `${failures.length} échec(s) : ${failures[0]}`, variant: "destructive" });
    } else {
      toast({ title: "Copie annulée", description: `Accès ajoutés retirés de ${target.displayName}` });
    }
  }

  function renderReportSection(title: string, icon: typeof Users, rows: ReportRow[], unavailable?: string | null) {
    const Icon = icon;
    return (
      <div className="space-y-2 min-w-0">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
        </h4>
        {unavailable ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{unavailable}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {STATUS_ORDER.map((s) => {
                const n = rows.filter((r) => r.status === s).length;
                if (n === 0 && (s === "skipped" || s === "error")) return null;
                const { icon: SIcon, className } = STATUS_STYLE[s];
                return (
                  <span key={s} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${className}`}>
                    <SIcon className="h-3 w-3" />
                    {GROUP_COPY_STATUS_LABELS[s]} : {n}
                  </span>
                );
              })}
            </div>
            {rows.length > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y min-w-0">
                {[...rows]
                  .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
                  .map((r) => {
                    const { icon: SIcon, className } = STATUS_STYLE[r.status];
                    const undone = rolledBack.has(r.key);
                    return (
                      <div key={r.key} className="flex items-start gap-2 px-3 py-2 text-sm min-w-0">
                        <SIcon className={`h-4 w-4 mt-0.5 shrink-0 ${className}`} />
                        <div className="min-w-0 flex-1">
                          <div className={`font-medium truncate ${undone ? "line-through text-foreground/40" : ""}`}>
                            {r.label}
                            {r.detail && <span className="font-normal text-foreground/50"> — {r.detail}</span>}
                          </div>
                          <div className="text-xs text-foreground/50 break-words">
                            {undone ? "Annulé" : GROUP_COPY_STATUS_LABELS[r.status]}
                            {r.reason && ` — ${r.reason}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const previewLoading = withGroups && (targetGroupsLoading || !sourceGroups);
  const sourceReady = withGroups ? !!sourceGroups : !!sourceMailboxes || !!sourceMailboxesError;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{withGroups ? "Copier les groupes" : "Copier les boîtes partagées"}</DialogTitle>
          <DialogDescription>
            {withGroups ? "Groupes" : "Délégations sur boîtes partagées"} de <strong>{user.displayName}</strong>
            {target && <> vers <strong>{target.displayName}</strong></>}
          </DialogDescription>
        </DialogHeader>

        {/* ── Étape 1 : choix de l'utilisateur cible ── */}
        {step === "pick" && (
          <div className="space-y-3 min-w-0">
            <Input
              placeholder="Rechercher l'utilisateur cible..."
              value={search}
              autoFocus
              onChange={(e) => { setSearch(e.target.value); setTarget(null); }}
            />
            {search.trim() && (
              <div className="max-h-60 overflow-y-auto border rounded-md divide-y min-w-0">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-foreground/40 text-center py-3">Aucun utilisateur</p>
                ) : (
                  filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className={`px-3 py-2 cursor-pointer text-sm transition-colors min-w-0 ${
                        target?.id === u.id ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"
                      }`}
                      onClick={() => setTarget(u)}
                    >
                      <div className="font-medium truncate">{u.displayName}</div>
                      <div className="text-foreground/40 text-xs truncate">{u.userPrincipalName}</div>
                    </div>
                  ))
                )}
              </div>
            )}
            <p className="text-xs text-foreground/50">
              {withGroups ? (
                <>
                  {sourceGroups ? `${sourceGroups.length} groupe(s) à copier` : "Chargement des groupes..."}.
                  Seule l&apos;appartenance en tant que membre est copiée (pas le rôle de propriétaire).
                </>
              ) : (
                <>
                  {sourceMailboxesLoading
                    ? sourceMbx.data && sourceMbx.data.total > 0
                      ? `Analyse des boîtes partagées (${sourceMbx.data.done}/${sourceMbx.data.total})...`
                      : "Analyse des boîtes partagées..."
                    : sourceMailboxes
                      ? `${sourceMailboxes.length} boîte(s) partagée(s) à copier.`
                      : "Boîtes partagées indisponibles."}{" "}
                  Seules les délégations directes sont copiées (pas celles héritées d&apos;un groupe).
                </>
              )}
            </p>
          </div>
        )}

        {/* ── Étape 2 : aperçu + confirmation ── */}
        {step === "preview" && (
          <div className="space-y-4 min-w-0">
            {/* Groupes */}
            {withGroups && (
            <div className="space-y-2 min-w-0">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Groupes
              </h4>
              {previewLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="default">{selectedGroups.size} à ajouter</Badge>
                    <Badge variant="secondary">{groupPreview.filter((p) => p.already).length} déjà attribué(s)</Badge>
                    {groupPreview.some((p) => !p.already && p.nonCopyable) && (
                      <Badge variant="outline">
                        {groupPreview.filter((p) => !p.already && p.nonCopyable).length} non copiable(s)
                      </Badge>
                    )}
                  </div>
                  {groupPreview.length === 0 ? (
                    <p className="text-xs text-foreground/40">Aucun groupe</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-md divide-y min-w-0">
                      {groupPreview.map(({ group, already, nonCopyable, exchange }) => {
                        const disabled = already || !!nonCopyable;
                        return (
                          <label
                            key={group.id}
                            className={`flex items-start gap-2 px-3 py-2 text-sm min-w-0 ${
                              disabled ? "opacity-60" : "cursor-pointer hover:bg-foreground/5"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 mt-0.5 accent-primary shrink-0"
                              checked={!disabled && selectedGroups.has(group.id)}
                              disabled={disabled}
                              onChange={() => toggle(setSelectedGroups, group.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{group.displayName}</div>
                              {already && <div className="text-xs text-blue-600 dark:text-blue-400">Déjà attribué</div>}
                              {!already && nonCopyable && (
                                <div className="text-xs text-amber-600 dark:text-amber-400">{nonCopyable}</div>
                              )}
                              {!disabled && exchange && (
                                <div className="text-xs text-foreground/40">Liste Exchange — rôle Exchange requis</div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            )}

            {/* Boîtes partagées */}
            {withMailboxes && (
            <div className="space-y-2 min-w-0">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Inbox className="h-4 w-4" /> Boîtes partagées
              </h4>
              {mailboxesUnavailableReason ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">{mailboxesUnavailableReason}</p>
              ) : indexProgress ? (
                <IndexProgress done={indexProgress.done} total={indexProgress.total} />
              ) : !mailboxStepReady || sourceMailboxesLoading || targetMailboxesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="default">{delegationsToAdd} délégation(s) à ajouter</Badge>
                    <Badge variant="secondary">
                      {mailboxPreview.filter((p) => p.missing.length === 0).length} boîte(s) déjà attribuée(s)
                    </Badge>
                  </div>
                  {mailboxPreview.length === 0 ? (
                    <p className="text-xs text-foreground/40">Aucune boîte partagée</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-md divide-y min-w-0">
                      {mailboxPreview.map(({ mailbox, types, missing, held }) => {
                        const disabled = missing.length === 0;
                        return (
                          <label
                            key={mailbox.mail}
                            className={`flex items-start gap-2 px-3 py-2 text-sm min-w-0 ${
                              disabled ? "opacity-60" : "cursor-pointer hover:bg-foreground/5"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 mt-0.5 accent-primary shrink-0"
                              checked={!disabled && selectedMailboxes.has(mailbox.mail)}
                              disabled={disabled}
                              onChange={() => toggle(setSelectedMailboxes, mailbox.mail)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{mailbox.displayName}</div>
                              <div className="text-xs text-foreground/40 truncate">{mailbox.mail}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {types.map((t) => (
                                  <Badge
                                    key={t}
                                    variant={held.includes(t) ? "secondary" : "outline"}
                                    className="text-[10px]"
                                    title={held.includes(t) ? "Déjà attribué" : "À ajouter"}
                                  >
                                    {DELEGATION_LABELS[t]}
                                    {held.includes(t) && " ✓"}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            )}

            {(withGroups || canCopyMailboxes) && (
              <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-700 dark:text-amber-300">
                {withGroups ? (
                  <><strong>{target?.displayName}</strong> sera ajouté(e) à <strong>{selectedGroups.size}</strong> groupe(s).</>
                ) : (
                  <><strong>{target?.displayName}</strong> recevra <strong>{delegationsToAdd}</strong> délégation(s) sur boîtes partagées.</>
                )}{" "}
                Chaque ajout est journalisé et pourra être annulé depuis le rapport ou le journal d&apos;audit.
              </div>
            )}
          </div>
        )}

        {/* ── Étape 3 : rapport final ── */}
        {step === "report" && (
          <div className="space-y-4 min-w-0">
            {copyErrors.length > 0 && (
              <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
                {copyErrors.map((e) => <div key={e}>{e}</div>)}
              </div>
            )}
            {withGroups && renderReportSection("Groupes", Users, groupRows)}
            {withMailboxes &&
              renderReportSection("Boîtes partagées", Inbox, mailboxRows, canCopyMailboxes ? null : mailboxesUnavailableReason)}
            {confirmRollback && (
              <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                Retirer à <strong>{target?.displayName}</strong> les {pendingRollback} accès ajouté(s) par cette copie ?
                Les accès déjà attribués avant la copie ne sont pas touchés.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "pick" && (
            <>
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button onClick={() => setStep("preview")} disabled={!target || !sourceReady}>
                Suivant <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("pick")} disabled={copying}>Retour</Button>
              <Button
                onClick={handleCopy}
                disabled={
                  copying || previewLoading || !mailboxStepReady ||
                  (withGroups ? groupPreview.length === 0 : !canCopyMailboxes || mailboxPreview.length === 0)
                }
              >
                {copying ? "Copie en cours..." : "Copier"}
              </Button>
            </>
          )}
          {step === "report" && (
            <>
              <ExportButton
                fileBase={`${withGroups ? "copie-groupes" : "copie-boites-partagees"}-${target?.userPrincipalName ?? "utilisateur"}`}
                label="Exporter le rapport"
                sheets={() => withGroups ? [
                  {
                    name: "Groupes",
                    columns: [
                      { header: "Groupe", key: "groupe", width: 40 },
                      { header: "Statut", key: "statut", width: 16 },
                      { header: "Motif", key: "motif", width: 50 },
                      { header: "ID", key: "id", width: 38 },
                    ],
                    rows: (groupReport?.results ?? []).map((r) => ({
                      groupe: r.groupName,
                      statut: rolledBack.has(groupKey(r.groupId)) ? "Annulé" : GROUP_COPY_STATUS_LABELS[r.status],
                      motif: r.reason ?? "",
                      id: r.groupId,
                    })),
                  },
                ] : [
                  {
                    name: "Boîtes partagées",
                    columns: [
                      { header: "Boîte", key: "boite", width: 36 },
                      { header: "Adresse", key: "mail", width: 34 },
                      { header: "Délégation", key: "type", width: 22 },
                      { header: "Statut", key: "statut", width: 16 },
                      { header: "Motif", key: "motif", width: 50 },
                    ],
                    rows: (mailboxReport?.results ?? []).map((r) => ({
                      boite: r.mailboxName,
                      mail: r.mailbox,
                      type: DELEGATION_LABELS[r.type],
                      statut: rolledBack.has(mailboxKey(r.mailbox, r.type)) ? "Annulé" : GROUP_COPY_STATUS_LABELS[r.status],
                      motif: r.reason ?? "",
                    })),
                  },
                ]}
              />
              {pendingRollback > 0 && (
                confirmRollback ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setConfirmRollback(false)} disabled={rollingBack}>
                      Non
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleRollback} disabled={rollingBack}>
                      {rollingBack ? "Annulation..." : "Confirmer l'annulation"}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setConfirmRollback(true)}>
                    <Undo2 className="h-4 w-4 mr-1" />
                    Annuler la copie
                  </Button>
                )
              )}
              <Button size="sm" onClick={onClose} disabled={rollingBack}>Fermer</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
