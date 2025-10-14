(() => {
'use strict';

// ============ 配置常數 ============
const CONFIG = {
	ANIMATION_DURATION: 2000,
	UPDATE_INTERVAL: 30000,
	PAGE_CHECK_INTERVAL: 1500,
	CARD_DELAY: 600,
	CLICK_FEEDBACK_DURATION: 250,
};

const SELECTORS = {
	viewerCount: 'main [data-a-target="animated-channel-viewers-count"]',
	chatHeader: 'h4[data-test-selector="chat-room-header-label"]',
	ffzViewer: 'main .ffz--meta-tray [data-key="viewers"]',
	previewCard: 'a[data-a-target="preview-card-image-link"]',
	cardStats: 'div.tw-media-card-stat',
};

const EXCLUDED_PATHS = ['videos', 'settings', 'subscriptions', 'inventory', 'wallet', 'privacy', 'turbo', 'downloads', 'p', 'annual-recap'];

// ============ 狀態管理 ============
const state = {
	channel: '',
	updateTimer: null,
	isRefreshing: false,
	cachedCount: '⏳',
	counters: {
		main: null,
		theatre: null,
		chat: null,
		ffz: null,
	},
};

// ============ 工具函數 ============
const utils = {
	formatNumber: (num) => new Intl.NumberFormat('en-US').format(num),

	parseFormattedNumber: (str) => parseInt(str.replace(/[^\d]/g, ''), 10),

	extractChannelFromURL: () => {
		const segments = location.pathname.split('/').filter(Boolean);
		if (!segments.length) return null;

		const first = segments[0];
		if (EXCLUDED_PATHS.includes(first)) return null;

		return first === 'popout' ? segments[1] : first;
	},

	isDirectoryPage: () => {
		const path = location.pathname;
		return path === '/' || path.startsWith('/directory');
	},
};

// ============ 計數器元素創建 ============
const counterFactory = {
	createBase: (id) => {
		const el = document.createElement('span');

		el.id = id;
		el.className = 'twitch-chatters-counter';
		el.textContent = `(${state.cachedCount})`;
		el.title = 'refresh';

		Object.assign(el.style, {
			color: '#ff8280',
			fontSize: '1.3rem',
			fontWeight: '600',
			marginLeft: '0.5rem',
			cursor: 'pointer',
			transition: 'color 0.2s ease',
		});

		el.addEventListener('click', () => counterActions.handleManualRefresh(el));

		return el;
	},

	attachToViewer: () => {
		if (state.counters.main) return;

		const parent = document.querySelector(SELECTORS.viewerCount)?.parentElement;
		if (!parent) return;

		state.counters.main = counterFactory.createBase('chatters-main');
		parent.appendChild(state.counters.main);
	},

	attachToTheatre: () => {
		if (state.counters.theatre) return;

		const parent = document.querySelector(SELECTORS.theatreInfo);
		if (!parent) return;

		state.counters.theatre = counterFactory.createBase('chatters-theatre');
		parent.appendChild(state.counters.theatre);
	},

	attachToChat: () => {
		if (state.counters.chat) return;

		const header = document.querySelector(SELECTORS.chatHeader);
		if (!header) return;

		state.counters.chat = counterFactory.createBase('chatters-chat');
		state.counters.chat.style.marginLeft = '0.3rem';
		header.parentElement.appendChild(state.counters.chat);
	},

	attachToFFZ: () => {
		if (state.counters.ffz) return;

		setTimeout(() => {
			const parent = document.querySelector(SELECTORS.ffzViewer);
			if (!parent || state.counters.ffz) return;

			state.counters.ffz = counterFactory.createBase('chatters-ffz');
			state.counters.ffz.style.order = '1';
			parent.appendChild(state.counters.ffz);
		}, CONFIG.CARD_DELAY);
	},
};

// ============ 動畫系統 ============
const animator = {
	animate: (element, from, to, formattedValue) => {
		const fps = 60;
		const frames = Math.ceil(CONFIG.ANIMATION_DURATION / (1000 / fps));
		const delta = (to - from) / frames;
		let frame = 0;

		const tick = () => {
			if (frame >= frames) {
				element.textContent = `(${formattedValue})`;
				return;
			}

			const current = Math.round(from + delta * frame);
			element.textContent = `(${utils.formatNumber(current)})`;
			frame++;
			requestAnimationFrame(tick);
		};

		tick();
	},

	updateCounter: (element, newValue) => {
		if (!element) return;

		const currentText = element.textContent.slice(1, -1);
		const oldNum = utils.parseFormattedNumber(currentText);
		const newNum = utils.parseFormattedNumber(newValue);

		if (isNaN(oldNum) || isNaN(newNum)) {
			element.textContent = `(${newValue})`;
		} else {
			animator.animate(element, oldNum, newNum, newValue);
		}
	},
};

// ============ 計數器操作 ============
const counterActions = {
	refreshAll: async () => {
		if (state.isRefreshing || !state.channel) return;
		state.isRefreshing = true;

		try {
			const count = await api.fetchChattersCount(state.channel);
			state.cachedCount = count;

			Object.values(state.counters).forEach(el => {
				if (el) animator.updateCounter(el, count);
			});
		} catch (err) {
			console.warn('[Chatters Counter] Update failed:', err);
		} finally {
			state.isRefreshing = false;
		}
	},

	handleManualRefresh: async (element) => {
		if (state.isRefreshing) return;

		const original = element.style.color;
		element.style.color = 'rgba(255, 255, 255, 0.7)';

		await counterActions.refreshAll();

		setTimeout(() => {
			element.style.color = original;
		}, CONFIG.CLICK_FEEDBACK_DURATION);
	},
};

// ============ 預覽卡片處理 ============
const cardHandler = {
	processCards: () => {
		const cards = document.querySelectorAll(SELECTORS.previewCard);
		cards.forEach(card => cardHandler.addCounterToCard(card));
	},

	addCounterToCard: async (card) => {
		const statsEl = card.querySelector(SELECTORS.cardStats);
		if (!statsEl || card.dataset.chattersProcessed) return;

		card.dataset.chattersProcessed = 'true';

		const href = card.getAttribute('href');
		if (!href || href.startsWith('/videos')) return;

		const channel = href.slice(1);
		if (!channel) return;

		const badge = document.createElement('span');
		badge.style.paddingLeft = '0.5rem';
		badge.style.color = '#ff8280';
		badge.textContent = '(⏳)';
		statsEl.appendChild(badge);

		try {
			const count = await api.fetchChattersCount(channel);
			badge.textContent = `(${count})`;
		} catch {
			badge.textContent = '(N/A)';
		}
	},
};

// ============ API 層 ============
const api = {
	fetchChattersCount: async (channel) => {
		const query = api.buildQuery();
		const response = await api.executeQuery(query, { name: channel });

		const count = response?.data?.channel?.chatters?.count;
		return (count != null && !isNaN(count))
			? utils.formatNumber(count)
			: 'N/A';
	},

	buildQuery: () => ({
		kind: 'Document',
		definitions: [{
			kind: 'OperationDefinition',
			operation: 'query',
			name: { kind: 'Name', value: 'GetChannelChattersCount' },
			variableDefinitions: [{
				kind: 'VariableDefinition',
				variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
				type: {
					kind: 'NonNullType',
					type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } }
				},
				directives: [],
			}],
			directives: [],
			selectionSet: {
				kind: 'SelectionSet',
				selections: [{
					kind: 'Field',
					name: { kind: 'Name', value: 'channel' },
					arguments: [{
						kind: 'Argument',
						name: { kind: 'Name', value: 'name' },
						value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } }
					}],
					directives: [],
					selectionSet: {
						kind: 'SelectionSet',
						selections: [{
							kind: 'Field',
							name: { kind: 'Name', value: 'chatters' },
							arguments: [],
							directives: [],
							selectionSet: {
								kind: 'SelectionSet',
								selections: [{
									kind: 'Field',
									name: { kind: 'Name', value: 'count' },
									arguments: [],
									directives: [],
								}]
							}
						}]
					}
				}]
			}
		}],
		loc: { start: 0, end: 191 }
	}),

	executeQuery: async (query, variables) => {
		const client = getApolloClient();
		if (!client) throw new Error('Apollo client not found');
		return client.query({ query, variables });
	},
};

// ============ 路由與定時器管理 ============
const router = {
	handlePageChange: () => {
		if (utils.isDirectoryPage()) {
			cardHandler.processCards();
			return;
		}

		const channel = utils.extractChannelFromURL();
		if (!channel) return;

		if (state.channel !== channel) {
			router.switchChannel(channel);
		}

		router.ensureCountersAttached();
		router.ensureTimerRunning();
	},

	switchChannel: (newChannel) => {
		state.channel = newChannel;
		state.cachedCount = '⏳';

		if (state.updateTimer) {
			clearInterval(state.updateTimer);
			state.updateTimer = null;
		}

		Object.keys(state.counters).forEach(key => {
			state.counters[key] = null;
		});
	},

	ensureCountersAttached: () => {
		counterFactory.attachToViewer();
		counterFactory.attachToTheatre();
		counterFactory.attachToChat();
		counterFactory.attachToFFZ();
	},

	ensureTimerRunning: () => {
		if (state.updateTimer) return;

		counterActions.refreshAll();
		state.updateTimer = setInterval(
			counterActions.refreshAll,
			CONFIG.UPDATE_INTERVAL
		);
	},
};

// ============ Apollo Client 獲取 ============
function searchReactChildren(node, predicate, maxDepth = 15, depth = 0) {
	try {
		if (predicate(node)) return node;
	} catch (_) {}

	if (!node || depth > maxDepth) return null;

	const {child, sibling} = node;
	if (child || sibling) {
		return (
			searchReactChildren(child, predicate, maxDepth, depth + 1) ||
			searchReactChildren(sibling, predicate, maxDepth, depth + 1)
		);
	}

	return null;
}

function getReactRoot(element) {
	for (const key in element) {
		if (key.startsWith('_reactRootContainer') || key.startsWith('__reactContainer$')) {
			return element[key];
		}
	}
	return null;
}

function getApolloClient() {
	let client;
	try {
		const reactRoot = getReactRoot(document.getElementById('root'));
		const node = searchReactChildren(
			reactRoot?._internalRoot?.current ?? reactRoot,
			(n) => n.pendingProps?.value?.client
		);
		client = node.pendingProps.value.client;
	} catch (_) {}
	return client;
}

// ============ 初始化 ============
setInterval(router.handlePageChange, CONFIG.PAGE_CHECK_INTERVAL);

})();


