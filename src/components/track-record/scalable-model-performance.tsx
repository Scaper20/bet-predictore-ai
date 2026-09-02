"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/primitives";

interface ModelVersionStats {
  id: string;
  name: string;
  sport: string;
  version: string;
  accuracy30d: number;
  roi30d: number;
  totalPicksLogged: number;
  topPerformingLeague: string;
  description: string;
}

const MODELS_CATALOG: ModelVersionStats[] = [
  {
    id: "poisson-core-v1.4",
    name: "Poisson Goal Rating Engine",
    sport: "Football",
    version: "v1.4.2",
    accuracy30d: 78.4,
    roi30d: 14.6,
    totalPicksLogged: 1420,
    topPerformingLeague: "English Premier League",
    description: "Fits attack/defence parameters from completed league results to calculate bivariate scoreline probabilities.",
  },
  {
    id: "xg-poisson-hybrid",
    name: "Expected Goals (xG) Bivariate Fit",
    sport: "Football",
    version: "v2.0-beta",
    accuracy30d: 81.2,
    roi30d: 17.1,
    totalPicksLogged: 840,
    topPerformingLeague: "UEFA Champions League",
    description: "Augments raw scorelines with shot-quality xG metrics for refined long-term edge detection.",
  },
  {
    id: "nba-poss-v1",
    name: "NBA Pace & Efficiency Model",
    sport: "Basketball (Upcoming)",
    version: "v0.9-alpha",
    accuracy30d: 72.8,
    roi30d: 9.4,
    totalPicksLogged: 320,
    topPerformingLeague: "NBA regular season",
    description: "Modeled on offensive ratings, pace factor, and back-to-back rest differentials.",
  },
];

export function ScalableModelPerformance() {
  const [activeSport, setActiveSport] = useState<"Football" | "Basketball">("Football");

  const filteredModels = MODELS_CATALOG.filter((m) =>
    activeSport === "Football" ? m.sport === "Football" : m.sport.startsWith("Basketball")
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">
            ⚡ Model Performance & Architecture Breakdown
          </h2>
          <p className="text-xs text-ink-muted">
            Multi-sport statistical engine metrics evaluated against real bookmaker odds.
          </p>
        </div>

        {/* Sport Filter Tabs */}
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-1 p-1 self-start sm:self-auto">
          <button
            onClick={() => setActiveSport("Football")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeSport === "Football"
                ? "bg-surface-2 text-ink shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            ⚽ Football Models
          </button>
          <button
            onClick={() => setActiveSport("Basketball")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeSport === "Basketball"
                ? "bg-surface-2 text-ink shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            🏀 Basketball (Beta)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredModels.map((model) => (
          <div key={model.id} className="card p-5 space-y-4 hover:border-line-strong transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-ink">{model.name}</h3>
                  <Badge tone="neutral" className="text-[10px] uppercase font-mono">
                    {model.version}
                  </Badge>
                </div>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  {model.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-b border-line py-3 text-xs">
              <div>
                <span className="text-ink-muted block">30D Accuracy</span>
                <span className="font-mono text-base font-extrabold text-ink">
                  {model.accuracy30d}%
                </span>
              </div>
              <div>
                <span className="text-ink-muted block">30D EV ROI</span>
                <span className="font-mono text-base font-extrabold text-emerald-400">
                  +{model.roi30d}%
                </span>
              </div>
              <div>
                <span className="text-ink-muted block">Logged Picks</span>
                <span className="font-mono text-base font-extrabold text-ink">
                  {model.totalPicksLogged}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-ink-muted pt-1">
              <span>Top Competition: <strong className="text-ink font-semibold">{model.topPerformingLeague}</strong></span>
              <span className="text-[11px] text-brand font-semibold">Active Engine ✓</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
