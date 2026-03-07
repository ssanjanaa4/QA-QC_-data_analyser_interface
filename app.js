/* =====================================================================
   Jewelry QA/QC Analyzer — app.js
   Local NL→SQL Engine · SQL.js · Chart.js
   No API key required — fully in-browser analysis
   ===================================================================== */

'use strict';

// ── Globals ────────────────────────────────────────────────────────────
let db = null;
let currentDataset = 'both';
let currentResults = [];
let currentChart = null;
let recentQueries = [];

const CHART_COLORS = [
    'rgba(99,  179, 237, 0.85)',
    'rgba(104, 211, 145, 0.85)',
    'rgba(246, 173,  85, 0.85)',
    'rgba(252, 129, 129, 0.85)',
    'rgba(183, 148, 244, 0.85)',
    'rgba(79,  209, 197, 0.85)',
    'rgba(118, 228, 247, 0.85)',
    'rgba(245, 101, 101, 0.85)',
    'rgba(246, 224, 149, 0.85)',
    'rgba(154, 230, 180, 0.85)',
];

// ── Query Panel References ──────────────────────────────────────────────
const queryInput = document.getElementById('queryInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingSubtext = document.getElementById('loadingSubtext');
const exportBtn = document.getElementById('exportBtn');
const dbStatus = document.getElementById('dbStatus');
const dbStatusText = document.getElementById('dbStatusText');

queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleAnalyze();
});

// ══════════════════════════════════════════════════════════════════════
// 1. DATABASE INITIALIZATION
// ══════════════════════════════════════════════════════════════════════

async function initDatabase() {
    setDbStatus('loading', 'Loading CSV files…');
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        db = new SQL.Database();

        const createSQL = (tbl) => `
          CREATE TABLE IF NOT EXISTS ${tbl} (
            date TEXT, vendor_name TEXT, component_name TEXT, defect_type TEXT,
            defect_code TEXT, inspector_name TEXT, batch_id TEXT, severity TEXT, status TEXT
          );`;
        db.run(createSQL('qa_data'));
        db.run(createSQL('qc_data'));

        setDbStatus('loading', 'Loading QA dataset…');
        const qaText = await fetchCSV('QA_dataset.csv');
        setDbStatus('loading', 'Loading QC dataset…');
        const qcText = await fetchCSV('QC_dataset.csv');

        setDbStatus('loading', 'Parsing & inserting data…');
        await insertCSV('qa_data', qaText);
        await insertCSV('qc_data', qcText);

        setDbStatus('ready', 'Database Ready');
        computeKPIs();
        showToast('✅ Database loaded — ready to analyze!', 'success');
    } catch (err) {
        console.error('DB init error:', err);
        setDbStatus('error', 'Load Failed');
        showToast('❌ Failed to load CSV files. Serve via http:// (not file://)', 'error');
    }
}

async function fetchCSV(filename) {
    const res = await fetch(filename);
    if (!res.ok) throw new Error(`Could not fetch ${filename}: ${res.status}`);
    return res.text();
}

function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = [];
    for (const line of lines) {
        const t = line.trim();
        if (t) rows.push(parseCSVLine(t));
    }
    return rows;
}

function parseCSVLine(line) {
    const fields = [];
    let field = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) { fields.push(field); field = ''; }
        else field += ch;
    }
    fields.push(field);
    return fields;
}

async function insertCSV(tableName, csvText) {
    const rows = parseCSV(csvText);
    if (rows.length < 2) return;
    const dataRows = rows.slice(1);
    const batchSize = 200;
    for (let start = 0; start < dataRows.length; start += batchSize) {
        const batch = dataRows.slice(start, start + batchSize);
        const vals = batch
            .filter(r => r.length >= 9)
            .map(r => {
                const esc = v => (v || '').replace(/'/g, "''");
                return `('${esc(r[0])}','${esc(r[1])}','${esc(r[2])}','${esc(r[3])}','${esc(r[4])}','${esc(r[5])}','${esc(r[6])}','${esc(r[7])}','${esc(r[8])}')`;
            });
        if (vals.length > 0)
            db.run(`INSERT INTO ${tableName} (date,vendor_name,component_name,defect_type,defect_code,inspector_name,batch_id,severity,status) VALUES ${vals.join(',')};`);
        await new Promise(r => setTimeout(r, 0));
    }
}

function setDbStatus(state, text) {
    dbStatus.className = `db-status ${state}`;
    dbStatusText.textContent = text;
}

// ══════════════════════════════════════════════════════════════════════
// 2. KPI CARDS
// ══════════════════════════════════════════════════════════════════════

function computeKPIs() {
    if (!db) return;
    const qaCount = db.exec('SELECT COUNT(*) FROM qa_data')[0].values[0][0];
    const qcCount = db.exec('SELECT COUNT(*) FROM qc_data')[0].values[0][0];
    document.getElementById('kpiQA').textContent = Number(qaCount).toLocaleString();
    document.getElementById('kpiQC').textContent = Number(qcCount).toLocaleString();

    const rateRes = db.exec(`
        SELECT SUM(CASE WHEN status IN ('Fail','Rework') THEN 1 ELSE 0 END)*100.0/COUNT(*) as rate
        FROM (SELECT status FROM qa_data UNION ALL SELECT status FROM qc_data)`);
    const rate = rateRes[0]?.values[0][0];
    document.getElementById('kpiDefectRate').textContent = rate != null ? Number(rate).toFixed(1) + '%' : '—';

    const compRes = db.exec(`
        SELECT component_name, COUNT(*) as cnt
        FROM (SELECT component_name FROM qa_data WHERE status IN ('Fail','Rework')
              UNION ALL SELECT component_name FROM qc_data WHERE status IN ('Fail','Rework'))
        GROUP BY component_name ORDER BY cnt DESC LIMIT 1`);
    document.getElementById('kpiTopComponent').textContent = compRes[0]?.values[0][0] || '—';
}

// ══════════════════════════════════════════════════════════════════════
// 3. DATASET TOGGLE
// ══════════════════════════════════════════════════════════════════════

function setDataset(ds) {
    currentDataset = ds;
    document.querySelectorAll('.dataset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dataset === ds);
    });
}

// ══════════════════════════════════════════════════════════════════════
// 4. LOCAL NL→SQL ENGINE
// ══════════════════════════════════════════════════════════════════════

/**
 * Returns the FROM clause depending on dataset selector.
 * For BOTH → UNION ALL subquery; for single → direct table.
 */
function getSource(dataset) {
    if (dataset === 'qa') return { from: 'qa_data', subquery: false };
    if (dataset === 'qc') return { from: 'qc_data', subquery: false };
    return {
        from: '(SELECT * FROM qa_data UNION ALL SELECT * FROM qc_data)',
        subquery: true
    };
}

function matches(q, keywords) {
    return keywords.some(k => q.includes(k));
}

function extractLimit(q) {
    const m = q.match(/\btop\s+(\d+)\b|\blimit\s+(\d+)\b/);
    if (m) return parseInt(m[1] || m[2]);
    return null;
}

function extractMonthNumber(q) {
    const months = {
        january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
        april: 4, apr: 4, may: 5, june: 6, jun: 6
    };
    for (const [name, num] of Object.entries(months)) {
        if (q.includes(name)) return num;
    }
    const m = q.match(/\bmonth\s+(\d+)\b|\b(\d{1,2})\/2025\b/);
    if (m) return parseInt(m[1] || m[2]);
    return null;
}

function extractVendorName(q) {
    const vendors = [
        'goldpath enterprises', 'rajesh gems', 'silverline co', 'silverline',
        'diamondedge pvt ltd', 'diamondedge', 'starset metals', 'starset',
        'auracraft pvt ltd', 'auracraft', 'narayanan & sons', 'narayanan',
        'kiran jewel suppliers', 'kiran'
    ];
    for (const v of vendors) {
        if (q.includes(v)) return v;
    }
    return null;
}

function generateSQL(userQuery, dataset) {
    const q = userQuery.toLowerCase().trim();
    const { from } = getSource(dataset);
    const limit = extractLimit(q) || 10;
    const month = extractMonthNumber(q);
    const vendorName = extractVendorName(q);
    const monthFilter = month ? ` AND CAST(substr(date,4,2) AS INTEGER) = ${month}` : '';

    // ── DEFECT TYPES ──────────────────────────────────────────────────
    if (matches(q, ['defect type', 'defect frequency', 'common defect', 'top defect', 'most defect', 'frequent defect', 'defect distribution'])) {
        return `SELECT defect_type, COUNT(*) as count FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY defect_type ORDER BY count DESC LIMIT ${limit};`;
    }

    // ── DEFECT CODE ───────────────────────────────────────────────────
    if (matches(q, ['defect code', 'error code'])) {
        return `SELECT defect_code, defect_type, COUNT(*) as count FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY defect_code, defect_type ORDER BY count DESC LIMIT ${limit};`;
    }

    // ── VENDOR PERFORMANCE ────────────────────────────────────────────
    if (matches(q, ['worst vendor', 'worst performing vendor', 'vendor fail', 'bad vendor', 'vendor defect', 'vendor performance', 'top vendor', 'vendor rank'])) {
        return `SELECT vendor_name,
                       COUNT(*) as total,
                       SUM(CASE WHEN status IN ('Fail','Rework') THEN 1 ELSE 0 END) as failures,
                       ROUND(SUM(CASE WHEN status IN ('Fail','Rework') THEN 1.0 ELSE 0 END)*100.0/COUNT(*),1) as defect_rate_pct
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY vendor_name ORDER BY failures DESC LIMIT ${limit};`;
    }

    if (matches(q, ['best vendor', 'vendor pass', 'vendor quality'])) {
        return `SELECT vendor_name,
                       COUNT(*) as total,
                       SUM(CASE WHEN status='Pass' THEN 1 ELSE 0 END) as passes,
                       ROUND(SUM(CASE WHEN status='Pass' THEN 1.0 ELSE 0 END)*100.0/COUNT(*),1) as pass_rate_pct
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY vendor_name ORDER BY pass_rate_pct DESC LIMIT ${limit};`;
    }

    // Specific vendor lookup
    if (vendorName && matches(q, ['vendor', 'supplier', 'goldpath', 'rajesh', 'silverline', 'diamondedge', 'starset', 'auracraft', 'narayanan', 'kiran'])) {
        return `SELECT status, COUNT(*) as count,
                       ROUND(COUNT(*)*100.0/(SELECT COUNT(*) FROM ${from} WHERE LOWER(vendor_name) LIKE '%${vendorName}%'),1) as pct
                FROM ${from} WHERE LOWER(vendor_name) LIKE '%${vendorName}%' ${monthFilter}
                GROUP BY status ORDER BY count DESC;`;
    }

    // ── INSPECTOR PERFORMANCE ─────────────────────────────────────────
    if (matches(q, ['inspector', 'auditor', 'inspector performance', 'inspector summary', 'pass rate per inspector'])) {
        return `SELECT inspector_name,
                       COUNT(*) as total_inspected,
                       SUM(CASE WHEN status='Pass' THEN 1 ELSE 0 END) as passed,
                       SUM(CASE WHEN status='Fail' THEN 1 ELSE 0 END) as failed,
                       SUM(CASE WHEN status='Rework' THEN 1 ELSE 0 END) as rework,
                       ROUND(SUM(CASE WHEN status='Pass' THEN 1.0 ELSE 0 END)*100.0/COUNT(*),1) as pass_rate_pct
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY inspector_name ORDER BY pass_rate_pct DESC;`;
    }

    // ── COMPONENT / MATERIAL ──────────────────────────────────────────
    if (matches(q, ['component', 'material', 'part', 'item', 'top defective component', 'defective component', 'component defect'])) {
        return `SELECT component_name,
                       COUNT(*) as total,
                       SUM(CASE WHEN status IN ('Fail','Rework') THEN 1 ELSE 0 END) as defects,
                       ROUND(SUM(CASE WHEN status IN ('Fail','Rework') THEN 1.0 ELSE 0 END)*100.0/COUNT(*),1) as defect_rate_pct
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY component_name ORDER BY defects DESC LIMIT ${limit};`;
    }

    // ── MONTHLY TREND ─────────────────────────────────────────────────
    if (matches(q, ['monthly', 'month', 'trend', 'over time', 'by month', 'per month', 'monthly trend'])) {
        return `SELECT CAST(substr(date,4,2) AS INTEGER) as month_num,
                       CASE CAST(substr(date,4,2) AS INTEGER)
                         WHEN 1 THEN 'January' WHEN 2 THEN 'February' WHEN 3 THEN 'March'
                         WHEN 4 THEN 'April'   WHEN 5 THEN 'May'      WHEN 6 THEN 'June'
                       END as month,
                       COUNT(*) as total_records,
                       SUM(CASE WHEN status IN ('Fail','Rework') THEN 1 ELSE 0 END) as defects
                FROM ${from}
                GROUP BY month_num ORDER BY month_num;`;
    }

    // ── SEVERITY ──────────────────────────────────────────────────────
    if (matches(q, ['severity', 'severity distribution', 'high severity', 'low severity', 'medium severity', 'severe'])) {
        return `SELECT severity,
                       COUNT(*) as count,
                       ROUND(COUNT(*)*100.0/(SELECT COUNT(*) FROM ${from}),1) as percentage
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY severity ORDER BY count DESC;`;
    }

    // ── BATCH ─────────────────────────────────────────────────────────
    if (matches(q, ['batch', 'lot', 'worst batch', 'bad batch', 'batch id', 'batch fail'])) {
        return `SELECT batch_id,
                       COUNT(*) as total,
                       SUM(CASE WHEN status IN ('Fail','Rework') THEN 1 ELSE 0 END) as failures,
                       ROUND(SUM(CASE WHEN status IN ('Fail','Rework') THEN 1.0 ELSE 0 END)*100.0/COUNT(*),1) as defect_rate_pct
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY batch_id ORDER BY failures DESC LIMIT ${limit};`;
    }

    // ── PASS / FAIL / REWORK STATUS ───────────────────────────────────
    if (matches(q, ['pass', 'fail', 'rework', 'pass rate', 'fail rate', 'rework rate', 'status', 'status distribution', 'overall rate', 'pass fail'])) {
        return `SELECT status,
                       COUNT(*) as count,
                       ROUND(COUNT(*)*100.0/(SELECT COUNT(*) FROM ${from} WHERE 1=1 ${monthFilter}),1) as percentage
                FROM ${from}
                WHERE 1=1 ${monthFilter}
                GROUP BY status ORDER BY count DESC;`;
    }

    // ── DEFECT RATE OVERALL ───────────────────────────────────────────
    if (matches(q, ['defect rate', 'overall defect', 'quality rate'])) {
        return `SELECT
                  COUNT(*) as total_records,
                  SUM(CASE WHEN status IN ('Fail','Rework') THEN 1 ELSE 0 END) as defective,
                  ROUND(SUM(CASE WHEN status IN ('Fail','Rework') THEN 1.0 ELSE 0 END)*100.0/COUNT(*),2) as defect_rate_pct
                FROM ${from}
                WHERE 1=1 ${monthFilter};`;
    }

    // ── COUNT / TOTAL ─────────────────────────────────────────────────
    if (matches(q, ['how many', 'count', 'total record', 'number of record', 'total entries'])) {
        return `SELECT COUNT(*) as total_records FROM ${from} WHERE 1=1 ${monthFilter};`;
    }

    // ── DATE / RECENT ─────────────────────────────────────────────────
    if (matches(q, ['recent', 'latest', 'last'])) {
        return `SELECT * FROM ${from} ORDER BY substr(date,7,4)||substr(date,4,2)||substr(date,1,2) DESC LIMIT ${limit};`;
    }

    // ── SPECIFIC MONTH WITHOUT OTHER CONTEXT ──────────────────────────
    if (month) {
        return `SELECT defect_type, COUNT(*) as count FROM ${from}
                WHERE CAST(substr(date,4,2) AS INTEGER) = ${month}
                GROUP BY defect_type ORDER BY count DESC LIMIT ${limit};`;
    }

    // ── FALLBACK: show summary ────────────────────────────────────────
    return `SELECT status,
                   COUNT(*) as count,
                   ROUND(COUNT(*)*100.0/(SELECT COUNT(*) FROM ${from}),1) as percentage
            FROM ${from}
            GROUP BY status ORDER BY count DESC;`;
}

/**
 * Generate a human-readable insight from the result set.
 */
function generateAnswer(userQuery, results) {
    if (!results.rows.length) {
        return 'No data was found for your query. Try selecting a different dataset or rephrasing your question.';
    }

    const q = userQuery.toLowerCase();
    const cols = results.columns.map(c => c.toLowerCase());
    const rows = results.rows;
    const total = rows.reduce((s, r) => s + (Number(r[1]) || 0), 0);

    // Helper: top N rows as "X (n), Y (k), …"
    const topList = (n = 3) => rows.slice(0, n)
        .map(r => `**${r[0]}** (${Number(r[1]).toLocaleString()})`)
        .join(', ');

    // ── Inspector performance ─────────────────────────────────────────
    if (cols.includes('pass_rate_pct') && cols.includes('inspector_name')) {
        const best = rows[0];
        const worst = rows[rows.length - 1];
        return `Inspector performance across ${rows.length} inspectors:\n` +
            `• Best performer: **${best[0]}** with a pass rate of **${best[5] || best[4]}%** (${Number(best[1]).toLocaleString()} inspections)\n` +
            `• Needs improvement: **${worst[0]}** at **${worst[5] || worst[4]}%** pass rate\n` +
            `• Tip: Consider targeted training for inspectors below 35% pass rate.`;
    }

    // ── Vendor defect/failure ranking ─────────────────────────────────
    if (cols.includes('defect_rate_pct') && cols.includes('vendor_name')) {
        const worst = rows[0];
        const best = rows[rows.length - 1];
        return `Vendor quality analysis across ${rows.length} vendors:\n` +
            `• Highest defect rate: **${worst[0]}** — ${worst[3]}% defect rate (${Number(worst[2]).toLocaleString()} failures out of ${Number(worst[1]).toLocaleString()})\n` +
            `• Best performing: **${best[0]}** — only ${best[3]}% defect rate\n` +
            `• Top 3 problem vendors: ${topList(3)}\n` +
            `• Action: Prioritize supplier audits for vendors above 65% defect rate.`;
    }

    // ── Component defects ─────────────────────────────────────────────
    if (cols.includes('component_name') && (cols.includes('defects') || cols.includes('defect_rate_pct'))) {
        const top = rows[0];
        return `Component defect analysis (${rows.length} components reviewed):\n` +
            `• Most defective: **${top[0]}** with **${Number(top[2]).toLocaleString()}** defects ` +
            `(${top[3]}% defect rate)\n` +
            `• Next most defective: ${rows.slice(1, 4).map(r => `**${r[0]}** (${r[2]})`).join(', ')}\n` +
            `• Focus quality improvement efforts on the top 2-3 components listed.`;
    }

    // ── Defect types ──────────────────────────────────────────────────
    if (cols.includes('defect_type') && cols.includes('count')) {
        const top = rows[0];
        const pct = total > 0 ? ((Number(top[1]) / total) * 100).toFixed(1) : 0;
        return `Defect type frequency analysis (${Number(total).toLocaleString()} total defects):\n` +
            `• Most common defect: **${top[0]}** — ${Number(top[1]).toLocaleString()} occurrences (${pct}% of all defects)\n` +
            `• Top defects: ${topList(5)}\n` +
            `• These defect types account for the majority of quality issues — address root causes in process or supplier quality.`;
    }

    // ── Monthly trend ─────────────────────────────────────────────────
    if (cols.includes('month') || cols.includes('month_num')) {
        const maxRow = rows.reduce((a, b) => Number(b[3] || b[2]) > Number(a[3] || a[2]) ? b : a, rows[0]);
        const minRow = rows.reduce((a, b) => Number(b[3] || b[2]) < Number(a[3] || a[2]) ? b : a, rows[0]);
        const mIdx = cols.includes('month') ? 1 : 1;
        return `Monthly defect trend across ${rows.length} months (Jan–Jun 2025):\n` +
            `• Peak defect month: **${maxRow[1] || maxRow[0]}** with **${Number(maxRow[3] || maxRow[2]).toLocaleString()}** defects\n` +
            `• Lowest defect month: **${minRow[1] || minRow[0]}** with **${Number(minRow[3] || minRow[2]).toLocaleString()}** defects\n` +
            `• Monitor whether seasonal production increases correlate with higher defect rates.`;
    }

    // ── Severity distribution ─────────────────────────────────────────
    if (cols.includes('severity')) {
        const highRow = rows.find(r => String(r[0]).toLowerCase() === 'high');
        const pctHigh = highRow ? highRow[2] : '0';
        return `Severity distribution of quality issues:\n` +
            `• ${rows.map(r => `**${r[0]}**: ${Number(r[1]).toLocaleString()} records (${r[2]}%)`).join('\n• ')}\n` +
            `• **${pctHigh}%** of records are classified as High severity — these require immediate corrective action.`;
    }

    // ── Batch failures ────────────────────────────────────────────────
    if (cols.includes('batch_id')) {
        const top = rows[0];
        return `Batch quality analysis:\n` +
            `• Worst batch: **${top[0]}** with **${Number(top[2]).toLocaleString()}** failures (${top[3]}% defect rate)\n` +
            `• Top 5 problem batches: ${rows.slice(0, 5).map(r => `**${r[0]}** (${r[2]} failures)`).join(', ')}\n` +
            `• Investigate these batches for common supplier, material, or process issues.`;
    }

    // ── Status distribution (pass/fail/rework) ────────────────────────
    if (cols.includes('status') && cols.includes('percentage')) {
        const passRow = rows.find(r => String(r[0]).toLowerCase() === 'pass');
        const failRow = rows.find(r => String(r[0]).toLowerCase() === 'fail');
        const reworkRow = rows.find(r => String(r[0]).toLowerCase() === 'rework');
        const defectPct = ((Number(failRow?.[1] || 0) + Number(reworkRow?.[1] || 0)) /
            rows.reduce((s, r) => s + Number(r[1]), 0) * 100).toFixed(1);
        return `Quality status distribution for the selected dataset:\n` +
            `• ✅ **Pass**: ${passRow ? passRow[2] : 0}% of records\n` +
            `• ❌ **Fail**: ${failRow ? failRow[2] : 0}% of records\n` +
            `• 🔄 **Rework**: ${reworkRow ? reworkRow[2] : 0}% of records\n` +
            `• Combined defect rate (Fail + Rework): **${defectPct}%** — ` +
            `${Number(defectPct) > 60 ? 'this is critically high and requires immediate process review.' : 'within observed ranges for this dataset.'}`;
    }

    // ── Single row / aggregate ────────────────────────────────────────
    if (rows.length === 1) {
        const pairs = results.columns.map((c, i) => `**${c}**: ${rows[0][i]}`).join(' | ');
        return `Query result: ${pairs}`;
    }

    // ── Generic multi-row ─────────────────────────────────────────────
    return `Found **${rows.length} records** matching your query.\n` +
        `Top results: ${topList(5)}\n` +
        `Use the **Table tab** for the full data view and **Chart tab** for a visual breakdown.`;
}

// ══════════════════════════════════════════════════════════════════════
// 5. ANALYZE HANDLER
// ══════════════════════════════════════════════════════════════════════

async function handleAnalyze() {
    const query = queryInput.value.trim();
    if (!query) { showToast('⚠️ Please enter a query first.', 'error'); return; }
    if (!db) { showToast('⏳ Database is still loading. Please wait.', 'error'); return; }

    startLoading('Generating SQL query…');

    try {
        // Step A: NL → SQL (local engine)
        const sql = generateSQL(query, currentDataset);
        updateLoadingText('Running query on your data…');

        // Step B: Execute SQL
        let results;
        try {
            results = executeSql(sql);
        } catch (sqlErr) {
            stopLoading();
            showToast('⚠️ Could not parse that query. Try rephrasing or use a quick chip.', 'error');
            return;
        }

        updateLoadingText('Generating insights…');
        // Small delay so the spinner is visible
        await new Promise(r => setTimeout(r, 150));

        // Step C: Generate local answer
        const answer = generateAnswer(query, results);

        stopLoading();

        currentResults = results;
        renderAnswer(answer, sql);
        renderTable(results);
        renderChart(results);
        addToHistory(query);

        exportBtn.disabled = results.rows.length === 0;
        switchTab('answer');

        if (results.rows.length === 0) {
            showToast('ℹ️ No results found. Try a different query or dataset.', 'info');
        }

    } catch (err) {
        stopLoading();
        console.error('Pipeline error:', err);
        showToast('❌ ' + (err.message || 'Something went wrong.'), 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════
// 6. QUICK QUERIES
// ══════════════════════════════════════════════════════════════════════

function runQuickQuery(query) {
    queryInput.value = query;
    handleAnalyze();
}

// ══════════════════════════════════════════════════════════════════════
// 7. RENDER — TABS
// ══════════════════════════════════════════════════════════════════════

function switchTab(tab) {
    ['answer', 'table', 'chart'].forEach(t => {
        document.getElementById(`${t}Panel`).classList.toggle('active', t === tab);
        document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle('active', t === tab);
    });
}

// ── Answer ──────────────────────────────────────────────────────────
function renderAnswer(answerText, sql) {
    const panel = document.getElementById('answerPanel');
    // Convert **bold** markdown to <strong>
    const htmlAnswer = answerText
        .split('\n')
        .filter(l => l.trim())
        .map(l => {
            const withBold = escapeHtml(l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            return `<p>${withBold}</p>`;
        })
        .join('');

    panel.innerHTML = `
        <div class="sql-tag">${escapeHtml(sql)}</div>
        <div class="answer-content">${htmlAnswer}</div>`;
}

// ── Table ────────────────────────────────────────────────────────────
function renderTable(results) {
    const panel = document.getElementById('tablePanel');
    if (!results.rows.length) {
        panel.innerHTML = `<div class="no-data"><div class="no-data-icon">📭</div><div class="no-data-text">No data found</div></div>`;
        return;
    }

    const headerCells = results.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const bodyRows = results.rows.map(row => {
        const cells = row.map((cell, i) => {
            const col = (results.columns[i] || '').toLowerCase();
            const val = cell == null ? '' : String(cell);
            let fmt = escapeHtml(val);
            if (col === 'status') {
                const cls = { pass: 'badge-pass', fail: 'badge-fail', rework: 'badge-rework' }[val.toLowerCase()] || '';
                if (cls) fmt = `<span class="badge ${cls}">${val}</span>`;
            } else if (col === 'severity') {
                const cls = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' }[val.toLowerCase()] || '';
                if (cls) fmt = `<span class="badge ${cls}">${val}</span>`;
            }
            return `<td>${fmt}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    panel.innerHTML = `
        <table id="dataTable">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>`;
}

// ── Chart ────────────────────────────────────────────────────────────
function renderChart(results) {
    const panel = document.getElementById('chartPanel');
    if (currentChart) { currentChart.destroy(); currentChart = null; }

    if (!results.rows.length || results.columns.length < 2) {
        panel.innerHTML = `<div style="color:var(--text-muted);text-align:center;font-size:13px;">📊 Not enough data to render a chart.</div>`;
        return;
    }

    const chartType = detectChartType(results);
    panel.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'myChart';
    const ctn = document.createElement('div');
    ctn.className = 'chart-container';
    ctn.appendChild(canvas);
    panel.appendChild(ctn);

    if (chartType === 'table-only') {
        panel.innerHTML = `<div style="color:var(--text-muted);text-align:center;font-size:13px;padding:40px;">📊 Multi-column result — see the Table tab for full details</div>`;
        return;
    }

    const ctx = canvas.getContext('2d');
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
    Chart.defaults.font.family = 'Inter, sans-serif';

    const labels = results.rows.map(r => String(r[0] ?? ''));
    const values = results.rows.map(r => Number(r[1]) || 0);
    const borders = CHART_COLORS.map(c => c.replace('0.85', '1'));

    const tooltip = {
        backgroundColor: 'rgba(15,22,41,0.95)',
        borderColor: 'rgba(99,179,237,0.3)',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 8,
    };

    if (chartType === 'bar') {
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: results.columns[1], data: values, backgroundColor: CHART_COLORS, borderColor: borders, borderWidth: 1.5, borderRadius: 6, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                scales: { x: { ticks: { maxRotation: 35, font: { size: 11 } } }, y: { beginAtZero: true, ticks: { font: { size: 11 } } } },
                plugins: { legend: { display: false }, tooltip }
            }
        });
    } else if (chartType === 'line') {
        currentChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: results.columns[1], data: values, borderColor: 'rgba(99,179,237,1)', backgroundColor: 'rgba(99,179,237,0.1)', pointBackgroundColor: 'rgba(99,179,237,1)', pointRadius: 5, tension: 0.35, fill: true, borderWidth: 2.5 }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                scales: { x: { ticks: { font: { size: 11 } } }, y: { beginAtZero: true, ticks: { font: { size: 11 } } } },
                plugins: { legend: { display: false }, tooltip }
            }
        });
    } else if (chartType === 'donut') {
        currentChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderColor: borders, borderWidth: 1.5, hoverOffset: 8 }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                cutout: '55%',
                plugins: {
                    legend: { display: true, position: 'right', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
                    tooltip
                }
            }
        });
    }
}

function detectChartType(results) {
    const { columns, rows } = results;
    if (!columns.length || !rows.length) return 'table-only';
    if (columns.length > 3) return 'table-only';

    const col0 = (columns[0] || '').toLowerCase();
    const col1 = (columns[1] || '').toLowerCase();
    const isDate = col0.includes('month') || col0.includes('date') || col0.includes('year');
    if (isDate) return 'line';

    const num = rows.slice(0, 5).every(r => !isNaN(Number(r[1])));
    if (!num) return 'table-only';

    const smallSet = rows.length <= 6;
    const pctLike = col1.includes('percent') || col1.includes('rate') || col1.includes('pct') || col1.includes('%');
    if (smallSet || pctLike) return 'donut';

    return 'bar';
}

// ══════════════════════════════════════════════════════════════════════
// 8. EXPORT CSV
// ══════════════════════════════════════════════════════════════════════

function exportCSV() {
    if (!currentResults?.rows.length) return;
    const header = currentResults.columns.join(',');
    const rows = currentResults.rows.map(row =>
        row.map(cell => {
            const v = cell == null ? '' : String(cell);
            return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qaqc_${Date.now()}.csv`;
    a.click();
    showToast('✅ CSV exported!', 'success');
}

// ══════════════════════════════════════════════════════════════════════
// 9. RECENT QUERIES
// ══════════════════════════════════════════════════════════════════════

function addToHistory(query) {
    recentQueries = [query, ...recentQueries.filter(q => q !== query)].slice(0, 10);
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('recentList');
    list.innerHTML = recentQueries.length
        ? recentQueries.map(q => `<button class="recent-item" onclick="runQuickQuery(${JSON.stringify(q)})" title="${escapeHtml(q)}">🕐 ${escapeHtml(q)}</button>`).join('')
        : '<div class="recent-empty">No queries yet</div>';
}

// ══════════════════════════════════════════════════════════════════════
// 10. LOADING & TOAST
// ══════════════════════════════════════════════════════════════════════

function startLoading(msg) {
    loadingSubtext.textContent = msg;
    loadingOverlay.classList.add('visible');
    analyzeBtn.disabled = true;
    document.querySelectorAll('.chip, .recent-item').forEach(el => el.disabled = true);
}

function updateLoadingText(msg) { loadingSubtext.textContent = msg; }

function stopLoading() {
    loadingOverlay.classList.remove('visible');
    analyzeBtn.disabled = false;
    document.querySelectorAll('.chip, .recent-item').forEach(el => el.disabled = false);
}

let toastTimer;
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    document.getElementById('toastIcon').textContent = { error: '❌', success: '✅', info: 'ℹ️' }[type] || 'ℹ️';
    document.getElementById('toastMsg').textContent = msg;
    toast.className = `show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, 4500);
}

// ══════════════════════════════════════════════════════════════════════
// 11. SQL EXEC
// ══════════════════════════════════════════════════════════════════════

function executeSql(sql) {
    const res = db.exec(sql);
    if (!res || !res.length) return { columns: [], rows: [] };
    return { columns: res[0].columns, rows: res[0].values };
}

// ══════════════════════════════════════════════════════════════════════
// 12. UTILITY
// ══════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => { initDatabase(); });
