"use client";

import { useState } from "react";
import {
  AlertCircle,
  LogOut,
  Settings,
  Menu,
  X,
  Bell,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth.store";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/store/ui.store";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Assets", href: "/dashboard/assets", icon: "🔐" },
  { name: "Policies", href: "/dashboard/policies", icon: "📋" },
  { name: "Findings", href: "/dashboard/findings", icon: "🔍" },
  { name: "Gateway", href: "/dashboard/gateway", icon: "🌉" },
  { name: "Reports", href: "/dashboard/reports", icon: "📄" },
  { name: "Rights", href: "/dashboard/rights", icon: "👤" },
  { name: "Alerts", href: "/dashboard/alerts", icon: "🔔" },
  { name: "Settings", href: "/dashboard/settings", icon: "⚙️" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
      logout();
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      logout();
      router.push("/login");
    }
  };

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar - Always visible on desktop (lg), toggleable on mobile */}
      <div className="hidden lg:block fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-700 bg-slate-900 p-6">
        {/* Desktop Sidebar - Always Visible */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">DS</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">DataSentinel</h1>
            <p className="text-xs text-slate-400">DPDP Platform</p>
          </div>
        </div>

        <nav className="space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
            >
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Mobile Sidebar - Animated Toggle */}
      <motion.aside
        initial={{ x: -250 }}
        animate={{ x: sidebarOpen ? 0 : -250 }}
        transition={{ duration: 0.3 }}
        className="fixed left-0 top-0 z-50 h-screen w-64 border-r border-slate-700 bg-slate-900 p-6 lg:hidden"
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">DS</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">DataSentinel</h1>
            <p className="text-xs text-slate-400">DPDP Platform</p>
          </div>
        </div>

        <nav className="space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
            >
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </motion.aside>

      {/* Mobile Overlay for sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="ml-0 flex flex-1 flex-col overflow-hidden lg:ml-64">
        {/* Topbar */}
        <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden"
              >
                {sidebarOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
              <h2 className="text-xl font-semibold text-slate-100">
                DPDP Compliance Dashboard
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>

              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-700"
                >
                  <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-slate-200">
                    {user?.full_name || user?.email}
                  </span>
                </button>

                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-700 bg-slate-900 shadow-lg"
                  >
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 rounded-t-lg"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-slate-800 rounded-b-lg"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-slate-950 p-6">{children}</main>
      </div>
    </div>
  );
}

