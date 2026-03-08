# Jewelry QA/QC Intelligence Analyzer

A full-stack, AI-powered QA/QC analytics dashboard built for jewelry manufacturing operations.

This application transforms natural language questions into SQL queries, executes them in-browser using SQLite, and returns executive-ready insights with intelligent visualizations — all inside a single self-contained `index.html` file.

Built with:

* Vanilla JavaScript
* SQL.js (in-browser SQLite engine)
* Chart.js (data visualization)
* Anthropic Claude API (`claude-sonnet-4-20250514`) for Natural Language → SQL → Business Insight pipeline

---

## Overview

The Jewelry QA/QC Intelligence Analyzer allows quality managers, vendor analysts, and leadership teams to explore QA and QC datasets without writing SQL.

Users can type questions like:

* “Top defects this month”
* “Worst performing vendor”
* “Inspector performance summary”

The system:

1. Converts natural language into SQL
2. Executes the query in-browser
3. Generates a stakeholder-friendly answer
4. Automatically selects the best chart type
5. Allows export to CSV

All within a modern, dark-themed enterprise dashboard.

---

## UI Design

### Layout Structure

---

## Header: Jewelry QA/QC Intelligence Analyzer

## Sidebar (Left) | Main Panel (Center-Right)

Dataset Toggle | KPI Cards (4)
Quick Chips    | Natural Language Input + Analyze Button
Recent Queries | Tabs: Answer | Table | Chart
| Chart Area
| Export to CSV
---------------

### Header

Title: Jewelry QA/QC Intelligence Analyzer

### Sidebar (Left Panel)

* Dataset selector toggle:

  * QA
  * QC
  * Both
* Quick query suggestion chips
* Recent query history list

### Main Panel

* KPI Cards (always visible)
* Natural language input field
* “Analyze” button
* Tabbed result interface:

  * Answer → Claude-generated business explanation
  * Table → SQL result grid
  * Chart → Auto-generated visualization
* Export to CSV button

---

## Quick Stats Dashboard (Auto-Computed KPIs)

Displayed at the top of the main panel:

* Total QA Records – Count of all QA records
* Total QC Records – Count of all QC records
* Overall Defect Rate (%) – Computed defect ratio
* Top Defective Component – Most frequently defective item

These values are computed directly from the in-browser SQLite database.

---

## Natural Language to SQL Pipeline

This application uses a two-step Claude API pipeline.

### Step 1: Natural Language → SQL

* User submits a query.
* The app sends:

  * User question
  * Full schema of `qa_data` and `qc_data`
  * Strict system instruction to return only a valid SQL query (no markdown, no explanation, no backticks).

Model used:
`claude-sonnet-4-20250514`

### Step 2: SQL Execution (Client Side)

* SQL is executed using SQL.js (in-browser SQLite).
* No backend server required.
* Fully client-side execution.

### Step 3: SQL Result → Business Insight

* Query results are sent back to Claude.
* Claude generates:

  * Clear
  * Executive-level
  * Stakeholder-friendly explanation
  * Direct answer to the original question

---

## Chart Intelligence

The system auto-detects the best visualization type based on result shape:

* Category + numeric column → Bar chart
* Date + numeric column → Line chart
* Category + percentage → Pie/Donut chart
* Multi-column detail rows → Table only

### Chart Engine

* Built using Chart.js
* Auto-labeled
* Includes legend
* Uses jewel-tone color palette:

  * Deep purple
  * Gold
  * Emerald green
  * Ruby red

Designed to feel like a premium enterprise BI tool.

---

## Error Handling

### Invalid SQL from Claude

* Catch SQL.js error
* Automatically ask Claude to fix SQL
* Retry once

### No Data Returned

Display:
“No data found for your query.”

### Loading State

During API calls:
“Analyzing your query...”
Displayed with animated loading spinner.

---

## API Key Handling

At the top of the app:

* User pastes their Anthropic API key
* Stored in a JavaScript variable for the session only
* Not stored in localStorage
* Not persisted across sessions

---

## Export Functionality

* Results can be exported to CSV
* Generated dynamically from SQL result set
* Download triggered via browser Blob API

---

## Technology Stack

* Frontend: Vanilla JavaScript
* Database: SQL.js (SQLite in-browser)
* Visualization: Chart.js
* AI Engine: Anthropic Claude API
* Deployment: Single self-contained `index.html`

All dependencies are loaded via CDN.

---

## Project Structure

index.html

Everything lives inside one file:

* UI
* SQL engine
* Chart rendering
* API calls
* Error handling
* CSV export
* Schema embedding

---

## How to Run

1. Open `index.html` in a browser.
2. Paste your Anthropic API key.
3. Load QA and QC datasets into SQL.js.
4. Start querying in natural language.

No backend required.

---

## Example Queries

* Top defects this month
* Which vendor has the highest rejection rate?
* Inspector performance summary for March
* Compare QA vs QC defect trends
* Defect distribution by component
* Monthly defect trend for ring category

---

## Target Users

* QA Managers
* QC Inspectors
* Vendor Performance Analysts
* Business Intelligence Teams
* Manufacturing Leadership

---

## Enterprise Design Principles

* Dark-themed professional dashboard
* Responsive layout
* Clear typography
* Strong visual hierarchy
* Performance-focused
* Minimal latency
* No unnecessary dependencies

---

## Future Enhancements

* Authentication layer
* Role-based dataset filtering
* Multi-file upload support
* Persistent query history
* Advanced filter builder
* Drill-down interactions
* Export to Excel / PDF
* Cloud-hosted SQLite backend option

---

## License

Internal enterprise analytics tool.
Customize and extend as needed.

---

## Summary

The Jewelry QA/QC Intelligence Analyzer combines:

* In-browser database execution
* AI-powered query generation
* Intelligent visualization
* Executive-level explanations
* Enterprise-grade UI

All in one elegant, self-contained web application.
