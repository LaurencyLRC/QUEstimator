"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getNextLampStatus, getPrevLampStatus } from "@/lib/questimator-types";
import { RotateCw, Plus } from "lucide-react";
import { useLang } from "@/lib/i18n";

export interface LampBadgeProps {
  status?: number | null;
  editable?: boolean;
  onStatusChange?: (newStatus: number) => void;
  variant?: "short" | "full";
  showEmptyAsButton?: boolean;
  className?: string;
}

const BADGE_CONFIG_SHORT: Record<number, { label: string; className: string }> = {
  3: { label: "VH", className: "bg-lamp-vhard/15 text-lamp-vhard border-lamp-vhard/40" },
  2: { label: "H", className: "bg-lamp-hard/15 text-lamp-hard border-lamp-hard/40" },
  1: { label: "N", className: "bg-lamp-normal/15 text-lamp-normal border-lamp-normal/40" },
  0: { label: "F", className: "bg-lamp-failed/15 text-lamp-failed border-lamp-failed/40" },
};

const BADGE_CONFIG_FULL: Record<number, { label: string; className: string }> = {
  3: { label: "V-HARD", className: "bg-lamp-vhard/15 text-lamp-vhard border-lamp-vhard/40" },
  2: { label: "HARD", className: "bg-lamp-hard/15 text-lamp-hard border-lamp-hard/40" },
  1: { label: "NORMAL", className: "bg-lamp-normal/15 text-lamp-normal border-lamp-normal/40" },
  0: { label: "FAILED", className: "bg-lamp-failed/15 text-lamp-failed border-lamp-failed/40" },
};

function getTooltipText(status: number | null | undefined, isKo: boolean): string {
  if (status == null || status < 0) {
    return isKo
      ? "클릭: 램프 등록 (FAILED). 우클릭: V-HARD"
      : "Click to set clear lamp (FAILED). Right-click for V-HARD.";
  }
  switch (status) {
    case 0:
      return isKo
        ? "현재: FAILED → 클릭: HARD (우클릭: 미설정 초기화)"
        : "Current: FAILED → Click to cycle: HARD (Right-click to remove)";
    case 1:
      return isKo
        ? "현재: NORMAL → 클릭: HARD (우클릭: FAILED)"
        : "Current: NORMAL → Click to cycle: HARD (Right-click: FAILED)";
    case 2:
      return isKo
        ? "현재: HARD → 클릭: V-HARD (우클릭: FAILED)"
        : "Current: HARD → Click to cycle: V-HARD (Right-click: FAILED)";
    case 3:
      return isKo
        ? "현재: V-HARD → 클릭: 램프 초기화 (우클릭: HARD)"
        : "Current: V-HARD → Click to remove lamp (Right-click: HARD)";
    default:
      return isKo ? "클릭하여 램프 변경" : "Click to cycle lamp";
  }
}

export function LampBadge({
  status,
  editable = false,
  onStatusChange,
  variant = "short",
  showEmptyAsButton = true,
  className,
}: LampBadgeProps) {
  const { t } = useLang();
  const isKo = t.lang === "ko";
  const hasStatus = status != null && status >= 0 && status <= 3;
  const config = (variant === "full" ? BADGE_CONFIG_FULL : BADGE_CONFIG_SHORT)[status ?? -1];

  // 1. Non-editable (read-only) view
  if (!editable || !onStatusChange) {
    if (!hasStatus || !config) {
      if (!showEmptyAsButton) return null;
      return (
        <span
          className={cn(
            "inline-block font-mono text-[10px] px-1.5 py-0.5 rounded text-muted-foreground/50 border border-border/40 bg-muted/20 select-none",
            className
          )}
        >
          --
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-block font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border select-none shrink-0",
          config.className,
          className
        )}
      >
        {config.label}
      </span>
    );
  }

  // 2. Editable Status Override button
  const tooltip = getTooltipText(status, isKo);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStatusChange(getNextLampStatus(status));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStatusChange(getPrevLampStatus(status));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onStatusChange(getNextLampStatus(status));
    }
  };

  if (!hasStatus || !config) {
    if (!showEmptyAsButton) return null;
    return (
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        title={tooltip}
        aria-label={tooltip}
        className={cn(
          "group/lamp inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold border border-dashed border-border/80 bg-muted/20 text-muted-foreground/70 hover:text-foreground hover:bg-telemetry-cyan/10 hover:border-telemetry-cyan/70 hover:ring-1 hover:ring-telemetry-cyan/40 transition-all cursor-pointer active:scale-95 shrink-0 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan",
          className
        )}
      >
        <Plus className="w-2.5 h-2.5 opacity-60 group-hover/lamp:opacity-100 group-hover/lamp:text-telemetry-cyan shrink-0 transition-colors" />
        <span className="font-sans text-[9px] tracking-tight group-hover/lamp:text-foreground">
          {t.setLamp}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "group/lamp inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border transition-all cursor-pointer active:scale-95 shrink-0 select-none hover:brightness-110 hover:border-telemetry-cyan/70 hover:ring-1 hover:ring-telemetry-cyan/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan",
        config.className,
        className
      )}
    >
      <span>{config.label}</span>
      <RotateCw className="w-2.5 h-2.5 opacity-60 group-hover/lamp:opacity-100 group-hover/lamp:rotate-180 transition-all duration-300 shrink-0 text-current" />
    </button>
  );
}
