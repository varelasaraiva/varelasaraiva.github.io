/**
 * Trevor SSG - Client-side search
 *
 * Lazy-loads search-index.json on first open, performs case-insensitive
 * substring matching, and renders results in a modal overlay with
 * keyboard navigation.
 */
(function () {
  "use strict";

  var index = null;
  var selectedIdx = -1;
  var debounceTimer = null;
  var overlay = document.getElementById("search-overlay");
  var input = document.getElementById("search-input");
  var resultsContainer = document.getElementById("search-results");
  var trigger = document.getElementById("search-trigger");

  if (!overlay || !input || !resultsContainer) return;

  // Determine asset prefix from the script's own src attribute
  var scripts = document.getElementsByTagName("script");
  var assetPrefix = "";
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].getAttribute("src") || "";
    if (src.indexOf("assets/search.js") !== -1) {
      assetPrefix = src.replace("assets/search.js", "");
      break;
    }
  }

  /**
   * Fetches the search index JSON. Returns a promise-like callback pattern
   * compatible with older browsers.
   */
  function loadIndex(callback) {
    if (index) {
      callback(index);
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open("GET", assetPrefix + "search-index.json", true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          index = JSON.parse(xhr.responseText);
        } catch (e) {
          index = [];
        }
        callback(index);
      }
    };
    xhr.send();
  }

  /** Opens the search modal. */
  function openSearch() {
    overlay.classList.add("active");
    input.value = "";
    resultsContainer.innerHTML = "";
    selectedIdx = -1;
    // Small delay so the transition renders
    setTimeout(function () {
      input.focus();
    }, 50);
    loadIndex(function () {});
  }

  /** Closes the search modal. */
  function closeSearch() {
    overlay.classList.remove("active");
    input.value = "";
    resultsContainer.innerHTML = "";
    selectedIdx = -1;
  }

  /**
   * Highlights all occurrences of `query` in `text` using <mark> tags.
   * Returns an HTML string.
   */
  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var queryEscaped = escapeHtml(query);
    // Build a case-insensitive regex from the query
    var re = new RegExp(
      "(" + queryEscaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
      "gi"
    );
    return escaped.replace(re, "<mark>$1</mark>");
  }

  /** Escapes HTML special characters. */
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /**
   * Finds a snippet of `text` around the first occurrence of `query`,
   * returning ~120 chars of context.
   */
  function findSnippet(text, query) {
    var lower = text.toLowerCase();
    var qLower = query.toLowerCase();
    var pos = lower.indexOf(qLower);
    if (pos === -1) return text.substring(0, 120) + (text.length > 120 ? "…" : "");
    var start = Math.max(0, pos - 50);
    var end = Math.min(text.length, pos + query.length + 70);
    var snippet = "";
    if (start > 0) snippet += "…";
    snippet += text.substring(start, end);
    if (end < text.length) snippet += "…";
    return snippet;
  }

  /**
   * Performs the search and renders results.
   */
  function doSearch(query) {
    if (!index) return;
    selectedIdx = -1;

    if (!query || query.length < 2) {
      resultsContainer.innerHTML = "";
      return;
    }

    var q = query.toLowerCase();
    var titleExact = [];
    var titlePartial = [];
    var tagMatches = [];
    var bodyMatches = [];

    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      var titleLower = entry.t.toLowerCase();

      if (titleLower === q) {
        titleExact.push(entry);
      } else if (titleLower.indexOf(q) !== -1) {
        titlePartial.push(entry);
      } else if (entry.g && entry.g.join(" ").toLowerCase().indexOf(q) !== -1) {
        tagMatches.push(entry);
      } else if (entry.b.indexOf(q) !== -1) {
        bodyMatches.push(entry);
      }
    }

    var results = titleExact.concat(titlePartial, tagMatches, bodyMatches);

    if (results.length === 0) {
      resultsContainer.innerHTML =
        '<div class="search-empty">No results for &ldquo;' +
        escapeHtml(query) +
        '&rdquo;</div>';
      return;
    }

    // Limit to 20 results
    var limited = results.slice(0, 20);
    var html = "";

    for (var j = 0; j < limited.length; j++) {
      var r = limited[j];
      var snippet = findSnippet(r.p, query);
      var tags = r.g && r.g.length > 0 ? r.g.map(function(t) { return "#" + t; }).join(" ") : "";
      var meta = [];
      if (r.m) meta.push(r.m);
      if (tags) meta.push(tags);

      html +=
        '<a class="search-result-item" href="' +
        assetPrefix +
        escapeHtml(r.s) +
        '.html" data-index="' + j + '">' +
        '<div class="search-result-title">' +
        highlight(r.t, query) +
        "</div>" +
        '<div class="search-result-preview">' +
        highlight(snippet, query) +
        "</div>" +
        (meta.length > 0
          ? '<div class="search-result-meta">' + escapeHtml(meta.join(" · ")) + "</div>"
          : "") +
        "</a>";
    }

    resultsContainer.innerHTML = html;
  }

  /** Updates the visual selection state of result items. */
  function updateSelection() {
    var items = resultsContainer.querySelectorAll(".search-result-item");
    for (var i = 0; i < items.length; i++) {
      if (i === selectedIdx) {
        items[i].classList.add("selected");
        // Scroll into view if needed
        items[i].scrollIntoView({ block: "nearest" });
      } else {
        items[i].classList.remove("selected");
      }
    }
  }

  // Event: trigger click
  if (trigger) {
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      openSearch();
    });
  }

  // Event: overlay click (close on background click)
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      closeSearch();
    }
  });

  // Event: keyboard shortcut Ctrl+K / Cmd+K
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      if (overlay.classList.contains("active")) {
        closeSearch();
      } else {
        openSearch();
      }
    }
  });

  // Event: input with debounce
  input.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      loadIndex(function () {
        doSearch(input.value.trim());
      });
    }, 150);
  });

  // Event: keyboard navigation within search
  input.addEventListener("keydown", function (e) {
    var items = resultsContainer.querySelectorAll(".search-result-item");
    var count = items.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (count > 0) {
        selectedIdx = (selectedIdx + 1) % count;
        updateSelection();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (count > 0) {
        selectedIdx = selectedIdx <= 0 ? count - 1 : selectedIdx - 1;
        updateSelection();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < count) {
        var href = items[selectedIdx].getAttribute("href");
        if (href) window.location.href = href;
      } else if (count > 0) {
        // If nothing selected, go to first result
        var firstHref = items[0].getAttribute("href");
        if (firstHref) window.location.href = firstHref;
      }
    } else if (e.key === "Escape") {
      closeSearch();
    }
  });

  // Event: hover to select
  resultsContainer.addEventListener("mouseover", function (e) {
    var item = e.target.closest(".search-result-item");
    if (item) {
      var idx = parseInt(item.getAttribute("data-index"), 10);
      if (!isNaN(idx)) {
        selectedIdx = idx;
        updateSelection();
      }
    }
  });
})();
