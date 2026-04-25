# Metrics Narrator

An AI-powered tool that converts raw, unstructured business metrics into
an executive-ready narrative — flagging anomalies and surfacing hypotheses
worth investigating.

Built as a portfolio artifact to demonstrate product thinking, data
communication skills, and AI tool development.

---

## What It Does

Data teams produce dashboards. Executives want stories. This tool bridges
that gap by turning any metrics input — however messy or unstructured —
into a structured three-part briefing.

| Section | What it gives you |
|---|---|
| **Executive Narrative** | What the metrics collectively say, written for a board or exec audience |
| **Anomalies and Flags** | Unusual patterns, contradictions, or data quality issues |
| **Hypotheses to Investigate** | Data-grounded questions worth exploring next |

---

## Who It Is For

- Product Managers preparing for a metrics review or exec readout
- Analysts who need to translate a data dump into a stakeholder narrative
- Founders preparing board updates
- Growth and data teams who want a fast first-pass interpretation of their numbers

---

## Guardrails

This tool was built with explicit guardrails to ensure output quality and
prevent AI hallucination:

| Guardrail | What it protects against |
|---|---|
| **Interpretability check** | A lightweight validation runs before full analysis. If the input does not contain identifiable metrics, the tool asks specific clarifying questions instead of generating a low-quality narrative |
| **One clarification round limit** | If the input is still uninterpretable after one round of clarification, the tool surfaces a specific terminal error rather than looping indefinitely |
| **No external benchmarking** | The AI is explicitly instructed never to compare metrics against industry benchmarks unless the user has provided comparison data in their input |
| **No assumption rule** | The AI never invents, assumes, or extrapolates any metric not explicitly present in the input |
| **Anomaly detection requires a baseline** | Anomalies are only flagged when the input contains enough data to establish a trend. Single-snapshot inputs are told explicitly that anomaly detection is not possible and why |
| **Contradiction flagging** | If two metrics appear to contradict each other, the tool flags it explicitly rather than silently resolving the conflict |

---

## What It Accepts

Any format. Examples of inputs that work:

- Structured metrics: `DAU: 12,000 | Churn: 3.1% | NPS: 42`
- Natural language: *"Our daily actives grew from 8k to 12k last quarter. Churn ticked up slightly."*
- Mixed formats: numbers, percentages, ratios, and shorthand (k, M) in the same input
- Multi-period data: current and previous period figures for trend analysis

---

## How to Use

1. Paste your metrics into the text area in any format
2. Click **Interpret Metrics**
3. If the input needs clarification, answer the specific questions shown and resubmit
4. Review the three output sections
5. Use the **Copy** button on any section to paste into a doc, Notion, or Slack

---

## Running the Tool

There are three ways to run this tool depending on your setup.

---

### Option A — Run as a Claude Artifact (Easiest, No Setup Required)

This is the fastest way to try the tool. You only need a Claude.ai account.

1. Go to [claude.ai](https://claude.ai) and sign in
2. Start a new conversation
3. Download `metrics-narrator.jsx` from this repo
4. Drag and drop the file into the Claude chat window
5. Type: `Please run this as an artifact`
6. Claude will render the full interactive UI directly in the chat

No API key, no installations, no configuration needed. The tool runs immediately.

> **Note:** Sample inputs to test with are available in
> `metrics-narrator-test-data.md` in this repo.

---

### Option B — Run Locally

**Requirements:**
- A React environment (Create React App, Vite, or equivalent)
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

**Steps:**
1. Clone this repo
2. Place `metrics-narrator.jsx` in your React project's `src` folder
3. Import and render the component in your `App.jsx`
4. Add your Anthropic API key as an environment variable

---

### Option C — Deploy as a Live Web App

The component can be deployed as a standalone public URL on Vercel or
Netlify. Requires an Anthropic API key configured as an environment
variable in your deployment settings.

---

## Testing

A full set of test cases is included in `metrics-narrator-test-data.md`.
Each test case covers a specific scenario:

| Test | Scenario |
|---|---|
| Test 1 | Fully structured metrics with multiple types and comparison periods |
| Test 2 | Natural language narrative style input |
| Test 3 | Vague input with no identifiable metrics (clarification trigger) |
| Test 4 | Single number with no context (clarification trigger) |
| Test 5 | Single snapshot with no baseline (anomaly detection guardrail) |
| Test 6 | Contradictory metrics — high churn and high retention simultaneously |
| Test 7 | Mixed formats in a single input |
| Test 8 | Completely off-topic input (non-metrics guardrail) |

---

## Tech Stack

- **React** — UI and state management
- **Anthropic API** — Claude Sonnet 4 for analysis
- **CSS custom properties** — theming and design tokens
- **No external UI libraries** — fully self-contained single file

---

## Design Decisions

- **Two-step AI pipeline** — a lightweight interpretability check runs first;
  the full analysis only fires if the input passes. This prevents
  low-quality or misleading output from vague inputs
- **State machine pattern** — UI state is managed as a single status enum
  (`idle | loading | clarifying | result | error`) to prevent impossible
  state combinations
- **One clarification round maximum** — enforced in code, not just in the
  prompt, to prevent infinite loops
- **Strict JSON output** — the AI is always instructed to return structured
  JSON, parsed client-side, so the UI renders predictably
- **Accessibility** — all interactive elements have `aria-label` attributes;
  loading states use `aria-live` regions; color is never the only status
  differentiator

---

## About This Project

This tool is part of a broader portfolio of AI-powered product thinking
artifacts. It was built to demonstrate:

- Data literacy and executive communication skills
- Ability to design AI pipelines with meaningful guardrails
- Practical AI product development using the Anthropic API
- Attention to edge cases and output quality — not just the happy path

---

## Related Projects

- [API Concept Simplifier](https://github.com/swapneelrkPM/API-Concept-Simplifier)
  — Translates API documentation into plain business English for
  non-technical stakeholders

---

## Author

**Swapneel** — Senior Product Owner working toward Product Manager elevation.
Building in public at [github.com/swapneelrkPM](https://github.com/swapneelrkPM)
