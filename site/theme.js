const key = 'stillmotion-theme';
const choices = ['system', 'light', 'dark'];
const root = document.documentElement;
try {
  const saved = localStorage.getItem(key);
  if (choices.includes(saved)) root.dataset.theme = saved;
} catch {
  // The system preference remains available when storage is disabled.
}

document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('theme');
  select.value = root.dataset.theme || 'system';
  select.addEventListener('change', () => {
    root.dataset.theme = select.value;
    try {
      localStorage.setItem(key, select.value);
    } catch {
      // The current page still honors the manual selection.
    }
  });
});
