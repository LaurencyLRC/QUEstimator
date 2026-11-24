"use client";

import { Layers, Sigma, Trophy } from "lucide-react";
import { useLang } from "@/lib/i18n";
import type { Meta } from "@/lib/questimator-types";

export function AboutTab({ meta }: { meta: Meta | null }) {
  const { t } = useLang();

  return (
    <div className="max-w-4xl rounded-lg border border-border/80 bg-card divide-y divide-border/40 overflow-hidden">
      {/* Overview section */}
      <div className="p-5 sm:p-6 space-y-3">
        <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Sigma className="w-4 h-4 text-telemetry-cyan" />
          {t.projectOverview}
        </h3>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {t.lang === "en" ? (
            <>
              <p>
                <strong className="text-foreground">QUEstimator</strong> is an objective, data-driven difficulty estimation system for 6-key BMS charts on the U_E scale in <span className="text-foreground">Qwilight</span>. By fitting a Bayesian Graded Response Model (GRM), it evaluates the exact latent difficulty thresholds for HARD and V-HARD clears directly from actual Internet Ranking (IR) play logs.
              </p>
              <p>
                Qwilight is uniquely suited for IRT estimation due to its <strong className="text-foreground">Gauge Auto-Shift (GAS)</strong> system: a failed V-HARD play automatically continues on the HARD gauge. The clear status recorded on the IR therefore represents a player&apos;s genuine organic peak survival threshold without requiring artificial gauge conversion guesses.
              </p>
              <p className="text-xs pt-1">
                Inspired by{" "}
                <a
                  href="https://github.com/HorieYuuka"
                  target="_blank"
                  rel="noreferrer"
                  className="text-telemetry-cyan hover:underline"
                >
                  HorieYuuka&apos;s Scale Analyzer
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p>
                <strong className="text-foreground">QUEstimator</strong>는 <span className="text-foreground">Qwilight</span> U_E 6키 난이도표 수록 채보를 대상으로 한 베이지안 문항반응이론(IRT) 기반 난이도 추정 대시보드입니다. 인터넷 랭킹(IR) 플레이 기록을 바탕으로 Graded Response Model(GRM)을 피팅하여 각 패턴의 HARD 및 V-HARD 클리어 한계 난이도를 산출합니다.
              </p>
              <p>
                Qwilight 특유의 <strong className="text-foreground">Gauge Auto-Shift(GAS)</strong> 시스템(V-HARD 폭사 시 HARD 게이지 자동 승계) 덕분에, IR에 기록된 클리어 상태는 별도의 추정 없이 유저의 유기적인 최고 게이지 생존 역치를 나타냅니다.
              </p>
              <p className="text-xs pt-1">
                Inspired by{" "}
                <a
                  href="https://github.com/HorieYuuka"
                  target="_blank"
                  rel="noreferrer"
                  className="text-telemetry-cyan hover:underline"
                >
                  HorieYuuka&apos;s Scale Analyzer
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>

      {/* Math & Model Architecture */}
      <div className="p-5 sm:p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          {t.methodology}
        </h3>
        <div className="space-y-4 text-xs">
          <div className="rounded border border-border/70 p-4 bg-muted/20">
            <div className="text-foreground font-semibold text-sm mb-2 font-mono">
              P*(θ, k) = 1 / (1 + exp(-a_i · (θ - b_ik)))
            </div>
            <p className="text-muted-foreground leading-relaxed font-sans text-xs">
              {t.lang === "en"
                ? "Samejima's Graded Response Model parameterizes the cumulative survival probability P* that a player with latent skill ability θ clears chart i on gauge tier k or higher."
                : "Samejima의 Graded Response Model(GRM)을 채택하여, 잠재 실력 θ인 플레이어가 문항 i를 게이지 단계 k 이상으로 클리어할 누적 생존 확률 P*를 추정합니다."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded border border-border/60 bg-muted/20">
              <div className="text-foreground font-semibold mb-1 font-mono">a_i (Discrimination)</div>
              <div className="text-muted-foreground text-xs font-sans">
                {t.lang === "en"
                  ? "Indicates how strictly the chart tests pure skill vs randomness."
                  : "패턴이 순수 실력을 얼마나 예리하게 판별하는지 나타냅니다."}
              </div>
            </div>
            <div className="p-3 rounded border border-border/60 bg-muted/20">
              <div className="text-foreground font-semibold mb-1 font-mono">b_k (Difficulty)</div>
              <div className="text-muted-foreground text-xs font-sans">
                {t.lang === "en"
                  ? "Point where survival probability reaches 50%."
                  : "생존 확률이 50%에 도달하는 임계 난이도."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline & Diagnostics panel */}
      <div className="p-5 sm:p-6 space-y-3">
        <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          {t.pipelineState}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.model}</div>
            <div className="text-foreground font-semibold mt-1 font-mono">{meta?.model}</div>
          </div>
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.categories}</div>
            <div className="text-foreground font-semibold mt-1 font-mono text-[11px]">
              {meta?.categories.join(" → ")}
            </div>
          </div>
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.provisionalRule}</div>
            <div className="text-foreground font-semibold mt-1 font-mono text-[11px]">
              {meta?.provisional_rule}
            </div>
          </div>
          <div className="rounded border border-border/60 p-3 bg-muted/20">
            <div className="text-muted-foreground text-xs">{t.runtimeLabel}</div>
            <div className="text-foreground font-semibold mt-1 font-mono tabular-nums">
              {meta?.runtime_sec}s
            </div>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="p-5 sm:p-6 space-y-2">
        <h3 className="text-base font-bold text-foreground mb-2">{t.techStack}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span className="text-foreground font-semibold">Inference Engine:</span>{" "}
            {meta?.model?.includes("C11") ? "C11 + OpenMP NUTS MCMC" : "NumPyro NUTS MCMC · JAX"}
            {meta?.mcmc_chains && meta?.mcmc_samples_per_chain
              ? ` (${meta.mcmc_chains}×${meta.mcmc_samples_per_chain})`
              : ""}
          </div>
          <div>
            <span className="text-foreground font-semibold">Quadrature:</span>{" "}
            {meta?.identification?.quadrature_nodes ?? 41}-node MCMC · 101-node EAP Gauss-Hermite
          </div>
          <div>
            <span className="text-foreground font-semibold">Frontend:</span> Next.js 16 · React 19 · Tailwind CSS
          </div>
          <div>
            <span className="text-foreground font-semibold">Scale System:</span> Weighted Whittaker + PAVA Isotonic PCHIP
          </div>
        </div>
      </div>
    </div>
  );
}
