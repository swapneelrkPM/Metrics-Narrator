import { useState, useRef } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MIN_INPUT_LENGTH = 30;
const MAX_INPUT_LENGTH = 3000;
const MIN_CLARIFICATION_LENGTH = 10;

const TOOL_TAGLINE = "Turn raw metrics into executive-ready stories.";
const TOOL_EYEBROW = "AI Portfolio Tool";

const INPUT_PLACEHOLDER = `Paste your metrics here in any format. Examples:

DAU: 12,000 | WAU: 45,000 | MAU: 120,000
D7 Retention: 42% | Churn: 3.2% | NPS: 34

Or write naturally: "Our daily actives grew from 8k to 12k last
quarter. Churn went up slightly from 2.8% to 3.2%."

No specific format required.`;

const CLARIFICATION_PLACEHOLDER = "Answer the questions above in any order. Plain language is fine.";
const DATA_DISCLAIMER = "Do not paste data containing personally identifiable information, credentials, or confidential company data.";

const LABELS = {
  analyze: "Interpret Metrics",
  analyzing: "Interpreting...",
  resubmit: "Resubmit with Answers",
  resubmitting: "Re-analyzing...",
  reset: "Start over",
  copy: "Copy",
  copied: "✓ Copied",
};

const OUTPUT_SECTIONS = [
  { key: "narrative", title: "Executive Narrative", description: "What the metrics say, written for a board or exec audience." },
  { key: "anomalies", title: "Anomalies & Flags", description: "Unusual patterns, contradictions, or data quality issues." },
  { key: "hypotheses", title: "Hypotheses to Investigate", description: "Data-grounded questions worth exploring next." },
];

const SIMPLE_SECTIONS = [
  { key: "simpleSummary", title: "What's Happening", description: "The same analysis, written in plain everyday language." },
  { key: "simpleAnomalies", title: "Things That Look Off", description: "Unusual patterns and flags, explained simply." },
  { key: "simpleHypotheses", title: "Questions Worth Asking", description: "What to investigate next, in plain terms." },
];

const VISUALIZATION_SYSTEM_PROMPT = `You are a data visualization specialist. Extract key metrics from the provided business data and suggest appropriate visualizations.

RULES:
1. Return ONLY valid JSON. No preamble, no markdown, no backticks.
2. Extract ONLY metrics that are explicitly present in the input. Do not invent or estimate values.
3. Identify the best visualization type for the data:
   - Line chart: for time-series or sequential data (e.g., weekly DAU, month-over-month trends)
   - Bar chart: for categorical comparisons (e.g., retention by cohort, metrics by region, user segments)
   - Pie chart: for parts of a whole (e.g., user distribution across channels, traffic sources)
4. For each visualization, provide structured data in the format required by the chart type.
5. If the input has insufficient data for meaningful visualization (single data points, no clear patterns), return an empty visualizations array.
6. Limit to maximum 3 visualizations.

Return this exact JSON structure:
{
  "visualizations": [
    {
      "type": "line" | "bar" | "pie",
      "title": "Chart title",
      "data": [
        { "name": "label", "value": number, "percentage": number (for pie only) }
      ]
    }
  ]
}`;


const INTERPRETABILITY_SYSTEM_PROMPT = `You are a strict input validator for a business metrics analysis tool.

Your ONLY job is to determine whether the user's input can be meaningfully interpreted as business metrics data.

RULES - follow all of them without exception:
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

const ANALYSIS_SYSTEM_PROMPT = `You are a senior data analyst preparing a metrics briefing for two audiences simultaneously.

Analyze the provided business metrics and return a structured JSON response with SIX fields:
three for an executive audience and three in plain everyday language.

STRICT RULES - violating any of these makes the output unreliable:
1. Return ONLY valid JSON. No preamble, no markdown, no backticks.
2. NEVER invent, assume, or extrapolate any metric not explicitly present in the input.
3. NEVER benchmark against external industry data unless the user has provided comparison figures in their input.
4. Flag anomalies ONLY when the input contains enough data to establish a trend or baseline.
5. If two metrics appear contradictory, flag the contradiction explicitly in the anomalies section.
6. Write the executive fields in confident, precise language suitable for a board or executive audience.
7. Each hypothesis must be directly grounded in at least one metric from the input.
8. MISSING OR BLANK VALUES: List each missing metric explicitly in the anomalies section.
9. LEADING VS LAGGING INDICATORS: If lagging indicators appear positive while leading indicators are declining, lead the narrative with the leading indicator risk.
10. TREND VS SPIKE: When a multi-period dataset shows a sustained trend followed by a single-period reversal, do not characterize the reversal as a trend change.
11. PLAIN LANGUAGE CONSISTENCY: The three simple fields must convey exactly the same findings as their executive counterparts.
12. EM DASHES BANNED: Do not use em dashes anywhere in any output field.

Return this exact JSON structure and nothing else:
{
  "narrative": "3 to 5 sentences. Executive summary for a board audience. Lead with the most significant signal.",
  "anomalies": "Executive-register flags, contradictions, and data quality issues.",
  "hypotheses": "2 to 4 executive-register hypotheses, each grounded in a specific metric.",
  "simpleSummary": "3 to 5 sentences. Same analysis as narrative but in plain, simple language. No jargon.",
  "simpleAnomalies": "Same flags as anomalies but explained simply.",
  "simpleHypotheses": "Same hypotheses as the executive version but phrased as plain, everyday questions."
}`;

const ERROR_MESSAGES = {
  network: "Something went wrong connecting to the AI. Your input has been preserved. Please try again.",
  parse: "The AI returned an unexpected response format. Please try again.",
  secondClarification: "We were still unable to interpret your input after clarification. Please provide at least one metric name and a corresponding value - for example: \"DAU: 5,000\" or \"Monthly revenue: $120,000\".",
  generic: "An unexpected error occurred. Please try again.",
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Ubuntu:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500&display=swap');

  :root {
    --bg: #F4F0E4;
    --surface: #EAE6D9;
    --surface-raised: #E1DDD0;
    --border: #CEC9BA;
    --border-subtle: #DBD7CB;
    --accent: #44A194;
    --accent-dim: #537D96;
    --accent-hover: #338078;
    --accent-glow: rgba(68, 161, 148, 0.09);
    --text-primary: #1E2D2B;
    --text-secondary: #4A6360;
    --text-muted: #8A9B99;
    --error: #C96E6C;
    --error-bg: rgba(236, 143, 141, 0.10);
    --error-border: rgba(236, 143, 141, 0.35);
    --success: #44A194;
    --radius-sm: 6px;
    --radius: 10px;
    --radius-lg: 14px;
    --font-display: 'Ubuntu', sans-serif;
    --font-body: 'Ubuntu', sans-serif;
    --transition: 0.2s ease;
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

  .gradient-top-border {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(to right, #44A194, #537D96);
    z-index: 100;
  }

  .app { max-width: 720px; margin: 0 auto; padding: 64px 24px 120px; }

  .accent-bar { width: 40px; height: 2px; background: var(--accent); margin-bottom: 32px; }

  .header { margin-bottom: 52px; }

  .header-eyebrow {
    font-size: 10px; font-weight: 500; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--accent-dim); margin-bottom: 14px;
  }

  .header-title {
    font-family: var(--font-display);
    font-size: clamp(40px, 7vw, 58px);
    font-weight: 300; line-height: 1.05;
    color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.01em;
  }

  .header-tagline { font-size: 14px; font-weight: 300; color: var(--text-secondary); line-height: 1.7; max-width: 480px; }

  .disclaimer {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 12px 16px; border: 1px solid var(--border);
    border-left: 2px solid var(--accent-dim); border-radius: var(--radius-sm);
    background: var(--accent-glow); margin-bottom: 24px;
  }
  .disclaimer-icon { font-size: 12px; margin-top: 2px; flex-shrink: 0; }
  .disclaimer-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

  .input-label {
    display: block; font-size: 10px; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 10px;
  }

  .textarea {
    width: 100%; min-height: 210px; padding: 18px 20px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text-primary);
    font-family: var(--font-body); font-size: 14px; font-weight: 300;
    line-height: 1.75; resize: vertical; outline: none;
    transition: border-color var(--transition);
  }
  .textarea:focus { border-color: var(--accent-dim); }
  .textarea::placeholder { color: var(--text-muted); }
  .textarea:disabled { opacity: 0.5; cursor: not-allowed; }

  .textarea-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .char-count { font-size: 11px; color: var(--text-muted); text-align: right; flex-shrink: 0; }
  .char-count.warn { color: var(--error); }

  .loading-row {
    display: flex; align-items: center; gap: 12px;
    padding: 20px 0 4px; color: var(--text-secondary); font-size: 13px;
  }
  .spinner {
    width: 16px; height: 16px; border: 1.5px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin 0.75s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-block {
    margin-top: 20px; padding: 16px 18px; background: var(--error-bg);
    border: 1px solid var(--error-border); border-radius: var(--radius);
    font-size: 13px; line-height: 1.65; color: var(--error);
    animation: fade-up 0.25s ease;
  }
  .error-block strong { display: block; font-weight: 500; margin-bottom: 5px; }

  .action-row { display: flex; align-items: center; gap: 0; flex-wrap: wrap; margin-top: 20px; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 26px; background: var(--accent); color: #F4F0E4;
    border: none; border-radius: var(--radius); font-family: var(--font-body);
    font-size: 13px; font-weight: 500; letter-spacing: 0.03em;
    cursor: pointer; transition: background var(--transition), transform 0.1s ease;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
  .btn-primary:active:not(:disabled) { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }

  .btn-reset {
    background: none; border: none; color: var(--text-muted);
    font-family: var(--font-body); font-size: 12px; cursor: pointer;
    text-decoration: underline; text-underline-offset: 3px;
    padding: 13px 20px; transition: color var(--transition);
  }
  .btn-reset:hover { color: var(--text-secondary); }

  .clarify-panel {
    background: var(--surface); border: 1px solid var(--border);
    border-top: 2px solid var(--accent); border-radius: var(--radius-lg);
    padding: 32px; margin-top: 36px; animation: fade-up 0.3s ease;
  }
  .clarify-heading { font-family: var(--font-display); font-size: 24px; font-weight: 400; color: var(--text-primary); margin-bottom: 8px; }
  .clarify-subheading { font-size: 13px; font-weight: 300; color: var(--text-secondary); margin-bottom: 28px; line-height: 1.6; }
  .clarify-questions { margin-bottom: 26px; }
  .clarify-question {
    display: flex; gap: 14px; padding: 13px 0;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 14px; color: var(--text-primary); line-height: 1.55; font-weight: 300;
  }
  .clarify-question:last-child { border-bottom: none; }
  .q-number { font-family: var(--font-display); color: var(--accent); font-size: 18px; line-height: 1.2; flex-shrink: 0; width: 18px; text-align: right; }

  .audience-tabs {
    display: flex; gap: 4px; margin-bottom: 28px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 4px; width: fit-content;
  }
  .tab-btn {
    padding: 8px 20px; border: none; border-radius: calc(var(--radius) - 2px);
    background: none; color: var(--text-muted); font-family: var(--font-body);
    font-size: 12px; font-weight: 500; letter-spacing: 0.04em;
    cursor: pointer; transition: background var(--transition), color var(--transition); white-space: nowrap;
  }
  .tab-btn:hover:not(.tab-btn--active) { color: var(--text-secondary); background: var(--surface-raised); }
  .tab-btn--active { background: var(--accent); color: #F4F0E4; }

  .results { margin-top: 52px; animation: fade-up 0.35s ease; }
  .results-eyebrow {
    font-size: 10px; font-weight: 500; letter-spacing: 0.2em;
    text-transform: uppercase; color: var(--text-muted); margin-bottom: 28px;
    display: flex; align-items: center; gap: 12px;
  }
  .results-eyebrow::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .result-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 28px 32px 24px;
    margin-bottom: 14px; transition: border-color var(--transition);
    animation: fade-up 0.35s ease both;
  }
  .result-card:nth-child(1) { animation-delay: 0.00s; }
  .result-card:nth-child(2) { animation-delay: 0.08s; }
  .result-card:nth-child(3) { animation-delay: 0.16s; }
  .result-card:hover { border-color: var(--accent-dim); }

  .card-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 6px; }
  .card-number { font-family: var(--font-display); font-size: 32px; color: var(--accent-dim); line-height: 1; flex-shrink: 0; }
  .card-title { font-family: var(--font-display); font-size: 20px; font-weight: 600; color: var(--text-primary); line-height: 1.2; }
  .card-description { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px; padding-left: 46px; }
  .card-body { font-size: 14px; font-weight: 300; color: var(--text-primary); line-height: 1.85; white-space: pre-wrap; }

  .copy-btn {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 18px; padding: 6px 14px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: none; color: var(--text-muted);
    font-family: var(--font-body); font-size: 11px; font-weight: 400;
    cursor: pointer; transition: color var(--transition), border-color var(--transition);
  }
  .copy-btn:hover { color: var(--text-secondary); border-color: var(--text-muted); }
  .copy-btn.copied { color: var(--success); border-color: var(--success); }

  .results-footer { margin-top: 36px; padding-top: 24px; border-top: 1px solid var(--border); }

  .viz-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 28px 32px;
    margin-bottom: 14px;
    animation: fade-up 0.35s ease both;
  }
  .viz-container:nth-child(1) { animation-delay: 0.00s; }
  .viz-container:nth-child(2) { animation-delay: 0.08s; }
  .viz-container:nth-child(3) { animation-delay: 0.16s; }

  .viz-title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 22px;
  }

  .viz-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 300;
  }


  @keyframes fade-up {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

async function callAnthropicAPI(systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) throw new Error(`API error: HTTP ${response.status}`);

  const data = await response.json();
  const rawText = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  return JSON.parse(cleaned);
}

function ResultCard({ index, number, title, description, content }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="result-card" role="region" aria-label={title}>
      <div className="card-header">
        <span className="card-number" aria-hidden="true">{number}.</span>
        <h3 className="card-title">{title}</h3>
      </div>
      <p className="card-description">{description}</p>
      <div className="card-body">{content}</div>
      <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy} aria-label={`Copy ${title} to clipboard`}>
        {copied ? LABELS.copied : LABELS.copy}
      </button>
    </div>
  );
}

function VisualizationChart({ viz }) {
  const COLORS = ['#44A194', '#537D96', '#C96E6C', '#F4A460', '#8B7D6B', '#A0B0A8'];

  if (viz.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={viz.data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#CEC9BA" />
          <XAxis dataKey="name" stroke="#8A9B99" />
          <YAxis stroke="#8A9B99" />
          <Tooltip contentStyle={{ backgroundColor: '#EAE6D9', border: '1px solid #CEC9BA', borderRadius: '8px' }} />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#44A194" strokeWidth={2} dot={{ fill: '#44A194' }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (viz.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={viz.data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#CEC9BA" />
          <XAxis dataKey="name" stroke="#8A9B99" />
          <YAxis stroke="#8A9B99" />
          <Tooltip contentStyle={{ backgroundColor: '#EAE6D9', border: '1px solid #CEC9BA', borderRadius: '8px' }} />
          <Bar dataKey="value" fill="#44A194" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viz.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={viz.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
            {viz.data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: '#EAE6D9', border: '1px solid #CEC9BA', borderRadius: '8px' }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

export default function MetaMetrics() {
  const [status, setStatus] = useState("idle");
  const [inputText, setInputText] = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [clarificationAnswers, setClarificationAnswers] = useState("");
  const [inClarificationFlow, setInClarificationFlow] = useState(false);
  const [outputData, setOutputData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState("exec");
  const resultsRef = useRef(null);

  async function runAnalysis(isSecondAttempt) {
    setStatus("loading");
    setErrorMessage("");

    try {
      const msgForCheck = isSecondAttempt
        ? `Original metrics input:\n${inputText}\n\nUser's clarification answers:\n${clarificationAnswers}`
        : inputText;

      const checkResult = await callAnthropicAPI(INTERPRETABILITY_SYSTEM_PROMPT, msgForCheck);

      if (!checkResult.interpretable) {
        if (isSecondAttempt) {
          setErrorMessage(ERROR_MESSAGES.secondClarification);
          setInClarificationFlow(false);
          setStatus("error");
          return;
        }
        setClarifyingQuestions(checkResult.clarifyingQuestions || []);
        setInClarificationFlow(true);
        setStatus("clarifying");
        return;
      }

      const msgForAnalysis = isSecondAttempt
        ? `Metrics input:\n${inputText}\n\nAdditional context from user:\n${clarificationAnswers}`
        : inputText;

      const analysisResult = await callAnthropicAPI(ANALYSIS_SYSTEM_PROMPT, msgForAnalysis);
      setOutputData(analysisResult);
      setStatus("result");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);

    } catch (err) {
      setErrorMessage(err instanceof SyntaxError ? ERROR_MESSAGES.parse : ERROR_MESSAGES.network);
      setStatus("error");
    }
  }

  function handleReset() {
    setStatus("idle");
    setInputText("");
    setClarifyingQuestions([]);
    setClarificationAnswers("");
    setInClarificationFlow(false);
    setOutputData(null);
    setErrorMessage("");
    setActiveTab("exec");
  }

  const isProcessing = status === "loading";
  const isPrimaryDisabled = inputText.trim().length < MIN_INPUT_LENGTH || isProcessing;
  const isClarifyDisabled = clarificationAnswers.trim().length < MIN_CLARIFICATION_LENGTH || isProcessing;
  const showInputSection = !inClarificationFlow && status !== "result";

  return (
    <>
      <style>{STYLES}</style>
      <div className="gradient-top-border" aria-hidden="true" />
      <div className="app">
        <div className="accent-bar" aria-hidden="true" />

        <header className="header">
          <p className="header-eyebrow">{TOOL_EYEBROW}</p>
          <h1 className="header-title">
            Meta<span style={{ color: "var(--accent)" }}>Metrics</span>
          </h1>
          <p className="header-tagline">{TOOL_TAGLINE}</p>
        </header>

        {showInputSection && (
          <section aria-label="Metrics input area">
            <div className="disclaimer" role="note">
              <span className="disclaimer-icon" aria-hidden="true">⚠</span>
              <span className="disclaimer-text">{DATA_DISCLAIMER}</span>
            </div>

            <label className="input-label" htmlFor="metrics-input">Your Metrics</label>
            <textarea
              id="metrics-input"
              className="textarea"
              value={inputText}
              onChange={e => setInputText(e.target.value.slice(0, MAX_INPUT_LENGTH))}
              placeholder={INPUT_PLACEHOLDER}
              disabled={isProcessing}
            />
            <div className="textarea-meta">
              <span />
              <span className={`char-count ${inputText.length > MAX_INPUT_LENGTH * 0.9 ? "warn" : ""}`}>
                {inputText.length} / {MAX_INPUT_LENGTH}
              </span>
            </div>

            {isProcessing && (
              <div className="loading-row" aria-live="polite">
                <div className="spinner" aria-hidden="true" />
                <span>Checking interpretability...</span>
              </div>
            )}

            {status === "error" && errorMessage && (
              <div className="error-block" role="alert">
                <strong>Unable to process</strong>{errorMessage}
              </div>
            )}

            {!isProcessing && (
              <div className="action-row">
                <button className="btn-primary" onClick={() => runAnalysis(false)} disabled={isPrimaryDisabled}>
                  {LABELS.analyze}
                </button>
                {(status === "error" || inputText.length > 0) && (
                  <button className="btn-reset" onClick={handleReset}>{LABELS.reset}</button>
                )}
              </div>
            )}
          </section>
        )}

        {inClarificationFlow && (
          <section className="clarify-panel" aria-label="Clarification needed">
            <h2 className="clarify-heading">A few things to clarify</h2>
            <p className="clarify-subheading">
              Your input was received but needs a bit more context to produce an accurate narrative. Please answer the questions below.
            </p>
            <div className="clarify-questions" role="list">
              {clarifyingQuestions.map((q, i) => (
                <div key={i} className="clarify-question" role="listitem">
                  <span className="q-number" aria-hidden="true">{i + 1}.</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
            <label className="input-label" htmlFor="clarification-input">Your Answers</label>
            <textarea
              id="clarification-input"
              className="textarea"
              style={{ minHeight: "120px" }}
              value={clarificationAnswers}
              onChange={e => setClarificationAnswers(e.target.value)}
              placeholder={CLARIFICATION_PLACEHOLDER}
              disabled={isProcessing}
            />
            {isProcessing && (
              <div className="loading-row" aria-live="polite">
                <div className="spinner" aria-hidden="true" />
                <span>Re-analyzing with your answers...</span>
              </div>
            )}
            {status === "error" && errorMessage && (
              <div className="error-block" role="alert">
                <strong>Still unable to interpret</strong>{errorMessage}
              </div>
            )}
            {!isProcessing && (
              <div className="action-row">
                <button className="btn-primary" onClick={() => runAnalysis(true)} disabled={isClarifyDisabled}>
                  {LABELS.resubmit}
                </button>
                <button className="btn-reset" onClick={handleReset}>{LABELS.reset}</button>
              </div>
            )}
          </section>
        )}

        {status === "result" && outputData && (
          <section ref={resultsRef} className="results" aria-label="Analysis results">
            <p className="results-eyebrow">Analysis Complete</p>
            <div className="audience-tabs" role="tablist">
              <button role="tab" aria-selected={activeTab === "exec"} className={`tab-btn ${activeTab === "exec" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("exec")}>
                Executive View
              </button>
              <button role="tab" aria-selected={activeTab === "simple"} className={`tab-btn ${activeTab === "simple" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("simple")}>
                The Simple Read
              </button>
              <button role="tab" aria-selected={activeTab === "viz"} className={`tab-btn ${activeTab === "viz" ? "tab-btn--active" : ""}`} onClick={() => setActiveTab("viz")}>
                Visual Summary
              </button>
            </div>
            {activeTab !== "viz" && (
              <>
                {(activeTab === "exec" ? OUTPUT_SECTIONS : SIMPLE_SECTIONS).map((section, i) => (
                  <ResultCard
                    key={`${activeTab}-${section.key}`}
                    index={i}
                    number={i + 1}
                    title={section.title}
                    description={section.description}
                    content={outputData[section.key] || "No output returned for this section."}
                  />
                ))}
              </>
            )}
            {activeTab === "viz" && (
              <div>
                {outputData.visualizations && outputData.visualizations.length > 0 ? (
                  outputData.visualizations.map((viz, i) => (
                    <div key={i} className="viz-container">
                      <h3 className="viz-title">{viz.title}</h3>
                      <VisualizationChart viz={viz} />
                    </div>
                  ))
                ) : (
                  <div className="viz-container">
                    <div className="viz-empty">
                      No visualizations available. The input metrics may not contain enough structured data for graphical representation.
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="results-footer">
              <button className="btn-reset" onClick={handleReset}>← {LABELS.reset}</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
