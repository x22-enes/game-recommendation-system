import { useMemo } from 'react';
import { Game } from '../utils/games';
import { GPU_TIERS, getEstimatedPcRequirement } from '../utils/compatibility';

export default function CompatibilityPanel({ game }: { game: Game }) {
    const requirement = useMemo(() => getEstimatedPcRequirement(game), [game]);
    const gpuTierLabel = GPU_TIERS.find(tier => tier.value === requirement.minGpuTier)?.label || 'GPU target';

    const specs = [
        { label: 'Class', value: requirement.label },
        { label: 'CPU', value: `${requirement.minCpuCores}+ cores` },
        { label: 'Memory', value: `${requirement.minMemoryGb}+ GB` },
        { label: 'GPU', value: gpuTierLabel },
        { label: 'Storage', value: `${requirement.storageGb} GB` },
    ];

    return (
        <section className="surface rounded-xl p-5 sm:p-6">
            <div>
                <h2 className="text-xl font-black text-white">Minimum Requirements</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                    Estimated minimum PC specs needed to play this game.
                </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {specs.map(spec => (
                    <div key={spec.label} className="rounded-lg border border-white/[0.06] bg-slate-950/40 px-4 py-3">
                        <span className="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{spec.label}</span>
                        <span className="mt-1 block text-sm font-bold text-white">{spec.value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
