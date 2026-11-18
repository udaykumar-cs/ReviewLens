// ReviewLens Dashboard Interactive Frontend

let currentDataset = null;
let currentFilteredReviews = [];

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
    dropzoneCard.classList.add("border-indigo-500", "bg-indigo-50/20");
  });

  dropzoneCard.addEventListener("dragleave", () => {
    dropzoneCard.classList.remove("border-indigo-500", "bg-indigo-50/20");
  });

  dropzoneCard.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzoneCard.classList.remove("border-indigo-500", "bg-indigo-50/20");
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
      badge.textContent = `Engine: ${provName} (${data.cached_reviews} cached)`;
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
  showLoading(`Analyzing '${file.name}' with ReviewLens...`);
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
  document.getElementById("cardAgreementPct").textContent = `${metrics.rating_agreement_pct}%`;

  // Mismatch count subtext
  const mismatchCount = reviews.filter(r => r.is_rating_mismatch).length;
  document.getElementById("cardMismatchCount").textContent = `${mismatchCount} review(s) flagged as mismatch`;

  // Top 3 Praises
  renderPraises(metrics.top_3_praises);

  // Top 3 Complaints
  renderComplaints(metrics.top_3_complaints);

  // Product View Cards
  renderProductCards(metrics.product_view);

  // Populate product filter dropdown
  populateProductFilter(metrics.products);

  // Update health status with latest cache count
  checkHealth();

  // Apply table filters and render rows
  applyFilters();
}

function renderPraises(praises) {
  const container = document.getElementById("topPraisesList");
  container.innerHTML = "";
  if (!praises || praises.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 italic">No praises recorded yet.</div>`;
    return;
  }
  praises.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "flex items-start justify-between p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 text-xs";
    el.innerHTML = `
      <div class="space-y-1 pr-2">
        <div class="flex items-center space-x-2">
          <span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">${idx + 1}</span>
          <span class="font-semibold text-emerald-950 capitalize">${item.topic}</span>
        </div>
        <p class="text-slate-600 italic">"${item.sample || 'Positive customer satisfaction'}"</p>
      </div>
      <span class="px-2 py-1 font-mono font-bold text-emerald-700 bg-emerald-100/70 rounded-md border border-emerald-200">
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
    container.innerHTML = `<div class="text-xs text-slate-400 italic">No complaints recorded yet.</div>`;
    return;
  }
  complaints.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "flex items-start justify-between p-3 rounded-xl bg-rose-50/50 border border-rose-100 text-xs";
    el.innerHTML = `
      <div class="space-y-1 pr-2">
        <div class="flex items-center space-x-2">
          <span class="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-[10px]">${idx + 1}</span>
          <span class="font-semibold text-rose-950 capitalize">${item.topic}</span>
        </div>
        <p class="text-slate-600 italic">"${item.sample || 'Reported customer grievance'}"</p>
      </div>
      <span class="px-2 py-1 font-mono font-bold text-rose-700 bg-rose-100/70 rounded-md border border-rose-200">
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
      ? data.top_issues.map(t => `<span class="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px]">${t}</span>`).join(" ")
      : `<span class="text-slate-400 text-[10px]">None reported</span>`;

    const card = document.createElement("div");
    card.className = "p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer bg-white space-y-3";
    card.onclick = () => {
      document.getElementById("filterProduct").value = name;
      applyFilters();
    };
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-xs text-slate-900 leading-tight">${name}</h4>
        <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${data.total} rev</span>
      </div>
      <!-- Mini sentiment bar -->
      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
        <div style="width: ${posPct}%" class="bg-emerald-500" title="Positive: ${posPct}%"></div>
        <div style="width: ${neuPct}%" class="bg-slate-400" title="Neutral: ${neuPct}%"></div>
        <div style="width: ${negPct}%" class="bg-rose-500" title="Negative: ${negPct}%"></div>
      </div>
      <div class="flex justify-between items-center text-[10px] text-slate-500">
        <span class="text-emerald-600 font-medium">${posPct}% Pos</span>
        <span class="text-rose-600 font-medium">${negPct}% Neg</span>
      </div>
      <div class="pt-1 border-t border-slate-100">
        <div class="text-[10px] text-slate-400 mb-1">Top Issues:</div>
        <div class="flex flex-wrap gap-1">${issuesTags}</div>
      </div>
    `;
    container.appendChild(card);
  });
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
        <td colspan="7" class="py-8 text-center text-slate-400 text-xs italic">
          No reviews found matching the selected filters.
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
          <span class="font-bold text-slate-800">${r.rating}</span>
          <i data-lucide="star" class="w-3.5 h-3.5 text-amber-500 fill-amber-500 inline"></i>
        </div>
      `;
    } else {
      starBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">Unknown</span>`;
    }

    // Mismatch warning
    let mismatchNotice = "";
    if (r.is_rating_mismatch) {
      mismatchNotice = `
        <div class="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold mismatch-badge">
          <i data-lucide="alert-triangle" class="w-3 h-3 mr-1 text-amber-600"></i> Mismatch
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
      sentimentBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">N/A</span>`;
    }

    // Topic badges
    const topicBadges = (r.topics || []).map(t => `<span class="topic-tag">${t}</span>`).join(" ");

    // Duplicate or Empty badge
    let metaBadge = "";
    if (r.status === "skipped_empty") {
      metaBadge = `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">Empty</span>`;
    } else if (r.duplicate_of) {
      metaBadge = `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono">Dup of ${r.duplicate_of}</span>`;
    }

    // Prompt injection badge for R012
    let securityBadge = "";
    if ((r.review_text || "").toLowerCase().includes("ignore all previous instructions")) {
      securityBadge = `
        <div class="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <i data-lucide="shield-check" class="w-3 h-3 mr-1 text-purple-600"></i> Injection Defended
        </div>
      `;
    }

    // Action button: Suggest Reply if needs_reply is true
    let actionCol = "";
    if (r.needs_reply) {
      actionCol = `
        <button onclick="handleSuggestReply('${r.review_id}')" class="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition shadow-sm">
          <i data-lucide="message-square-plus" class="w-3.5 h-3.5"></i>
          <span>Suggest Reply</span>
        </button>
      `;
    } else {
      actionCol = `<span class="text-[11px] text-slate-400">-</span>`;
    }

    tr.innerHTML = `
      <td class="py-3 px-4 font-mono text-xs font-semibold text-slate-800 align-top">
        ${r.review_id}
        <div class="text-[10px] font-normal text-slate-400">${r.date || ''}</div>
        ${metaBadge}
      </td>
      <td class="py-3 px-4 text-xs font-medium text-slate-900 align-top max-w-[140px] truncate" title="${r.product}">
        ${r.product}
      </td>
      <td class="py-3 px-4 text-xs align-top whitespace-nowrap">
        ${starBadge}
        ${mismatchNotice}
      </td>
      <td class="py-3 px-4 text-xs text-slate-700 align-top max-w-xs">
        <div class="line-clamp-2 hover:line-clamp-none transition-all">${r.review_text || '<i class="text-slate-400">[Empty]</i>'}</div>
        ${securityBadge}
      </td>
      <td class="py-3 px-4 align-top whitespace-nowrap space-y-1">
        <div>${sentimentBadge}</div>
        <div class="flex flex-wrap gap-1 max-w-[150px]">${topicBadges}</div>
      </td>
      <td class="py-3 px-4 text-xs text-slate-600 align-top max-w-sm">
        ${r.summary || '<span class="text-slate-400">-</span>'}
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

async function handleSuggestReply(reviewId) {
  const review = currentDataset.reviews.find(r => r.review_id === reviewId);
  if (!review) return;

  const modal = document.getElementById("replyModal");
  const modalReview = document.getElementById("modalReviewText");
  const modalReply = document.getElementById("modalReplyText");
  const copyBtnText = document.getElementById("copyBtnText");

  modalReview.textContent = `[${review.product}] "${review.review_text}"`;
  modalReply.value = "Generating intelligent suggested merchant reply...";
  copyBtnText.textContent = "Copy to Clipboard";
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/api/suggest-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: review.product,
        review_text: review.review_text,
        summary: review.summary,
        topics: review.topics
      })
    });

    const data = await res.json();
    if (res.ok && data.reply) {
      modalReply.value = data.reply;
    } else {
      modalReply.value = "Failed to generate reply: " + (data.error || "Unknown error");
    }
  } catch (err) {
    modalReply.value = "Network error: " + err.message;
  }
}

function closeReplyModal() {
  document.getElementById("replyModal").classList.add("hidden");
}

function copyModalReply() {
  const textarea = document.getElementById("modalReplyText");
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  const copyBtnText = document.getElementById("copyBtnText");
  copyBtnText.textContent = "Copied!";
  setTimeout(() => {
    copyBtnText.textContent = "Copy to Clipboard";
  }, 2000);
}
