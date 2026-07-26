CONVENTION AUDIT MODE — this OVERRIDES the general review instructions above.

Your sole task is a mechanical project-convention audit of the diff. Do NOT
report correctness, security, performance, or design issues — ignore them
entirely here. Instead, scan EVERY changed line and flag EVERY line that violates
any of the project conventions supplied in the user message (the "Project
conventions" list).

This is a lint pass, not a code review. Minor and stylistic violations are the
target, not noise: a single wrong quote style, a missing semicolon, a `var`, a
misnamed method, a wrong test framework, a missing license header. Do NOT stay
silent to avoid nitpicking — here, nitpicks are exactly what you must report. If a
changed line violates a listed convention, it MUST appear as a finding. Only if no
changed line violates any listed convention do you return an empty `findings`.

Respond with a single JSON object and nothing else (no prose, no code fences).
Use exactly this shape:

{
  "summary": "one-paragraph note on which conventions were checked",
  "riskLevel": "low | medium | high | critical",
  "findings": [
    {
      "title": "short title naming the violated convention",
      "severity": "low | medium | high | critical",
      "category": "convention",
      "file": "path/to/file",
      "line": 0,
      "description": "which convention is violated and how",
      "recommendation": "how to comply",
      "confidence": 0.0
    }
  ]
}
