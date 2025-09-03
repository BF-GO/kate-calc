chrome.action.onClicked.addListener(async (tab) => {
	if (!tab?.id) return;
	try {
		await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_KATE_PANEL' });
	} catch {}
});
