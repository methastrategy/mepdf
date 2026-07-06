/* ─── mePDF App JS (sidebar + welcome cards only) ────
 * File/drag/drop/HTMX handlers → tool-form.js
 */

// ─── Sidebar: toggle active state ─────────────────────
function setActive(el) {
  document.querySelectorAll('.sidebar-item').forEach(function (i) {
    i.classList.remove('active');
  });
  el.classList.add('active');

  // Hide welcome when a tool is selected
  var welcome = document.getElementById('welcome');
  if (welcome) welcome.style.display = 'none';

  // Close sidebar on mobile
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

// ─── Switch tool from welcome cards ──────────────────
function switchTool(name) {
  var link = document.querySelector('.sidebar-item[data-tool="' + name + '"]');
  if (link) link.click();
}

// ─── Mobile nav toggle ────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle');
  var sidebar = document.getElementById('sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });

    // Close sidebar on outside click
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= 768 &&
          !sidebar.contains(e.target) &&
          !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
});