"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "./sidebar";
import { InactivityWatcher } from "@/components/inactivity-watcher";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  // L'admin local (accès de secours) est confiné à l'Administration
  const localBlocked = session?.role === "local" && !pathname.startsWith("/dashboard/admin");
  useEffect(() => {
    if (localBlocked) router.replace("/dashboard/admin");
  }, [localBlocked, router]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile: backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper — fixed on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#01031B] text-white shrink-0 border-b border-white/10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/logo.png" alt="" width={24} height={24} className="rounded" />
          <span className="font-bold text-sm">OneRing Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F5F5FA]">
          {localBlocked ? null : children}
        </main>
      </div>

      <InactivityWatcher timeoutMs={10 * 60 * 1000} />
    </div>
  );
}
