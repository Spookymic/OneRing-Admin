import { describe, it, expect } from "vitest";
import { parseCoworkCsv } from "@/lib/cowork";

describe("parseCoworkCsv", () => {
  it("lit l'export anglais documenté (dates US)", () => {
    const csv =
      "User ID,Display name,Total tasks,Scheduled tasks,User-initiated tasks,Active days,Last activity date\r\n" +
      "alice@contoso.com,Alice,12,4,8,5,11/14/2026\r\n" +
      "bob@contoso.com,Bob,3,0,3,2,11/03/2026\r\n";
    const r = parseCoworkCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      upn: "alice@contoso.com", displayName: "Alice", totalTasks: 12, scheduledTasks: 4,
      userTasks: 8, activeDays: 5, lastActivity: "2026-11-14",
    });
    // 11/03 ambigu : l'ordre US est déduit de 11/14 dans la même colonne
    expect(r.rows[1].lastActivity).toBe("2026-11-03");
    expect(r.ignored).toEqual([]);
  });

  it("lit un export français séparé par des points-virgules", () => {
    const csv =
      "﻿ID d'utilisateur;Nom d'affichage;Nombre total de tâches;Tâches planifiées;Tâches lancées par l'utilisateur;Jours actifs;Date de la dernière activité\n" +
      "alice@contoso.com;Alice;7;2;5;3;05/11/2026\n";
    const r = parseCoworkCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toMatchObject({ upn: "alice@contoso.com", totalTasks: 7, scheduledTasks: 2, userTasks: 5, activeDays: 3 });
    expect(r.rows[0].lastActivity).toBe("2026-11-05");
  });

  it("calcule le total si la colonne manque et signale les colonnes inconnues", () => {
    const csv = "User ID,Scheduled tasks,User-initiated tasks,Region\nalice@contoso.com,1,2,EU\n";
    const r = parseCoworkCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0].totalTasks).toBe(3);
    expect(r.ignored).toEqual(["Region"]);
  });

  it("refuse un fichier sans colonne utilisateur", () => {
    const r = parseCoworkCsv("Foo,Bar\n1,2\n");
    expect(r.ok).toBe(false);
  });
});
