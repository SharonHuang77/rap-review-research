"""
Publication figures for the capstone paper (IEEE two-column, single-column width).

Data are the confirmatory results; every number traces to a persisted artifact:
  - depth gradient .......... hetero-confirmatory/phase3-hetero-stats-report.json
  - per-arm quality/cost .... phase2-results/phase3-stats-report.json
  - defect-type split ....... scripts/phase3-hetero-by-category.ts (stdout)

Run:  python3 make_figures.py      ->  writes ../fig2_depth_gradient.png (+ optional)
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent  # docs/paper/

# IEEE single-column is ~3.5in wide. Keep type >= 7pt at final size.
plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 8,
    "axes.labelsize": 8,
    "axes.titlesize": 8.5,
    "xtick.labelsize": 8,
    "ytick.labelsize": 7.5,
    "legend.fontsize": 7.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "figure.dpi": 400,
})

# Print-safe: distinct in colour AND in value/hatch for greyscale reproduction.
C_SAME = "#BFC5CC"   # light grey  - same model, 3 runs
C_CROSS = "#1F4E9C"  # deep blue   - three independent families


def fig2_depth_gradient():
    """The confirmed positive result: agreement predicts truth only when the
    agreeing sources are independent."""
    depths = np.array([1, 2, 3])
    same = np.array([14, 17, 54])      # n = 35, 30, 391 clusters
    cross = np.array([28, 51, 89])     # n = 419, 114, 137 clusters
    n_same = [35, 30, 391]
    n_cross = [419, 114, 137]

    fig, ax = plt.subplots(figsize=(3.5, 2.35))
    w = 0.36
    b1 = ax.bar(depths - w / 2, same, w, label="same model $\\times$3 runs",
                color=C_SAME, edgecolor="#6B7280", linewidth=0.6)
    b2 = ax.bar(depths + w / 2, cross, w, label="cross-family $\\times$3",
                color=C_CROSS, edgecolor="#12306180", linewidth=0.6, hatch="//")

    for bars, vals, ns, ncol in ((b1, same, n_same, "#4B5563"),
                                 (b2, cross, n_cross, "#FFFFFF")):
        for bar, v, n in zip(bars, vals, ns):
            ax.text(bar.get_x() + bar.get_width() / 2, v + 2.5, f"{v}%",
                    ha="center", va="bottom", fontsize=7.5,
                    fontweight="bold" if v == 89 else "normal")
            ax.text(bar.get_x() + bar.get_width() / 2, 2.0, f"n={n}",
                    ha="center", va="bottom", fontsize=5.8, color=ncol)

    # the equal-depth gaps are the correlated-error mechanism made visible
    for d, lo, hi in ((2, 17, 51), (3, 54, 89)):
        x = d + w / 2 + 0.11
        ax.annotate("", xy=(x, hi), xytext=(x, lo),
                    arrowprops=dict(arrowstyle="<->", lw=0.7, color="#B91C1C"))
        ax.text(x + 0.05, (lo + hi) / 2, f"+{hi - lo}", fontsize=6.5,
                color="#B91C1C", va="center", ha="left")

    ax.set_xlim(0.55, 3.62)   # right margin so the gap labels never clip
    ax.set_xticks(depths)
    # NOT "independent sources" -- the grey series is 3 runs of ONE model, which
    # is exactly the non-independence this figure exists to expose.
    ax.set_xlabel("sources agreeing on a finding")
    ax.set_ylabel("golden-match rate (%)")
    ax.set_ylim(0, 104)
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.grid(axis="y", color="#E5E7EB", linewidth=0.6)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, loc="upper left", handlelength=1.4, borderpad=0.2)
    fig.tight_layout(pad=0.25)
    p = OUT / "fig2_depth_gradient.png"
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {p}")


def fig3_support():
    """Two supporting panels, rendered as ONE two-column-spanning figure so the
    page cost is ~0.3pp instead of ~0.6pp for two separate floats.

    (a) the accuracy/call-budget tradeoff: Agentless Pareto-dominates.
    (b) where the cross-family signal lives: universal bugs, not conventions.
    """
    fig, (axa, axb) = plt.subplots(1, 2, figsize=(7.0, 2.05))

    # --- (a) quality vs cost -------------------------------------------------
    arms = ["Agentless", "Generalists-3", "Hierarchical", "Consensus"]
    f1 = [0.487, 0.357, 0.378, 0.369]
    cost_tp = [0.34, 0.45, 0.50, 1.76]
    offs = [(7, 4), (6, -11), (6, 5), (-4, 8)]
    axa.scatter(cost_tp, f1, s=52, zorder=3,
                color=[C_CROSS, C_SAME, C_SAME, C_SAME],
                edgecolor=["#123061", "#6B7280", "#6B7280", "#6B7280"], linewidth=0.7)
    for a, x, y, off in zip(arms, cost_tp, f1, offs):
        axa.annotate(a, (x, y), textcoords="offset points", xytext=off,
                     fontsize=7, fontweight="bold" if a == "Agentless" else "normal")
    axa.annotate("fewest calls AND best F1", xy=(0.34, 0.487), xytext=(0.62, 0.452),
                 fontsize=6.5, color="#B91C1C",
                 arrowprops=dict(arrowstyle="->", lw=0.7, color="#B91C1C"))
    axa.set_xlabel("LLM calls per confirmed true positive")
    axa.set_ylabel("semantic F1")
    axa.set_xlim(0.15, 2.05)
    axa.set_ylim(0.32, 0.54)
    axa.grid(color="#E5E7EB", linewidth=0.6)
    axa.set_axisbelow(True)
    # "no better", not "worse": the trend is not monotonic (Hierarchical 0.378 >
    # Generalists-3 0.357). The defensible claim is Agentless Pareto-dominance.
    axa.set_title("(a) more agents use more calls, review no better", fontsize=8, pad=4)

    # --- (b) where the signal lives -----------------------------------------
    depths = np.array([1, 2, 3])
    functional = np.array([80, 61, 43])   # n=217
    rule = np.array([45, 26, 18])         # n=220
    w = 0.36
    ba = axb.bar(depths - w / 2, functional, w, label="functional bug (n=217)",
                 color=C_CROSS, edgecolor="#123061", linewidth=0.6)
    bb = axb.bar(depths + w / 2, rule, w, label="rule violation (n=220)",
                 color=C_SAME, edgecolor="#6B7280", linewidth=0.6, hatch="//")
    for bars, vals in ((ba, functional), (bb, rule)):
        for bar, v in zip(bars, vals):
            axb.text(bar.get_x() + bar.get_width() / 2, v + 1.8, f"{v}%",
                     ha="center", va="bottom", fontsize=7)
    axb.set_xticks(depths)
    axb.set_xlabel("independent families agreeing")
    axb.set_ylabel("recall (%)")
    axb.set_ylim(0, 96)
    axb.grid(axis="y", color="#E5E7EB", linewidth=0.6)
    axb.set_axisbelow(True)
    axb.legend(frameon=False, fontsize=7, loc="upper right")
    axb.set_title("(b) agreement finds universal bugs, not conventions",
                  fontsize=8, pad=4)

    fig.tight_layout(pad=0.4, w_pad=2.0)
    p = OUT / "fig3_support.png"
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {p}")


if __name__ == "__main__":
    fig2_depth_gradient()
    fig3_support()
