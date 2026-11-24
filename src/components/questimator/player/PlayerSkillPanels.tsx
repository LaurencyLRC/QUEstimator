"use client";

import { Swords, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import {
  formatTopPercentile,
  isSpecialLevel,
  type PlayerData,
  type SamplePlayers,
} from "@/lib/questimator-types";
import { PlayerSkillHistogram } from "@/components/questimator/PlayerSkillHistogram";
import { STATUS_LABELS, type LevelStatRow } from "./player-utils";

interface PlayerSkillPanelsProps {
  submittedID: string;
  currentPlayer: PlayerData;
  isCustomProfile: boolean;
  rank: number | null;
  topPercentile: number | null;
  statusCounts: { 0: number; 1: number; 2: number; 3: number };
  levelStats: LevelStatRow[];
  samplePlayers: SamplePlayers | null;
  playerThetaMean: number;
  playerThetaStd: number;
  rivalPlayer?: { id: string; data: PlayerData; isCustom?: boolean } | null;
  onSetRival?: (id: string | null, player?: PlayerData | null, isCustom?: boolean) => void;
}

export function PlayerSkillPanels({
  submittedID,
  currentPlayer,
  isCustomProfile,
  rank,
  topPercentile,
  statusCounts,
  levelStats,
  samplePlayers,
  playerThetaMean,
  playerThetaStd,
  rivalPlayer,
  onSetRival,
}: PlayerSkillPanelsProps) {
  const { t } = useLang();
  const { mode, format } = useScale();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
      {/* Left: Skill Distribution Engine */}
      <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <h4 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            {t.estimatedSkill}
          </h4>
          <div className="flex items-center gap-1.5">
            {onSetRival &&
              (rivalPlayer?.id === submittedID ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetRival(null)}
                  className="h-6 text-[11px] font-mono gap-1 px-2 bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25"
                  title={t.unpinRival}
                >
                  <Swords className="w-3 h-3" />
                  <span>{t.rival}</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetRival(submittedID, currentPlayer, isCustomProfile)}
                  className="h-6 text-[11px] font-mono gap-1 px-2 bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted"
                  title={t.setRival}
                >
                  <Swords className="w-3 h-3 text-amber-400" />
                  <span>{t.setRival}</span>
                </Button>
              ))}
            {rank != null && (
              <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                #{rank}
              </span>
            )}
            {topPercentile != null && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                {t.lang === "en"
                  ? `Top ${formatTopPercentile(topPercentile)}`
                  : `상위 ${formatTopPercentile(topPercentile)}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-2.5 flex-wrap">
          <div className="font-mono text-3xl font-black text-cyan-400 tracking-tight tabular-nums">
            {format(currentPlayer.t, mode === "lerp" ? 2 : 3)}
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {mode === "lerp" ? "Level" : "θ ability"}
            </span>
          </div>
          {currentPlayer.se != null && Number.isFinite(currentPlayer.se) && (
            <span
              className="text-[11px] font-mono tabular-nums text-muted-foreground"
              title={
                t.lang === "en"
                  ? "Posterior standard error of latent ability θ (EAP)"
                  : "잠재 실력 θ의 사후 표준오차 (EAP)"
              }
            >
              (SE ±{currentPlayer.se.toFixed(3)} θ)
            </span>
          )}
        </div>

        {samplePlayers && (
          <PlayerSkillHistogram
            data={samplePlayers}
            playerTheta={currentPlayer.t}
            rivalTheta={rivalPlayer?.data?.t ?? null}
            rivalName={rivalPlayer?.data?.n || rivalPlayer?.id}
          />
        )}

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {([3, 2, 1, 0] as const).map((s) => {
            const meta = STATUS_LABELS[s];
            const n = statusCounts[s];
            return (
              <div
                key={s}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-mono"
                title={`Status ${s}: ${meta.short}`}
              >
                <span className={cn("inline-block w-2 h-2 rounded-full", meta.bgClass)} />
                <span className={cn("font-bold", meta.textClass)}>{meta.short}</span>
                <span className="text-foreground tabular-nums">{n}</span>
              </div>
            );
          })}
        </div>

        {samplePlayers && (
          <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/40 font-sans">
            {t.lang === "en" ? (
              mode === "lerp" ? (
                <>
                  Population:{" "}
                  <span className="font-mono tabular-nums">
                    μ={format(playerThetaMean, 2)} (U_E), σ={playerThetaStd.toFixed(3)} (θ)
                  </span>{" "}
                  (n=<span className="font-mono tabular-nums">{samplePlayers.n_players}</span>).
                </>
              ) : (
                <>
                  Population:{" "}
                  <span className="font-mono tabular-nums">
                    μ={format(playerThetaMean, 3)}, σ={playerThetaStd.toFixed(3)}
                  </span>{" "}
                  (n=<span className="font-mono tabular-nums">{samplePlayers.n_players}</span>).
                </>
              )
            ) : mode === "lerp" ? (
              <>
                모집단:{" "}
                <span className="font-mono tabular-nums">
                  μ={format(playerThetaMean, 2)} (U_E), σ={playerThetaStd.toFixed(3)} (θ)
                </span>{" "}
                (n=<span className="font-mono tabular-nums">{samplePlayers.n_players}</span>).
              </>
            ) : (
              <>
                모집단:{" "}
                <span className="font-mono tabular-nums">
                  μ={format(playerThetaMean, 3)}, σ={playerThetaStd.toFixed(3)}
                </span>{" "}
                (n=<span className="font-mono tabular-nums">{samplePlayers.n_players}</span>).
              </>
            )}
          </p>
        )}
      </div>

      {/* Right: Folder Lamp Matrix */}
      <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <h4 className="text-sm font-semibold tracking-tight text-foreground">
            {t.folderClearsTitle}
          </h4>
          <span className="text-xs font-mono text-muted-foreground">
            {levelStats.length} active
          </span>
        </div>

        {levelStats.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center font-sans">
            {t.lang === "en" ? "No clears logged yet." : "클리어 기록이 없습니다."}
          </p>
        ) : (
          <ScrollArea className="h-[240px] overflow-hidden pr-3">
            <div className="space-y-2">
              {levelStats.map((s) => (
                <div
                  key={s.level}
                  className="flex items-center gap-2.5 font-mono text-xs"
                  title={`U_E ${s.level} | V-HARD: ${s.vhard}, HARD: ${s.hard}, NORMAL: ${s.normal}, FAILED: ${s.failed}, Total: ${s.total}`}
                >
                  <span
                    className={cn(
                      "w-8 text-right font-bold shrink-0",
                      isSpecialLevel(s.level) ? "text-amber-400" : "text-muted-foreground"
                    )}
                  >
                    {s.level}
                  </span>

                  <div className="flex-1 h-2 rounded bg-muted/50 overflow-hidden flex border border-border/40">
                    {s.vhard > 0 && (
                      <div
                        style={{ width: `${(s.vhard / s.total) * 100}%` }}
                        className="bg-lamp-vhard h-full"
                      />
                    )}
                    {s.hard > 0 && (
                      <div
                        style={{ width: `${(s.hard / s.total) * 100}%` }}
                        className="bg-lamp-hard h-full"
                      />
                    )}
                    {s.normal > 0 && (
                      <div
                        style={{ width: `${(s.normal / s.total) * 100}%` }}
                        className="bg-lamp-normal h-full"
                      />
                    )}
                    {s.failed > 0 && (
                      <div
                        style={{ width: `${(s.failed / s.total) * 100}%` }}
                        className="bg-lamp-failed h-full"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 text-right text-[11px]">
                    <span className="text-foreground font-semibold tabular-nums">{s.cleared}</span>
                    <span className="text-muted-foreground/60 tabular-nums">/{s.total}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                      {Math.round((s.cleared / s.total) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40 font-mono">
          <span>{levelStats.length} active folders</span>
          <span className="tabular-nums">
            <span className="text-foreground font-semibold">
              {levelStats.reduce((sum, s) => sum + s.cleared, 0)}
            </span>{" "}
            clears logged
          </span>
        </div>
      </div>
    </div>
  );
}
