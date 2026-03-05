import { BarChart3, TrendingUp, Settings, Store } from "lucide-react";

export const navItems = [
  { href: "/trades", label: "Trades", icon: BarChart3 },
  { href: "/market", label: "Market", icon: Store },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
