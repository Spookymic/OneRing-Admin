"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users, Shield, History, LogOut, LayoutDashboard, Users2,
  Settings, Eye, X, Check, Inbox, Network, KeyRound, Sun, Moon, Monitor, HardDrive, UserX, Globe, ShieldAlert,
  ChevronDown, Activity,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useAccessibility, A11Y_LABELS, A11Y_MODES } from "@/lib/accessibility";
import { ACCENT_PRESETS, getSavedAccent, saveAccent } from "@/lib/accent";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "Utilisateurs", icon: Users },
  { href: "/dashboard/groups", label: "Groupes", icon: Users2 },
  { href: "/dashboard/group-tree", label: "Arborescence", icon: Network },
  { href: "/dashboard/mailboxes", label: "Boîtes partagées", icon: Inbox },
  { href: "/dashboard/licenses", label: "Licences", icon: Shield },
  { href: "/dashboard/storage", label: "Stockage", icon: HardDrive },
  { href: "/dashboard/sharepoint-sites", label: "Sites SharePoint", icon: Globe },
  { href: "/dashboard/conditional-access", label: "Accès conditionnel", icon: ShieldAlert },
  { href: "/dashboard/sign-in-logs", label: "Journaux de connexion", icon: Activity },
  { href: "/dashboard/credentials", label: "Secrets & certificats", icon: KeyRound },
  { href: "/dashboard/deleted-accounts", label: "Comptes supprimés", icon: UserX },
  { href: "/dashboard/audit", label: "Historique", icon: History },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { mode, setA11yMode } = useAccessibility();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [accent, setAccent] = useState("rose");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setAccent(getSavedAccent()); setMounted(true); }, []);

  // L'admin local (accès de secours) n'a accès qu'à l'Administration, via le menu utilisateur
  const visibleNav = session?.role === "local" ? [] : navItems;

  function closeUserMenu() {
    setUserMenuOpen(false);
    setA11yOpen(false);
  }

  return (
    <aside className="w-64 shrink-0 h-screen overflow-y-auto bg-[#01031B] text-white flex flex-col">
      <div className="p-5 border-b border-white/10 relative">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="OneRing Admin"
            width={36}
            height={36}
            className="rounded-md shrink-0"
          />
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            className="min-w-0 flex-1 flex items-center gap-1.5 text-left rounded-md px-1 -mx-1 py-0.5 hover:bg-white/8 transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-tight">OneRing Admin</span>
              {session?.user?.email && (
                <span className="block text-xs text-white/50 mt-0.5 truncate">{session.user.email}</span>
              )}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-white/40 shrink-0 transition-transform", userMenuOpen && "rotate-180")} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-md hover:bg-white/10 text-white/60 hover:text-white shrink-0"
              aria-label="Fermer le menu"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {userMenuOpen && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-[#0A0D2E] border border-white/15 rounded-lg shadow-xl z-50 p-1">
            <Link
              href="/dashboard/admin"
              onClick={() => { closeUserMenu(); onClose?.(); }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith("/dashboard/admin")
                  ? "bg-primary text-white"
                  : "text-white/70 hover:bg-white/8 hover:text-white"
              )}
            >
              <Settings className="h-4 w-4" />
              Administration
            </Link>

            <div className="h-px bg-white/10 my-1" />

            {/* Accessibilité */}
            <button
              type="button"
              onClick={() => setA11yOpen(!a11yOpen)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                mode !== "normal"
                  ? "text-primary bg-primary/10 hover:bg-primary/20"
                  : "text-white/70 hover:bg-white/8 hover:text-white"
              )}
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Accessibilité</span>
              {mode !== "normal" && (
                <span className="text-xs bg-primary text-white px-1.5 py-0.5 rounded-full leading-none">
                  actif
                </span>
              )}
            </button>
            {a11yOpen && (
              <div className="ml-2 mt-0.5 mb-1 border-l border-white/10 pl-1">
                {A11Y_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setA11yMode(m);
                      setA11yOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors text-left",
                      m === mode
                        ? "text-primary bg-primary/10"
                        : "text-white/70 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    {m === mode ? (
                      <Check className="h-3 w-3 shrink-0" />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    {A11Y_LABELS[m]}
                  </button>
                ))}
              </div>
            )}

            {/* Thème clair / sombre */}
            <div className="px-3 py-2">
              <p className="text-xs text-white/40 mb-1.5">Thème</p>
              <div className="flex gap-1">
                {[
                  { id: "light", icon: Sun, label: "Clair" },
                  { id: "dark", icon: Moon, label: "Sombre" },
                  { id: "system", icon: Monitor, label: "Système" },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    onClick={() => setTheme(id)}
                    className={cn(
                      "flex-1 flex items-center justify-center py-1.5 rounded-md text-xs transition-colors",
                      mounted && theme === id
                        ? "bg-white/15 text-white"
                        : "text-white/50 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Couleur d'accent */}
            <div className="px-3 py-2">
              <p className="text-xs text-white/40 mb-1.5">Couleur d&apos;accent</p>
              <div className="flex gap-1.5">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.label}
                    onClick={() => { saveAccent(p.id); setAccent(p.id); }}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                      accent === p.id ? "border-white" : "border-transparent"
                    )}
                    style={{ backgroundColor: p.color }}
                    aria-label={`Accent ${p.label}`}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-white/10 my-1" />

            <Button
              variant="ghost"
              className="w-full justify-start text-white/70 hover:text-white hover:bg-white/8"
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            >
              <LogOut className="h-4 w-4 mr-3" />
              Déconnexion
            </Button>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visibleNav.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-white"
                  : "text-white/70 hover:bg-white/8 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <p className="text-center text-white/25 text-xs py-3 border-t border-white/10">v1.29.2</p>
    </aside>
  );
}
