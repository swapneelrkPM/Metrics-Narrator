# Metrics Narrator — Sample Test Data

Each block below maps to a specific test case category.
Copy the content between the dashed lines and paste it directly into the tool.

---

## TEST 1 — Happy Path: Structured Metrics
Category: Full structured data with multiple metric types.
Expected behavior: All three output sections render cleanly.

--------------------------------------------------
DAU: 12,400
WAU: 48,200
MAU: 134,000

Retention:
  D1: 61%
  D7: 38%
  D30: 22%

Churn rate (monthly): 3.1%
NPS: 42
Average session duration: 6m 40s
ARPU: $4.20

Previous month comparison:
  DAU was 9,800
  Churn was 2.6%
  NPS was 37
--------------------------------------------------


---

## TEST 2 — Happy Path: Narrative Style Input
Category: No structured format, written as a business update.
Expected behavior: Interpretability check passes. Full output renders.

--------------------------------------------------
Our daily active users climbed from around 9,800 last month to 12,400 this
month, which is the strongest growth we have seen in two quarters. Weekly
actives are at 48,200 and monthly actives just crossed 134,000.

Retention at day 7 is sitting at 38%, which is roughly flat compared to last
quarter's 39%. Day 30 retention dropped from 25% to 22%, which is worth
watching. NPS improved from 37 to 42 following the redesign we shipped in
week 3.

Churn ticked up from 2.6% to 3.1% despite the user growth, which is a
pattern we haven't fully explained yet.
--------------------------------------------------


---

## TEST 3 — Clarification Trigger: Vague Input
Category: Input has no identifiable metrics or values.
Expected behavior: Interpretability check fails. Clarifying questions appear.

--------------------------------------------------
Things are looking pretty good overall. The numbers are moving in the right
direction and the team is happy with how the last release landed. Engagement
is up and users seem to like the new features. Revenue side also looks
healthy.
--------------------------------------------------


---

## TEST 4 — Clarification Trigger: Single Number
Category: A number without any context.
Expected behavior: Clarification panel asks what the number represents,
what time period it covers, and whether there is a comparison point.

--------------------------------------------------
142
--------------------------------------------------


---

## TEST 5 — Anomaly Detection: Single Snapshot (No Baseline)
Category: Valid metrics but only one time period, no comparison data.
Expected behavior: Anomalies section explicitly states that anomaly
detection requires at least two time periods and cannot be performed.

--------------------------------------------------
MAU: 28,500
Paid conversion rate: 6.2%
Average revenue per user: $9.80
Support ticket volume: 340 this month
Feature adoption (new export tool): 18% of active users
--------------------------------------------------


---

## TEST 6 — Contradictory Data
Category: Metrics that appear to contradict each other.
Expected behavior: Anomalies section flags the contradiction explicitly
rather than silently accepting both as true.

--------------------------------------------------
Monthly churn rate: 8.5%
30-day retention: 94%
DAU/MAU ratio: 0.52
Net Promoter Score: 71
New user signups (this month): 1,200
Total active users: 45,000
--------------------------------------------------


---

## TEST 7 — Edge Case: Mixed Formats
Category: Metrics expressed in different formats in the same input.
Expected behavior: Tool handles all formats without error and produces
a coherent narrative across all of them.

--------------------------------------------------
Revenue: $1.2M MRR (up from $980K last month)
DAU: 34k
Paid subscribers: 8,421
Free-to-paid conversion: roughly 1 in 14 users
D7 retention = 41 percent
Support CSAT: 4.2 out of 5
CAC: approximately $38
LTV estimated at $210
Refund rate: 0.8%
--------------------------------------------------


---

## TEST 8 — Guardrail: Non-Metrics Input
Category: Content that is not business metrics at all.
Expected behavior: Interpretability check fails with a specific message
asking the user to provide metric names and values.

--------------------------------------------------
Can you help me write a performance review for my engineer? They have been
doing great work this quarter on the new checkout flow and I want to make
sure I capture their impact accurately.
--------------------------------------------------
