"use client";

import { Swords, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import type { PlayerData } from "@/lib/questimator-types";

interface PlayerRivalCardProps {
  submittedID: string;
  currentPlayer: PlayerData;
  isCustomProfile: boolean;
  totalClears: number;
  rivalPlayer: { id: string; data: PlayerData; isCustom?: boolean };
  rivalAheadCount: number;
  rivalDiffOnly: boolean;
  onToggleRivalDiff: () => void;
  onUnpinRival: () => void;
}

export function PlayerRivalCard({
  submittedID,
  currentPlayer,
  isCustomProfile,
  totalClears,
  rivalPlayer,
  rivalAheadCount,
  rivalDiffOnly,
  onToggleRivalDiff,
  onUnpinRival,
}: PlayerRivalCardProps) {
  const { t } = useLang();
  const { mode, format, toScale } = useScale();

  const deltaRaw = currentPlayer.t - rivalPlayer.data.t;
  const deltaScale = (() => {
    if (mode === "lerp") {
      const s0 = toScale(rivalPlayer.data.t);
      const s1 = toScale(currentPlayer.t);
      if (s0 != null && s1 != null) return s1 - s0;
    }
    return deltaRaw;
  })();

  return (
    <div className="rounded-lg border border-amber-500/30 bg-card p-4 sm:p-5 relative overflow-hidden space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-border/40 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Swords className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              {t.rivalComparison}
            </h4>
            <p className="text-xs text-muted-foreground font-sans">
              {t.lang === "en"
                ? "Head-to-head performance telemetry & target gap"
                : "1:1 상대 전적 및 채보 클리어 격차"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleRivalDiff}
            className={cn(
              "h-7 text-xs font-mono gap-1.5 border transition-all",
              rivalDiffOnly
                ? "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold hover:bg-amber-500/25"
                : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Swords className="w-3 h-3 text-amber-400" />
            <span>{t.rivalDiff}</span>
            {rivalAheadCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-400 border-amber-500/30 font-mono"
              >
                {rivalAheadCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onUnpinRival}
            title={t.unpinRival}
            aria-label={t.unpinRival}
            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            <span>{t.unpinRival}</span>
          </Button>
        </div>
      </div>

      {/* Telemetry Duel Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-muted/20 rounded-md p-3.5 border border-border/50">
        {/* You */}
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-foreground truncate max-w-[150px]">
              {currentPlayer.n || submittedID}
            </span>
            {isCustomProfile && (
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/30">
                {t.lang === "en" ? "You" : "나"}
              </span>
            )}
          </span>
          <div className="font-mono text-2xl font-black text-cyan-400 tracking-tight">
            {format(currentPlayer.t, mode === "lerp" ? 2 : 3)}
            <span className="text-xs font-normal text-muted-foreground ml-1.5">
              {mode === "lerp" ? "Level" : "θ"}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {totalClears} {t.clears}
          </span>
        </div>

        {/* Difference Badge & Lead/Deficit Indicator */}
        <div className="flex flex-col items-center justify-center text-center gap-1.5 py-1 sm:border-x sm:border-border/40">
          <div className="text-[11px] font-mono text-muted-foreground">
            {t.lang === "en" ? "Ability Differential" : "실력 격차"}
          </div>
          {Math.abs(deltaRaw) < 0.005 ? (
            <Badge
              variant="outline"
              className="font-mono text-xs px-2.5 py-0.5 bg-muted text-muted-foreground border-border/60"
            >
              {t.rivalTied} (±0.00)
            </Badge>
          ) : deltaRaw > 0 ? (
            <Badge
              variant="outline"
              className="font-mono text-xs px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/40 font-bold"
            >
              +{deltaScale.toFixed(2)} {t.rivalLead}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="font-mono text-xs px-2.5 py-0.5 bg-amber-500/15 text-amber-400 border-amber-500/40 font-bold"
            >
              {deltaScale.toFixed(2)} {t.rivalDeficit}
            </Badge>
          )}
          <span className="text-[11px] font-mono text-muted-foreground">
            {rivalAheadCount} {t.lang === "en" ? "snipes to chase" : "개 추격 가능"}
          </span>
        </div>

        {/* Rival */}
        <div className="flex flex-col items-start sm:items-end gap-1">
          <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
            <Swords className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate max-w-[150px] font-semibold">
              {rivalPlayer.data.n || rivalPlayer.id}
            </span>
            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {t.rival}
            </span>
          </span>
          <div className="font-mono text-2xl font-black text-amber-400 tracking-tight">
            {format(rivalPlayer.data.t, mode === "lerp" ? 2 : 3)}
            <span className="text-xs font-normal text-muted-foreground ml-1.5">
              {mode === "lerp" ? "Level" : "θ"}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {Object.keys(rivalPlayer.data.c || {}).length} {t.clears}
          </span>
        </div>
      </div>
    </div>
  );
}
