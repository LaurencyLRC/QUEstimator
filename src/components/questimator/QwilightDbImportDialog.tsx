"use client";

import { useState, useRef, useId } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLang } from "@/lib/i18n";
import { useScale } from "@/lib/value-scale";
import { cn } from "@/lib/utils";
import {
  parseQwilightDb,
  type QwilightImportResult,
} from "@/lib/qwilight-importer";
import {
  type Chart,
  type LeaderboardResult,
  estimateTheta,
  computeTopPercentile,
  formatTopPercentile,
} from "@/lib/questimator-types";
import {
  Database,
  Upload,
  Check,
  AlertCircle,
  FileSpreadsheet,
  FolderOpen,
  Sparkles,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charts: Chart[];
  leaderboard?: LeaderboardResult | null;
  activeProfileId?: string;
  onImportComplete: (
    name: string,
    clears: Record<string, number>,
    isMerge?: boolean
  ) => void;
}

export function QwilightDbImportDialog({
  open,
  onOpenChange,
  charts,
  leaderboard,
  activeProfileId,
  onImportComplete,
}: Props) {
  const { t } = useLang();
  const { mode, format } = useScale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QwilightImportResult | null>(null);
  const [profileName, setProfileName] = useState("");
  const [importAction, setImportAction] = useState<"new" | "merge">("new");

  const newRadioId = useId();
  const mergeRadioId = useId();

  const resetState = () => {
    setError(null);
    setResult(null);
    setProfileName("");
    setParsing(false);
    setImportAction("new");
  };

  const handleFileProcess = async (file: File) => {
    setError(null);
    setParsing(true);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseQwilightDb(buffer);

      if (parsed.matchedUeCharts === 0) {
        throw new Error(
          t.lang === "en"
            ? "No matching U_E table charts found in the database. (Found 0 out of 1,544 U_E charts)."
            : "데이터베이스에서 일치하는 U_E 채보를 찾지 못했습니다. (1,544개 U_E 채보 중 0개 발견)."
        );
      }

      setResult(parsed);

      // Default profile name: AvatarName from comment table if found, else file-derived
      const suggestedName =
        parsed.avatarName?.trim() ||
        file.name.replace(/\.[^/.]+$/, "") ||
        "Qwilight Player";
      setProfileName(suggestedName);

      if (activeProfileId) {
        setImportAction("new");
      }
    } catch (err) {
      console.error("Qwilight DB import error:", err);
      setError(
        err instanceof Error
          ? err.message
          : t.lang === "en"
          ? "Failed to parse Qwilight database file."
          : "Qwilight 데이터베이스 파일을 분석하지 못했습니다."
      );
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    e.target.value = "";
  };

  const handleApply = () => {
    if (!result) return;
    const finalName = profileName.trim() || "Qwilight Player";
    const isMerge = activeProfileId != null && importAction === "merge";

    onImportComplete(finalName, result.clears, isMerge);
    onOpenChange(false);
    resetState();
  };

  // Preview metrics
  const previewTheta = result ? estimateTheta(charts, result.clears) : null;
  const previewPercentile =
    previewTheta != null && leaderboard?.sortedThetas
      ? computeTopPercentile(previewTheta, leaderboard.sortedThetas)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl bg-card border border-border/80 text-foreground p-6 rounded-lg">
        <DialogHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded border border-telemetry-cyan/40 bg-telemetry-cyan/10 flex items-center justify-center text-telemetry-cyan">
              <Database className="w-4 h-4" />
            </div>
            <DialogTitle className="text-base font-bold tracking-tight">
              {t.qwilightDbTitle}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {t.qwilightDbDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Dropzone */}
          {!result && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5",
                isDragging
                  ? "border-telemetry-cyan bg-telemetry-cyan/5"
                  : "border-border/80 hover:border-telemetry-cyan/60 hover:bg-muted/20",
                parsing && "opacity-50 pointer-events-none"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".db"
                className="hidden"
                onChange={handleFileSelect}
              />

              {parsing ? (
                <>
                  <Loader2 className="w-8 h-8 text-telemetry-cyan animate-spin" />
                  <p className="text-xs font-mono text-muted-foreground">
                    {t.qwilightDbParsing}
                  </p>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.qwilightDbDragDrop}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      DB.db (SQLite)
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Location Helper Guide */}
          {!result && (
            <div className="rounded-md border border-border/60 bg-background/50 p-3 space-y-1.5 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-telemetry-cyan" />
                <span>{t.qwilightDbLocationTip}</span>
              </div>
              <p className="font-mono text-xs text-foreground/90 pl-5 select-all tracking-wide">
                {t.qwilightDbPathTip}
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 flex items-start gap-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t.lang === "en" ? "Import Failed" : "가져오기 실패"}</p>
                <p className="text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Success Preview Display */}
          {result && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/80 bg-background/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-semibold text-foreground">
                      {t.qwilightDbSuccess(result.matchedUeCharts, charts.length)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs font-mono text-muted-foreground hover:text-foreground"
                    onClick={resetState}
                  >
                    {t.lang === "en" ? "Change file" : "다른 파일 선택"}
                  </Button>
                </div>

                {/* Telemetry preview cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
                  <div className="rounded border border-lamp-failed/30 bg-lamp-failed/10 p-2">
                    <div className="text-xs text-muted-foreground font-semibold">FAILED</div>
                    <div className="text-base font-bold text-foreground tabular-nums">
                      {result.breakdown.failed}
                    </div>
                  </div>
                  <div className="rounded border border-lamp-normal/30 bg-lamp-normal/10 p-2">
                    <div className="text-xs text-lamp-normal font-semibold">NORMAL</div>
                    <div className="text-base font-bold text-lamp-normal tabular-nums">
                      {result.breakdown.normal}
                    </div>
                  </div>
                  <div className="rounded border border-lamp-hard/30 bg-lamp-hard/10 p-2">
                    <div className="text-xs text-lamp-hard font-semibold">HARD</div>
                    <div className="text-base font-bold text-lamp-hard tabular-nums">
                      {result.breakdown.hard}
                    </div>
                  </div>
                  <div className="rounded border border-lamp-vhard/30 bg-lamp-vhard/10 p-2">
                    <div className="text-xs text-lamp-vhard font-semibold">V-HARD</div>
                    <div className="text-base font-bold text-lamp-vhard tabular-nums">
                      {result.breakdown.vhard}
                    </div>
                  </div>
                </div>

                {/* Real-time preview calculation of theta */}
                {previewTheta != null && (
                  <div className="rounded border border-border/80 bg-card p-3 flex items-center justify-between gap-4 font-mono">
                    <div>
                      <div className="text-xs text-muted-foreground font-sans">
                        {t.estimatedSkill}
                      </div>
                      <div className="text-lg font-bold text-telemetry-cyan tabular-nums">
                        {format(previewTheta, mode === "lerp" ? 2 : 3)}
                        <span className="text-xs font-normal text-muted-foreground ml-1.5 font-sans">
                          {mode === "lerp" ? "U_E" : "θ"}
                        </span>
                      </div>
                    </div>

                    {previewPercentile != null && (
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground font-sans">
                          {t.lang === "en" ? "Leaderboard Standing" : "랭킹 위치"}
                        </div>
                        <div className="text-sm font-semibold text-emerald-400 tabular-nums">
                          {formatTopPercentile(previewPercentile)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Profile Destination Options */}
              <div className="space-y-3">
                {activeProfileId && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground font-medium">
                      {t.lang === "en" ? "Destination Mode" : "저장 방식"}
                    </Label>
                    <RadioGroup
                      value={importAction}
                      onValueChange={(val) => setImportAction(val as "new" | "merge")}
                      className="grid grid-cols-2 gap-2 text-xs"
                    >
                      <Label
                        htmlFor={newRadioId}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all",
                          importAction === "new"
                            ? "border-telemetry-cyan bg-telemetry-cyan/10 text-foreground"
                            : "border-border/80 bg-background/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <RadioGroupItem value="new" id={newRadioId} />
                        <span>{t.qwilightDbSaveNew}</span>
                      </Label>

                      <Label
                        htmlFor={mergeRadioId}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all",
                          importAction === "merge"
                            ? "border-telemetry-cyan bg-telemetry-cyan/10 text-foreground"
                            : "border-border/80 bg-background/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <RadioGroupItem value="merge" id={mergeRadioId} />
                        <span className="truncate">
                          {t.qwilightDbMerge} ({activeProfileId})
                        </span>
                      </Label>
                    </RadioGroup>
                  </div>
                )}

                {importAction === "new" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-medium">
                      {t.profileName}
                    </Label>
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Qwilight Player"
                      className="h-8 text-xs font-mono bg-background/80"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 pt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              resetState();
            }}
            className="text-xs font-sans"
          >
            {t.cancel}
          </Button>

          {result && (
            <Button
              size="sm"
              onClick={handleApply}
              className="text-xs font-sans bg-telemetry-cyan hover:bg-telemetry-cyan/90 text-primary-foreground font-semibold gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {importAction === "merge" && activeProfileId
                  ? t.qwilightDbMerge
                  : t.qwilightDbSaveNew}
              </span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
