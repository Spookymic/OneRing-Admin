import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  listEntraDevices, listIntuneDevices, listAutopilotDevices,
  type EntraDevice, type IntuneDevice, type AutopilotDevice,
} from "@/services/graph/devices";
import { listUsers } from "@/services/graph/users";

export interface Machine {
  key: string;
  name: string;
  os: string | null;
  osVersion: string | null;
  serial: string | null;
  trustType: string | null;
  lastActivity: string | null;
  owner: string | null;
  ownerEnabled?: boolean | null; // false = compte propriétaire désactivé ; null = inconnu/introuvable
  compliance: string | null;
  sources: {
    entra?: { id: string };
    intune?: { id: string };
    autopilot?: { id: string };
  };
}

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const newer = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

/** Récupère une source en best-effort : renvoie [] + supported=false sur 403 (permission absente). */
async function safe<T>(fn: () => Promise<T[]>): Promise<{ items: T[]; supported: boolean }> {
  try {
    return { items: await fn(), supported: true };
  } catch (e: any) {
    if (String(e?.message ?? "").startsWith("[403]")) return { items: [], supported: false };
    throw e;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = session.accessToken;
  try {
    const [entra, intune, autopilot, users] = await Promise.all([
      safe<EntraDevice>(() => listEntraDevices(token)),
      safe<IntuneDevice>(() => listIntuneDevices(token)),
      safe<AutopilotDevice>(() => listAutopilotDevices(token)),
      // Pour signaler un propriétaire désactivé (best-effort).
      listUsers(token).then((u) => u).catch(() => []),
    ]);

    // Map UPN (minuscule) → accountEnabled, pour qualifier le propriétaire d'une machine.
    const ownerEnabledByUpn = new Map<string, boolean>();
    for (const u of users) {
      if (u.userPrincipalName) ownerEnabledByUpn.set(u.userPrincipalName.toLowerCase(), u.accountEnabled);
    }

    const machines: Machine[] = [];
    const byDeviceId = new Map<string, Machine>();
    const bySerial = new Map<string, Machine>();

    const register = (m: Machine, deviceId?: string | null, serial?: string | null) => {
      machines.push(m);
      if (deviceId) byDeviceId.set(lc(deviceId), m);
      if (serial) bySerial.set(lc(serial), m);
    };

    // 1) Entra (annuaire) — base, clé = deviceId (GUID appareil Azure AD)
    for (const d of entra.items) {
      const m: Machine = {
        key: lc(d.deviceId) || `entra:${d.id}`,
        name: d.displayName || "—",
        os: d.operatingSystem ?? null,
        osVersion: d.operatingSystemVersion ?? null,
        serial: null,
        trustType: d.trustType ?? null,
        lastActivity: d.approximateLastSignInDateTime ?? null,
        owner: null,
        compliance: d.isCompliant === true ? "compliant" : d.isCompliant === false ? "noncompliant" : null,
        sources: { entra: { id: d.id } },
      };
      register(m, d.deviceId);
    }

    // 2) Intune (MDM) — corrélation par azureADDeviceId
    for (const d of intune.items) {
      let m = d.azureADDeviceId ? byDeviceId.get(lc(d.azureADDeviceId)) : undefined;
      if (!m) {
        m = {
          key: lc(d.azureADDeviceId) || `intune:${d.id}`,
          name: d.deviceName || "—",
          os: d.operatingSystem ?? null,
          osVersion: d.osVersion ?? null,
          serial: d.serialNumber ?? null,
          trustType: null,
          lastActivity: d.lastSyncDateTime ?? null,
          owner: d.userPrincipalName ?? null,
          compliance: d.complianceState ?? null,
          sources: {},
        };
        register(m, d.azureADDeviceId, d.serialNumber);
      } else if (d.serialNumber) {
        bySerial.set(lc(d.serialNumber), m);
      }
      m.sources.intune = { id: d.id };
      m.serial = m.serial ?? d.serialNumber ?? null;
      m.os = m.os ?? d.operatingSystem ?? null;
      m.osVersion = m.osVersion ?? d.osVersion ?? null;
      m.owner = m.owner ?? d.userPrincipalName ?? null;
      m.compliance = m.compliance ?? d.complianceState ?? null;
      m.lastActivity = newer(m.lastActivity, d.lastSyncDateTime ?? null);
    }

    // 3) Autopilot — corrélation par azureAdDeviceId puis par n° de série
    for (const d of autopilot.items) {
      let m = d.azureAdDeviceId ? byDeviceId.get(lc(d.azureAdDeviceId)) : undefined;
      if (!m && d.serialNumber) m = bySerial.get(lc(d.serialNumber));
      if (!m) {
        m = {
          key: lc(d.azureAdDeviceId) || (d.serialNumber ? `sn:${lc(d.serialNumber)}` : `ap:${d.id}`),
          name: d.displayName || [d.manufacturer, d.model].filter(Boolean).join(" ") || d.serialNumber || "—",
          os: null,
          osVersion: null,
          serial: d.serialNumber ?? null,
          trustType: null,
          lastActivity: null,
          owner: null,
          compliance: null,
          sources: {},
        };
        register(m, d.azureAdDeviceId, d.serialNumber);
      }
      m.sources.autopilot = { id: d.id };
      m.serial = m.serial ?? d.serialNumber ?? null;
    }

    // Qualifie le propriétaire (activé / désactivé / introuvable)
    for (const m of machines) {
      if (m.owner) {
        const found = ownerEnabledByUpn.get(m.owner.toLowerCase());
        m.ownerEnabled = found === undefined ? null : found;
      }
    }

    machines.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

    return NextResponse.json({
      supported: { entra: entra.supported, intune: intune.supported, autopilot: autopilot.supported },
      machines,
    });
  } catch (error: any) {
    console.error("[/api/devices GET]", error?.message);
    return NextResponse.json({ error: "Erreur lors de la récupération des appareils." }, { status: 500 });
  }
}
