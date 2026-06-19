"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users, Shield, History, LogOut, LayoutDashboard, Users2,
  Settings, Eye, X, Check, Inbox, Network,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useAccessibility, A11Y_LABELS, A11Y_MODES } from "@/lib/accessibility";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "Utilisateurs", icon: Users },
  { href: "/dashboard/groups", label: "Groupes", icon: Users2 },
  { href: "/dashboard/group-tree", label: "Arborescence", icon: Network },
  { href: "/dashboard/mailboxes", label: "Boîtes partagées", icon: Inbox },
  { href: "/dashboard/licenses", label: "Licences", icon: Shield },
  { href: "/dashboard/audit", label: "Historique", icon: History },
  { href: "/dashboard/admin", label: "Administration", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { mode, setA11yMode } = useAccessibility();
  const [a11yOpen, setA11yOpen] = useState(false);

  return (
    <aside className="w-64 shrink-0 h-screen overflow-y-auto bg-[#01031B] text-white flex flex-col">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="OneRing Admin"
            width={36}
            height={36}
            className="rounded-md shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-tight">OneRing Admin</h1>
            {session?.user?.email && (
              <p className="text-xs text-white/50 mt-0.5 truncate">{session.user.email}</p>
            )}
          </div>
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
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-[#D8346E] text-white"
                  : "text-white/70 hover:bg-white/8 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-1">
        {/* Accessibility dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setA11yOpen(!a11yOpen)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              mode !== "normal"
                ? "text-[#D8346E] bg-[#D8346E]/10 hover:bg-[#D8346E]/20"
                : "text-white/70 hover:bg-white/8 hover:text-white"
            )}
          >
            <Eye className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Accessibilité</span>
            {mode !== "normal" && (
              <span className="text-xs bg-[#D8346E] text-white px-1.5 py-0.5 rounded-full leading-none">
                actif
              </span>
            )}
          </button>

          {a11yOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#0A0D2E] border border-white/15 rounded-lg overflow-hidden shadow-xl z-50">
              {A11Y_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setA11yMode(m);
                    setA11yOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left",
                    m === mode
                      ? "text-[#D8346E] bg-[#D8346E]/10"
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
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start text-white/70 hover:text-white hover:bg-white/8"
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Déconnexion
        </Button>
        <p className="text-center text-white/25 text-xs pt-1">v1.16.0</p>
      </div>
    </aside>
  );
}
