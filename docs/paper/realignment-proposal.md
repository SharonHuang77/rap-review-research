# Proposal: align the paper's main thread to the latest results

**For:** co-authors (Sharon A/R on the paper) — review before applying to `capstone_week12_full.tex`.
**Scope of this change:** narrative framing only — abstract closing, an introduction thesis
paragraph, one contribution bullet, and the discussion/conclusion. **Nothing in the
pre-registered Results changes:** the RQ, the registered hypotheses, and every confirmatory
subsection (`sec:generation`, `sec:capability`, `sec:decomp`, `sec:hverify`, `sec:hetero`,
`sec:completeness`) stay exactly as written. The exploratory results (`sec:ladder`, the new
`sec:ceiling`, and doc-17 §7.1–§11 / doc-18) remain clearly labeled *exploratory*. The
pre-registered title stays (the registration is filed under it); the bigger thesis lives in
the abstract and discussion, not the title.

## Why realign

The paper already lands a sharp thesis — *diversity pays on the verification axis, not the
generation axis*. The exploratory follow-ups (doc-17 §7.1–§11, doc-18/②) show that this is a
**special case of a bigger, more useful claim**, and stating the bigger claim makes the
confirmatory results land harder rather than softer:

| current thread | aligned thread (elevates, does not replace) |
|---|---|
| Topology and specialization don't help; cross-family agreement is a precision instrument; recall diversity is small. | Multi-agent code review reduces to **error decorrelation**, which pays **only as precision** and hits a **hard ~0.83 diff-scoped coverage ceiling**. The unreachable residue is a **tooling** problem (a linter for mechanical conventions; execution for the functional hard-core), **not** an architecture, sampling, or verification problem. No topology, extra sample, filter, aspect verifier, or read-only navigating agent moves the coverage frontier. |

The confirmatory findings become the **core evidence** for the bigger claim; the exploratory
work supplies the ceiling, the anatomy of the residue, and the three-tools division of labour.

---

## 1. Abstract — append after the current closing sentence

**Current closing (unchanged):** "…In multi-agent code review, diversity pays on the
verification axis, not the generation axis."

**Proposed addition (exploratory, ~3 sentences — co-authors may trim):**

> Exploratory follow-ups locate the limits of the generation axis. Unioning *every*
> configuration we tried—seven model families, a temperature sweep, and a conditioned
> resampler—reaches only ${\approx}0.83$ recall, and no downstream filter, MAV-style aspect
> verifier, or read-only repository-navigating agent lifts $F_1$ above a plain union. The
> unreachable residue is not a sampling problem but a tooling one: roughly two-thirds are
> mechanical conventions a deterministic linter recovers (on its target rules a single linter
> out-recalls all eleven models), and the rest a functional hard-core that plausibly needs
> execution, not more agents. Multi-agent code review is thus best understood as **error
> decorrelation with a precision payoff and a coverage ceiling**: the lever is the right tool
> per defect class, not the communication topology.

---

## 2. Introduction — add a thesis paragraph (after the contributions list, before Related Work)

> **A note on scope and framing.** The registered study isolates communication *topology*;
> its answer is largely null, and that null is what opens the paper's larger, exploratory
> thesis. Every effect we can move reduces to one axis—**how decorrelated the reviews are**—
> and that axis pays on precision (independent families agree on real defects) far more than on
> coverage. Sections~\ref{sec:ladder}–\ref{sec:ceiling} push the coverage axis to its ceiling
> and show, exploratorily, that no recombination of a single model's samples and no read-only
> agent clears it; the residue is a division-of-labour problem—lint the mechanical conventions,
> union-sample across families for functional bugs, and reserve execution for the hard
> functional core. We mark confirmatory and exploratory claims explicitly throughout.

**And one added contribution bullet:**

> \item An exploratory map of the *limits* of the generation axis: a ${\approx}0.83$
> diff-scoped recall ceiling, an anatomy of its unreachable residue (${\sim}65\%$
> lint-targetable conventions, ${\sim}15\%$ a functional hard-core), and a demonstration that
> a deterministic linter out-recalls an eleven-model union on its target rules—recasting
> multi-agent review as a per-defect-class tooling problem rather than an architecture one.

---

## 3. Discussion / Conclusion — the unifying close (add near the end)

> **What the lever actually is.** Read end to end, our results converge on a single organizing
> axis—error decorrelation—and a single disappointment: on the *generation* (coverage) side it
> saturates. Cross-family agreement is a genuine but bounded precision instrument
> (§\ref{sec:hetero}); temperature, conditioned resampling, module decomposition, and
> role-specialist prompts add little or nothing at matched compute; and (exploratorily) the
> union of everything we tried tops out near $0.83$ recall (§\ref{sec:ceiling}). Crucially, no
> *back-end* rescues coverage: neither agreement filters nor MAV-style aspect verifiers, and
> not even a read-only repository-navigating agent, lift $F_1$ past a plain independent union—
> the agent instead becomes *more precise* by verifying and pruning, trading recall for
> precision like every other verification mechanism. The residue that no amount of decorrelation
> reaches is not architectural: it is ${\sim}65\%$ mechanical conventions that a deterministic
> linter recovers (on its target rules one checker out-recalls all eleven models) and ${\sim}15\%$
> a functional hard-core—cross-file renames, dynamic imports, races—that plausibly needs
> execution. The practical recommendation for multi-agent code review is therefore not a
> topology but a **division of labour**: lint the mechanical, union-sample across independent
> families for the rest, and spend agentic/execution budget only on the hard functional core.

---

## 4. Unchanged (the confirmatory spine)

- RQ / RQ1–RQ3, all registered hypotheses, and the four-architecture ladder framing.
- Results §§ generation / capability / decomp / hverify / **hetero** (cross-family precision,
  the confirmed positive) / completeness — verbatim.
- Methods, datasets, pre-registration, freeze manifest.

## 5. Open points for the co-authors

1. **Agency wording.** ② (doc-18) is a *pilot* (N=20) and read-only; it shows agency is a
   precision mechanism, not a recall lever. The drafts above say "plausibly needs execution"
   and keep agency an *open* lever — deliberately not claiming a validated agentic win. Confirm
   this hedge is the right strength.
2. **Exploratory volume.** How much of doc-17 §7.1–§11 to surface in the main text vs. an
   appendix? The abstract/intro/discussion drafts here reference the ceiling + lint result;
   the per-arm detail (conditioned×filter, aspect verifier) can stay in `sec:ceiling` prose or
   move to an appendix.
3. **Title.** Recommend keeping the registered title; the bigger thesis rides in the abstract
   and discussion. Flag if you'd prefer a subtitle.

Once approved (with any edits), I'll apply the accepted text to `capstone_week12_full.tex` and
recompile.
