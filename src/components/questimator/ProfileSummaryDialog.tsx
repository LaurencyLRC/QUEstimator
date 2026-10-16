"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import {
  type Chart,
  type SignatureClear,
  formatTopPercentile,
  levelSortKey,
} from "@/lib/questimator-types";
import {
  Share2,
  Copy,
  Check,
  Download,
  AlertCircle,
  Sparkles,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  playerTheta: number;
  clears: Record<string, number>;
  charts: Chart[];
  rank?: number | null;
  topPercentile?: number | null;
  isCustomProfile?: boolean;
  signatureClears?: SignatureClear[];
  levelStats?: Array<{
    level: string;
    total: number;
    vhard: number;
    hard: number;
    normal: number;
    failed: number;
    cleared: number;
  }>;
}

export function ProfileSummaryDialog({
  open,
  onOpenChange,
  playerName,
  playerTheta,
  clears,
  charts,
  rank,
  topPercentile,
  isCustomProfile,
  signatureClears = [],
  levelStats = [],
}: Props) {
  const { t } = useLang();
  const { mode, toScale, format } = useScale();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // Compute status counts
  const statusCounts = { 3: 0, 2: 0, 1: 0, 0: 0 };
  for (const s of Object.values(clears)) {
    if (s in statusCounts) {
      statusCounts[s as 0 | 1 | 2 | 3]++;
    }
  }
  const totalClears = statusCounts[3] + statusCounts[2];
  const totalPlayed = totalClears + statusCounts[1] + statusCounts[0];

  const heroFormatted = format(playerTheta, mode === "lerp" ? 2 : 3);
  const heroUnit = mode === "lerp" ? "U_E LEVEL" : "LATENT SKILL θ";

  const renderCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 1200;
    const height = 675;
    canvas.width = width;
    canvas.height = height;

    // 1. Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#080c14");
    bgGrad.addColorStop(0.5, "#0b1220");
    bgGrad.addColorStop(1, "#070a12");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle Grid pattern
    ctx.strokeStyle = "rgba(6, 182, 212, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Outer cybernetic border
    ctx.strokeStyle = "rgba(30, 41, 59, 0.9)";
    ctx.lineWidth = 2;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(16, 16, width - 32, height - 32, 16);
      ctx.stroke();
    } else {
      ctx.strokeRect(16, 16, width - 32, height - 32);
    }

    // Top Header Bar
    ctx.fillStyle = "#06b6d4";
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("QUEstimator // BMS TELEMETRY ARCHIVE", 48, 56);

    ctx.fillStyle = "#64748b";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("SAMEJIMA GRADED RESPONSE IRT ENGINE", 48, 74);

    const today = new Date().toISOString().slice(0, 10);
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`LOGGED: ${today}`, width - 48, 56);
    ctx.fillText("1,544 U_E CHARTS CALIBRATED", width - 48, 74);
    ctx.textAlign = "left";

    // Header divider line
    ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, 92);
    ctx.lineTo(width - 48, 92);
    ctx.stroke();

    // 2. Player Name & Badge
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 36px 'Noto Sans JP', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const displayName = playerName || "Qwilight Player";
    ctx.fillText(displayName, 48, 142);

    // Profile type badge
    const badgeText = isCustomProfile ? "OFFLINE PROFILE" : "VERIFIED RECORD";
    const badgeX = 48 + ctx.measureText(displayName).width + 16;
    ctx.fillStyle = isCustomProfile ? "rgba(6, 182, 212, 0.15)" : "rgba(245, 158, 11, 0.15)";
    ctx.strokeStyle = isCustomProfile ? "rgba(6, 182, 212, 0.4)" : "rgba(245, 158, 11, 0.4)";
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, 116, 140, 26, 6);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = isCustomProfile ? "#22d3ee" : "#fbbf24";
    ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(badgeText, badgeX + 12, 133);

    // 3. LEFT COLUMN: Hero Ability & Clears Breakdown
    const colLeftW = 520;

    // Ability Container Box
    ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
    ctx.strokeStyle = "rgba(30, 41, 59, 0.8)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(48, 170, colLeftW, 190, 12);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("ESTIMATED LATENT SKILL", 72, 204);

    // Hero Number
    ctx.fillStyle = "#06b6d4";
    ctx.font = "900 68px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(heroFormatted, 72, 274);

    // Unit label next to hero number
    const numW = ctx.measureText(heroFormatted).width;
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(heroUnit, 72 + numW + 12, 252);

    // Rank / Percentile Badges
    let rankBadgeX = 72;
    if (rank != null) {
      const rankStr = `#${rank}`;
      ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      const rW = ctx.measureText(rankStr).width + 24;
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(rankBadgeX, 302, rW, 28, 6);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(rankStr, rankBadgeX + 12, 321);
      rankBadgeX += rW + 10;
    }

    if (topPercentile != null) {
      const topStr = `TOP ${formatTopPercentile(topPercentile)}`;
      ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      const pW = ctx.measureText(topStr).width + 24;
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(rankBadgeX, 302, pW, 28, 6);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#10b981";
      ctx.fillText(topStr, rankBadgeX + 12, 321);
    }

    // Clears Breakdown Container
    ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
    ctx.strokeStyle = "rgba(30, 41, 59, 0.8)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(48, 380, colLeftW, 196, 12);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("CLEAR LAMP DISTRIBUTION", 72, 412);

    ctx.textAlign = "right";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`${totalClears} CLEARS / ${totalPlayed} PLAYED`, 48 + colLeftW - 24, 412);
    ctx.textAlign = "left";

    // Stacked Lamp Bar
    const barX = 72;
    const barY = 432;
    const barW = colLeftW - 48;
    const barH = 18;

    // Background track
    ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 5);
      ctx.fill();
    }

    if (totalPlayed > 0) {
      ctx.save();
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 5);
        ctx.clip();
      }
      let curX = barX;
      const lamps = [
        { count: statusCounts[3], color: "#a855f7" }, // V-HARD
        { count: statusCounts[2], color: "#f43f5e" }, // HARD (crimson coral)
        { count: statusCounts[1], color: "#f59e0b" }, // NORMAL (amber gold)
        { count: statusCounts[0], color: "#64748b" }, // FAILED
      ];

      for (const lamp of lamps) {
        if (lamp.count === 0) continue;
        const segmentW = (lamp.count / totalPlayed) * barW;
        ctx.fillStyle = lamp.color;
        ctx.fillRect(curX, barY, segmentW, barH);
        curX += segmentW;
      }
      ctx.restore();
    }

    // Status pill chips below bar
    const chipY = 480;
    const chipW = (barW - 30) / 4;
    const chipData = [
      { label: "V-HARD", count: statusCounts[3], color: "#c084fc", bg: "rgba(168, 85, 247, 0.15)" },
      { label: "HARD", count: statusCounts[2], color: "#fb7185", bg: "rgba(244, 63, 94, 0.15)" },
      { label: "NORMAL", count: statusCounts[1], color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)" },
      { label: "FAILED", count: statusCounts[0], color: "#94a3b8", bg: "rgba(100, 116, 139, 0.15)" },
    ];

    chipData.forEach((cd, idx) => {
      const cx = barX + idx * (chipW + 10);
      ctx.fillStyle = cd.bg;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(cx, chipY, chipW, 64, 8);
        ctx.fill();
      }
      ctx.fillStyle = cd.color;
      ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(cd.label, cx + 12, chipY + 22);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "900 20px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(String(cd.count), cx + 12, chipY + 50);
    });

    // 4. RIGHT COLUMN: Signature Peak Upsets & Folder Coverage
    const colRightX = 600;
    const colRightW = width - colRightX - 48;

    // Peak Clears Box
    ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
    ctx.strokeStyle = "rgba(30, 41, 59, 0.8)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(colRightX, 170, colRightW, 280, 12);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("PEAK SIGNATURE CLEARS (BIGGEST UPSETS)", colRightX + 24, 204);

    const peaks = signatureClears.slice(0, 3);
    if (peaks.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "italic 13px system-ui, sans-serif";
      ctx.fillText("Log HARD or V-HARD clears to unlock peak upset showcases.", colRightX + 24, 248);
    } else {
      peaks.forEach((peak, idx) => {
        const itemY = 226 + idx * 72;

        // Item sub-box
        ctx.fillStyle = "rgba(30, 41, 59, 0.35)";
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(colRightX + 20, itemY, colRightW - 40, 60, 8);
          ctx.fill();
        }

        // Folder Level Pill
        ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(colRightX + 32, itemY + 12, 54, 36, 6);
          ctx.fill();
        }
        ctx.fillStyle = "#22d3ee";
        ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText(peak.chart.level || "?", colRightX + 59, itemY + 35);
        ctx.textAlign = "left";

        // Chart Title (truncated)
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 14px 'Noto Sans JP', system-ui, -apple-system, sans-serif";
        let title = peak.chart.title;
        if (title.length > 32) title = title.slice(0, 30) + "...";
        ctx.fillText(title, colRightX + 98, itemY + 28);

        // Chart Lamp + Survival Odds
        const lampLabel = peak.status === 3 ? "V-HARD CLEAR" : "HARD CLEAR";
        const lampColor = peak.status === 3 ? "#c084fc" : "#fb7185";
        ctx.fillStyle = lampColor;
        ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(lampLabel, colRightX + 98, itemY + 48);

        const oddsStr = `${(peak.p * 100).toFixed(1)}% odds`;
        const oddsInt = Math.max(1, Math.round(peak.odds));
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`· ${oddsStr} (1 in ${oddsInt})`, colRightX + 98 + ctx.measureText(lampLabel).width + 8, itemY + 48);
      });
    }

    // Active Folder Mini Matrix Box
    ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
    ctx.strokeStyle = "rgba(30, 41, 59, 0.8)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(colRightX, 466, colRightW, 110, 12);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("TOP FOLDER COVERAGE", colRightX + 24, 494);

    const candidateFolders = [...levelStats].filter((f) => f.cleared > 0);
    const sourceFolders = candidateFolders.length > 0 ? candidateFolders : levelStats;
    const topFolders = [...sourceFolders]
      .sort((a, b) => {
        const ratioA = a.total > 0 ? a.cleared / a.total : 0;
        const ratioB = b.total > 0 ? b.cleared / b.total : 0;
        if (Math.abs(ratioB - ratioA) > 0.001) return ratioB - ratioA;
        return b.cleared - a.cleared;
      })
      .slice(0, 5)
      .sort((a, b) => {
        const [ax, ay] = levelSortKey(a.level);
        const [bx, by] = levelSortKey(b.level);
        return ax - bx || ay - by;
      });

    if (topFolders.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("No folder plays recorded yet.", colRightX + 24, 530);
    } else {
      const folderSlotW = (colRightW - 48) / Math.max(1, topFolders.length);
      topFolders.forEach((f, idx) => {
        const fx = colRightX + 24 + idx * folderSlotW;
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(f.level, fx, 526);

        // Mini bar
        const miniW = folderSlotW - 14;
        ctx.fillStyle = "rgba(51, 65, 85, 0.5)";
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(fx, 534, miniW, 8, 3);
          ctx.fill();
        } else {
          ctx.fillRect(fx, 534, miniW, 8);
        }

        const clearedRatio = f.total > 0 ? f.cleared / f.total : 0;
        if (clearedRatio > 0) {
          ctx.save();
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(fx, 534, miniW, 8, 3);
            ctx.clip();
          }
          ctx.fillStyle = "#06b6d4";
          ctx.fillRect(fx, 534, miniW * clearedRatio, 8);
          ctx.restore();
        }

        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(`${f.cleared}/${f.total}`, fx, 558);
      });
    }

    // 5. Bottom Telemetry Footer
    ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, 604);
    ctx.lineTo(width - 48, 604);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("Calibrated with 101-node Gauss-Hermite Quadrature EAP • Graded Response Model (GRM)", 48, 628);

    ctx.textAlign = "right";
    ctx.fillStyle = "#06b6d4";
    ctx.fillText("QUEstimator // https://laurencylrc.github.io/QUEstimator", width - 48, 628);
    ctx.textAlign = "left";
  }, [playerName, playerTheta, clears, isCustomProfile, rank, topPercentile, signatureClears, levelStats, mode, toScale, format]);

  useEffect(() => {
    if (open) {
      // Allow modal DOM mount before drawing
      const timer = setTimeout(() => {
        renderCard();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, renderCard]);

  const handleCopy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setCopyError(false);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setCopyError(true);
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn("Clipboard API write failed, prompting download fallback:", err);
          setCopyError(true);
        }
      }, "image/png");
    } catch {
      setCopyError(true);
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    const cleanName = (playerName || "player").replace(/[^a-zA-Z0-9_-]/g, "_");
    link.download = `QUEstimator-${cleanName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-card border border-border/80 text-foreground p-6 rounded-lg">
        <DialogHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded border border-telemetry-cyan/40 bg-telemetry-cyan/10 flex items-center justify-center text-telemetry-cyan">
              <Share2 className="w-4 h-4" />
            </div>
            <DialogTitle className="text-base font-bold tracking-tight">
              {t.profileCardTitle}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground font-sans">
            {t.profileCardDesc}
          </DialogDescription>
        </DialogHeader>

        {/* Canvas Display Container */}
        <div className="my-2 flex flex-col items-center justify-center bg-black/40 rounded-lg p-2 border border-border/40 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full max-h-[55vh] object-contain rounded border border-border/40"
          />
        </div>

        {copyError && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2.5 flex items-center gap-2 font-sans">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{t.copyCardFailed}</span>
          </div>
        )}

        <DialogFooter className="border-t border-border/60 pt-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-telemetry-cyan" />
            <span>1200 × 675 Hi-Res PNG (Retina 2x)</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="text-xs font-mono gap-1.5 border-border/80 hover:bg-muted"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">{t.cardImageCopied}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t.copyCardImage}</span>
                </>
              )}
            </Button>

            <Button
              size="sm"
              onClick={handleDownload}
              className="text-xs font-mono gap-1.5 bg-telemetry-cyan hover:bg-telemetry-cyan/90 text-primary-foreground font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.downloadCardImage}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
