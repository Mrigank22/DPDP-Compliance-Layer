"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth.store";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, token, loadFromStorage } = useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);

  // Load auth from storage on mount
  useEffect(() => {
    // Restore auth state from cookies and localStorage
    loadFromStorage();
    setIsHydrated(true);
  }, [loadFromStorage]);

  // Redirect based on auth state after hydration
  useEffect(() => {
    if (!isHydrated) return;

    if (isAuthenticated && token) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [isHydrated, isAuthenticated, token, router]);

  // Show loading state while determining auth
  if (!isHydrated) {
    return null;
  }

  return null;
}



