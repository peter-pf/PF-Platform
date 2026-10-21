/* PF Field Portal — Shared runtime
   Loaded at end of <body> on all authenticated pages, before the page
   inline <script>. Defines: window.esc, theme helpers, account menu,
   nav active state.
   ------------------------------------------------------------------ */

/* ---- XSS escaper ---- */
window.esc = function(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
};

/* ---- Theme ---- */
var PF_DARK  = '[data-theme="dark"]';
var PF_LIGHT = 'light';
var PF_DARK_VAL = 'dark';

function pfCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === PF_DARK_VAL
    ? PF_DARK_VAL : PF_LIGHT;
}

function pfApplyTheme(t) {
  if (t === PF_DARK_VAL) {
    document.documentElement.setAttribute('data-theme', PF_DARK_VAL);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem('pf-theme', t); } catch(e){}
}

window.pfToggleTheme = function() {
  pfApplyTheme(pfCurrentTheme() === PF_DARK_VAL ? PF_LIGHT : PF_DARK_VAL);
  pfSyncThemeLabel();
};

function pfSyncThemeLabel() {
  var el = document.getElementById('acctThemeLabel');
  if (!el) return;
  el.textContent = pfCurrentTheme() === PF_DARK_VAL ? 'Light mode' : 'Dark mode';
}

/* ---- Account menu ---- */
function pfInitAccountMenu() {
  var menu = document.getElementById('acctMenu');
  if (!menu) return;
  // Close on outside click
  document.addEventListener('click', function(e) {
    if (menu.open && !menu.contains(e.target)) {
      menu.open = false;
    }
  });
  pfSyncThemeLabel();
}

/* ---- Nav active state ---- */
function pfInitNav() {
  var path = window.location.pathname.replace(/\/?$/, '');
  var navItems = document.querySelectorAll('.pf-nav-item[data-paths]');
  navItems.forEach(function(item) {
    var paths = item.getAttribute('data-paths').split(',');
    var match = paths.some(function(p) {
      p = p.trim().replace(/\/?$/, '');
      return p === path || p === '' && (path === '' || path === '/');
    });
    if (match) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

/* ---- Init ---- */
function pfSharedInit() {
  pfInitAccountMenu();
  pfInitNav();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pfSharedInit);
} else {
  pfSharedInit();
}
