// app/logout/page.tsx
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await logout();
      router.replace("/login");
    })();
  }, [router]);

  return null;
}
