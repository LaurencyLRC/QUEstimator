"use client";

import { useState } from "react";
import {
  Check,
  Database,
  Download,
  Save,
  Search,
  Share2,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLang } from "@/lib/i18n";
import {
  estimateThetaWithSe,
  formatTopPercentile,
  type Chart,
  type PlayerData,
  type PlayerHistoryPoint,
} from "@/lib/questimator-types";
import type { PlayerAnalytics } from "./player-utils";

export interface PlayerSearchMatch {
  id: string;
  name: string;
  clears: number;
  isCustom?: boolean;
}

interface ProfileSearchConsoleProps {
  charts: Chart[];
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  loadingPlayers: boolean;
  notFound: boolean;
  onClearNotFound: () => void;
  loadError: string | null;
  onSetLoadError: (err: string | null) => void;
  searchResults: PlayerSearchMatch[] | null;
  onSelectSearchMatch: (match: PlayerSearchMatch) => void;
  currentPlayer: PlayerData | null;
  analytics: PlayerAnalytics | null;
  submittedID: string;
  activePlayerExternalId?: string;
  isCustomProfile: boolean;
  rank: number | null;
  topPercentile: number | null;
  customProfiles: Record<string, PlayerData>;
  onSelectCustomProfile: (id: string) => void;
  onSaveCustomProfile?: (id: string, data: PlayerData) => void;
  onDeleteCustomProfile?: (id: string) => void;
  onProfileActivated: (id: string, isCustom: boolean) => void;
  onProfileDeleted: () => void;
  onOpenQwilightDb: () => void;
  onOpenSummary: () => void;
  importSuccess: string | null;
  onNotifyImportSuccess: (name: string) => void;
}

export function ProfileSearchConsole({
  charts,
  query,
  onQueryChange,
  onSearch,
  loadingPlayers,
  notFound,
  onClearNotFound,
  loadError,
  onSetLoadError,
  searchResults,
  onSelectSearchMatch,
  currentPlayer,
  analytics,
  submittedID,
  activePlayerExternalId,
  isCustomProfile,
  rank,
  topPercentile,
  customProfiles,
  onSelectCustomProfile,
  onSaveCustomProfile,
  onDeleteCustomProfile,
  onProfileActivated,
  onProfileDeleted,
  onOpenQwilightDb,
  onOpenSummary,
  importSuccess,
  onNotifyImportSuccess,
}: ProfileSearchConsoleProps) {
  const { t } = useLang();
  const [newProfileName, setNewProfileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exported, setExported] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearch();
    }
  };

  const commitNewProfile = () => {
    const name = newProfileName.trim();
    if (!name || !onSaveCustomProfile) return;
    const clears = currentPlayer?.c ? { ...currentPlayer.c } : {};
    const { theta: tVal, se: seVal } =
      charts.length > 0 ? estimateThetaWithSe(charts, clears) : { theta: 0, se: 1 };
    onSaveCustomProfile(name, { t: tVal, se: seVal, c: clears, n: name });
    onProfileActivated(name, true);
    setIsCreating(false);
    setNewProfileName("");
  };

  return (
    <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4 pb-3 border-b border-border/40">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <User className="w-4 h-4 text-cyan-400" />
            {t.playerProfile}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-sans">
            {t.playerProfileDesc}
          </p>
        </div>
        {currentPlayer && (
          <div className="flex items-center gap-2">
            {isCustomProfile ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
                OFFLINE LOCAL
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                ONLINE IR
              </span>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t.playerIdPlaceholder}
              aria-label={t.playerIdPlaceholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9 pr-8 font-mono text-xs bg-background/50 border-border/80"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  onClearNotFound();
                }}
                aria-label="Clear player ID search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-telemetry-cyan cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            onClick={onSearch}
            disabled={loadingPlayers || !query.trim()}
            size="sm"
            className="text-xs font-sans"
          >
            {loadingPlayers ? "…" : t.search}
          </Button>
        </div>

        {notFound && (
          <div className="mt-3 p-3 rounded-md border border-border/70 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs text-rose-400 font-sans font-medium">{t.playerNotFound}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-sans">
                {t.lang === "en"
                  ? "Initialize a local offline profile to record manual clears and calculate your rating."
                  : "로컬 프로필을 생성하여 수동 클리어 기록 및 실력 수치를 산출할 수 있습니다."}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-sans border-telemetry-cyan/40 bg-telemetry-cyan/10 text-telemetry-cyan hover:bg-telemetry-cyan/20 gap-1.5"
                onClick={onOpenQwilightDb}
              >
                <Database className="w-3.5 h-3.5" />
                {t.importQwilightDb}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-sans shrink-0"
                onClick={() => {
                  setNewProfileName(query.trim());
                  setIsCreating(true);
                }}
              >
                <Save className="w-3 h-3 mr-1" />
                {t.newProfile}
              </Button>
            </div>
          </div>
        )}
        {loadError && (
          <p className="text-xs text-rose-400 mt-2 font-sans">
            {t.loadFailed}: {loadError}
          </p>
        )}

        {searchResults && searchResults.length > 1 && (
          <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-border/80 bg-background/95">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectSearchMatch(r)}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center justify-between border-b border-border/30 last:border-0 transition-colors"
              >
                <span className="font-medium font-jp text-sm">{r.name}</span>
                <span className="text-xs text-muted-foreground font-mono ml-2">
                  {r.id} · {r.clears} {t.lang === "en" ? "clears" : "클리어"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Active Player Status Banner */}
        {currentPlayer && analytics && (
          <div className="mt-4 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-semibold text-sm">
                  {currentPlayer.n ?? activePlayerExternalId ?? submittedID}
                </span>
                {currentPlayer.n && currentPlayer.n !== (activePlayerExternalId ?? submittedID) && (
                  <span className="text-muted-foreground text-xs font-mono">
                    ({activePlayerExternalId ?? submittedID})
                  </span>
                )}
                {rank != null && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    #{rank}
                  </span>
                )}
                {topPercentile != null && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    Top {formatTopPercentile(topPercentile)}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground">
                <span className="text-foreground font-semibold">{analytics.totalClears}</span> /{" "}
                {charts.length} {t.lang === "en" ? "clears" : "개 클리어"} (
                {charts.length > 0 ? ((analytics.totalClears / charts.length) * 100).toFixed(1) : "0.0"}%)
              </div>
            </div>

            {/* Proportional clear status gauge bar */}
            <div className="w-full h-2 rounded-sm overflow-hidden flex bg-muted/60 border border-border/40 mt-2">
              <div
                style={{ width: `${(analytics.statusCounts[3] / Math.max(1, charts.length)) * 100}%` }}
                title={`V-HARD: ${analytics.statusCounts[3]}`}
                className="h-full bg-lamp-vhard"
              />
              <div
                style={{ width: `${(analytics.statusCounts[2] / Math.max(1, charts.length)) * 100}%` }}
                title={`HARD: ${analytics.statusCounts[2]}`}
                className="h-full bg-lamp-hard"
              />
              <div
                style={{ width: `${(analytics.statusCounts[1] / Math.max(1, charts.length)) * 100}%` }}
                title={`NORMAL: ${analytics.statusCounts[1]}`}
                className="h-full bg-lamp-normal"
              />
              <div
                style={{ width: `${(analytics.statusCounts[0] / Math.max(1, charts.length)) * 100}%` }}
                title={`FAILED: ${analytics.statusCounts[0]}`}
                className="h-full bg-lamp-failed"
              />
            </div>

            {/* Status counts legend below header gauge */}
            <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-lamp-vhard" />
                <span className="text-lamp-vhard font-bold">VH</span>
                <span className="text-foreground tabular-nums">{analytics.statusCounts[3]}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-lamp-hard" />
                <span className="text-lamp-hard font-bold">H</span>
                <span className="text-foreground tabular-nums">{analytics.statusCounts[2]}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-lamp-normal" />
                <span className="text-lamp-normal font-bold">N</span>
                <span className="text-foreground tabular-nums">{analytics.statusCounts[1]}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-lamp-failed" />
                <span className="text-muted-foreground font-bold">F</span>
                <span className="text-foreground tabular-nums">{analytics.statusCounts[0]}</span>
              </span>
            </div>
          </div>
        )}

        {/* Profile Management Sub-Bar */}
        <div className="flex gap-4 mt-4 border-t border-border/40 pt-4 flex-col sm:flex-row items-center justify-between text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-muted-foreground font-sans shrink-0">{t.offlineProfiles}:</span>
            <Select
              value={isCustomProfile ? submittedID : ""}
              onValueChange={(v) => {
                if (v) onSelectCustomProfile(v);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs font-mono">
                <SelectValue placeholder={t.selectOfflineProfile} />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(customProfiles).map((id) => (
                  <SelectItem key={id} value={id} className="font-mono text-xs">
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
            {isCreating ? (
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder={t.profileName}
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="h-8 text-xs font-mono w-36"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitNewProfile();
                    } else if (e.key === "Escape") {
                      setIsCreating(false);
                    }
                  }}
                />
                <Button size="sm" className="h-8 text-xs font-sans" onClick={commitNewProfile}>
                  {t.save}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs font-sans"
                  onClick={() => setIsCreating(false)}
                >
                  {t.cancel}
                </Button>
              </div>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-sans"
                  onClick={() => setIsCreating(true)}
                >
                  <Save className="w-3 h-3 mr-1" /> {currentPlayer ? t.cloneProfile : t.newProfile}
                </Button>

                {isCustomProfile && currentPlayer && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-sans text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> {t.deleteProfile}
                    </Button>

                    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-semibold text-foreground">
                            {t.lang === "en"
                              ? `Delete profile "${submittedID}"?`
                              : `"${submittedID}" 프로필을 삭제하시겠습니까?`}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground text-xs">
                            {t.lang === "en"
                              ? "This action permanently removes this local offline profile and all its recorded clears. This cannot be undone."
                              : "이 로컬 오프라인 프로필과 기록된 모든 클리어 데이터가 영구적으로 삭제됩니다. 실행 후 되돌릴 수 없습니다."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel autoFocus className="text-xs font-sans">
                            {t.cancel}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="text-xs font-sans bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                              if (onDeleteCustomProfile) {
                                onDeleteCustomProfile(submittedID);
                                onProfileDeleted();
                              }
                              setDeleteDialogOpen(false);
                            }}
                          >
                            {t.deleteProfile}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-sans"
                      onClick={() => {
                        const exportData: {
                          c: Record<string, number>;
                          n?: string;
                          history?: PlayerHistoryPoint[];
                        } = {
                          c: currentPlayer.c ?? {},
                          ...(currentPlayer.n ? { n: currentPlayer.n } : {}),
                          ...(currentPlayer.history ? { history: currentPlayer.history } : {}),
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `profile-${submittedID}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setExported(true);
                        setTimeout(() => setExported(false), 2000);
                      }}
                    >
                      {exported ? (
                        <>
                          <Check className="w-3 h-3 mr-1 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">
                            {t.lang === "en" ? "Exported!" : "내보냄!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 mr-1" /> {t.exportProfile}
                        </>
                      )}
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-sans relative overflow-hidden"
                >
                  <Upload className="w-3 h-3 mr-1" /> {t.importProfile}
                  <input
                    type="file"
                    accept=".json"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const data = JSON.parse(ev.target?.result as string);
                          if (data && typeof data.c === "object" && data.c !== null && !Array.isArray(data.c)) {
                            const name = file.name.replace(".json", "");
                            const { theta: calculatedTheta, se: calculatedSe } = estimateThetaWithSe(charts, data.c);
                            const profileData: PlayerData = {
                              t: calculatedTheta,
                              se: calculatedSe,
                              c: data.c,
                              ...(typeof data.n === "string" ? { n: data.n } : {}),
                              ...(Array.isArray(data.history) ? { history: data.history } : {}),
                            };
                            if (onSaveCustomProfile) onSaveCustomProfile(name, profileData);
                            onProfileActivated(name, true);
                            onSetLoadError(null);
                            onNotifyImportSuccess(name);
                          } else {
                            onSetLoadError(
                              t.lang === "en"
                                ? "Invalid profile JSON format: expected 'c' (clears) map"
                                : "잘못된 프로필 JSON 형식입니다: 'c' (클리어) 맵이 필요합니다"
                            );
                          }
                        } catch {
                          onSetLoadError(
                            t.lang === "en"
                              ? "Failed to parse JSON file"
                              : "JSON 파일을 구문 분석하지 못했습니다"
                          );
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = "";
                    }}
                  />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-sans border-telemetry-cyan/40 bg-telemetry-cyan/10 text-telemetry-cyan hover:bg-telemetry-cyan/20 hover:text-telemetry-cyan hover:border-telemetry-cyan/70 gap-1.5"
                  onClick={onOpenQwilightDb}
                >
                  <Database className="w-3 h-3 text-telemetry-cyan shrink-0" />
                  <span>{t.importQwilightDb}</span>
                </Button>

                {currentPlayer && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-sans gap-1.5 border-border/80 hover:bg-muted"
                    onClick={onOpenSummary}
                  >
                    <Share2 className="w-3.5 h-3.5 text-telemetry-cyan shrink-0" />
                    <span>{t.shareProfile}</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        {importSuccess && (
          <div className="mt-2 text-xs text-emerald-400 font-sans flex items-center gap-1.5 justify-end">
            <Check className="w-3.5 h-3.5" />
            <span>
              {t.lang === "en"
                ? `Profile "${importSuccess}" imported successfully`
                : `"${importSuccess}" 프로필을 성공적으로 불러왔습니다`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
