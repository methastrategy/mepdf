/* ─── mePDF Tool Form JS (event delegation) ──────────
 * All drop-zone / file-input / drag-drop logic in one place.
 * No inline scripts in tool fragments — event delegation on #main-content.
 */

(function () {
  'use strict';

  // ─── File input change handler ────────────────────
  function handleFileInput(inputEl) {
    const panel = inputEl.closest('.tool-panel');
    if (!panel) return;
    const list = panel.querySelector('#file-list');
    if (!list) return;

    list.innerHTML = '';
    const files = Array.from(inputEl.files);

    // Reorder controls for merge tool
    const isMerge = panel.dataset.tool === 'merge' || panel.dataset.tool === 'images-to-pdf';

    files.forEach(function (f, i) {
      const item = document.createElement('div');
      item.className = 'file-item';

      let sizeStr = f.size > 1024 * 1024
        ? (f.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (f.size / 1024).toFixed(1) + ' KB';

      let reorderBtns = '';
      if (isMerge && files.length > 1) {
        reorderBtns = `
          <button type="button" class="file-up" data-idx="${i}" title="Move up">↑</button>
          <button type="button" class="file-down" data-idx="${i}" title="Move down">↓</button>
          <button type="button" class="file-remove" data-idx="${i}" title="Remove">✕</button>`;
      }

      item.innerHTML = `
        <span class="file-icon">📄</span>
        <span class="file-name">${f.name}</span>
        <span class="file-size">${sizeStr}</span>
        <span class="file-pages" data-file-idx="${i}">—</span>
        ${reorderBtns}`;

      // Animate in
      item.style.animation = 'slideIn 0.2s ease';
      list.appendChild(item);
    });

    // Read page counts in background (via backend)
    readPageCounts(inputEl, list);
  }

  // ─── Read page counts ─────────────────────────────
  function readPageCounts(inputEl, list) {
    var items = list.querySelectorAll('.file-item');
    Array.from(items).forEach(function (item, i) {
      var file = inputEl.files[i];
      var el = item.querySelector('.file-pages');
      if (!file || !file.name.endsWith('.pdf')) {
        if (el) el.textContent = '';
        return;
      }

      if (el) el.textContent = '\u2026';  // ellipsis while loading

      // Use fetch + /api/page-count
      var fd = new FormData();
      fd.append('file', file);
      fetch('/api/page-count', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.pages !== undefined && el) {
            el.textContent = data.pages + ' p.';
          }
        })
        .catch(function () {
          if (el) el.textContent = 'PDF';
        });
    });
  }

  // ─── Drag-and-drop ────────────────────────────────
  function handleDragOver(e) {
    e.preventDefault();
    const zone = e.currentTarget;
    zone.classList.add('dragover');
  }

  function handleDragLeave(e) {
    // Only remove if we're actually leaving the zone (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.classList.remove('dragover');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const zone = e.currentTarget;
    zone.classList.remove('dragover');
    const input = zone.querySelector('#file-input');
    if (input) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  }

  // ─── Reorder handlers (for merge) ─────────────────
  function reorderFiles(panel, fromIdx, toIdx) {
    const input = panel.querySelector('#file-input');
    if (!input) return;
    const files = Array.from(input.files);
    if (fromIdx < 0 || fromIdx >= files.length || toIdx < 0 || toIdx >= files.length) return;

    // Swap in the FileList using DataTransfer
    const dt = new DataTransfer();
    const arr = Array.from(files);
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    arr.forEach(function (f) { dt.items.add(f); });
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }

  function removeFile(panel, idx) {
    const input = panel.querySelector('#file-input');
    if (!input) return;
    const dt = new DataTransfer();
    const arr = Array.from(input.files);
    arr.splice(idx, 1);
    arr.forEach(function (f) { dt.items.add(f); });
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }

  // ─── HTMX download interceptor ────────────────────
  function handleHtmxBeforeSwap(evt) {
    const contentType = evt.detail.xhr.getResponseHeader('Content-Type') || '';
    const contentDispo = evt.detail.xhr.getResponseHeader('Content-Disposition') || '';

    if (contentType.includes('application/pdf') ||
        contentType.includes('application/zip') ||
        contentType.includes('text/plain') ||
        contentDispo.includes('attachment')) {

      evt.preventDefault();

      const blob = evt.detail.xhr.response;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      let filename = 'download';
      const match = contentDispo.match(/filename[^;=\n]*=(?:"([^"]*)"|([^;]*))/);
      if (match) filename = match[1] || match[2];
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

      // Show success + read compression headers
      const resultArea = document.getElementById('result-area');
      if (resultArea) {
        const compressRatio = evt.detail.xhr.getResponseHeader('X-Compress-Ratio');
        let sizeInfo = '';
        if (compressRatio) {
          const orig = evt.detail.xhr.getResponseHeader('X-Original-Size');
          const comp = evt.detail.xhr.getResponseHeader('X-Compressed-Size');
          if (orig && comp) {
            const origKB = (parseInt(orig) / 1024).toFixed(1);
            const compKB = (parseInt(comp) / 1024).toFixed(1);
            sizeInfo = `<div class="result-size">${origKB} KB → ${compKB} KB (${compressRatio}% smaller)</div>`;
          }
        }
        resultArea.innerHTML = `
          <div class="result-success">
            <div class="result-icon">✅</div>
            <div class="result-name">${filename}</div>
            ${sizeInfo || '<div class="result-size">Downloaded successfully</div>'}
            <a href="${url}" download="${filename}">Download again</a>
          </div>`;
      }

      showToast('Download complete', 'success');
    }
  }

  // ─── HTMX error handler ───────────────────────────
  function handleHtmxError(evt) {
    const resultArea = document.getElementById('result-area');
    let errMsg = 'Something went wrong';
    try {
      const parsed = JSON.parse(evt.detail.xhr?.responseText || '{}');
      errMsg = parsed.error || 'Something went wrong';
    } catch (e) {
      errMsg = evt.detail.xhr?.responseText || 'Something went wrong';
    }
    if (resultArea) {
      resultArea.innerHTML = '<div class="result-error">⚠️ ' + errMsg + '</div>';
    }
    showToast(errMsg, 'error');
  }

  // ─── Toast notifications ──────────────────────────
  function showToast(msg, type) {
    type = type || 'success';
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ─── Event delegation on #main-content ────────────
  const main = document.getElementById('main-content');

  // File input changes (delegated)
  main.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'file-input') {
      handleFileInput(e.target);
    }
  });

  // Drag events (delegated)
  main.addEventListener('dragover', function (e) {
    const zone = e.target.closest('.drop-zone');
    if (zone) {
      e.preventDefault();
      zone.classList.add('dragover');
    }
  });

  main.addEventListener('dragleave', function (e) {
    const zone = e.target.closest('.drop-zone');
    if (zone && !zone.contains(e.relatedTarget)) {
      zone.classList.remove('dragover');
    }
  });

  main.addEventListener('drop', function (e) {
    const zone = e.target.closest('.drop-zone');
    if (zone) {
      e.preventDefault();
      zone.classList.remove('dragover');
      const input = zone.querySelector('#file-input');
      if (input) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    }
  });

  // Reorder buttons (delegated)
  main.addEventListener('click', function (e) {
    const panel = e.target.closest('.tool-panel');
    if (!panel) return;

    if (e.target.classList.contains('file-up')) {
      const idx = parseInt(e.target.dataset.idx);
      if (idx > 0) reorderFiles(panel, idx, idx - 1);
    }
    else if (e.target.classList.contains('file-down')) {
      const idx = parseInt(e.target.dataset.idx);
      const input = panel.querySelector('#file-input');
      if (input && idx < input.files.length - 1) reorderFiles(panel, idx, idx + 1);
    }
    else if (e.target.classList.contains('file-remove')) {
      const idx = parseInt(e.target.dataset.idx);
      removeFile(panel, idx);
    }
  });

  // ─── HTMX events (global) ─────────────────────────
  document.body.addEventListener('htmx:beforeSwap', handleHtmxBeforeSwap);
  document.body.addEventListener('htmx:responseError', handleHtmxError);

  // ─── Expose for inline use ────────────────────────
  window.showToast = showToast;

})();