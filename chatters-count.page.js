(() => {
'use strict';

// ============ 配置常數 ============
const CONFIG = {
	ANIMATION_DURATION: 2000,
	UPDATE_INTERVAL: 30000,
	PAGE_CHECK_INTERVAL: 3000,
	ROUTE_DEBOUNCE_MS: 400,
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
const TWITCH_GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const BRIDGE_REQUEST = 'tsn-chatters-request';
const BRIDGE_RESPONSE = 'tsn-chatters-response';
const BRIDGE_TIMEOUT_MS = 12000;

const api = {
	fetchChattersCount: async (channel) => {
		const errors = [];

		for (const fetcher of [api.fetchViaGql, api.fetchViaExtension, api.fetchViaApollo]) {
			try {
				const count = await fetcher(channel);
				if (count != null && !Number.isNaN(Number(count))) {
					return utils.formatNumber(count);
				}
			} catch (err) {
				errors.push(err);
			}
		}

		if (errors.length) {
			throw errors[0];
		}

		return 'N/A';
	},

	fetchViaGql: async (channel) => {
		const login = String(channel || '').trim().toLowerCase();
		if (!login) {
			throw new Error('Invalid channel');
		}

		const response = await fetch('https://gql.twitch.tv/gql', {
			method: 'POST',
			headers: {
				'Client-ID': TWITCH_GQL_CLIENT_ID,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				operationName: 'GetChannelChattersCount',
				variables: { name: login },
				query:
					'query GetChannelChattersCount($name: String!) {\n' +
					'  channel(name: $name) {\n' +
					'    chatters {\n' +
					'      count\n' +
					'    }\n' +
					'  }\n' +
					'}'
			})
		});

		if (!response.ok) {
			throw new Error(`GQL HTTP ${response.status}`);
		}

		const json = await response.json();
		if (Array.isArray(json?.errors) && json.errors.length > 0) {
			throw new Error(json.errors[0]?.message || 'GQL error');
		}

		const count = json?.data?.channel?.chatters?.count;
		if (count == null || Number.isNaN(Number(count))) {
			throw new Error('Chatters count unavailable');
		}

		return Number(count);
	},

	fetchViaExtension: (channel) => new Promise((resolve, reject) => {
		const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const MSG_SOURCE_PAGE = 'tsn-chatters-page';
		const MSG_SOURCE_CONTENT = 'tsn-chatters-content';
		let settled = false;

		const onResponse = (event) => {
			if (event.source !== window || !event.data) return;
			if (event.data.source !== MSG_SOURCE_CONTENT) return;
			if (event.data.type !== BRIDGE_RESPONSE) return;
			if (event.data.requestId !== requestId) return;

			window.removeEventListener('message', onResponse);
			if (settled) return;
			settled = true;
			clearTimeout(timer);

			if (event.data.error) {
				reject(new Error(event.data.error));
				return;
			}

			const value = event.data.count;
			if (value == null || Number.isNaN(Number(value))) {
				reject(new Error('Chatters count unavailable'));
				return;
			}

			resolve(Number(value));
		};

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			window.removeEventListener('message', onResponse);
			reject(new Error('Chatters fetch timeout'));
		}, BRIDGE_TIMEOUT_MS);

		window.addEventListener('message', onResponse);
		window.postMessage(
			{
				source: MSG_SOURCE_PAGE,
				type: BRIDGE_REQUEST,
				requestId,
				channel
			},
			'*'
		);
	}),

	fetchViaApollo: async (channel) => {
		const query = api.buildQuery();
		const login = String(channel || '').trim().toLowerCase();
		const response = await api.executeQuery(query, { name: login });
		const count = response?.data?.channel?.chatters?.count;
		if (count == null || Number.isNaN(Number(count))) {
			throw new Error('Chatters count unavailable');
		}
		return Number(count);
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
		try {
			return await client.query({ query, variables });
		} catch (err) {
			invalidateApolloClient();
			throw err;
		}
	},
};

let cachedApolloClient = null;
let routeDebounceTimer = null;

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
		invalidateApolloClient();

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
		if (document.hidden) return;

		counterActions.refreshAll();
		state.updateTimer = setInterval(() => {
			if (!document.hidden) {
				counterActions.refreshAll();
			}
		}, CONFIG.UPDATE_INTERVAL);
	},

	schedulePageCheck: () => {
		if (routeDebounceTimer) {
			clearTimeout(routeDebounceTimer);
		}
		routeDebounceTimer = setTimeout(() => {
			routeDebounceTimer = null;
			router.handlePageChange();
		}, CONFIG.ROUTE_DEBOUNCE_MS);
	},
};

// ============ Apollo Client 獲取 ============
function searchReactChildren(node, predicate, maxDepth = 30, depth = 0) {
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

function invalidateApolloClient() {
	cachedApolloClient = null;
}

function getApolloClient() {
	if (cachedApolloClient) {
		return cachedApolloClient;
	}

	try {
		const rootEl = document.getElementById('root');
		const reactRoot = getReactRoot(rootEl);
		const startNode = reactRoot?._internalRoot?.current ?? reactRoot?.current ?? reactRoot;
		const node = searchReactChildren(startNode, (n) => {
			const props = n?.memoizedProps || n?.pendingProps;
			const client = props?.value?.client || props?.client;
			return !!(client?.query);
		});

		if (node) {
			const props = node.memoizedProps || node.pendingProps;
			cachedApolloClient = props?.value?.client || props?.client || null;
		}
	} catch (_) {
		cachedApolloClient = null;
	}

	return cachedApolloClient;
}

// ============ 初始化 ============
setInterval(() => {
	if (!document.hidden) {
		router.schedulePageCheck();
	}
}, CONFIG.PAGE_CHECK_INTERVAL);

document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		router.schedulePageCheck();
	}
});

})();


