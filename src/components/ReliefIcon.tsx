"use client";

import {
  Accessibility,
  Baby,
  BadgeCheck,
  BookOpen,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  PiggyBank,
  Receipt,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Laptop,
  Dumbbell,
  HeartPulse,
  Users,
  ShieldCheck,
  ShieldPlus,
  PiggyBank,
  GraduationCap,
  BookOpen,
  Home,
  BadgeCheck,
  Baby,
  Sparkles,
  Zap,
  Accessibility,
};

export function ReliefIcon({
  name,
  className = "w-5 h-5",
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICON_MAP[name] || Receipt;
  return <Icon className={className} />;
}
