/**
 * Applies the saved theme before the page paints.
 *
 * This has to be a separate file loaded synchronously in <head>: the page's
 * own CSP forbids inline scripts, and without it a visitor who chose the dark
 * theme would get a white flash on every load.
 */
try {
  const theme = localStorage.getItem('dw_theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {
  /* storage blocked — fall back to the system preference, which the CSS handles */
}
