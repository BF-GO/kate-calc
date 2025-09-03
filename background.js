chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'toggle_kate_panel',
		title: 'Näytä/piilota Kate-laskin',
		contexts: ['all'],
	});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === 'toggle_kate_panel' && tab?.id) {
		chrome.tabs
			.sendMessage(tab.id, { type: 'TOGGLE_KATE_PANEL' })
			.catch(() => {});
	}
});

chrome.action.onClicked.addListener(async (tab) => {
	if (tab?.id) {
		try {
			await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_KATE_PANEL' });
		} catch (e) {
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ['content.js'],
			});
			await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_KATE_PANEL' });
		}
	}
});

chrome.commands.onCommand.addListener(async (command, tab) => {
	if (command === 'toggle-calculator' && tab?.id) {
		try {
			await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_KATE_PANEL' });
		} catch {
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ['content.js'],
			});
			await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_KATE_PANEL' });
		}
	}
});
