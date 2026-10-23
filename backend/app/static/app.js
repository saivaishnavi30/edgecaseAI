
const zipInput = document.getElementById("zipFile");
const sourceInput = document.getElementById("sourceFiles");
const githubInput = document.getElementById("githubUrl");
const analyzeButton = document.getElementById("analyzeButton");
const message = document.getElementById("inputMessage");

const zipName = document.getElementById("zipName");
const sourceNames = document.getElementById("sourceNames");
const resultsSection = document.getElementById("results");

const supportedExtensions = [
  ".py", ".js", ".jsx", ".ts", ".tsx",
  ".java", ".html", ".css"
];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#f87171" : "#9aa8bf";
}

function clearOtherInputs(selected) {
  if (selected !== "zip") {
    zipInput.value = "";
    zipName.textContent = "No file selected";
  }

  if (selected !== "files") {
    sourceInput.value = "";
    sourceNames.textContent = "No files selected";
  }

  if (selected !== "github") {
    githubInput.value = "";
  }
}

zipInput.addEventListener("change", () => {
  const file = zipInput.files[0];

  clearOtherInputs("zip");
  showMessage("");

  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".zip")) {
    zipInput.value = "";
    zipName.textContent = "No file selected";
    showMessage("Please select a ZIP archive.", true);
    return;
  }

  zipName.textContent = file.name;
});

sourceInput.addEventListener("change", () => {
  const files = Array.from(sourceInput.files);

  clearOtherInputs("files");
  showMessage("");

  if (!files.length) return;

  const unsupported = files.filter(file => {
    const name = file.name.toLowerCase();
    return !supportedExtensions.some(ext => name.endsWith(ext));
  });

  if (unsupported.length) {
    sourceInput.value = "";
    sourceNames.textContent = "No files selected";

    showMessage(
      "Unsupported file type: " +
      unsupported.map(file => file.name).join(", "),
      true
    );
    return;
  }

  sourceNames.textContent = files.length === 1
    ? files[0].name
    : `${files.length} files selected`;
});

githubInput.addEventListener("input", () => {
  if (githubInput.value.trim()) {
    clearOtherInputs("github");
  }

  showMessage("");
});

function renderResults(data) {
  const summary = data.summary || {};
  const findings = Array.isArray(data.findings)
    ? data.findings
    : [];

  const high = Number(summary.high || 0);
  const medium = Number(summary.medium || 0);
  const low = Number(summary.low || 0);
  const total = Number(data.findings_count ?? findings.length);

  const handled = Number(summary.handled || 0);
  const manual = Number(summary.manual_review || 0);
  const unhandled = Number(summary.potentially_unhandled || 0);

  const maximumSeverity = Math.max(high, medium, low, 1);
  const statusTotal = Math.max(handled + manual + unhandled, 1);

  const severityBars = [
    { label: "High", count: high, color: "#f87171" },
    { label: "Medium", count: medium, color: "#fbbf24" },
    { label: "Low", count: low, color: "#60a5fa" }
  ];

  const statusBars = [
    { label: "Handled", count: handled, color: "#34d399" },
    { label: "Manual review", count: manual, color: "#a78bfa" },
    {
      label: "Potentially unhandled",
      count: unhandled,
      color: "#fb7185"
    }
  ];

  // 1. Findings by severity
  const severityChart = severityBars.map(item => `
    <div class="chart-row">
      <div class="chart-label">
        <span>${item.label}</span>
        <strong>${item.count}</strong>
      </div>
      <div class="chart-track">
        <div class="chart-bar"
             style="width:${item.count / maximumSeverity * 100}%;
                    background:${item.color}"></div>
      </div>
    </div>
  `).join("");

  // 2. Handling status
  const statusChart = statusBars.map(item => `
    <div class="chart-row">
      <div class="chart-label">
        <span>${item.label}</span>
        <strong>${item.count}</strong>
      </div>
      <div class="chart-track">
        <div class="chart-bar"
             style="width:${item.count / statusTotal * 100}%;
                    background:${item.color}"></div>
      </div>
    </div>
  `).join("");

  // 3. Severity distribution doughnut
  const severityTotal = high + medium + low;
  const highPercent = severityTotal
    ? high / severityTotal * 100
    : 0;
  const mediumPercent = severityTotal
    ? medium / severityTotal * 100
    : 0;

  const severityDonut = `
    <div style="
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      justify-content:center;
      gap:24px;
      padding:14px 0;
    ">
      <div
        role="img"
        aria-label="Severity distribution: ${high} high, ${medium} medium, ${low} low"
        style="
          width:156px;
          height:156px;
          flex:0 0 156px;
          border-radius:50%;
          background:${
            severityTotal > 0
              ? `conic-gradient(
                  #f87171 0% ${highPercent}%,
                  #fbbf24 ${highPercent}% ${highPercent + mediumPercent}%,
                  #60a5fa ${highPercent + mediumPercent}% 100%
                )`
              : "#263247"
          };
          display:grid;
          place-items:center;
        "
      >
        <div style="
          width:94px;
          height:94px;
          border-radius:50%;
          background:#111827;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
        ">
          <strong style="font-size:24px;color:#f3f4f6;">
            ${severityTotal}
          </strong>
          <span style="font-size:11px;color:#9aa8bf;">
            findings
          </span>
        </div>
      </div>

      <div style="display:grid;gap:12px;min-width:120px;">
        ${severityBars.map(item => `
          <div style="
            display:flex;
            align-items:center;
            gap:9px;
            font-size:13px;
            color:#cbd5e1;
          ">
            <span style="
              width:10px;
              height:10px;
              border-radius:3px;
              background:${item.color};
              display:inline-block;
              flex-shrink:0;
            "></span>
            <span>${item.label}</span>
            <strong style="margin-left:auto;color:#f8fafc;">
              ${item.count}
            </strong>
            <span style="color:#9aa8bf;">
              ${severityTotal
                ? Math.round(item.count / severityTotal * 100)
                : 0}%
            </span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  // 4. Overall risk indicator.
  // This is a heuristic indicator, not a verified security score.
  const riskPoints = high * 3 + medium * 2 + low;
  const maximumRiskPoints = Math.max(severityTotal * 3, 1);

  const riskScore = severityTotal
    ? Math.round(riskPoints / maximumRiskPoints * 100)
    : 0;

  const riskLabel = !severityTotal
    ? "No findings"
    : riskScore >= 75
      ? "Higher relative risk"
      : riskScore >= 45
        ? "Moderate relative risk"
        : "Lower relative risk";

  const riskColor = !severityTotal
    ? "#64748b"
    : riskScore >= 75
      ? "#f87171"
      : riskScore >= 45
        ? "#fbbf24"
        : "#34d399";

  const riskIndicator = `
    <div style="
      display:flex;
      align-items:center;
      gap:22px;
      padding:16px 0;
      flex-wrap:wrap;
    ">
      <div
        role="img"
        aria-label="Heuristic relative risk indicator: ${riskScore} out of 100, ${riskLabel}"
        style="
          width:132px;
          height:132px;
          flex:0 0 132px;
          border-radius:50%;
          display:grid;
          place-items:center;
          background:conic-gradient(
            ${riskColor} 0% ${riskScore}%,
            #263247 ${riskScore}% 100%
          );
        "
      >
        <div style="
          width:104px;
          height:104px;
          border-radius:50%;
          background:#111827;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
        ">
          <strong style="font-size:28px;color:#f8fafc;">
            ${riskScore}
          </strong>
          <span style="font-size:11px;color:#9aa8bf;">
            out of 100
          </span>
        </div>
      </div>

      <div style="flex:1;min-width:140px;">
        <strong style="
          display:block;
          color:${riskColor};
          font-size:16px;
          margin-bottom:8px;
        ">
          ${riskLabel}
        </strong>
        <p class="muted" style="margin:0 0 8px;">
          Based on the severity mix in this report.
        </p>
        <p class="muted" style="font-size:12px;margin:0;">
          Heuristic indicator only; it is not a verified security rating.
        </p>
      </div>
    </div>
  `;

  // 5. Edge-case categories.
  // Categories are inferred from text using keyword matching.
  const categoryRules = [
    {
      label: "Null / missing values",
      color: "#60a5fa",
      pattern: /\b(null|none|nullpointer|undefined|missing value|missing input|empty value)\b/i
    },
    {
      label: "Boundary values",
      color: "#fbbf24",
      pattern: /\b(boundary|edge of range|out of range|overflow|underflow|limit|zero length|empty list|empty array)\b/i
    },
    {
      label: "Invalid input / format",
      color: "#a78bfa",
      pattern: /\b(invalid input|invalid format|malformed|parse error|type mismatch|wrong type|validation)\b/i
    },
    {
      label: "Error handling",
      color: "#fb7185",
      pattern: /\b(exception|error handling|try.?catch|catch block|unhandled error|throw|failure path)\b/i
    },
    {
      label: "Arithmetic / numeric",
      color: "#34d399",
      pattern: /\b(division by zero|divide by zero|numeric|arithmetic|rounding|precision)\b/i
    }
  ];

  const categoryCounts = {};

  findings.forEach(finding => {
    const searchableText = [
      finding.title,
      finding.explanation,
      finding.evidence,
      finding.recommendation
    ].filter(Boolean).join(" ");

    const matchedRule = categoryRules.find(rule =>
      rule.pattern.test(searchableText)
    );

    const category = matchedRule || {
      label: "Other / general",
      color: "#818cf8"
    };

    if (!categoryCounts[category.label]) {
      categoryCounts[category.label] = {
        count: 0,
        color: category.color
      };
    }

    categoryCounts[category.label].count += 1;
  });

  const categoriesByCount = Object.entries(categoryCounts)
    .map(([label, item]) => ({ label, ...item }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const maxCategoryCount = Math.max(
    ...categoriesByCount.map(item => item.count),
    1
  );

  const categoryChart = categoriesByCount.length
    ? categoriesByCount.map(item => `
        <div class="chart-row">
          <div class="chart-label" style="gap:12px;">
            <span style="overflow-wrap:anywhere;min-width:0;">
              ${escapeHTML(item.label)}
            </span>
            <strong>${item.count}</strong>
          </div>
          <div class="chart-track">
            <div class="chart-bar"
                 style="
                   width:${item.count / maxCategoryCount * 100}%;
                   background:${item.color};
                 "></div>
          </div>
        </div>
      `).join("")
    : `<p class="muted">No categories to display yet.</p>`;

  // Finding cards
  const findingCards = findings.length
    ? findings.map(finding => {
        const severity = String(
          finding.severity || "low"
        ).toLowerCase();

        const status = String(
          finding.status || "manual_review"
        );

        const severityClass = ["high", "medium", "low"].includes(severity)
          ? severity
          : "low";

        const statusLabel = {
          handled: "Handled",
          manual_review: "Manual review",
          potentially_unhandled: "Potentially unhandled"
        }[status] || "Manual review";

        return `
          <article class="finding-card">
            <div class="finding-heading">
              <span class="severity-badge ${severityClass}">
                ${escapeHTML(severity.toUpperCase())}
              </span>
              <span class="finding-status">
                ${escapeHTML(statusLabel)}
              </span>
            </div>

            <h4>${escapeHTML(finding.title || "Potential edge case")}</h4>

            <p class="finding-location">
              ${escapeHTML(finding.filename || "Unknown file")}
              · Line ${escapeHTML(finding.line ?? "—")}
            </p>

            <p>${escapeHTML(finding.explanation || "")}</p>

            <div class="evidence-block">
              <span>CODE EVIDENCE</span>
              <code>${escapeHTML(
                finding.evidence || "No evidence supplied"
              )}</code>
            </div>

            <div class="recommendation-block">
              <strong>Suggested improvement</strong>
              <p>${escapeHTML(
                finding.recommendation ||
                "Review this scenario manually."
              )}</p>
            </div>
          </article>
        `;
      }).join("")
    : `
      <div class="empty-findings">
        <h3>No findings generated</h3>
        <p>
          The current static rules did not identify any matching patterns.
          This does not prove the code is free from edge cases.
        </p>
      </div>
    `;

  const limitations = Array.isArray(data.limitations)
    ? data.limitations
    : [];

  resultsSection.innerHTML = `
    <div class="report-header">
      <div>
        <p class="eyebrow">ANALYSIS REPORT</p>
        <h2>Source code analysis results</h2>
        <p class="muted">
          Inspection method: ${escapeHTML(
            data.analysis_type || "static analysis"
          )}
        </p>
      </div>
      <button id="exportReport" class="secondary-button">
        Export report
      </button>
    </div>

    <div class="summary-grid">
      <article class="summary-card">
        <span>Files analyzed</span>
        <strong>${Number(data.files_analyzed || 0)}</strong>
      </article>
      <article class="summary-card">
        <span>Total findings</span>
        <strong>${total}</strong>
      </article>
      <article class="summary-card">
        <span>High severity</span>
        <strong class="red-text">${high}</strong>
      </article>
      <article class="summary-card">
        <span>Needs review</span>
        <strong class="purple-text">${manual + unhandled}</strong>
      </article>
    </div>

    <div class="charts-grid">
      <article class="chart-card">
        <h3>Findings by severity</h3>
        <p class="muted">Distribution of potential risks</p>
        ${severityChart}
      </article>

      <article class="chart-card">
        <h3>Handling status</h3>
        <p class="muted">Classification of identified findings</p>
        ${statusChart}
      </article>

      <article class="chart-card">
        <h3>Severity distribution</h3>
        <p class="muted">
          Proportion of High, Medium, and Low findings
        </p>
        ${severityDonut}
      </article>

      <article class="chart-card">
        <h3>Overall risk indicator</h3>
        <p class="muted">
          Relative score calculated from finding severity
        </p>
        ${riskIndicator}
      </article>

      <article class="chart-card">
        <h3>Edge-case categories</h3>
        <p class="muted">
          Approximate categories inferred from finding descriptions
        </p>
        ${categoryChart}
        <p class="muted" style="font-size:12px;margin-top:12px;">
          Categories use keyword matching and may need manual verification.
        </p>
      </article>
    </div>

    <div class="findings-header">
      <div>
        <h3>Edge case findings</h3>
        <p class="muted">
          Review the evidence and suggested improvements.
        </p>
      </div>
      <span class="total-badge">${total} findings</span>
    </div>

    <div class="findings-list">${findingCards}</div>

    <details class="limitations-panel">
      <summary>Analysis limitations</summary>
      <ul>
        ${limitations.map(item => `<li>${escapeHTML(item)}</li>`).join("")}
      </ul>
      <p>
        These findings are heuristic observations, not proof that a defect
        exists. No uploaded application or generated test was executed.
      </p>
    </details>
  `;

  resultsSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  // Export report as JSON
  document.getElementById("exportReport").addEventListener("click", () => {
    const report = {
      generated_at: new Date().toISOString(),
      analysis_type: data.analysis_type,
      files_analyzed: data.files_analyzed,
      findings_count: total,
      summary,
      findings,
      limitations
    };

    const blob = new Blob(
      [JSON.stringify(report, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "edgecase-ai-report.json";
    link.click();

    URL.revokeObjectURL(url);
  });
}

analyzeButton.addEventListener("click", async () => {
  const zipFile = zipInput.files[0];
  const sourceFiles = Array.from(sourceInput.files);
  const githubUrl = githubInput.value.trim();

  const selectedMethods = [
    Boolean(zipFile),
    sourceFiles.length > 0,
    Boolean(githubUrl)
  ].filter(Boolean).length;

  if (selectedMethods !== 1) {
    showMessage(
      "Choose exactly one input method: ZIP, source files, or GitHub URL.",
      true
    );
    return;
  }

  if (githubUrl) {
    let parsedUrl;

    try {
      parsedUrl = new URL(githubUrl);
    } catch {
      showMessage("Enter a valid GitHub repository URL.", true);
      return;
    }

    const validPath =
      /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(
        parsedUrl.pathname
      );

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "github.com" ||
      !validPath
    ) {
      showMessage(
        "Enter a public repository URL like https://github.com/owner/repo.",
        true
      );
      return;
    }
  }

  const formData = new FormData();

  if (zipFile) {
    formData.append("zip_file", zipFile);
  } else if (sourceFiles.length) {
    sourceFiles.forEach(file => {
      formData.append("source_files", file);
    });
  } else {
    formData.append("github_url", githubUrl);
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing source code...";
  showMessage("Uploading and inspecting your source code...");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof result.detail === "string"
          ? result.detail
          : "The analysis request failed."
      );
    }

    renderResults(result);
    showMessage("Analysis completed. Review the findings below.");
  } catch (error) {
    showMessage(
      error.message || "Could not connect to the analysis backend.",
      true
    );
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze source code →";
  }
});

