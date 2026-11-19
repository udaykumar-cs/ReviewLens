// ReviewLens Dashboard - Enterprise AI Analytics Suite

let currentDataset = null;
let currentFilteredReviews = [];
let sentimentChartInstance = null;
let topicsChartInstance = null;
let activeModalReview = null;
let currentReplyTone = "empathetic";

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }
  setupEventListeners();
  checkHealth();
});

function setupEventListeners() {
  const fileInput = document.getElementById("csvFileInput");
  const loadSampleBtn = document.getElementById("loadSampleBtn");
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const dropzoneCard = document.getElementById("dropzoneCard");

  // File upload input
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  });

  // Drag and drop
  dropzoneCard.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzoneCard.classList.add("border-cyan-500", "bg-cyan-500/5");
  });

  dropzoneCard.addEventListener("dragleave", () => {
    dropzoneCard.classList.remove("border-cyan-500", "bg-cyan-500/5");
  });

  dropzoneCard.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzoneCard.classList.remove("border-cyan-500", "bg-cyan-500/5");
    if (e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  // Load sample dataset
  loadSampleBtn.addEventListener("click", () => {
    loadSampleData();
  });

  // Clear cache
  clearCacheBtn.addEventListener("click", () => {
    clearCache();
  });

  // Filter events
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("filterProduct").addEventListener("change", applyFilters);
  document.getElementById("filterSentiment").addEventListener("change", applyFilters);
  document.getElementById("filterTopic").addEventListener("change", applyFilters);
  document.getElementById("filterNeedsReply").addEventListener("change", applyFilters);
  document.getElementById("filterMismatch").addEventListener("change", applyFilters);
  document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);

  // Modal copy button
  document.getElementById("copyReplyBtn").addEventListener("click", copyModalReply);
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      const badge = document.getElementById("providerBadge");
      const provName = (data.provider || "gemini").toUpperCase();
      badge.textContent = `ENGINE: ${provName} (${data.cached_reviews} CACHED)`;
    }
  } catch (err) {
    console.warn("Health check error:", err);
  }
}

function showLoading(text) {
  const overlay = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  label.textContent = text || "Processing dataset...";
  overlay.classList.remove("hidden");
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  overlay.classList.add("hidden");
}

async function uploadFile(file) {
  showLoading(`Analyzing '${file.name}' with ReviewLens AI pipeline...`);
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Upload Error: ${data.error || "Failed to process file"}`);
      hideLoading();
      return;
    }

    renderDashboard(data);
  } catch (err) {
    alert(`Network Error: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function loadSampleData() {
  showLoading("Loading pre-bundled 'reviews.csv' (30 records)...");
  try {
    const res = await fetch("/api/sample-data");
    const data = await res.json();
    if (!res.ok) {
      alert(`Error loading sample dataset: ${data.error}`);
      hideLoading();
      return;
    }
    renderDashboard(data);
  } catch (err) {
    alert(`Failed to load sample data: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function clearCache() {
  if (!confirm("Are you sure you want to clear the SQLite cache? Next upload will re-query the AI engine.")) {
    return;
  }
  try {
    const res = await fetch("/api/clear-cache", { method: "POST" });
    const data = await res.json();
    alert(data.message || "Cache cleared successfully!");
    checkHealth();
  } catch (err) {
    alert(`Failed to clear cache: ${err.message}`);
  }
}

// Tab Switching
function switchTab(tabName) {
  const tabs = ["overview", "products", "actionQueue", "allReviews"];
  tabs.forEach(t => {
    const el = document.getElementById(`tab${capitalize(t)}`);
    const btn = document.getElementById(`tab${capitalize(t)}Btn`);
    if (t === tabName) {
      el.classList.remove("hidden");
      btn.className = "px-4 py-2.5 rounded-lg bg-indigo-600/20 text-cyan-400 border border-indigo-500/30 flex items-center space-x-2 transition font-bold";
    } else {
      el.classList.add("hidden");
      btn.className = "px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-800 flex items-center space-x-2 transition font-semibold";
    }
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderDashboard(data) {
  currentDataset = data;
  const metrics = data.metrics;
  const reviews = data.reviews;

  // Reveal analytics section
  document.getElementById("analyticsSection").classList.remove("hidden");

  // Telemetry banner
  document.getElementById("telemetryTime").textContent = `${metrics.total_time_seconds}s`;
  document.getElementById("telemetryApiCalls").textContent = metrics.ai_calls_made;
  document.getElementById("telemetryCacheHits").textContent = metrics.cached_count;
  const skippedTotal = (metrics.skipped_empty_count || 0) + (metrics.skipped_duplicate_count || 0);
  document.getElementById("telemetrySkipped").textContent = `${skippedTotal} (${metrics.skipped_empty_count} empty, ${metrics.skipped_duplicate_count} dup)`;

  // Summary cards
  document.getElementById("cardTotal").textContent = metrics.total_reviews;
  document.getElementById("cardAnalyzed").textContent = `${metrics.total_analyzed} successfully analyzed`;

  document.getElementById("cardPositivePct").textContent = `${metrics.sentiment_breakdown.positive_pct}%`;
  document.getElementById("cardPositiveCount").textContent = `${metrics.sentiment_breakdown.positive_count} reviews`;

  document.getElementById("cardNeutralPct").textContent = `${metrics.sentiment_breakdown.neutral_pct}%`;
  document.getElementById("cardNeutralCount").textContent = `${metrics.sentiment_breakdown.neutral_count} reviews`;

  document.getElementById("cardNegativePct").textContent = `${metrics.sentiment_breakdown.negative_pct}%`;
  document.getElementById("cardNegativeCount").textContent = `${metrics.sentiment_breakdown.negative_count} reviews`;

  document.getElementById("cardNeedsReply").textContent = metrics.needs_reply_count;
  document.getElementById("tabNeedsReplyCount").textContent = metrics.needs_reply_count;
  document.getElementById("cardAgreementPct").textContent = `${metrics.rating_agreement_pct}%`;

  // Mismatch count subtext
  const mismatchCount = reviews.filter(r => r.is_rating_mismatch).length;
  document.getElementById("cardMismatchCount").textContent = `${mismatchCount} review(s) flagged mismatch`;

  // Dynamic Executive Summary Briefing
  renderExecutiveSummary(metrics);

  // Render Charts
  renderCharts(metrics);

  // Top 3 Praises
  renderPraises(metrics.top_3_praises);

  // Top 3 Complaints
  renderComplaints(metrics.top_3_complaints);

  // Product View Cards
  renderProductCards(metrics.product_view);

  // Populate Action Queue
  renderActionQueue(reviews.filter(r => r.needs_reply));

  // Populate product filter dropdown
  populateProductFilter(metrics.products);

  // Update health status with latest cache count
  checkHealth();

  // Apply table filters and render rows
  applyFilters();
}

function renderExecutiveSummary(metrics) {
  const container = document.getElementById("executiveSummaryText");
  const posPct = metrics.sentiment_breakdown.positive_pct;
  const negPct = metrics.sentiment_breakdown.negative_pct;
  const topComplaint = metrics.top_3_complaints[0] ? metrics.top_3_complaints[0].topic : "quality";
  const topPraise = metrics.top_3_praises[0] ? metrics.top_3_praises[0].topic : "satisfaction";

  let healthStatus = posPct >= 50 ? "Healthy" : (posPct >= 35 ? "Moderate Attention Needed" : "Critical Intervention Required");

  container.innerHTML = `
    Store Sentiment Health is rated <strong class="text-cyan-400 font-bold">${healthStatus}</strong> (${posPct}% positive vs ${negPct}% negative). 
    Customers strongly praise product <strong class="text-emerald-400 font-bold">${topPraise}</strong>, but severe customer friction exists in <strong class="text-rose-400 font-bold">${topComplaint}</strong> and delayed support response. 
    Immediate merchant action is recommended on the <strong class="text-amber-400 font-bold">${metrics.needs_reply_count} flagged customer complaints</strong> in the Priority Queue.
  `;
}

function renderCharts(metrics) {
  // 1. Sentiment Donut Chart
  const ctxSentiment = document.getElementById("sentimentChart").getContext("2d");
  const posCount = metrics.sentiment_breakdown.positive_count;
  const neuCount = metrics.sentiment_breakdown.neutral_count;
  const negCount = metrics.sentiment_breakdown.negative_count;

  document.getElementById("chartPosLabel").textContent = `${metrics.sentiment_breakdown.positive_pct}%`;
  document.getElementById("chartNeuLabel").textContent = `${metrics.sentiment_breakdown.neutral_pct}%`;
  document.getElementById("chartNegLabel").textContent = `${metrics.sentiment_breakdown.negative_pct}%`;

  if (sentimentChartInstance) {
    sentimentChartInstance.destroy();
  }

  sentimentChartInstance = new Chart(ctxSentiment, {
    type: "doughnut",
    data: {
      labels: ["Positive", "Neutral", "Negative"],
      datasets: [{
        data: [posCount, neuCount, negCount],
        backgroundColor: [
          "#10b981", // Emerald
          "#64748b", // Slate
          "#f43f5e"  // Rose
        ],
        borderWidth: 2,
        borderColor: "#0B0F19",
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#161F33",
          titleColor: "#ffffff",
          bodyColor: "#94a3b8",
          borderColor: "#334155",
          borderWidth: 1
        }
      },
      cutout: "74%"
    }
  });

  // 2. Topic Bar Chart
  const ctxTopics = document.getElementById("topicsChart").getContext("2d");

  // Collect frequency per topic from both complaints and praises
  const topicsList = ["quality", "delivery", "price", "packaging", "support", "size_fit", "other"];
  const praisesMap = {};
  const complaintsMap = {};

  metrics.top_3_praises.forEach(p => { praisesMap[p.topic] = p.count; });
  metrics.top_3_complaints.forEach(c => { complaintsMap[c.topic] = c.count; });

  const praisesData = topicsList.map(t => praisesMap[t] || 0);
  const complaintsData = topicsList.map(t => complaintsMap[t] || 0);

  if (topicsChartInstance) {
    topicsChartInstance.destroy();
  }

  topicsChartInstance = new Chart(ctxTopics, {
    type: "bar",
    data: {
      labels: ["Quality", "Delivery", "Price", "Packaging", "Support", "Size/Fit", "Other"],
      datasets: [
        {
          label: "Praises (Positive)",
          data: praisesData,
          backgroundColor: "rgba(16, 185, 129, 0.7)",
          borderColor: "#10b981",
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: "Complaints (Negative)",
          data: complaintsData,
          backgroundColor: "rgba(244, 63, 94, 0.7)",
          borderColor: "#f43f5e",
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: "rgba(51, 65, 85, 0.3)" },
          ticks: { color: "#94a3b8", font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(51, 65, 85, 0.3)" },
          ticks: { color: "#94a3b8", stepSize: 2 }
        }
      },
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#cbd5e1", font: { size: 11 } }
        }
      }
    }
  });
}

function renderPraises(praises) {
  const container = document.getElementById("topPraisesList");
  container.innerHTML = "";
  if (!praises || praises.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 italic">No praises recorded yet.</div>`;
    return;
  }
  praises.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "flex items-start justify-between p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs";
    el.innerHTML = `
      <div class="space-y-1 pr-2">
        <div class="flex items-center space-x-2">
          <span class="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-[10px] border border-emerald-500/40">${idx + 1}</span>
          <span class="font-bold text-white capitalize">${item.topic}</span>
        </div>
        <p class="text-slate-300 italic">"${item.sample || 'Positive customer satisfaction'}"</p>
      </div>
      <span class="px-2 py-1 font-mono font-bold text-emerald-300 bg-emerald-950/60 rounded-md border border-emerald-500/30 whitespace-nowrap">
        ${item.count} mentions
      </span>
    `;
    container.appendChild(el);
  });
}

function renderComplaints(complaints) {
  const container = document.getElementById("topComplaintsList");
  container.innerHTML = "";
  if (!complaints || complaints.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 italic">No complaints recorded yet.</div>`;
    return;
  }
  complaints.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "flex items-start justify-between p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs";
    el.innerHTML = `
      <div class="space-y-1 pr-2">
        <div class="flex items-center space-x-2">
          <span class="w-5 h-5 rounded-full bg-rose-500/30 text-rose-400 flex items-center justify-center font-bold text-[10px] border border-rose-500/40">${idx + 1}</span>
          <span class="font-bold text-white capitalize">${item.topic}</span>
        </div>
        <p class="text-slate-300 italic">"${item.sample || 'Reported customer grievance'}"</p>
      </div>
      <span class="px-2 py-1 font-mono font-bold text-rose-300 bg-rose-950/60 rounded-md border border-rose-500/30 whitespace-nowrap">
        ${item.count} complaints
      </span>
    `;
    container.appendChild(el);
  });
}

function renderProductCards(productView) {
  const container = document.getElementById("productCardsContainer");
  container.innerHTML = "";
  if (!productView) return;

  Object.entries(productView).forEach(([name, data]) => {
    const total = data.total || 1;
    const posPct = Math.round((data.positive / total) * 100);
    const neuPct = Math.round((data.neutral / total) * 100);
    const negPct = Math.round((data.negative / total) * 100);

    const issuesTags = data.top_issues.length > 0
      ? data.top_issues.map(t => `<span class="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30 text-[10px] font-mono">${t}</span>`).join(" ")
      : `<span class="text-slate-500 text-[10px]">None reported</span>`;

    const card = document.createElement("div");
    card.className = "p-4 rounded-xl border border-slate-800 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/5 transition-all cursor-pointer bg-dark-850/80 space-y-3";
    card.onclick = () => {
      document.getElementById("filterProduct").value = name;
      switchTab("allReviews");
      applyFilters();
    };
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-xs text-white leading-tight">${name}</h4>
        <span class="text-[10px] font-mono font-bold text-slate-400 bg-dark-800 px-1.5 py-0.5 rounded border border-slate-700">${data.total} rev</span>
      </div>
      <!-- Mini sentiment bar -->
      <div class="w-full bg-dark-800 h-2 rounded-full overflow-hidden flex border border-slate-700/50">
        <div style="width: ${posPct}%" class="bg-emerald-500" title="Positive: ${posPct}%"></div>
        <div style="width: ${neuPct}%" class="bg-slate-400" title="Neutral: ${neuPct}%"></div>
        <div style="width: ${negPct}%" class="bg-rose-500" title="Negative: ${negPct}%"></div>
      </div>
      <div class="flex justify-between items-center text-[10px] text-slate-400">
        <span class="text-emerald-400 font-semibold">${posPct}% Pos</span>
        <span class="text-rose-400 font-semibold">${negPct}% Neg</span>
      </div>
      <div class="pt-2 border-t border-slate-800/80">
        <div class="text-[10px] text-slate-500 mb-1">Top Defect Drivers:</div>
        <div class="flex flex-wrap gap-1">${issuesTags}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderActionQueue(needsReplyReviews) {
  const container = document.getElementById("actionQueueContainer");
  const badge = document.getElementById("actionQueueBadge");
  badge.textContent = `${needsReplyReviews.length} Urgent Items`;
  container.innerHTML = "";

  if (needsReplyReviews.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs">All clear! No pending customer replies required.</div>`;
    return;
  }

  needsReplyReviews.forEach(r => {
    const card = document.createElement("div");
    card.className = "bg-dark-850/80 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md";
    card.innerHTML = `
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <span class="font-mono text-xs font-bold text-amber-400">${r.review_id}</span>
          <span class="text-xs font-semibold text-white">&bull; ${r.product}</span>
          <span class="px-2 py-0.5 rounded text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/30 font-bold capitalize">${r.sentiment || 'Complaint'}</span>
        </div>
        <p class="text-xs text-slate-300 italic">"${r.review_text}"</p>
        <p class="text-[11px] text-slate-400"><strong class="text-slate-300">Issue:</strong> ${r.summary}</p>
      </div>
      <button onclick="handleSuggestReply('${r.review_id}')" class="self-start sm:self-center whitespace-nowrap inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 rounded-lg shadow-sm">
        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-cyan-300"></i>
        <span>Draft Response</span>
      </button>
    `;
    container.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

function populateProductFilter(products) {
  const select = document.getElementById("filterProduct");
  const selectedVal = select.value;
  select.innerHTML = `<option value="">All Products</option>`;
  if (products) {
    products.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
  }
  select.value = selectedVal;
}

function applyFilters() {
  if (!currentDataset || !currentDataset.reviews) return;

  const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
  const selectedProduct = document.getElementById("filterProduct").value;
  const selectedSentiment = document.getElementById("filterSentiment").value;
  const selectedTopic = document.getElementById("filterTopic").value;
  const needsReplyOnly = document.getElementById("filterNeedsReply").checked;
  const mismatchOnly = document.getElementById("filterMismatch").checked;

  const filtered = currentDataset.reviews.filter(item => {
    // Search
    if (searchTerm) {
      const matchText = (item.review_text || "").toLowerCase().includes(searchTerm);
      const matchId = (item.review_id || "").toLowerCase().includes(searchTerm);
      const matchSummary = (item.summary || "").toLowerCase().includes(searchTerm);
      const matchProd = (item.product || "").toLowerCase().includes(searchTerm);
      if (!matchText && !matchId && !matchSummary && !matchProd) return false;
    }

    // Product
    if (selectedProduct && item.product !== selectedProduct) {
      return false;
    }

    // Sentiment
    if (selectedSentiment) {
      if (selectedSentiment === "failed") {
        if (item.status !== "analysis_failed") return false;
      } else if (item.sentiment !== selectedSentiment) {
        return false;
      }
    }

    // Topic
    if (selectedTopic) {
      if (!item.topics || !item.topics.includes(selectedTopic)) {
        return false;
      }
    }

    // Needs Reply
    if (needsReplyOnly && !item.needs_reply) {
      return false;
    }

    // Mismatch only
    if (mismatchOnly && !item.is_rating_mismatch) {
      return false;
    }

    return true;
  });

  currentFilteredReviews = filtered;
  document.getElementById("filteredCount").textContent = filtered.length;
  document.getElementById("totalCount").textContent = currentDataset.reviews.length;

  renderReviewsTable(filtered);
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterProduct").value = "";
  document.getElementById("filterSentiment").value = "";
  document.getElementById("filterTopic").value = "";
  document.getElementById("filterNeedsReply").checked = false;
  document.getElementById("filterMismatch").checked = false;
  applyFilters();
}

function renderReviewsTable(reviews) {
  const tbody = document.getElementById("reviewsTableBody");
  tbody.innerHTML = "";

  if (reviews.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-500 text-xs italic">
          No customer reviews matched the selected filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  reviews.forEach(r => {
    const tr = document.createElement("tr");

    // Star rating display
    let starBadge = "";
    if (r.rating !== null && r.rating !== undefined) {
      starBadge = `
        <div class="flex items-center space-x-1">
          <span class="font-bold text-white font-mono">${r.rating}</span>
          <i data-lucide="star" class="w-3.5 h-3.5 text-amber-400 fill-amber-400 inline"></i>
        </div>
      `;
    } else {
      starBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-dark-800 text-slate-400 border border-slate-700">Unknown</span>`;
    }

    // Mismatch warning
    let mismatchNotice = "";
    if (r.is_rating_mismatch) {
      mismatchNotice = `
        <div class="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold mismatch-badge">
          <i data-lucide="alert-triangle" class="w-3 h-3 mr-1 text-amber-400"></i> Mismatch
        </div>
      `;
    }

    // Sentiment badge
    let sentimentBadge = "";
    if (r.status === "analysis_failed") {
      sentimentBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold sentiment-badge-failed">Failed</span>`;
    } else if (r.sentiment === "positive") {
      sentimentBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold sentiment-badge-positive">Positive</span>`;
    } else if (r.sentiment === "neutral") {
      sentimentBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold sentiment-badge-neutral">Neutral</span>`;
    } else if (r.sentiment === "negative") {
      sentimentBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold sentiment-badge-negative">Negative</span>`;
    } else {
      sentimentBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-dark-800 text-slate-400">N/A</span>`;
    }

    // Topic badges
    const topicBadges = (r.topics || []).map(t => `<span class="topic-tag">${t}</span>`).join(" ");

    // Duplicate or Empty badge
    let metaBadge = "";
    if (r.status === "skipped_empty") {
      metaBadge = `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-slate-400 font-mono border border-slate-700">Empty</span>`;
    } else if (r.duplicate_of) {
      metaBadge = `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 font-mono border border-blue-500/30">Dup of ${r.duplicate_of}</span>`;
    }

    // Prompt injection badge for R012
    let securityBadge = "";
    if ((r.review_text || "").toLowerCase().includes("ignore all previous instructions")) {
      securityBadge = `
        <div class="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40">
          <i data-lucide="shield-check" class="w-3 h-3 mr-1 text-purple-400"></i> Shielded: Injection Quarantined
        </div>
      `;
    }

    // Action button: Suggest Reply if needs_reply is true
    let actionCol = "";
    if (r.needs_reply) {
      actionCol = `
        <button onclick="handleSuggestReply('${r.review_id}')" class="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 rounded-lg transition shadow-sm">
          <i data-lucide="message-square-plus" class="w-3.5 h-3.5 text-cyan-300"></i>
          <span>Suggest Reply</span>
        </button>
      `;
    } else {
      actionCol = `<span class="text-[11px] text-slate-600">-</span>`;
    }

    tr.innerHTML = `
      <td class="py-3 px-4 font-mono text-xs font-bold text-slate-200 align-top">
        ${r.review_id}
        <div class="text-[10px] font-normal text-slate-500">${r.date || ''}</div>
        ${metaBadge}
      </td>
      <td class="py-3 px-4 text-xs font-semibold text-white align-top max-w-[140px] truncate" title="${r.product}">
        ${r.product}
      </td>
      <td class="py-3 px-4 text-xs align-top whitespace-nowrap">
        ${starBadge}
        ${mismatchNotice}
      </td>
      <td class="py-3 px-4 text-xs text-slate-300 align-top max-w-xs">
        <div class="line-clamp-2 hover:line-clamp-none transition-all">${r.review_text || '<i class="text-slate-500">[Empty]</i>'}</div>
        ${securityBadge}
      </td>
      <td class="py-3 px-4 align-top whitespace-nowrap space-y-1">
        <div>${sentimentBadge}</div>
        <div class="flex flex-wrap gap-1 max-w-[150px]">${topicBadges}</div>
      </td>
      <td class="py-3 px-4 text-xs text-slate-300 align-top max-w-sm">
        ${r.summary || '<span class="text-slate-500">-</span>'}
      </td>
      <td class="py-3 px-4 align-top text-right whitespace-nowrap">
        ${actionCol}
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Suggested Reply Studio with Tone Customizer
async function handleSuggestReply(reviewId) {
  const review = currentDataset.reviews.find(r => r.review_id === reviewId);
  if (!review) return;

  activeModalReview = review;
  const modal = document.getElementById("replyModal");
  const modalReview = document.getElementById("modalReviewText");
  const modalReply = document.getElementById("modalReplyText");
  const copyBtnText = document.getElementById("copyBtnText");

  modalReview.textContent = `[${review.product}] "${review.review_text}"`;
  modalReply.value = "Drafting tone-adaptive response...";
  copyBtnText.textContent = "Copy to Clipboard";
  modal.classList.remove("hidden");

  fetchReplyWithTone(currentReplyTone);
}

function setReplyTone(tone) {
  currentReplyTone = tone;
  const toneBtns = {
    empathetic: document.getElementById("toneEmpatheticBtn"),
    solution: document.getElementById("toneSolutionBtn"),
    refund: document.getElementById("toneRefundBtn")
  };

  Object.entries(toneBtns).forEach(([t, btn]) => {
    if (t === tone) {
      btn.className = "px-2.5 py-1 text-xs rounded-lg font-bold bg-indigo-600/40 text-cyan-300 border border-cyan-500/50 transition";
    } else {
      btn.className = "px-2.5 py-1 text-xs rounded-lg font-medium bg-dark-800 text-slate-400 border border-slate-700 hover:bg-dark-700 transition";
    }
  });

  if (activeModalReview) {
    fetchReplyWithTone(tone);
  }
}

async function fetchReplyWithTone(tone) {
  const modalReply = document.getElementById("modalReplyText");
  modalReply.value = `Synthesizing ${tone} merchant reply...`;

  try {
    const res = await fetch("/api/suggest-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: activeModalReview.product,
        review_text: activeModalReview.review_text,
        summary: activeModalReview.summary,
        topics: activeModalReview.topics,
        tone: tone
      })
    });

    const data = await res.json();
    if (res.ok && data.reply) {
      modalReply.value = data.reply;
    } else {
      modalReply.value = "Error generating reply: " + (data.error || "Unknown error");
    }
  } catch (err) {
    modalReply.value = "Network error: " + err.message;
  }
}

function closeReplyModal() {
  document.getElementById("replyModal").classList.add("hidden");
  activeModalReview = null;
}

function copyModalReply() {
  const textarea = document.getElementById("modalReplyText");
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  const copyBtnText = document.getElementById("copyBtnText");
  copyBtnText.textContent = "Copied to Clipboard!";
  setTimeout(() => {
    copyBtnText.textContent = "Copy to Clipboard";
  }, 2000);
}

// Export Utilities
function exportToJSON() {
  if (!currentDataset) return;
  const jsonStr = JSON.stringify(currentDataset, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reviewlens_insights.json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCSV() {
  if (!currentDataset || !currentDataset.reviews) return;
  const headers = ["review_id", "product", "rating", "sentiment", "topics", "summary", "needs_reply", "is_rating_mismatch"];
  const rows = currentDataset.reviews.map(r => [
    r.review_id,
    `"${r.product}"`,
    r.rating ?? "",
    r.sentiment ?? "",
    `"${(r.topics || []).join(';')}"`,
    `"${(r.summary || '').replace(/"/g, '""')}"`,
    r.needs_reply,
    r.is_rating_mismatch
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reviewlens_cleaned_dataset.csv";
  a.click();
  URL.revokeObjectURL(url);
}
