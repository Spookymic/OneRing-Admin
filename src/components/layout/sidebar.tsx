"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, Shield, History, LogOut, LayoutDashboard } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard/users", label: "Utilisateurs", icon: Users },
  { href: "/dashboard/groups", label: "Groupes", icon: LayoutDashboard },
  { href: "/dashboard/licenses", label: "Licences", icon: Shield },
  { href: "/dashboard/audit", label: "Historique", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-64 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-bold">M365 Admin</h1>
        {session?.user?.email && (
          <p className="text-xs text-gray-400 mt-1 truncate">{session.user.email}</p>
        )}
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              pathname.startsWith(href)
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <Button
          variant="ghost"
          className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Déconnexion
        </Button>
      </div>
    </aside>
  );
}
