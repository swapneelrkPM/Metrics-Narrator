/**
 * ============================================================
 * METRICS NARRATOR
 * ============================================================
 * A single-page AI-powered tool that converts raw, unstructured
 * business metrics into an executive-ready narrative.
 *
 * Architecture overview:
 *  - State machine with 5 states: idle | loading | clarifying | result | error
 *  - Two-step AI pipeline: interpretability check → full analysis
 *  - Maximum one clarification round enforced (guardrail)
 *  - All AI instructions live in named constant strings (not inline)
 *  - Zero assumptions policy enforced via system prompt
 *
 * Author: Built with Claude (Anthropic)
 * ============================================================
 */

import { useState, useRef } from "react";

// ============================================================
// SECTION 1: CONSTANTS
// All configuration, labels, prompts, and limits are defined
// here as named constants so they can be updated in one place
// without hunting through logic or JSX.
// ============================================================

// --- Input constraints ---

/**
 * Minimum character count before the Analyze button activates.
 * 30 chars is roughly "DAU: 5,000, WAU: 20,000" — the smallest
 * meaningful metrics input. Below this, output quality is too low.
 */
const MIN_INPUT_LENGTH = 30;

/**
 * Maximum character count for the metrics input textarea.
 * 3000 chars covers even detailed multi-metric data dumps
 * without exceeding a comfortable context window usage.
 */
const MAX_INPUT_LENGTH = 3000;

/**
 * Minimum character count for clarification answers before
 * the resubmit button activates. Short answers like "yes" or
 * "10" are not sufficient context to re-run analysis.
 */
const MIN_CLARIFICATION_LENGTH = 10;

// --- UI copy ---
const TOOL_NAME = "Metrics Narrator";
const TOOL_TAGLINE = "Turn raw metrics into executive-ready stories.";
const TOOL_EYEBROW = "Portfolio Tool · Working Name";

const INPUT_PLACEHOLDER = `Paste your metrics here in any format. Examples:

DAU: 12,000 | WAU: 45,000 | MAU: 120,000
D7 Retention: 42% | Churn: 3.2% | NPS: 34

Or write naturally: "Our daily actives grew from 8k to 12k last
quarter. Churn went up slightly from 2.8% to 3.2%."

No specific format required.`;

const CLARIFICATION_PLACEHOLDER =
  "Answer the questions above in any order. Plain language is fine.";

/**
 * Disclaimer displayed above the textarea.
 * Informs users not to paste sensitive or identifiable data.
 * This is a UX safeguard, not a technical filter.
 */
const DATA_DISCLAIMER =
  "Do not paste data containing personally identifiable information, credentials, or confidential company data.";

// --- Button labels ---
const LABELS = {
  analyze:       "Interpret Metrics",
  analyzing:     "Interpreting...",
  resubmit:      "Resubmit with Answers",
  resubmitting:  "Re-analyzing...",
  reset:         "Start over",
  copy:          "Copy",
  copied:        "✓ Copied",
};

// --- Output section definitions ---
// Drives the result card rendering. Each item maps to a key
// in the JSON returned by the analysis API call.
const OUTPUT_SECTIONS = [
  {
    key: "narrative",
    title: "Executive Narrative",
    description: "What the metrics say, written for a board or exec audience.",
  },
  {
    key: "anomalies",
    title: "Anomalies & Flags",
    description: "Unusual patterns, contradictions, or data quality issues.",
  },
  {
    key: "hypotheses",
    title: "Hypotheses to Investigate",
    description: "Data-grounded questions worth exploring next.",
  },
];

// ============================================================
// SECTION 2: AI SYSTEM PROMPTS
// Every instruction to the model lives here as a named constant.
// Each prompt has a comment block explaining what it does and
// which guardrail(s) it implements.
// ============================================================

/**
 * STEP 1 PROMPT: Interpretability Check
 *
 * PURPOSE: Determine whether the user's input contains enough
 * meaningful signal to produce a reliable metrics narrative.
 * This runs BEFORE the full analysis to prevent the analysis
 * model from fabricating content based on vague or irrelevant input.
 *
 * GUARDRAILS IMPLEMENTED:
 * - Prevents full analysis from running on gibberish or vague text
 * - Forces specific, actionable clarifying questions (not generic ones)
 * - Limits clarifying questions to 4 maximum to avoid overwhelming the user
 *
 * OUTPUT FORMAT: Strict JSON only. Parsed client-side.
 */
const INTERPRETABILITY_SYSTEM_PROMPT = `You are a strict input validator for a business metrics analysis tool.

Your ONLY job is to determine whether the user's input can be meaningfully interpreted as business metrics data.

RULES — follow all of them without exception:
1. Return ONLY valid JSON. No preamble, no markdown, no backticks, no explanation outside the JSON.
2. Set "interpretable" to true if the input contains at least ONE of the following:
   - A named metric with a value (e.g., "DAU: 5000", "churn rate 3.2%")
   - A clear directional business statement (e.g., "revenue grew 20% last quarter")
   - Any numeric data labeled with a business context
3. Set "interpretable" to false if the input:
   - Is a single number without any context
   - Contains no identifiable business metrics
   - Is entirely vague (e.g., "things look good", "numbers are up")
   - Is off-topic (e.g., a question, a poem, a personal message)
4. If "interpretable" is false, provide specific and actionable clarifying questions.
   - Questions must directly address what is MISSING from the input
   - Do NOT ask generic questions like "can you provide more details?"
   - Maximum 4 questions, minimum 1
5. If "interpretable" is true, "clarifyingQuestions" must be an empty array.

Return this exact JSON structure and nothing else:
{
  "interpretable": true,
  "clarifyingQuestions": []
}`;

/**
 * STEP 2 PROMPT: Full Metrics Analysis
 *
 * PURPOSE: Generate a structured three-part executive briefing
 * from interpretable metrics data.
 *
 * GUARDRAILS IMPLEMENTED:
 * - No external benchmarking without user-provided comparison data
 * - No invented numbers or assumed business context
 * - Anomalies only flagged when baseline data is present
 * - Contradictions flagged explicitly, never silently resolved
 * - Narrative written for non-technical executive audience
 *
 * OUTPUT FORMAT: Strict JSON only. Parsed client-side.
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a senior data analyst preparing a metrics briefing for a board or executive audience.

Analyze the provided business metrics and return a structured JSON response.

STRICT RULES — violating any of these makes the output unreliable:
1. Return ONLY valid JSON. No preamble, no markdown, no backticks.
2. NEVER invent, assume, or extrapolate any metric not explicitly present in the input.
3. NEVER benchmark against external industry data unless the user has provided comparison figures in their input.
4. Flag anomalies ONLY when the input contains enough data to establish a trend or baseline.
   If only a single snapshot is provided with no prior period data, state this explicitly:
   "Anomaly detection requires at least two time periods. Only a single data point was provided."
5. If two metrics appear contradictory (e.g., high churn AND high retention simultaneously),
   flag the contradiction explicitly in the anomalies section. Do NOT silently resolve it.
6. Write the narrative in plain, confident language suitable for a non-technical executive.
   Avoid jargon. Lead with the most important insight.
7. Each hypothesis must be directly grounded in at least one metric from the input.
   Do not generate hypotheses that have no basis in the provided data.

Return this exact JSON structure and nothing else:
{
  "narrative": "3 to 5 sentences. Executive summary of what the metrics collectively say. Lead with the most significant signal.",
  "anomalies": "Specific flags, contradictions, or data quality issues found. If none are detectable OR if data is insufficient to identify any, state that explicitly and explain why.",
  "hypotheses": "2 to 4 specific hypotheses worth investigating. Each must reference the metric(s) that prompted it."
}`;

// --- User-facing error messages ---
const ERROR_MESSAGES = {
  /**
   * Shown when the network call fails or API returns a non-OK status.
   * Input is preserved so the user does not lose their work.
   */
  network:
    "Something went wrong connecting to the AI. Your input has been preserved. Please try again.",

  /**
   * Shown when the API response cannot be parsed as valid JSON.
   * This should be rare given the strict JSON instructions in the prompts.
   */
  parse:
    "The AI returned an unexpected response format. Please try again.",

  /**
   * GUARDRAIL: Shown when the user's second attempt (after clarification)
   * is still uninterpretable. Enforces the one-round clarification limit
   * and gives the user a concrete example of what to provide.
   */
  secondClarification:
    "We were still unable to interpret your input after clarification. Please provide at least one metric name and a corresponding value — for example: \"DAU: 5,000\" or \"Monthly revenue: $120,000\".",

  /** Generic fallback for unexpected runtime errors. */
  generic: "An unexpected error occurred. Please try again.",
};

// ============================================================
// SECTION 3: STYLES
// All CSS defined as a template literal injected via <style>.
// Uses CSS custom properties (variables) for theming so any
// color or spacing change only needs to happen in one place.
// ============================================================

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');

  /* ---- Design tokens ---- */
  :root {
    --bg:             #0C0C0F;
    --surface:        #13131A;
    --surface-raised: #1A1A24;
    --border:         #252535;
    --border-subtle:  #1E1E2A;
    --accent:         #C9A96E;
    --accent-dim:     #6B4F28;
    --accent-glow:    rgba(201, 169, 110, 0.07);
    --text-primary:   #EDE8DF;
    --text-secondary: #857E99;
    --text-muted:     #44405A;
    --error:          #D96B6B;
    --error-bg:       rgba(217, 107, 107, 0.06);
    --error-border:   rgba(217, 107, 107, 0.25);
    --success:        #6BB89A;
    --radius-sm:      6px;
    --radius:         10px;
    --radius-lg:      14px;
    --font-display:   'Cormorant Garamond', Georgia, serif;
    --font-body:      'DM Sans', system-ui, sans-serif;
    --transition:     0.2s ease;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body, #root {
    background: var(--bg);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.6;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- Layout shell ---- */
  .app {
    max-width: 720px;
    margin: 0 auto;
    padding: 64px 24px 120px;
  }

  /* ---- Decorative top accent bar ---- */
  .accent-bar {
    width: 40px;
    height: 2px;
    background: var(--accent);
    margin-bottom: 32px;
  }

  /* ---- Header ---- */
  .header { margin-bottom: 52px; }

  .header-eyebrow {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 14px;
  }

  .header-title {
    font-family: var(--font-display);
    font-size: clamp(40px, 7vw, 58px);
    font-weight: 300;
    line-height: 1.05;
    color: var(--text-primary);
    margin-bottom: 16px;
    letter-spacing: -0.01em;
  }

  /* Italic accent word in the title */
  .header-title em {
    font-style: italic;
    color: var(--accent);
  }

  .header-tagline {
    font-size: 14px;
    font-weight: 300;
    color: var(--text-secondary);
    line-height: 1.7;
    max-width: 480px;
  }

  /* ---- Disclaimer banner ---- */
  .disclaimer {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent-dim);
    border-radius: var(--radius-sm);
    background: var(--accent-glow);
    margin-bottom: 24px;
  }
  .disclaimer-icon { font-size: 12px; margin-top: 2px; flex-shrink: 0; }
  .disclaimer-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

  /* ---- Input section ---- */
  .input-label {
    display: block;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .textarea {
    width: 100%;
    min-height: 210px;
    padding: 18px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 300;
    line-height: 1.75;
    resize: vertical;
    outline: none;
    transition: border-color var(--transition);
  }
  .textarea:focus { border-color: var(--accent-dim); }
  .textarea::placeholder { color: var(--text-muted); }
  .textarea:disabled { opacity: 0.5; cursor: not-allowed; }

  .textarea-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
  }
  .char-count {
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
    flex-shrink: 0;
  }
  .char-count.warn { color: var(--error); }

  /* ---- Loading indicator ---- */
  .loading-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0 4px;
    color: var(--text-secondary);
    font-size: 13px;
  }
  .spinner {
    width: 16px; height: 16px;
    border: 1.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---- Error block ---- */
  .error-block {
    margin-top: 20px;
    padding: 16px 18px;
    background: var(--error-bg);
    border: 1px solid var(--error-border);
    border-radius: var(--radius);
    font-size: 13px;
    line-height: 1.65;
    color: var(--error);
    animation: fade-up 0.25s ease;
  }
  .error-block strong {
    display: block;
    font-weight: 500;
    margin-bottom: 5px;
  }

  /* ---- Action row (buttons) ---- */
  .action-row {
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: wrap;
    margin-top: 20px;
  }

  /* Primary CTA button */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 13px 26px;
    background: var(--accent);
    color: #0C0C0F;
    border: none;
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: opacity var(--transition), transform 0.1s ease;
  }
  .btn-primary:hover:not(:disabled) {
    opacity: 0.85;
    transform: translateY(-1px);
  }
  .btn-primary:active:not(:disabled) { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }

  /* Ghost reset link — styled as text, not a button */
  .btn-reset {
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 13px 20px;
    transition: color var(--transition);
  }
  .btn-reset:hover { color: var(--text-secondary); }

  /* ---- Clarification panel ---- */
  .clarify-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: 2px solid var(--accent);
    border-radius: var(--radius-lg);
    padding: 32px;
    margin-top: 36px;
    animation: fade-up 0.3s ease;
  }

  .clarify-heading {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 400;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .clarify-subheading {
    font-size: 13px;
    font-weight: 300;
    color: var(--text-secondary);
    margin-bottom: 28px;
    line-height: 1.6;
  }

  .clarify-questions { margin-bottom: 26px; }

  .clarify-question {
    display: flex;
    gap: 14px;
    padding: 13px 0;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 14px;
    color: var(--text-primary);
    line-height: 1.55;
    font-weight: 300;
  }
  .clarify-question:last-child { border-bottom: none; }

  /* Italic serif ordinal number for each question */
  .q-number {
    font-family: var(--font-display);
    font-style: italic;
    color: var(--accent);
    font-size: 18px;
    line-height: 1.2;
    flex-shrink: 0;
    width: 18px;
    text-align: right;
  }

  /* ---- Results section ---- */
  .results { margin-top: 52px; animation: fade-up 0.35s ease; }

  .results-eyebrow {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 28px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .results-eyebrow::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* Individual result card */
  .result-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 28px 32px 24px;
    margin-bottom: 14px;
    transition: border-color var(--transition);
    animation: fade-up 0.35s ease both;
  }
  /* Staggered entrance animation for each card */
  .result-card:nth-child(1) { animation-delay: 0.00s; }
  .result-card:nth-child(2) { animation-delay: 0.08s; }
  .result-card:nth-child(3) { animation-delay: 0.16s; }

  .result-card:hover { border-color: var(--accent-dim); }

  .card-header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 6px;
  }

  /* Large italic serif ordinal for visual character */
  .card-number {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 32px;
    color: var(--accent-dim);
    line-height: 1;
    flex-shrink: 0;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .card-description {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 18px;
    padding-left: 46px; /* Aligns with text after the number */
  }

  .card-body {
    font-size: 14px;
    font-weight: 300;
    color: var(--text-primary);
    line-height: 1.85;
    white-space: pre-wrap; /* Preserves any line breaks in AI output */
  }

  /* Copy-to-clipboard button inside each card */
  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 18px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 400;
    cursor: pointer;
    transition: color var(--transition), border-color var(--transition);
  }
  .copy-btn:hover { color: var(--text-secondary); border-color: var(--text-muted); }
  .copy-btn.copied { color: var(--success); border-color: var(--success); }

  /* Results footer */
  .results-footer {
    margin-top: 36px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }

  /* ---- Shared animations ---- */
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
`;

// ============================================================
// SECTION 4: UTILITY FUNCTIONS
// ============================================================

/**
 * Calls the Anthropic API with a system prompt and user message.
 * Returns a parsed JSON object from the model's response.
 *
 * IMPORTANT: The model is always instructed to return only JSON.
 * Any accidental markdown code fences are stripped before parsing.
 *
 * @param {string} systemPrompt - System-level instruction for the model
 * @param {string} userMessage  - The user's content to analyze
 * @returns {Promise<Object>}   - Parsed JSON from the model's text response
 * @throws {Error}              - On network failure, non-OK status, or parse error
 */
async function callAnthropicAPI(systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    // Throw with status code so the caller can log or inspect if needed
    throw new Error(`API error: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Concatenate all text blocks from the response
  const rawText = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip any accidental markdown code fences (```json ... ```) before parsing.
  // This prevents JSON.parse failures due to model formatting quirks.
  const cleaned = rawText.replace(/```json|```/gi, "").trim();

  return JSON.parse(cleaned);
}

// ============================================================
// SECTION 5: RESULT CARD COMPONENT
// Extracted as its own component because it manages its own
// copy-to-clipboard state independently from the parent.
// ============================================================

/**
 * Renders a single analysis result card with a copy-to-clipboard button.
 *
 * @param {Object} props
 * @param {number} props.index       - Zero-based index (used for aria and animation)
 * @param {number} props.number      - Display ordinal (1, 2, 3)
 * @param {string} props.title       - Card heading text
 * @param {string} props.description - One-line descriptor shown under the title
 * @param {string} props.content     - AI-generated text content to display
 */
function ResultCard({ index, number, title, description, content }) {
  // Local state: tracks whether the user recently clicked Copy
  const [copied, setCopied] = useState(false);

  /**
   * Copies the card's AI-generated content to the clipboard.
   * Shows a "Copied" confirmation for 2 seconds, then resets.
   * Fails silently if the Clipboard API is unavailable (e.g., non-HTTPS).
   */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available in all environments — silent fail
    }
  }

  return (
    <div
      className="result-card"
      role="region"
      aria-label={title}
    >
      <div className="card-header">
        <span className="card-number" aria-hidden="true">
          {number}.
        </span>
        <h3 className="card-title">{title}</h3>
      </div>
      <p className="card-description">{description}</p>
      <div className="card-body">{content}</div>
      <button
        className={`copy-btn ${copied ? "copied" : ""}`}
        onClick={handleCopy}
        aria-label={`Copy ${title} to clipboard`}
      >
        {copied ? LABELS.copied : LABELS.copy}
      </button>
    </div>
  );
}

// ============================================================
// SECTION 6: MAIN COMPONENT
// ============================================================

export default function MetricsNarrator() {

  // ----------------------------------------------------------
  // STATE
  // Using a single "status" string as a state machine to prevent
  // impossible state combinations (e.g., loading AND error both true).
  //
  // Valid transitions:
  //   idle → loading → clarifying (if input unclear)
  //   idle → loading → result     (if input clear)
  //   idle → loading → error      (on API failure)
  //   clarifying → loading → result
  //   clarifying → loading → error (terminal, one-round limit)
  //   any → idle                  (via reset)
  // ----------------------------------------------------------
  const [status, setStatus]                     = useState("idle");

  // The user's original metrics input text
  const [inputText, setInputText]               = useState("");

  // Questions returned by the interpretability check when unclear
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);

  // The user's typed answers to the clarifying questions
  const [clarificationAnswers, setClarificationAnswers] = useState("");

  // Whether the user has entered the clarification flow.
  // Stays true even during loading/error so the clarify panel stays visible.
  const [inClarificationFlow, setInClarificationFlow] = useState(false);

  // Parsed output from the full analysis API call
  const [outputData, setOutputData]             = useState(null);

  // Message to display in the error block
  const [errorMessage, setErrorMessage]         = useState("");

  // Ref used to scroll the results section into view after rendering
  const resultsRef = useRef(null);

  // ----------------------------------------------------------
  // CORE ANALYSIS FUNCTION
  // A single unified function handles both the initial submission
  // and the resubmission after clarification. The "isSecondAttempt"
  // boolean is passed as a parameter — NOT read from state —
  // to avoid async state update timing issues.
  // ----------------------------------------------------------

  /**
   * Runs the two-step AI pipeline:
   *   Step 1 — Interpretability check
   *   Step 2 — Full analysis (only if step 1 passes)
   *
   * GUARDRAIL: If isSecondAttempt is true and the input is still
   * uninterpretable, a terminal error is shown and the flow ends.
   * This enforces the maximum-one-clarification-round rule.
   *
   * @param {boolean} isSecondAttempt - True when called after clarification
   */
  async function runAnalysis(isSecondAttempt) {
    setStatus("loading");
    setErrorMessage("");

    try {
      // ---- STEP 1: INTERPRETABILITY CHECK ----
      // If this is a second attempt, combine the original input with
      // the clarification answers so the model has full context.
      const messageForCheck = isSecondAttempt
        ? `Original metrics input:\n${inputText}\n\nUser's clarification answers:\n${clarificationAnswers}`
        : inputText;

      const checkResult = await callAnthropicAPI(
        INTERPRETABILITY_SYSTEM_PROMPT,
        messageForCheck
      );

      // Handle: input still not interpretable after clarification
      if (!checkResult.interpretable) {
        if (isSecondAttempt) {
          // GUARDRAIL: One clarification round limit reached.
          // Show terminal error and exit clarification flow.
          setErrorMessage(ERROR_MESSAGES.secondClarification);
          setInClarificationFlow(false);
          setStatus("error");
          return;
        }

        // First attempt failed: surface clarifying questions to the user
        setClarifyingQuestions(checkResult.clarifyingQuestions || []);
        setInClarificationFlow(true);
        setStatus("clarifying");
        return;
      }

      // ---- STEP 2: FULL ANALYSIS ----
      // Combine original input and clarification answers for richer context
      const messageForAnalysis = isSecondAttempt
        ? `Metrics input:\n${inputText}\n\nAdditional context from user:\n${clarificationAnswers}`
        : inputText;

      const analysisResult = await callAnthropicAPI(
        ANALYSIS_SYSTEM_PROMPT,
        messageForAnalysis
      );

      setOutputData(analysisResult);
      setStatus("result");

      // Scroll the results section into view after React re-renders.
      // The 120ms delay allows the DOM to update before scrolling.
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);

    } catch (err) {
      // Distinguish JSON parse errors from network/API errors
      // to show the most helpful error message possible.
      const isParseError = err instanceof SyntaxError;
      setErrorMessage(isParseError ? ERROR_MESSAGES.parse : ERROR_MESSAGES.network);
      setStatus("error");
    }
  }

  // ----------------------------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------------------------

  /**
   * Handles initial "Interpret Metrics" button click.
   * Triggers the two-step pipeline with isSecondAttempt = false.
   */
  function handleSubmit() {
    runAnalysis(false);
  }

  /**
   * Handles "Resubmit with Answers" button click after clarification.
   * Triggers the two-step pipeline with isSecondAttempt = true.
   */
  function handleClarificationSubmit() {
    runAnalysis(true);
  }

  /**
   * Resets all state back to the initial idle configuration.
   * Clears all inputs, outputs, and intermediate state.
   */
  function handleReset() {
    setStatus("idle");
    setInputText("");
    setClarifyingQuestions([]);
    setClarificationAnswers("");
    setInClarificationFlow(false);
    setOutputData(null);
    setErrorMessage("");
  }

  // ----------------------------------------------------------
  // DERIVED STATE
  // Computed from current state to drive UI enable/disable logic.
  // ----------------------------------------------------------

  /** True while any API call is in flight */
  const isProcessing = status === "loading";

  /** Primary button is disabled when input is too short or processing */
  const isPrimaryDisabled =
    inputText.trim().length < MIN_INPUT_LENGTH || isProcessing;

  /** Clarification resubmit button is disabled when answers are too short */
  const isClarifyDisabled =
    clarificationAnswers.trim().length < MIN_CLARIFICATION_LENGTH || isProcessing;

  /** Whether to show the input section (all states except result and clarification) */
  const showInputSection = !inClarificationFlow && status !== "result";

  /** Whether to show the clarification panel */
  const showClarificationPanel = inClarificationFlow;

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <>
      <style>{STYLES}</style>

      <div className="app">

        {/* ---- DECORATIVE ACCENT BAR ---- */}
        {/* Small gold bar above the header for visual anchoring */}
        <div className="accent-bar" aria-hidden="true" />

        {/* ---- HEADER ---- */}
        <header className="header">
          <p className="header-eyebrow">{TOOL_EYEBROW}</p>
          <h1 className="header-title">
            Metrics <em>Narrator</em>
          </h1>
          <p className="header-tagline">{TOOL_TAGLINE}</p>
        </header>

        {/* ============================================================
            INPUT SECTION
            Shown when: not in clarification flow AND not showing results
        ============================================================ */}
        {showInputSection && (
          <section aria-label="Metrics input area">

            {/* Privacy disclaimer */}
            <div className="disclaimer" role="note" aria-label="Data privacy notice">
              <span className="disclaimer-icon" aria-hidden="true">⚠</span>
              <span className="disclaimer-text">{DATA_DISCLAIMER}</span>
            </div>

            {/* Textarea */}
            <label className="input-label" htmlFor="metrics-input">
              Your Metrics
            </label>
            <textarea
              id="metrics-input"
              className="textarea"
              value={inputText}
              onChange={(e) =>
                setInputText(e.target.value.slice(0, MAX_INPUT_LENGTH))
              }
              placeholder={INPUT_PLACEHOLDER}
              disabled={isProcessing}
              aria-label="Enter your metrics in any format"
              aria-describedby="char-count-display"
            />

            {/* Character counter */}
            <div className="textarea-meta">
              <span /> {/* Spacer for flex alignment */}
              <span
                id="char-count-display"
                className={`char-count ${
                  inputText.length > MAX_INPUT_LENGTH * 0.9 ? "warn" : ""
                }`}
              >
                {inputText.length} / {MAX_INPUT_LENGTH}
              </span>
            </div>

            {/* Loading indicator (during initial analysis) */}
            {isProcessing && (
              <div
                className="loading-row"
                aria-live="polite"
                aria-label="Analyzing your metrics"
              >
                <div className="spinner" aria-hidden="true" />
                <span>Checking interpretability...</span>
              </div>
            )}

            {/* Error block (shown after API failure on the initial attempt) */}
            {status === "error" && errorMessage && (
              <div className="error-block" role="alert">
                <strong>Unable to process</strong>
                {errorMessage}
              </div>
            )}

            {/* Action row: primary button + reset link */}
            {!isProcessing && (
              <div className="action-row">
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={isPrimaryDisabled}
                  aria-label="Interpret metrics and generate narrative"
                >
                  {LABELS.analyze}
                </button>

                {/* Show reset only when there is something to clear */}
                {(status === "error" || inputText.length > 0) && (
                  <button
                    className="btn-reset"
                    onClick={handleReset}
                    aria-label="Clear all input and start over"
                  >
                    {LABELS.reset}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============================================================
            CLARIFICATION PANEL
            Shown when: input was ambiguous and AI needs more context.
            Stays visible during loading on the second attempt.
        ============================================================ */}
        {showClarificationPanel && (
          <section
            className="clarify-panel"
            aria-label="Clarification needed"
          >
            <h2 className="clarify-heading">A few things to clarify</h2>
            <p className="clarify-subheading">
              Your input was received but needs a bit more context to produce
              an accurate narrative. Please answer the questions below.
            </p>

            {/* Clarifying questions list */}
            <div className="clarify-questions" role="list">
              {clarifyingQuestions.map((question, i) => (
                <div key={i} className="clarify-question" role="listitem">
                  <span className="q-number" aria-hidden="true">{i + 1}.</span>
                  <span>{question}</span>
                </div>
              ))}
            </div>

            {/* Answers textarea */}
            <label className="input-label" htmlFor="clarification-input">
              Your Answers
            </label>
            <textarea
              id="clarification-input"
              className="textarea"
              style={{ minHeight: "120px" }}
              value={clarificationAnswers}
              onChange={(e) => setClarificationAnswers(e.target.value)}
              placeholder={CLARIFICATION_PLACEHOLDER}
              disabled={isProcessing}
              aria-label="Provide your clarification answers"
            />

            {/* Loading indicator during second attempt */}
            {isProcessing && (
              <div
                className="loading-row"
                aria-live="polite"
                aria-label="Re-analyzing with your answers"
              >
                <div className="spinner" aria-hidden="true" />
                <span>Re-analyzing with your answers...</span>
              </div>
            )}

            {/* Terminal error after second attempt fails */}
            {status === "error" && errorMessage && (
              <div className="error-block" role="alert">
                <strong>Still unable to interpret</strong>
                {errorMessage}
              </div>
            )}

            {/* Action row for clarification */}
            {!isProcessing && (
              <div className="action-row">
                <button
                  className="btn-primary"
                  onClick={handleClarificationSubmit}
                  disabled={isClarifyDisabled}
                  aria-label="Resubmit with clarification answers"
                >
                  {LABELS.resubmit}
                </button>
                <button
                  className="btn-reset"
                  onClick={handleReset}
                  aria-label="Clear all and start over"
                >
                  {LABELS.reset}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ============================================================
            RESULTS SECTION
            Shown when: status === "result" and outputData is available.
            Each card animates in with a staggered delay.
        ============================================================ */}
        {status === "result" && outputData && (
          <section
            ref={resultsRef}
            className="results"
            aria-label="Analysis results"
          >
            <p className="results-eyebrow">Analysis Complete</p>

            {/* Render one card per output section */}
            {OUTPUT_SECTIONS.map((section, index) => (
              <ResultCard
                key={section.key}
                index={index}
                number={index + 1}
                title={section.title}
                description={section.description}
                content={outputData[section.key] || "No output returned for this section."}
              />
            ))}

            {/* Reset link in the results footer */}
            <div className="results-footer">
              <button
                className="btn-reset"
                onClick={handleReset}
                aria-label="Start a new analysis"
              >
                ← {LABELS.reset}
              </button>
            </div>
          </section>
        )}

      </div>
    </>
  );
}
