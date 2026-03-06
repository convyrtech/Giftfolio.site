import { BarChart3, TrendingUp, Settings, Store } from "lucide-react";

export const navItems = [
  { href: "/trades", labelKey: "trades", icon: BarChart3 },
  { href: "/market", labelKey: "market", icon: Store },
  { href: "/analytics", labelKey: "analytics", icon: TrendingUp },
  { href: "/settings", labelKey: "settings", icon: Settings },
] as const;
