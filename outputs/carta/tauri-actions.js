// Static HTML event attributes are blocked by Tauri's production CSP. Bind the
// existing controls here so the same interface works in both desktop and web.
(() => {
  const actions = {
    'cycleTheme()': () => window.cycleTheme?.(),
    'pickFile()': () => window.pickFile?.(),
    'closeReader()': () => window.closeReader?.(),
    'returnFromCitation()': () => window.returnFromCitation?.(),
    "togglePanel('notes')": () => window.togglePanel?.('notes'),
    "togglePanel('settings')": () => window.togglePanel?.('settings'),
    "togglePanel('assistant')": () => window.togglePanel?.('assistant'),
    'toggleAiPanel()': () => window.toggleAiPanel?.(),
    'closeAiPanel()': () => window.closeAiPanel?.(),
    'toggleAiDock()': () => window.toggleAiDock?.(),
    'toggleFullscreen()': () => window.toggleFullscreen?.(),
    'closePanel()': () => window.closePanel?.(),
    "showTab('notes')": () => window.showTab?.('notes'),
    "showTab('highlights')": () => window.showTab?.('highlights'),
    "showTab('settings')": () => window.showTab?.('settings'),
    "showTab('assistant')": () => window.showTab?.('assistant'),
    'newNote()': () => window.newNote?.(),
    'cancelNote()': () => window.cancelNote?.(),
    'saveNote()': () => window.saveNote?.(),
    "setTheme('light')": () => window.setTheme?.('light'),
    "setTheme('sepia')": () => window.setTheme?.('sepia'),
    "setTheme('dark')": () => window.setTheme?.('dark'),
    'setColumns(1)': () => window.setColumns?.(1),
    'setColumns(2)': () => window.setColumns?.(2),
    'removeSelectedHighlight()': () => window.removeSelectedHighlight?.(),
    'addSelectionNote()': () => window.addSelectionNote?.(),
    'downloadQwen()': () => window.downloadQwen?.(),
    'askAssistant()': () => window.askAssistant?.(),
    "askAssistant('spiega')": () => window.askAssistant?.('spiega'),
    "askAssistant('traduci')": () => window.askAssistant?.('traduci'),
    "askAssistant('idee')": () => window.askAssistant?.('idee'),
    "askAssistant('riassumi')": () => window.askAssistant?.('riassumi'),
    'newAssistantChat()': () => window.newAssistantChat?.(),
    'saveAssistantNote()': () => window.saveAssistantNote?.(),
  };

  // Bind every static control directly and remove its inline handler. This
  // keeps production WebViews working when their CSP blocks HTML event attrs.
  document.querySelectorAll('[onclick]').forEach((control) => {
    const action = actions[control.getAttribute('onclick')];
    if (!action) return;
    control.removeAttribute('onclick');
    control.addEventListener('click', (event) => {
      event.preventDefault();
      action();
    });
  });

  document.querySelectorAll('[oninput="setTypography()"]')
    .forEach((control) => {
      control.removeAttribute('oninput');
      control.addEventListener('input', () => window.setTypography?.());
    });
})();
