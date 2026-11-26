(() => {
    'use strict';

    let mapAccess = false;
    let mapAccessRequest = 0;
    async function loadMapAccess() {
        const version = ++mapAccessRequest;
        try {
            const result = await api('/api/maps/status');
            if (version !== mapAccessRequest) return;
            mapAccess = result.enabled || result.can_edit;
        } catch { if (version === mapAccessRequest) mapAccess = false; }
        if (version !== mapAccessRequest) return;
        renderNavigation();
        if (!mapAccess) {
            $('#food-map-frame').removeAttribute('src');
            if (state.view === 'map') showView('stalls');
        }
    }
    const state = Vue.shallowReactive({
        token: null,
        isAdmin: false,
        username: '',
        nickname: '',
        view: 'stalls',
        categories: [],
        canteens: [],
        canteensLoaded: false,
        ranking: [],
        rankingMode: 'all',
        categoryFilter: null,
        diningGroupFilter: '',
        diningCampusFilter: '',
        search: '',
        ratedOnly: false,
        foodType: [],
        sort: 'number',
        expandedCategories: new Set(),
        detailId: null,
        reopenDetailId: null,
        ratingScore: 5,
        admin: null,
        adminTab: 'categories',
        adminRatingFilter: 'all',
        adminRatingUserId: null
    });

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const AVATAR_GRADIENTS = [
        'linear-gradient(135deg, #0f766e, #2dd4bf)',
        'linear-gradient(135deg, #b45309, #f59e0b)',
        'linear-gradient(135deg, #4338ca, #818cf8)',
        'linear-gradient(135deg, #be123c, #fb7185)',
        'linear-gradient(135deg, #0369a1, #38bdf8)',
        'linear-gradient(135deg, #4d7c0f, #a3e635)'
    ];

    const CATEGORY_DOTS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#4d7c0f', '#7c3aed', '#c2410c'];

    const ACTION_LABELS = {
        revoke_admin: '撤销管理员权限',
        moderate_user: '调整用户权限',
        add_category: '新增食堂',
        delete_category: '删除食堂',
        add_canteen: '新增档口',
        delete_canteen: '删除档口',
        delete_rating: '删除评价',
        restore_rating: '恢复评价',
        set_rating_label: '添加评价标签',
        remove_rating_label: '移除评价标签',
        delete_report: '处理举报',
        backfill_history: '回填历史',
        archive_canteen: '下架档口',
        restore_canteen: '恢复档口'
    };

    const TYPE_LABELS = {
        user: '账号',
        category: '食堂',
        canteen: '档口',
        rating: '评价',
        report: '举报'
    };

    const numberFormat = new Intl.NumberFormat('zh-CN');
    const FOOD_TYPES = [
        ['rice', '米饭套餐', /米饭|盖饭|盖浇饭|盖码饭|炒饭|焖饭|卤肉饭|拌饭|烧腊饭|煲仔饭|套餐|快餐|烤肉饭|牛腩饭|双拼饭|咖喱饭|红烧饭|锅巴饭|炖肉饭|烤盘饭|牛肉饭|木桶饭|烧鸭饭|烤鸭饭|煎肉饭|捞饭|滑蛋饭|鸭腿饭|猪脚饭|叉烧饭|套饭|炸鸡饭|一元.*餐|黄焖鸡|自助午餐|自助餐|自选餐|把子肉/],
        ['noodles', '面食粉类', /面馆|拉面|拌面|炒面|汤面|刀削面|油泼面|裤带面|大碗面|凉面|米粉|米线|酸辣粉|螺蛳粉|凉皮|饺子|水饺|馄饨|云饺|蒸饺|鲜包|小[笼龙]包|包子|生煎|板面|担担面|扯面|牛肉面|川味面|重庆小面|爆肚面|羊杂面|牛杂面|羊肉面|猪肘面|竹升面|泡面|拌粉|花甲粉|渔粉|拉条|肠粉|粿条|热米皮|手工面|浇头面|炒细面|热干面|面夫子|面当家|焖面|削筋面|意大利面|牛肉粉|臊子面|乌冬面|打卤面|岐山面|肉酱面|泡馍|煮馍/],
        ['hotpot', '冒菜火锅', /冒菜|麻辣烫|麻辣拌|香锅|火锅|串串|钵钵鸡|馋冒阁|酥肉小锅/],
        ['stir-fry', '炒菜小炒', /小炒|炒菜|川菜|湘菜|粤菜|家常菜|自助餐|自选餐|点炒|辣椒炒肉|大盘鸡|口水鸡|水煮肉片|铁锅炖|中档菜/],
        ['snacks', '炸鸡汉堡与小吃', /炸鸡|汉堡|鸡排|烤肉串|炸串|肉夹馍|手抓饼|烤冷面|煎饼|烤肠|馅饼|花样饼|风味饼|掉渣饼|浙江桶饼|香葱大饼|里脊肉饼|包饼坊/],
        ['light', '轻食沙拉', /轻食|沙拉|水煮菜/],
        ['drinks', '饮品甜点', /奶茶|咖啡|甜品|冰城|冰淇淋|面包|蛋糕|果汁|酸奶|水吧|闲饮长安|茶瀑布/],
        ['breakfast', '早餐粥点', /早餐|早点|豆浆|豆饮|豆腐脑|粥道|粥记|营养粥|粥粥|小[笼龙]包|鲜包/],
        ['braised', '砂锅煲类与蒸菜', /砂锅|鸡公煲|黑鸭煲|石锅菜|小碗菜|小[碗蒸]蒸?菜|小蒸碗|蒸菜|瓦罐汤|热卤|匠心卤/],
        ['retail', '水果与便利', /水果|便利店|零食小屋/]
    ];

    let foodCatalog = null;

    function foodTypes() {
        return foodCatalog?.types ?? FOOD_TYPES.map(([id, name]) => ({id, name}));
    }

    function stallFoodTypes(stall) {
        const saved = foodCatalog?.overrides[stall.id];
        const ids = saved ?? FOOD_TYPES.filter(([, , pattern]) => pattern.test(stall.name)).map(([id]) => id);
        return foodTypes().filter(({id}) => ids.includes(id));
    }

    function matchesFoodType(stall, type) {
        return !type.length || stallFoodTypes(stall).some(({id}) => type.includes(id));
    }

    async function loadFoodTypes() {
        foodCatalog = await api('/api/food-types', {auth: false});
        updateFoodTypeOptions();
        renderCanteenGrid();
        renderRanking();
        if (state.isAdmin) {
            renderAdminFoodTypes();
            if (state.adminTab === 'canteens') renderAdminCanteens();
        }
    }

    function selectedFoodTypes(picker) {
        return picker.id === 'stall-food-type' ? state.foodType : foodPickerSelections.get(picker.id) || [];
    }

    const foodPickerSelections = new Map();

    function renderFoodPicker(picker) {
        const {h, render, Fragment} = Vue;
        const selected = selectedFoodTypes(picker);
        const count = selected.length;
        const label = picker.id === 'random-food-type' ? '推荐品类' : '餐饮分类';
        render(h(Fragment, [count ? `${label}（已选 ${count} 项）` : `${label}（全部）`]), $('summary', picker));
        render(h(Fragment, foodTypes().map(({id, name}) => h('button', {
            key: id, type: 'button', class: 'food-choice', value: id, 'aria-pressed': String(selected.includes(id)),
            onClick: () => setFoodPickerSelection(picker, selected.includes(id)
                ? selected.filter(value => value !== id) : [...selected, id])
        }, name))), $('.food-picker-options', picker));
    }

    function setFoodPickerSelection(picker, selection) {
        if (picker.id === 'stall-food-type') {
            state.foodType = selection;
            renderCanteenGrid();
            return;
        }
        foodPickerSelections.set(picker.id, selection);
        renderFoodPicker(picker);
        if (picker.id === 'ranking-food-type') renderRanking();
        else clearRandomFoodResult();
    }

    function updateFoodTypeOptions() {
        const valid = new Set(foodTypes().map(({id}) => id));
        state.foodType = state.foodType.filter(id => valid.has(id));
        for (const [id, selection] of foodPickerSelections) {
            foodPickerSelections.set(id, selection.filter(value => valid.has(value)));
        }
        for (const picker of $$('#stall-food-type, #ranking-food-type, #random-food-type')) renderFoodPicker(picker);
    }
    const beijingTimeFormat = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });

    function parseApiTime(value) {
        // Both backends store UTC; legacy responses omit the timezone suffix.
        let iso = String(value).trim().replace(' ', 'T');
        if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z';
        return new Date(iso);
    }

    function formatTime(value) {
        if (!value) return '';
        const date = parseApiTime(value);
        if (Number.isNaN(date.getTime())) return String(value);
        const parts = Object.fromEntries(beijingTimeFormat.formatToParts(date).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }

    let initialRouteReady = false;

    async function init() {
        Vue.watch(() => state.view, renderActiveView, {immediate: true, flush: 'sync'});
        Vue.watch(modalStack, renderModalLayers, {immediate: true, flush: 'sync'});
        restoreAuth();
        setAuthMode(false);

        if (window.location.protocol === 'file:') {
            showFileTip();
            return;
        }

        bindEvents();
        setInitialLoading();
        if (await useBackupIfNeeded()) return;
        await Promise.allSettled([loadCategories(), loadCanteens(), loadRanking(), loadFoodTypes(), loadMapAccess()]);
        window.addEventListener('popstate', applyRoute);
        window.addEventListener('hashchange', () => {
            if (window.location.hash !== activeRouteHash) applyRoute();
        });
        history.scrollRestoration = 'manual';
        initialRouteReady = true;
        await applyRoute();
        window.addEventListener('scroll', () => {
            if (scrollFrame) return;
            scrollFrame = requestAnimationFrame(() => {
                scrollFrame = 0;
                saveRouteState();
            });
        }, { passive: true });
        document.addEventListener('input', () => queueMicrotask(saveRouteState));
        document.addEventListener('change', () => queueMicrotask(saveRouteState));
        document.addEventListener('click', () => queueMicrotask(saveRouteState));
    }

    let activeRouteHash = '';
    let applyingRoute = false;
    let routeVersion = 0;
    let scrollFrame = 0;

    const viewPaths = { stalls: '/canteens', campus: '/campus', map: '/map', forum: '/forum', ranking: '/ranking', admin: '/admin' };

    function listHash() {
        const query = new URLSearchParams();
        if (state.view === 'stalls') {
            if (state.categoryFilter !== null) query.set('location', state.categoryFilter);
            if (state.diningGroupFilter) query.set('group', state.diningGroupFilter);
            if (state.diningCampusFilter) query.set('campus', state.diningCampusFilter);
            if (state.search) query.set('q', state.search);
            if (state.ratedOnly) query.set('rated', '1');
            for (const type of state.foodType) query.append('food', type);
            if (state.sort !== 'number') query.set('sort', state.sort);
        } else if (state.view === 'campus') {
            if (campusLocationFilter) query.set('location', campusLocationFilter);
            if (campusBuildingFilter) query.set('building', campusBuildingFilter);
            if ($('#campus-food-search').value) query.set('q', $('#campus-food-search').value);
        } else if (state.view === 'forum' && $('#forum-kind-filter').value) {
            query.set('kind', $('#forum-kind-filter').value);
        }
        return '#' + (viewPaths[state.view] || '/canteens') + (query.size ? '?' + query : '');
    }

    function routeSnapshot() {
        return {
            scroll: window.scrollY, expanded: Array.from(state.expandedCategories),
            forumRows: forumCachedRows, forumMore: !$('#forum-more').hidden
        };
    }

    function saveRouteState() {
        if (applyingRoute || !activeRouteHash || state.detailId || threadId ||
            /^#\/(stalls\/\d+|forum\/posts\/\d+|recommendations\/\d+)/.test(window.location.hash)) return;
        const hash = listHash();
        history.replaceState({ ...history.state, ui: routeSnapshot() }, '', hash);
        activeRouteHash = hash;
    }

    function openContentRoute(hash) {
        if (applyingRoute || window.location.hash === hash) return;
        saveRouteState();
        const parent = /^#\/(stalls\/\d+|forum\/posts\/\d+|recommendations\/\d+)/.test(window.location.hash)
            ? history.state?.parent : { hash: window.location.hash, ui: routeSnapshot() };
        history.pushState({ parent, routed: true }, '', hash);
        activeRouteHash = hash;
    }

    function dismissModal(modal) {
        if (modal?.id === 'photo-viewer-modal' && history.state?.photoViewer) {
            history.back();
            return;
        }
        const routed = modal?.id === 'detail-modal' && /^#\/stalls\/\d+$/.test(window.location.hash) ||
            modal?.id === 'forum-thread-modal' && /^#\/forum\/posts\/\d+$/.test(window.location.hash) ||
            modal?.id === 'recommendation-modal' && /^#\/recommendations\/\d+$/.test(window.location.hash);
        if (!routed) return closeModal(modal);
        if (history.state?.routed) history.back();
        else {
            const fallback = modal.id === 'forum-thread-modal' ? '#/forum' :
                state.canteens.find(stall => stall.id === state.detailId)?.category_kind === 'campus' ? '#/campus' : '#/canteens';
            history.replaceState(null, '', fallback);
            applyRoute();
        }
    }

    async function applyRoute() {
        if (activeRouteHash === window.location.hash) {
            const photoModal = $('#photo-viewer-modal');
            if (isModalOpen(photoModal) && !history.state?.photoViewer) {
                closeModal(photoModal);
                return;
            }
            if (history.state?.photoViewer && !isModalOpen(photoModal)) {
                showPhotoViewer(history.state.photoViewer.photos, history.state.photoViewer.index, false);
                return;
            }
        }
        const version = ++routeVersion;
        const requestedHash = window.location.hash;
        applyingRoute = true;
        activeRouteHash = window.location.hash;
        const url = new URL(window.location.hash.slice(1).replace(/^campus$/, '/campus').replace(/^forum$/, '/forum') || '/canteens', window.location.origin);
        const detail = /^\/stalls\/(\d+)$/.exec(url.pathname);
        const thread = /^\/forum\/posts\/(\d+)$/.exec(url.pathname);
        const recommendation = /^\/recommendations\/(\d+)$/.exec(url.pathname);
        const parent = (detail || thread || recommendation) ? history.state?.parent : null;
        const listUrl = parent ? new URL(parent.hash.slice(1), window.location.origin) : url;
        let view = Object.keys(viewPaths).find(name => viewPaths[name] === listUrl.pathname) || 'stalls';
        if (thread) view = 'forum';
        if (detail && !parent) view = state.canteens.find(stall => stall.id === Number(detail[1]))?.category_kind === 'campus' ? 'campus' : 'stalls';
        if (view === 'admin' && !state.isAdmin) view = 'stalls';
        if (view === 'map' && !mapAccess) view = 'stalls';
        const snapshot = parent?.ui || history.state?.ui;
        closeOpenModals();
        const location = Number(listUrl.searchParams.get('location'));
        state.categoryFilter = location > 0 && Number.isSafeInteger(location) ? location : null;
        state.diningGroupFilter = listUrl.searchParams.get('group') || '';
        state.diningCampusFilter = listUrl.searchParams.get('campus') || '';
        state.search = listUrl.searchParams.get('q') || '';
        state.ratedOnly = listUrl.searchParams.get('rated') === '1';
        state.foodType = [...new Set(listUrl.searchParams.getAll('food'))].filter(id => foodTypes().some(type => type.id === id));
        state.sort = ['number', 'score', 'reviews', 'name'].includes(listUrl.searchParams.get('sort')) ? listUrl.searchParams.get('sort') : 'number';
        state.expandedCategories = new Set(snapshot?.expanded || []);
        $('#search-input').value = state.search;
        campusLocationFilter = listUrl.searchParams.get('location') || '';
        campusBuildingFilter = listUrl.searchParams.get('building') || '';
        $('#campus-food-search').value = view === 'campus' ? listUrl.searchParams.get('q') || '' : '';
        $('#forum-kind-filter').value = ['recommend', 'avoid'].includes(listUrl.searchParams.get('kind')) ? listUrl.searchParams.get('kind') : '';
        showView(view);
        renderCategoryNav();
        renderCanteenGrid();
        if (view === 'forum') {
            if (snapshot?.forumRows?.length) {
                forumListRequest++;
                forumCachedRows = snapshot.forumRows;
                forumCursor = forumCachedRows.at(-1).id;
                renderForumRows();
                $('#forum-more').hidden = !snapshot.forumMore;
                $('#forum-more').disabled = false;
            } else await loadForum();
        }
        if (version !== routeVersion) return;
        if (detail) await openDetail(Number(detail[1]));
        if (thread) await openForumThread(Number(thread[1]));
        if (recommendation) await openRecommendation(Number(recommendation[1]));
        if (version !== routeVersion) return;
        if (window.location.hash !== requestedHash) return applyRoute();
        const canonical = detail ? '#/stalls/' + detail[1] : thread ? '#/forum/posts/' + thread[1] :
            recommendation ? '#/recommendations/' + recommendation[1] : listHash();
        history.replaceState(history.state, '', canonical);
        activeRouteHash = canonical;
        if (history.state?.photoViewer) {
            showPhotoViewer(history.state.photoViewer.photos, history.state.photoViewer.index, false);
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (version === routeVersion) {
            window.scrollTo({ top: snapshot?.scroll || 0, behavior: 'instant' });
            applyingRoute = false;
        }
    }

    async function useBackupIfNeeded() {
        const backup = 'https://duice-xuanfan.pages.dev/';
        const primary = window.CANTEEN_API_ORIGIN;
        if (window.location.hostname !== 'qilaotie.github.io' || !primary) return false;

        async function responds(url, timeoutMs) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
                return response.ok && (await response.json()).ok === true;
            } catch {
                return false;
            } finally {
                clearTimeout(timer);
            }
        }

        if (await responds(primary + '/api/health', 2000)) return false;
        if (await responds(backup + 'api/health', 4500)) {
            window.location.replace(backup);
            return true;
        }
        const notice = document.createElement('div');
        notice.className = 'file-tip';
        notice.textContent = '暂时无法连接食堂服务。';
        const link = document.createElement('a');
        link.href = backup;
        link.textContent = '尝试打开备用站';
        notice.append(link);
        $('.site-header').after(notice);
        return false;
    }

    /* ---------------- 基础工具 ---------------- */

    function formatNumber(value) {
        return numberFormat.format(Number(value) || 0);
    }

    function formatScore(value) {
        if (value === null || value === undefined || value === '') return '—';
        return Number(value).toFixed(1);
    }

    function starNodes(score) {
        const rounded = Math.round(Number(score) || 0);
        return [1, 2, 3, 4, 5].map(i => Vue.h('span', {key: i, class: {'is-empty': i > rounded}}, '★'));
    }

    function avatarGradient(id) {
        return AVATAR_GRADIENTS[Math.abs(Number(id) || 0) % AVATAR_GRADIENTS.length];
    }

    function initialOf(name) {
        const text = String(name || '').trim();
        if (!text) return '?';
        const match = text.match(/[\u4e00-\u9fa5A-Za-z]/);
        return match ? match[0] : text.slice(0, 1);
    }

    function showError(element, message) {
        if (!element) return;
        element.textContent = message;
        element.hidden = false;
    }

    function clearError(element) {
        if (!element) return;
        element.textContent = '';
        element.hidden = true;
    }

    function setBusy(button, busy) {
        if (!button) return;
        if (busy) {
            button.dataset.label = button.textContent;
            button.textContent = '处理中…';
            button.disabled = true;
        } else {
            button.textContent = button.dataset.label || button.textContent;
            button.disabled = false;
        }
    }

    const toastEntries = [];
    let nextToastId = 0;

    function renderToasts() {
        const stack = $('#toast-stack');
        if (!stack) return;
        const {h, render, Fragment} = Vue;
        render(h(Fragment, toastEntries.map(entry => h('div', {
            key: entry.id, class: ['toast', 'toast-' + entry.type, {'is-visible': entry.visible}]
        }, [
            h('span', {class: 'toast-icon'}, entry.type === 'error' ? '!' : entry.type === 'info' ? 'i' : '✓'),
            h('span', entry.message)
        ]))), stack);
    }

    function toast(message, type = 'success') {
        const entry = {id: ++nextToastId, message, type, visible: false};
        toastEntries.push(entry);
        renderToasts();
        requestAnimationFrame(() => {
            entry.visible = true;
            renderToasts();
        });
        window.setTimeout(() => {
            entry.visible = false;
            renderToasts();
            window.setTimeout(() => {
                toastEntries.splice(toastEntries.indexOf(entry), 1);
                renderToasts();
            }, 250);
        }, 3200);
    }

    function emptyState(title, text, icon = '🍽️') {
        const {h} = Vue;
        return h('div', {class: 'empty-state'}, [
            h('div', {class: 'empty-icon'}, icon), h('h3', title), h('p', text)
        ]);
    }

    function errorState(title, text) {
        const {h} = Vue;
        return h('div', {class: 'empty-state'}, [
            h('div', {class: 'empty-icon'}, '⚠️'), h('h3', title), h('p', text),
            actionButton('重新加载', 'retry', 'btn btn-soft btn-sm', {style: {marginTop: '14px'}})
        ]);
    }

    function getCategories() {
        if (state.categories.length) return state.categories;
        const map = new Map();
        state.canteens.forEach(canteen => {
            if (!map.has(canteen.category_id)) {
                map.set(canteen.category_id, {
                    id: canteen.category_id,
                    name: canteen.category_name || '未分类',
                    kind: canteen.category_kind
                });
            }
        });
        return Array.from(map.values());
    }

    /* ---------------- API ---------------- */

    async function api(path, options = {}) {
        const method = options.method || 'GET';
        const body = options.body;
        const useAuth = options.auth !== false;
        const headers = {};

        const multipart = body instanceof FormData;
        if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
        const authorization = state.token || localStorage.getItem('guestToken');
        if (useAuth && authorization) headers.Authorization = authorization;

        let response;
        try {
            response = await fetch((window.CANTEEN_API_ORIGIN || '') + path, {
                method,
                headers,
                body: multipart || body === undefined ? body : JSON.stringify(body)
            });
        } catch (error) {
            throw new Error('无法连接后端，请确认 Flask 服务正在运行');
        }

        const text = await response.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (error) {
                data = null;
            }
        }

        if (!response.ok) {
            const message = data && data.msg ? data.msg : `请求失败（${response.status}）`;
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    /* ---------------- 初始化与登录态 ---------------- */

    function restoreAuth() {
        state.token = localStorage.getItem('token');
        state.isAdmin = localStorage.getItem('isAdmin') === '1';
        state.username = localStorage.getItem('username') || '';
        state.nickname = localStorage.getItem('nickname') || '';
        updateAuthUI();
    }

    function updateAuthUI() {
        loadMapAccess();
        $('[data-admin-tab="administrators"]').hidden = !state.isAdmin;
        if (!state.isAdmin && state.adminTab === 'administrators') switchAdminTab('categories');
        renderHeaderActions();
        renderNavigation();
        if (!state.isAdmin && state.view === 'admin') {
            showView('stalls');
        }
    }

    function renderNavigation() {
        const {h, render, Fragment} = Vue;
        const items = [
            ['stalls', '食堂'], ['campus', '校内美食'], ['map', '地图', !mapAccess],
            ['forum', '校外论坛'], ['ranking', '排行榜'], ['admin', '管理后台', !state.isAdmin]
        ];
        render(h(Fragment, items.map(([id, label, hidden]) => h('button', {
            key: id, type: 'button', hidden, class: ['nav-link', {'is-active': state.view === id}], 'data-nav': id
        }, label))), $('.main-nav'));
    }

    function renderHeaderActions() {
        const {h, render, Fragment} = Vue;
        const loggedIn = Boolean(state.token);
        const name = state.nickname || state.username || '同学';
        render(h(Fragment, [
            h('button', {id: 'login-btn', type: 'button', class: 'btn btn-primary btn-sm', hidden: loggedIn}, '登录 / 注册'),
            h('div', {id: 'user-menu', class: 'user-menu', hidden: !loggedIn}, [
                h('button', {id: 'nickname-btn', type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': '编辑个人资料'}, [
                    h('span', {id: 'user-avatar', class: 'user-avatar'}, name.slice(0, 1)),
                    h('span', {id: 'user-name', class: 'user-name'}, name)
                ]),
                h('span', {id: 'admin-badge', class: 'badge badge-amber', hidden: !loggedIn || !state.isAdmin}, '管理员'),
                h('button', {id: 'logout-btn', type: 'button', class: 'btn btn-ghost btn-sm'}, '退出')
            ]),
            h('button', {id: 'my-reviews-btn', type: 'button', class: 'btn btn-ghost btn-sm',
                hidden: !loggedIn && !localStorage.getItem('guestToken')}, '我的')
        ]), $('.header-actions'));
    }

    function forceLogout() {
        state.adminRatingUserId = null;
        state.token = null;
        state.isAdmin = false;
        state.username = '';
        state.nickname = '';
        localStorage.removeItem('token');
        localStorage.removeItem('isAdmin');
        localStorage.removeItem('username');
        localStorage.removeItem('nickname');
        updateAuthUI();
    }

    function logout() {
        forceLogout();
        toast('已退出登录', 'info');
    }

    function openAuth() {
        const form = $('#auth-form');
        if (form) form.reset();
        setAuthMode(false);
        openModal($('#auth-modal'));
    }

    function setAuthMode(register) {
        const {h, render, Fragment} = Vue;
        const mode = register ? '注册' : '登录';
        const field = (label, input, hidden = false) => h('label', {class: 'field', hidden},
            [h('span', label), h('input', input)]);
        render(h(Fragment, [
            h('button', {type: 'button', class: 'icon-btn modal-close', 'data-close-modal': '', 'aria-label': '关闭'}, '×'),
            h('div', {class: 'modal-head'}, [h('span', {class: 'modal-icon'}, '食'), h('h2', {id: 'auth-title'}, mode)]),
            h('form', {id: 'auth-form', class: 'stack', onSubmit: submitAuth}, [
                field('账号', {type: 'text', id: 'auth-username', maxlength: 50, autocomplete: 'username', placeholder: '输入账号', required: true}),
                field('密码', {type: 'password', id: 'auth-password', maxlength: 100, autocomplete: register ? 'new-password' : 'current-password',
                    placeholder: '输入密码', required: true}),
                field('确认密码', {type: 'password', id: 'auth-confirm', maxlength: 100, autocomplete: 'new-password',
                    disabled: !register, required: register}, !register),
                field('昵称（可选）', {type: 'text', id: 'auth-nickname', maxlength: 24, autocomplete: 'nickname', disabled: !register}, !register),
                h('p', {class: 'form-error', id: 'auth-error', hidden: true}),
                h('button', {type: 'submit', class: 'btn btn-primary btn-block', id: 'auth-submit'}, mode)
            ]),
            h('button', {type: 'button', class: 'btn btn-ghost btn-block', id: 'auth-toggle',
                onClick: () => setAuthMode(!register)}, register ? '已有账号？登录' : '没有账号？注册')
        ]), $('#auth-content'));
        $('#auth-confirm').value = '';
        clearError($('#auth-error'));
    }

    async function submitAuth(event) {
        event.preventDefault();
        const username = $('#auth-username').value.trim();
        const password = $('#auth-password').value.trim();
        const errorElement = $('#auth-error');
        const button = $('#auth-submit');

        clearError(errorElement);
        if (!username || !password) {
            showError(errorElement, '账号和密码不能为空');
            return;
        }

        const register = !$('#auth-confirm').disabled;
        const confirmation = $('#auth-confirm').value.trim();
        if (register && confirmation !== password) {
            showError(errorElement, '两次输入的密码不一致');
            return;
        }

        setBusy(button, true);
        $('#auth-toggle').disabled = true;
        try {
            const data = await api(register ? '/api/register' : '/api/login', {
                method: 'POST',
                body: { username, password, confirm_password: confirmation, nickname: $('#auth-nickname').value },
                auth: false
            });

            state.token = 'Bearer ' + data.token;
            state.isAdmin = data.is_admin === true;
            state.username = username;
            state.nickname = data.nickname || '';
            localStorage.setItem('token', state.token);
            localStorage.setItem('isAdmin', state.isAdmin ? '1' : '0');
            localStorage.setItem('username', username);
            localStorage.setItem('nickname', state.nickname);

            closeModal($('#auth-modal'));
            updateAuthUI();
            toast('登录成功，欢迎回来');
        } catch (error) {
            showError(errorElement, error.message);
        } finally {
            setBusy(button, false);
            $('#auth-toggle').disabled = false;
        }
    }

    async function openNickname() {
        try {
            const data = await api('/api/profile');
            $('#nickname-input').value = data.nickname || '';
            $('#profile-taste').value = data.taste || '';
            $('#profile-birthplace').value = data.birthplace || '';
            showProfileAvatar(data.avatar_url);
            clearError($('#nickname-error'));
            openModal($('#nickname-modal'));
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    function avatarContent(url, name) {
        return photoNode(url, '', 'avatar-image') || Vue.createTextVNode(initialOf(name));
    }

    function showProfileAvatar(url) {
        Vue.render(avatarContent(url, state.nickname || '同学'), $('#profile-avatar-preview'));
        $('#profile-avatar-label').textContent = url ? '更换头像' : '选择头像';
        $('#profile-avatar-status').textContent = '';
        $('#profile-avatar-remove').hidden = !url;
    }

    async function changeProfileAvatar(photo) {
        const input = $('#profile-avatar-input');
        const remove = $('#profile-avatar-remove');
        const errorElement = $('#nickname-error');
        input.disabled = remove.disabled = true;
        clearError(errorElement);
        const status = $('#profile-avatar-status');
        status.textContent = photo ? '正在处理并上传头像…' : '正在移除头像…';
        try {
            let body;
            if (photo) {
                body = new FormData();
                body.append('photo', await preparePhoto(photo, 256, 50_000));
            }
            const data = await api('/api/profile/avatar', { method: photo ? 'PUT' : 'DELETE', body });
            showProfileAvatar(data.avatar_url);
            status.textContent = photo ? '头像已更新' : '头像已移除';
            refreshMyProfile(data.id);
            toast(photo ? '头像已更新' : '头像已移除');
        } catch (error) {
            status.textContent = '';
            showError(errorElement, error.message);
        } finally {
            input.value = '';
            input.disabled = remove.disabled = false;
        }
    }

    async function saveNickname(event) {
        event.preventDefault();
        const button = event.submitter;
        const errorElement = $('#nickname-error');
        clearError(errorElement);
        setBusy(button, true);
        try {
            const data = await api('/api/profile', {
                method: 'PATCH',
                body: {
                    nickname: $('#nickname-input').value,
                    taste: $('#profile-taste').value,
                    birthplace: $('#profile-birthplace').value
                }
            });
            state.nickname = data.nickname || '';
            localStorage.setItem('nickname', state.nickname);
            updateAuthUI();
            closeModal($('#nickname-modal'));
            refreshMyProfile(data.id);
            toast('资料已保存');
        } catch (error) {
            showError(errorElement, error.message);
        } finally {
            setBusy(button, false);
        }
    }

    let publicProfileRequest = 0;
    let ownProfileId = null;

    function refreshMyProfile(id = ownProfileId) {
        if (id && !$('#my-profile-panel').hidden && isModalOpen($('#my-reviews-modal'))) {
            return openPublicProfile(id, true);
        }
    }

    async function openPublicProfile(id, inline = false) {
        const {h, render, Fragment} = Vue;
        const requestId = ++publicProfileRequest;
        const modal = $('#public-profile-modal');
        const title = $('#public-profile-title');
        const content = $(inline ? '#my-profile-panel' : '#public-profile-content');
        if (!inline) title.textContent = '个人资料';
        render(Vue.createTextVNode('正在加载…'), content);
        if (!inline) openModal(modal);
        try {
            const profile = await api(`/api/users/${id}`);
            if (requestId !== publicProfileRequest) return;
            if (!inline) title.textContent = profile.nickname || '同学';
            if (inline && profile.is_self) ownProfileId = id;
            const nickname = profile.nickname || '同学';
            render(h(Fragment, [
                h('div', {class: 'profile-heading'}, [
                    h('span', {class: 'comment-avatar'}, [avatarContent(profile.avatar_url, nickname)]),
                    inline ? h('h3', nickname) : null,
                    profile.is_self ? h('button', {type: 'button', class: 'btn btn-soft btn-sm',
                        'data-action': 'edit-own-profile'}, '编辑资料') : null
                ]),
                h('p', '口味偏好：' + (profile.taste || '未填写')),
                h('p', '出生地：' + (profile.birthplace || '未填写')),
                h('p', ['获赞 ' + formatNumber(profile.likes_received) + ' ', h('small', '（公开评价）')]),
                state.token && !profile.is_self ? h('div', [h('button', {type: 'button', class: 'btn btn-soft btn-sm',
                    'data-action': 'toggle-follow', 'data-id': id, 'aria-pressed': String(profile.following === true)},
                profile.following ? '取消关注' : '关注')]) : null,
                h('div', {class: 'stack', 'data-author-recommendations': ''}),
                h('h3', '历史评价'),
                ...(profile.reviews.length ? profile.reviews.map(review => h('article', {key: review.id, class: 'detail-panel'}, [
                    h('button', {type: 'button', class: 'link-btn', 'data-action': 'profile-review-stall',
                        'data-id': review.canteen_id}, review.canteen_name),
                    h('p', {class: 'muted'}, formatTime(review.created_at) + ' · ' + review.score + ' 分'),
                    h('p', {class: 'comment-text'}, review.content || '（无文字评价）'),
                    review.dish_name ? h('p', {class: 'comment-text'}, review.dish_name) : null,
                    ...review.dish_scores.map(dish => h('p', {class: 'comment-text'}, dish.name + ' · ' + dish.score + ' 分'))
                ])) : [h('p', {class: 'muted'}, '暂无公开评价。')])
            ]), content);
            loadAuthorRecommendations(id, $('[data-author-recommendations]', content));
        } catch (error) {
            if (requestId === publicProfileRequest) render(Vue.createTextVNode(error.message), content);
        }
    }

    const recommendationApi = '/api/recommendations';

    function recommendationCards(lists, emptyText) {
        const {h} = Vue;
        return lists.length ? lists.map(list => h('article', {key: list.id, class: 'detail-panel'}, [
            h('button', {type: 'button', class: 'link-btn', 'data-action': 'recommendation-open', 'data-id': list.id}, list.title),
            list.is_public ? null : h('span', {class: 'badge badge-amber'}, '草稿'),
            list.description ? h('p', {class: 'comment-text'}, list.description) : null
        ])) : [h('p', {class: 'muted'}, emptyText)];
    }

    async function loadAuthorRecommendations(id, content) {
        try {
            const lists = await api(recommendationApi + '?author=' + id);
            if (lists.length) Vue.render(Vue.h(Vue.Fragment, [Vue.h('h3', '公开清单'), ...recommendationCards(lists, '')]), content);
        } catch (error) {
            content.textContent = error.message;
        }
    }

    async function loadMyRecommendations() {
        const {h, render, Fragment} = Vue;
        const content = $('#my-recommendations-panel');
        render(Vue.createTextVNode('正在加载…'), content);
        try {
            const [own, saved] = await Promise.all([api(recommendationApi), api(recommendationApi + '?saved=1')]);
            render(h(Fragment, [
                h('div', [h('button', {type: 'button', class: 'btn btn-primary btn-sm',
                    'data-action': 'recommendation-create'}, '新建清单')]),
                h('h3', '我创建的'), ...recommendationCards(own, '还没有创建清单。'),
                h('h3', '我收藏的'), ...recommendationCards(saved, '还没有收藏清单。')
            ]), content);
        } catch (error) {
            render(Vue.createTextVNode(error.message), content);
        }
    }

    function recommendationForm(list = {}) {
        const {h} = Vue;
        return h('form', {class: 'stack', 'data-recommendation-form': 'metadata', 'data-id': list.id || 0}, [
            h('label', ['标题', h('input', {name: 'title', required: true, maxlength: 60, value: list.title || ''})]),
            h('label', ['简介', h('textarea', {name: 'description', maxlength: 500, rows: 3, value: list.description || ''})]),
            h('label', ['可见范围', h('select', {name: 'visibility', value: list.is_public ? 'public' : 'draft'}, [
                h('option', {value: 'draft'}, '仅自己可见 · 草稿'),
                h('option', {value: 'public'}, '公开 · 可分享')
            ])]),
            h('div', [h('button', {type: 'submit', class: 'btn btn-primary btn-sm'}, list.id ? '保存修改' : '创建清单')])
        ]);
    }

    function actionButton(label, action, className, attrs = {}) {
        return Vue.h('button', {type: 'button', class: className, 'data-action': action, ...attrs}, label);
    }

    let recommendationRequest = 0;

    async function openRecommendation(id) {
        const {h, render, Fragment} = Vue;
        const version = ++recommendationRequest;
        const modal = $('#recommendation-modal');
        const content = $('#recommendation-content');
        closeOpenModals(modal);
        openContentRoute('#/recommendations/' + id);
        $('#recommendation-title').textContent = '美食清单';
        render(Vue.createTextVNode('正在加载…'), content);
        openModal(modal);
        try {
            const list = await api(recommendationApi + '/' + id);
            if (version !== recommendationRequest) return;
            $('#recommendation-title').textContent = list.title;
            render(h(Fragment, [
                h('p', {class: 'muted'}, (list.nickname || '同学') + (list.is_public ? ' · 公开清单' : ' · 草稿')),
                list.description ? h('p', {class: 'comment-text'}, list.description) : null,
                h('div', {class: 'feedback-review-actions'}, [
                    list.is_public ? actionButton('复制清单链接', 'copy-content-link', 'btn btn-ghost btn-sm') : null,
                    list.is_public && !list.own ? actionButton(list.saved ? '取消收藏' : '收藏清单',
                        'recommendation-save', 'btn btn-soft btn-sm', {'data-id': id, 'aria-pressed': String(list.saved)}) : null
                ]),
                ...(list.items.length ? list.items.map(item => {
                    const itemAction = {'data-id': id, 'data-stall': item.stall_id};
                    return h('article', {key: item.stall_id, class: 'detail-panel stack'}, [
                        h('div', [
                            item.is_active ? actionButton(item.name, 'open-detail', 'link-btn', {'data-id': item.stall_id})
                                : h(Fragment, [h('strong', item.name || '档口已移除'), ' ', h('span', {class: 'badge badge-amber'}, '已下架')]),
                            h('p', {class: 'muted'}, item.category_name || '')
                        ]),
                        item.dishes.length ? h('p', '推荐菜品 · ' + item.dishes.join('、')) : null,
                        item.reason ? h('p', {class: 'comment-text'}, item.reason) : null,
                        list.own ? h('div', {class: 'feedback-review-actions'}, [
                            actionButton('移到其他清单', 'recommendation-move', 'btn btn-ghost btn-sm', itemAction),
                            actionButton('移出清单', 'recommendation-remove-item', 'btn btn-ghost btn-sm', itemAction)
                        ]) : null
                    ]);
                }) : [h('p', {class: 'muted'}, '还没有收录档口。')]),
                list.own ? h('details', [
                    h('summary', '编辑清单'), recommendationForm(list),
                    actionButton('复制为草稿', 'recommendation-copy', 'btn btn-ghost btn-sm', {'data-id': id}),
                    actionButton('删除清单', 'recommendation-delete', 'btn btn-danger btn-sm', {'data-id': id})
                ]) : null
            ]), content);
        } catch (error) {
            if (version === recommendationRequest) render(Vue.createTextVNode(error.message), content);
        }
    }

    async function addStallToRecommendation(stallId) {
        if (!state.token) return openAuth();
        if (!stallId) return;
        const {h, render} = Vue;
        const version = ++recommendationRequest;
        const content = $('#recommendation-content');
        $('#recommendation-title').textContent = '加入清单';
        render(Vue.createTextVNode('正在加载…'), content);
        openModal($('#recommendation-modal'));
        try {
            const [lists, stall] = await Promise.all([
                api(recommendationApi),
                state.detailData?.id === stallId ? state.detailData : api('/api/canteens/' + stallId)
            ]);
            if (version !== recommendationRequest) return;
            const checkbox = (name, value, text) => h('label', [h('input', {type: 'checkbox', name, value}), ' ' + text]);
            render(h('form', {class: 'stack', 'data-recommendation-form': 'stall', 'data-id': stall.id}, [
                h('strong', stall.name),
                lists.length ? h('fieldset', [
                    h('legend', '选择清单（可多选）'),
                    ...lists.map(list => h('div', {key: list.id},
                        [checkbox('list', list.id, list.title + (list.is_public ? '' : '（草稿）'))])),
                    checkbox('list', 'new', '新建草稿')
                ]) : h('input', {type: 'hidden', name: 'list', value: 'new'}),
                lists.length ? h('p', {class: 'muted'}, '选多份时，已有的档口会跳过。') : null,
                h('label', {'data-new-recommendation': '', hidden: Boolean(lists.length)}, [
                    '新清单标题', h('input', {name: 'title', maxlength: 60, disabled: Boolean(lists.length), required: !lists.length})
                ]),
                stall.dishes?.length ? h('fieldset', [
                    h('legend', '推荐菜品（可多选）'),
                    ...stall.dishes.map(dish => h('div', {key: dish.id}, [checkbox('dish', dish.id, dish.name)]))
                ]) : null,
                h('label', ['推荐理由（选填）', h('textarea', {name: 'reason', maxlength: 300, rows: 3})]),
                h('div', [h('button', {type: 'submit', class: 'btn btn-primary btn-sm'}, '保存档口')])
            ]), content);
        } catch (error) {
            if (version === recommendationRequest) render(Vue.createTextVNode(error.message), content);
        }
    }

    async function submitRecommendation(event) {
        const form = event.target.closest('[data-recommendation-form]');
        if (!form) return;
        event.preventDefault();
        const button = $('button[type="submit"]', form);
        const data = new FormData(form);
        const id = Number(form.dataset.id);
        setBusy(button, true);
        try {
            if (form.dataset.recommendationForm === 'metadata') {
                const result = await api(recommendationApi + (id ? '/' + id : ''), {
                    method: id ? 'PATCH' : 'POST',
                    body: {title: data.get('title'), description: data.get('description'), is_public: data.get('visibility') === 'public'}
                });
                if (form.isConnected && isModalOpen($('#recommendation-modal'))) await openRecommendation(id || result.id);
            } else if (form.dataset.recommendationForm === 'move') {
                await api(recommendationApi + '/' + id + '/move/' + form.dataset.stall, {
                    method: 'POST', body: {target_id: Number(data.get('target'))}
                });
                toast('档口已移到目标清单');
                if (form.isConnected) await openRecommendation(id);
            } else {
                const selected = data.getAll('list');
                const listIds = selected.filter(value => value !== 'new').map(Number);
                const dishIds = data.getAll('dish').map(Number);
                if (!selected.length) throw new Error('请至少选择一份清单');
                if (dishIds.length > 30) throw new Error('最多可选择 30 道菜');
                if (selected.includes('new')) {
                    const result = await api(recommendationApi, {method: 'POST', body: {title: data.get('title'), is_public: false}});
                    listIds.push(result.id);
                    const input = $('input[name="list"][value="new"]', form);
                    input.value = String(result.id);
                    if (input.type === 'checkbox') input.parentElement.lastChild.textContent = ' ' + data.get('title') + '（草稿）';
                    const title = $('[data-new-recommendation]', form);
                    title.hidden = true;
                    title.querySelector('input').disabled = true;
                }
                const fields = {dish_ids: dishIds, reason: data.get('reason')};
                if (listIds.length === 1) {
                    await api(recommendationApi + '/' + listIds[0] + '/items/' + id, {method: 'PUT', body: fields});
                    toast('档口已保存到清单');
                } else {
                    const result = await api(recommendationApi + '/items', {
                        method: 'POST', body: {...fields, stall_id: id, list_ids: listIds}
                    });
                    toast('已加入 ' + result.added + ' 份清单' + (result.skipped ? '，跳过 ' + result.skipped + ' 份已有档口的清单' : ''));
                }
                if (form.isConnected) closeModal($('#recommendation-modal'));
            }
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    async function changeRecommendation(action, id, button) {
        if (!state.token) return openAuth();
        const saving = action === 'recommendation-save';
        const removingItem = action === 'recommendation-remove-item';
        if (!saving && !window.confirm(removingItem ? '确定移出这个档口？' : '确定删除这份清单？')) return;
        const suffix = saving ? '/save' : removingItem ? '/items/' + Number(button.dataset.stall) : '';
        button.disabled = true;
        try {
            await api(recommendationApi + '/' + id + suffix, {
                method: saving && button.getAttribute('aria-pressed') === 'false' ? 'PUT' : 'DELETE'
            });
            if (window.location.hash !== '#/recommendations/' + id) return;
            if (saving || removingItem) await openRecommendation(id);
            else {
                toast('清单已删除');
                dismissModal($('#recommendation-modal'));
            }
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function moveRecommendationItem(id, stall, button) {
        button.disabled = true;
        try {
            const lists = (await api(recommendationApi)).filter(list => list.id !== id);
            if (!button.isConnected) return;
            if (!lists.length) return toast('请先创建另一份清单', 'info');
            const {h, render} = Vue;
            render(h('form', {class: 'stack', 'data-recommendation-form': 'move', 'data-id': id, 'data-stall': stall}, [
                h('label', ['目标清单', h('select', {name: 'target', required: true}, [
                    h('option', {value: ''}, '请选择'),
                    ...lists.map(list => h('option', {key: list.id, value: list.id},
                        list.title + (list.is_public ? '（公开）' : '（草稿）')))
                ])]),
                h('div', {class: 'feedback-review-actions'}, [
                    h('button', {type: 'submit', class: 'btn btn-primary btn-sm'}, '确认移动'),
                    actionButton('取消', 'recommendation-open', 'btn btn-ghost btn-sm', {'data-id': id})
                ])
            ]), $('#recommendation-content'));
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function copyRecommendation(id, button) {
        button.disabled = true;
        try {
            const copy = await api(recommendationApi + '/' + id + '/copy', {method: 'POST'});
            toast('已复制为草稿');
            if (button.isConnected && isModalOpen($('#recommendation-modal'))) await openRecommendation(copy.id);
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }


    let followDirection = 'following';
    let followRequest = 0;

    function selectMySection(section) {
        $('#my-reviews-list').hidden = section !== 'my-reviews';
        $('#my-following-panel').hidden = section !== 'my-following';
        $('#my-profile-panel').hidden = section !== 'my-public-profile';
        $('#my-recommendations-panel').hidden = section !== 'my-recommendations';
        $$('#my-social-actions button').forEach(button => {
            const active = button.dataset.action === section;
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('btn-soft', active);
            button.classList.toggle('btn-ghost', !active);
        });
    }

    async function loadFollowing(direction = followDirection) {
        const {h, render, Fragment} = Vue;
        followDirection = direction;
        const requestId = ++followRequest;
        const list = $('#my-following-list');
        $$('[data-action="follow-list"]').forEach(button => {
            const active = button.dataset.list === direction;
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('btn-soft', active);
            button.classList.toggle('btn-ghost', !active);
        });
        render(Vue.createTextVNode('正在加载…'), list);
        try {
            const users = await api('/api/my/' + direction);
            if (requestId !== followRequest) return;
            render(users.length ? h(Fragment, users.map(user => h('button', {
                key: user.id, type: 'button', class: 'btn btn-ghost follow-user',
                'data-action': 'open-public-profile', 'data-id': user.id
            }, [
                h('span', {class: 'comment-avatar', 'aria-hidden': 'true'}, [avatarContent(user.avatar_url, user.nickname || '同学')]),
                h('strong', user.nickname || '同学'), h('span', {'aria-hidden': 'true'}, '›')
            ]))) : h('p', {class: 'muted'}, direction === 'followers' ? '还没有人关注你。' : '还没有关注的人。'), list);
        } catch (error) {
            if (requestId === followRequest) render(Vue.createTextVNode(error.message), list);
        }
    }

    async function toggleFollow(id, button) {
        const method = button.getAttribute('aria-pressed') === 'true' ? 'DELETE' : 'PUT';
        button.disabled = true;
        try {
            const result = await api(`/api/users/${id}/follow`, {method});
            button.setAttribute('aria-pressed', String(result.following));
            button.textContent = result.following ? '取消关注' : '关注';
            if (!$('#my-following-panel').hidden && isModalOpen($('#my-reviews-modal'))) await loadFollowing();
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    /* ---------------- 数据加载 ---------------- */

    function setInitialLoading() {
        const grid = $('#canteen-grid');
        if (grid) {
            Vue.render(Vue.h(Vue.Fragment, Array.from({length: 4}, (_, key) =>
                Vue.h('div', {key, class: 'skeleton skeleton-section'}))), grid);
        }
        const nav = $('#category-nav');
        if (nav) {
            Vue.render(Vue.h(Vue.Fragment, Array.from({length: 4}, (_, key) =>
                Vue.h('div', {key, class: 'skeleton skeleton-line'}))), nav);
        }
        const subtitle = $('#list-subtitle');
        if (subtitle) subtitle.textContent = '正在加载档口…';
    }

    async function loadCategories() {
        try {
            const data = await api('/api/categories');
            state.categories = Array.isArray(data) ? data : [];
            const dining = $('#random-food-dining');
            const previousDining = dining.value;
            renderSelectOptions(dining, '全部食堂', diningGroups().map(({name}) => selectOption(name, name)));
            if (Array.from(dining.options).some(option => option.value === previousDining)) dining.value = previousDining;
            renderCategoryNav();
            if (state.view === 'ranking') renderRanking();
            renderCampusFood();
            if (state.canteensLoaded) renderHeroStats();
            if (!isModalOpen($('#rating-modal'))) fillRatingCategories();
            fillAdminCategorySelect();
        } catch (error) {
            const nav = $('#category-nav');
            if (nav) Vue.render(Vue.h('div', {class: 'admin-empty'}, '食堂加载失败'), nav);
            throw error;
        }
    }

    async function loadCanteens() {
        try {
            const data = await api('/api/canteens');
            state.canteens = Array.isArray(data) ? data : [];
            state.canteensLoaded = true;
            renderCanteenGrid();
            renderCategoryNav();
            renderCampusFood();
            renderHeroStats();
            if ($('#sidebar-total')) {
                $('#sidebar-total').textContent = `${formatNumber(diningStalls().length)} 个档口`;
            }
        } catch (error) {
            const grid = $('#canteen-grid');
            if (grid) Vue.render(errorState('档口加载失败', '请确认后端 Flask 正在运行，然后重试。'), grid);
            throw error;
        }
    }

    async function loadRanking() {
        try {
            const data = await api('/api/stalls/ranking');
            state.ranking = Array.isArray(data) ? data : [];
            renderRanking();
            renderHeroStats();
            renderCanteenGrid();
        } catch (error) {
            const podium = $('#podium');
            if (podium) Vue.render(errorState('排行榜加载失败', '请稍后重试。'), podium);
            const list = $('#ranking-list');
            if (list) Vue.render(null, list);
            const best = $('#category-best');
            if (best) Vue.render(null, best);
            throw error;
        }
    }

    async function refreshAll() {
        await Promise.all([loadCategories(), loadCanteens(), loadRanking()]);
        if (state.isAdmin) await loadAdminAll();
    }

    /* ---------------- 首页 / 档口列表 ---------------- */

    function renderHeroStats() {
        const {h, render, Fragment} = Vue;
        const container = $('#hero-stats');
        if (!container) return;

        const ratingRows = state.ranking.filter(row => row.avg_score !== null && row.avg_score !== undefined);
        const totalRatings = ratingRows.reduce((sum, row) => sum + (Number(row.rating_count) || 0), 0);
        render(h(Fragment, [
            ['食堂', diningGroups().length], ['档口', diningStalls().length], ['条评价', totalRatings]
        ].map(([label, count]) => h('div', {key: label, class: 'stat-card'}, [
            h('strong', formatNumber(count)), h('span', label)
        ]))), container);
    }

    function renderCategoryNav() {
        const nav = $('#category-nav');
        if (!nav) return;

        const categories = getCategories().filter(category => category.kind !== 'campus');
        const stalls = diningStalls();
        const counts = new Map();
        stalls.forEach(canteen => {
            const key = String(canteen.category_id);
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        if (state.categoryFilter !== null && !categories.some(category => String(category.id) === String(state.categoryFilter))) {
            state.categoryFilter = null;
        }

        const groups = diningGroups();
        if (!groups.some(group => group.name === state.diningGroupFilter)) state.diningGroupFilter = '';
        if (!groups.some(group => group.campus === state.diningCampusFilter)) state.diningCampusFilter = '';
        const campuses = [...new Set(groups.map(group => group.campus))];
        nav.classList.add('dining-directory');
        const {h, render, Fragment} = Vue;
        const floorCount = floor => counts.get(String(floor.id)) || 0;
        const groupCount = group => group.floors.reduce((sum, floor) => sum + floorCount(floor), 0);
        render(h(Fragment, [
            directoryButton('全部档口', stalls.length,
                state.categoryFilter === null && !state.diningGroupFilter && !state.diningCampusFilter, {'data-category': 'all'}),
            ...campuses.map(campus => {
                const campusGroups = groups.filter(group => group.campus === campus);
                return h('div', {key: campus, class: 'directory-campus'}, [
                    directoryButton(campus, campusGroups.reduce((sum, group) => sum + groupCount(group), 0),
                        state.diningCampusFilter === campus, {'data-dining-campus': campus}, null, 'campus-directory-heading'),
                    ...campusGroups.map((group, index) => h('div', {key: group.name, class: 'dining-directory-group'}, [
                        directoryButton(group.name, groupCount(group), state.diningGroupFilter === group.name,
                            {'data-dining-group': group.name}, CATEGORY_DOTS[index % CATEGORY_DOTS.length]),
                        h('div', {class: 'dining-floor-links'}, group.floors.map(floor =>
                            directoryButton(floor.label, floorCount(floor), state.categoryFilter === floor.id,
                                {key: floor.id, 'data-category': floor.id})))
                    ]))
                ]);
            })
        ]), nav);
    }

    function directoryButton(name, count, selected, attrs, dot, extraClass) {
        const {h} = Vue;
        return h('button', {
            type: 'button', class: ['category-btn', extraClass, {'is-active': selected}],
            'aria-pressed': String(selected), ...attrs
        }, [
            dot ? h('span', {class: 'cat-dot', style: {background: dot}}) : null,
            h('span', {class: 'cat-name'}, name), h('span', {class: 'cat-count'}, count)
        ]);
    }

    function diningGroups() {
        const groups = new Map();
        for (const category of getCategories().filter(item => item.kind !== 'campus')) {
            const match = /^(.*?)([一二三四五六七八九十\d]+)[层楼](?:餐厅)?$/.exec(category.name);
            const special = category.id === 14;
            const name = special ? '东区' : match ? match[1] : category.name;
            const label = special ? '二楼 · ' + category.name : match ? match[2] + '楼' : category.name;
            const campus = [1,2,3,4,5,6,7,8].includes(category.id) || ['海棠','丁香','竹园'].includes(name)
                ? '南校区' : [11,12,13,14].includes(category.id) || ['东区','西区'].includes(name) ? '北校区' : '其他';
            if (!groups.has(name)) groups.set(name, { name, campus, floors: [] });
            groups.get(name).floors.push({ ...category, label });
        }
        return Array.from(groups.values());
    }

    function diningStalls() {
        return state.canteens.filter(stall => stall.category_kind !== 'campus');
    }

    function recommendRandomFood() {
        const panel = $('#random-food-result');
        const detail = $('button', panel);
        const selected = selectedFoodTypes($('#random-food-type'));
        const dining = $('#random-food-dining').value;
        const group = diningGroups().find(item => item.name === dining);
        const floors = group ? new Set(group.floors.map(floor => floor.id)) : null;
        const candidates = diningStalls().filter(stall => {
            if (floors && !floors.has(stall.category_id)) return false;
            const types = stallFoodTypes(stall);
            return stall.is_active !== false && (selected.length
                ? types.some(({id}) => selected.includes(id))
                : !(types.length === 1 && types[0].id === 'retail'));
        });
        if (!candidates.length) {
            const message = !state.canteensLoaded ? '档口还没加载好，请稍后再试'
                : selected.length || dining ? '当前条件下暂无可推荐档口，试试换个食堂或品类' : '暂时没有可推荐的档口';
            toast(message, 'error');
            return;
        }
        const alternatives = candidates.filter(stall => String(stall.id) !== detail.dataset.id);
        const pool = alternatives.length ? alternatives : candidates;
        const stall = pool[Math.floor(Math.random() * pool.length)];
        const {h, render, Fragment} = Vue;
        render(h(Fragment, [
            h('strong', stall.name),
            h('span', [stall.category_name || '位置待补充',
                stall.score == null ? '暂无评分' : '评分 ' + formatScore(stall.score)].join(' · '))
        ]), $('#random-food-copy'));
        render(photoNode(stall.photo_url, '', 'stall-thumbnail'), $('#random-food-photo'));
        detail.dataset.id = String(stall.id);
        panel.hidden = false;
        $('#random-food-button').textContent = '换一个';
    }

    function clearRandomFoodResult() {
        $('#random-food-result').hidden = true;
        $('#random-food-button').textContent = '随机推荐';
    }

    let campusLocationFilter = '';
    let campusBuildingFilter = '';

    function campusBuildingName(location) {
        return ['老综合楼', '新综合楼', '丁香综合楼'][Math.floor((location.id - 100001) / 2)] || location.name;
    }

    function renderCampusFood() {
        const {h, render, Fragment} = Vue;
        const list = $('#campus-food-list');
        const buildings = getCategories().filter(category => category.kind === 'campus');
        if (!buildings.length) {
            render(Vue.createTextVNode('正在加载校内楼宇…'), list);
            return;
        }
        const keyword = $('#campus-food-search').value.trim().toLowerCase();
        if (!buildings.some(location => String(location.id) === campusLocationFilter)) campusLocationFilter = '';
        if (!buildings.some(location => campusBuildingName(location) === campusBuildingFilter)) campusBuildingFilter = '';
        const entriesByLocation = new Map(buildings.map(location => [location.id, []]));
        for (const stall of state.canteens) entriesByLocation.get(stall.category_id)?.push(stall);
        const total = Array.from(entriesByLocation.values()).reduce((sum, entries) => sum + entries.length, 0);
        const directory = buildings.map(location => ({ ...location, count: entriesByLocation.get(location.id).length }));
        const directoryGroups = [...new Set(buildings.map(campusBuildingName))];
        const floorName = (location, building) => location.name.startsWith(building) ? location.name.slice(building.length) : location.name;
        const directoryNode = $('#campus-food-directory');
        directoryNode.classList.add('dining-directory');
        render(h(Fragment, [
            directoryButton('全部地点', total, !campusLocationFilter && !campusBuildingFilter, {'data-campus-location': ''}),
            ...directoryGroups.map(name => {
                const locations = directory.filter(location => campusBuildingName(location) === name);
                return h('div', {key: name, class: 'dining-directory-group'}, [
                    directoryButton(name, locations.reduce((sum, location) => sum + location.count, 0),
                        campusBuildingFilter === name, {'data-campus-building': name}),
                    locations.length > 1 ? h('div', {class: 'dining-floor-links'}, locations.map((location, index) =>
                        directoryButton(floorName(location, name), location.count, String(location.id) === campusLocationFilter,
                            {key: location.id, 'data-campus-location': location.id},
                            index ? CATEGORY_DOTS[(index - 1) % CATEGORY_DOTS.length] : '#0f766e'))) : null
                ]);
            })
        ]), directoryNode);

        const grouped = new Map();
        let resultCount = 0;
        for (const location of buildings) {
            if (campusLocationFilter && String(location.id) !== campusLocationFilter) continue;
            const name = campusBuildingName(location);
            if (campusBuildingFilter && campusBuildingFilter !== name) continue;
            const entries = entriesByLocation.get(location.id).filter(stall =>
                `${stall.name} ${location.name} ${name}`.toLowerCase().includes(keyword));
            if (keyword && !entries.length) continue;
            resultCount += entries.length;
            if (!grouped.has(name)) grouped.set(name, []);
            grouped.get(name).push({ location, entries });
        }
        $('#campus-food-count').textContent = `${formatNumber(resultCount)} 家`;
        if (!grouped.size) {
            render(emptyState('没有找到相关美食', '试试其他关键词，或切回全部地点。'), list);
            return;
        }
        render(h(Fragment, [...grouped].map(([building, locations]) => h('section', {
            key: building, class: 'detail-panel stack'
        }, [
            h('div', {class: 'panel-head'}, [h('h2', building)]),
            ...locations.map(({location, entries}) => h('div', {key: location.id}, [
                h('div', {class: 'panel-head'}, [
                    h('h3', floorName(location, building) || '全部美食'),
                    h('span', {class: 'muted'}, entries.length + ' 家')
                ]),
                ...(entries.length ? entries.map(stall => h('div', {key: stall.id, class: 'admin-row'}, [
                    h('div', {class: 'admin-row-main'}, [
                        h('strong', stall.name),
                        h('p', stall.score == null ? '暂无评分' : stall.score + ' / 5')
                    ]),
                    h('button', {type: 'button', class: 'btn btn-soft btn-sm', 'data-action': 'open-detail',
                        'data-id': Number(stall.id)}, '查看详情')
                ])) : [h('p', {class: 'muted'}, '还没有收录美食，欢迎推荐。')])
            ]))
        ]))), list);
    }

    function setCategoryFilter(value) {
        state.categoryFilter = value === 'all' ? null : Number(value);
        state.diningGroupFilter = '';
        state.diningCampusFilter = '';
        renderCategoryNav();
        renderCanteenGrid();
    }

    function splitStallName(name) {
        const text = String(name || '').trim();
        const match = text.match(/^((?:\d+)(?:\s*[-–—一]\s*\d+)?#?)\s*(.*)$/);
        if (!match || !match[2]) return { slot: '', name: text };
        return { slot: match[1].replace(/\s+/g, ''), name: match[2].trim() };
    }

    function canteenNumberKey(name) {
        const match = String(name || '').match(/^0*(\d+)(?:\s*[-–—一]\s*0*(\d+))?/);
        if (!match) return [1, 0, 0, String(name)];
        return [0, Number(match[1]), match[2] ? Number(match[2]) : Number(match[1]), String(name)];
    }

    function filterCanteens() {
        const keyword = state.search.toLowerCase();
        const selectedGroup = diningGroups().find(group => group.name === state.diningGroupFilter);
        const selectedFloors = selectedGroup ? new Set(selectedGroup.floors.map(floor => floor.id)) : null;
        const campusFloors = state.diningCampusFilter ? new Set(diningGroups().filter(group => group.campus === state.diningCampusFilter).flatMap(group => group.floors.map(floor => floor.id))) : null;
        return diningStalls().filter(canteen => {
            if (!matchesFoodType(canteen, state.foodType)) return false;
            if (campusFloors && !campusFloors.has(canteen.category_id)) return false;
            if (selectedFloors && !selectedFloors.has(canteen.category_id)) return false;
            if (state.categoryFilter !== null && String(canteen.category_id) !== String(state.categoryFilter)) {
                return false;
            }
            if (state.ratedOnly && (canteen.score === null || canteen.score === undefined)) {
                return false;
            }
            if (!keyword) return true;
            return String(canteen.name || '').toLowerCase().includes(keyword)
                || String(canteen.category_name || '').toLowerCase().includes(keyword);
        });
    }

    function compareCanteens(a, b, rankingById) {
        if (state.sort === 'score') {
            const scoreA = a.score === null || a.score === undefined ? -1 : Number(a.score);
            const scoreB = b.score === null || b.score === undefined ? -1 : Number(b.score);
            if (scoreA !== scoreB) return scoreB - scoreA;
        } else if (state.sort === 'reviews') {
            const countA = rankingById.get(a.id)?.rating_count || 0;
            const countB = rankingById.get(b.id)?.rating_count || 0;
            if (countA !== countB) return countB - countA;
        }

        const keyA = canteenNumberKey(a.name);
        const keyB = canteenNumberKey(b.name);
        for (let index = 0; index < keyA.length; index += 1) {
            if (keyA[index] < keyB[index]) return -1;
            if (keyA[index] > keyB[index]) return 1;
        }
        return 0;
    }

    function groupCanteens(rows, rankingById) {
        const map = new Map();
        rows.forEach(canteen => {
            const key = canteen.category_id === null || canteen.category_id === undefined
                ? 'uncategorized'
                : String(canteen.category_id);
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    id: canteen.category_id,
                    name: canteen.category_name || '未分类',
                    items: []
                });
            }
            map.get(key).items.push(canteen);
        });

        const order = new Map(getCategories().map((category, index) => [String(category.id), index]));
        return Array.from(map.values())
            .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
            .map(group => {
                group.items.sort((a, b) => compareCanteens(a, b, rankingById));
                return group;
            });
    }

    function categoryAverage(items, rankingById) {
        let ratingCount = 0;
        let weighted = 0;

        items.forEach(canteen => {
            const ranking = rankingById.get(canteen.id);
            if (ranking && ranking.rating_count) {
                ratingCount += Number(ranking.rating_count) || 0;
                weighted += (Number(ranking.avg_score) || 0) * (Number(ranking.rating_count) || 0);
            }
        });

        if (ratingCount) return (weighted / ratingCount).toFixed(1);

        const rated = items.filter(canteen => canteen.score !== null && canteen.score !== undefined);
        if (rated.length) {
            return (rated.reduce((sum, canteen) => sum + Number(canteen.score), 0) / rated.length).toFixed(1);
        }
        return null;
    }

    function stallRow(canteen, rankingById) {
        const {h} = Vue;
        const parts = {
            slot: canteen.slot_number ?? splitStallName(canteen.name).slot,
            name: canteen.display_name ?? splitStallName(canteen.name).name
        };
        const ranking = rankingById.get(canteen.id);
        const hasScore = canteen.score !== null && canteen.score !== undefined;
        const reviews = ranking ? Number(ranking.rating_count) || 0 : 0;

        return h('button', {key: canteen.id, type: 'button', class: 'stall-row',
            'data-action': 'open-detail', 'data-id': canteen.id, title: canteen.name}, [
            h('span', {class: ['slot-badge', {'is-empty': !parts.slot}]}, parts.slot || '·'),
            canteen.photo_url
                ? h('img', {class: 'stall-thumbnail', src: (window.CANTEEN_API_ORIGIN || '') + canteen.photo_url, alt: '', loading: 'lazy'})
                : h('span', {class: 'stall-thumbnail', 'aria-hidden': 'true'}),
            h('span', {class: 'stall-row-main'}, [h('span', {class: 'stall-row-name'}, parts.name)]),
            h('span', {class: ['stall-row-score', {'is-empty': !hasScore}]}, hasScore ? `★ ${formatScore(canteen.score)}` : '暂无评分'),
            h('span', {class: 'stall-row-reviews'}, reviews ? `${formatNumber(reviews)} 条` : ''),
            h('span', {class: 'stall-row-arrow', 'aria-hidden': 'true'}, '›')
        ]);
    }

    function renderCategoryBlock(group, options) {
        const {h} = Vue;
        const {single, searching, rankingById} = options;
        const expanded = single || searching || state.expandedCategories.has(group.key);
        const visibleItems = expanded ? group.items : group.items.slice(0, 3);
        const collapsible = !single && !searching && group.items.length > 3;
        const average = categoryAverage(group.items, rankingById);
        const stats = `${formatNumber(group.items.length)} 个档口${average ? ` · 均分 ${average}` : ''}`;
        const floor = diningGroups().flatMap(parent => parent.floors).find(item => item.id === group.id);
        const floorName = floor?.label.split(' · ')[0];
        const hasFloor = /^[一二三四五六七八九十\d]+楼$/.test(floorName || '');
        const toggle = {type: 'button', 'data-action': 'toggle-category', 'data-id': group.key};
        const heading = [
            h('span', {class: 'floor-heading-badge'}, hasFloor ? floorName : '餐厅'),
            h('span', {class: 'category-title'}, group.name),
            h('span', {class: 'category-stats'}, stats),
            collapsible ? h('span', {class: 'category-chevron', 'aria-hidden': 'true'}, expanded ? '▴' : '▾') : null
        ];
        return h('section', {key: group.key, class: ['category-block', {'is-single': single}]}, [
            collapsible
                ? h('button', {...toggle, class: 'category-head', 'aria-expanded': String(expanded)}, heading)
                : h('div', {class: 'category-head is-static'}, heading),
            h('div', {class: 'stall-list'}, visibleItems.map(canteen => stallRow(canteen, rankingById))),
            collapsible ? h('button', {...toggle, class: 'category-more'},
                expanded ? '收起' : `展开全部 ${formatNumber(group.items.length)} 个档口`) : null
        ]);
    }

    function updateListToolbar(single, searching) {
        const picker = $('#stall-food-type');
        renderFoodPicker(picker);
        const rated = $('#rated-toggle');
        if (rated) {
            rated.classList.toggle('is-active', state.ratedOnly);
            rated.setAttribute('aria-pressed', String(state.ratedOnly));
        }

        const sort = $('#sort-select');
        if (sort && sort.value !== state.sort) sort.value = state.sort;

        const expand = $('#expand-all');
        const collapse = $('#collapse-all');
        if (expand) expand.hidden = single || searching;
        if (collapse) collapse.hidden = single || searching;
    }

    function renderCanteenGrid() {
        const grid = $('#canteen-grid');
        if (!grid || !state.canteensLoaded || !initialRouteReady) return;
        const {h, render} = Vue;

        if (!diningStalls().length) {
            render(emptyState('还没有档口', '请管理员先在后台添加食堂和档口。'), grid);
            updateListHeading([], [], new Map());
            updateListToolbar(false, false);
            return;
        }

        const rankingById = new Map(state.ranking.map(row => [row.id, row]));
        const rows = filterCanteens();
        const groups = groupCanteens(rows, rankingById);
        const single = state.categoryFilter !== null;
        const searching = Boolean(state.search);

        updateListHeading(rows, groups, rankingById);
        updateListToolbar(single, searching);

        if (!rows.length) {
            render(h('div', {class: 'empty-state'}, [
                h('div', {class: 'empty-icon'}, '🔍'),
                h('h3', '没有找到相关档口'),
                h('p', '换个关键词，或者看看全部档口。'),
                h('button', {type: 'button', class: 'btn btn-soft btn-sm', style: {marginTop: '14px'},
                    'data-action': 'reset-filters'}, '查看全部')
            ]), grid);
            return;
        }

        const block = group => renderCategoryBlock(group, {single, searching, rankingById});
        if (single) {
            render(h(Vue.Fragment, groups.map(block)), grid);
            return;
        }
        const parents = diningGroups();
        const sections = [...new Set(parents.map(parent => parent.campus))].map(campus => {
            const buildings = parents.filter(parent => parent.campus === campus).flatMap(parent => {
                const floors = groups.filter(group => parent.floors.some(floor => floor.id === group.id));
                return floors.length ? [h('section', {key: parent.name, class: 'dining-result-group stack'}, [
                    h('h2', parent.name), ...floors.map(block)
                ])] : [];
            });
            return buildings.length ? h('section', {key: 'campus:' + campus, class: 'campus-result-section stack'}, [
                h('h2', {class: 'campus-result-title'}, campus), ...buildings
            ]) : null;
        });
        const ungrouped = groups.filter(group => !parents.some(parent => parent.floors.some(floor => floor.id === group.id)));
        render(h(Vue.Fragment, [...sections, ...ungrouped.map(block)]), grid);
    }

    function updateListHeading(rows, groups, rankingById) {
        const title = $('#list-title');
        const subtitle = $('#list-subtitle');
        if (!title || !subtitle) return;

        const single = state.categoryFilter !== null;
        if (!single) {
            title.textContent = state.diningGroupFilter ? state.diningGroupFilter + ' · 全部楼层' : state.diningCampusFilter ? state.diningCampusFilter + ' · 全部食堂' : '全部档口';
        } else {
            const category = getCategories().find(item => String(item.id) === String(state.categoryFilter));
            title.textContent = category ? category.name : '全部档口';
        }

        const parts = [`${formatNumber(rows.length)} 个档口`];
        if (!single) parts.push(`${formatNumber(groups.length)} 个楼层`);

        if (single) {
            const average = categoryAverage(rows, rankingById);
            if (average) parts.push(`均分 ${average}`);
        }
        if (state.ratedOnly) parts.push('只看有评分');
        if (state.foodType.length) parts.push(foodTypes().filter(({id}) => state.foodType.includes(id)).map(({name}) => name).join('、'));
        if (state.search) parts.push(`搜索「${state.search}」`);
        subtitle.textContent = parts.join(' · ');
    }

    function toggleCategory(key) {
        if (state.expandedCategories.has(key)) {
            state.expandedCategories.delete(key);
        } else {
            state.expandedCategories.add(key);
        }
        renderCanteenGrid();
    }

    function expandAllCategories() {
        filterCanteens().forEach(canteen => {
            state.expandedCategories.add(
                canteen.category_id === null || canteen.category_id === undefined
                    ? 'uncategorized'
                    : String(canteen.category_id)
            );
        });
        renderCanteenGrid();
    }

    function collapseAllCategories() {
        state.expandedCategories.clear();
        renderCanteenGrid();
    }

    function toggleRatedOnly() {
        state.ratedOnly = !state.ratedOnly;
        renderCanteenGrid();
    }

    function setSort(value) {
        state.sort = value === 'score' || value === 'reviews' ? value : 'number';
        renderCanteenGrid();
    }

    function resetFilters() {
        state.search = '';
        state.categoryFilter = null;
        state.diningGroupFilter = '';
        state.diningCampusFilter = '';
        state.ratedOnly = false;
        state.foodType = [];
        state.expandedCategories.clear();
        const input = $('#search-input');
        if (input) input.value = '';
        renderCategoryNav();
        renderCanteenGrid();
    }

    /* ---------------- 排行榜 ---------------- */

    function rankingLocations() {
        const locations = new Map();
        for (const group of diningGroups()) {
            for (const floor of group.floors) {
                for (const [key, name] of [
                    ['campus:' + group.campus, group.campus],
                    ['dining:' + group.name, group.name + ' · 全部楼层'],
                    ['floor:' + floor.id, floor.name]
                ]) {
                    if (!locations.has(key)) locations.set(key, {name, floors: new Set()});
                    locations.get(key).floors.add(floor.name);
                }
            }
        }
        return locations;
    }

    function renderRanking() {
        const {h, render, Fragment} = Vue;
        const podium = $('#podium');
        const list = $('#ranking-list');
        const best = $('#category-best');
        const count = $('#ranking-count');
        if (!podium || !list || !best) return;

        const scope = $('#ranking-scope');
        const order = $('#ranking-order').value;
        const foodType = selectedFoodTypes($('#ranking-food-type'));
        const minimum = Number($('#ranking-min').value);
        const locations = rankingLocations();
        const selected = scope.value;
        const active = locations.has(selected) ? selected : '';
        render(h(Fragment, [
            h('option', {value: ''}, '全部食堂'),
            ...[['campus:', '校区'], ['dining:', '食堂'], ['floor:', '楼层']].map(([prefix, label]) => {
                const options = [...locations].filter(([key]) => key.startsWith(prefix));
                return options.length ? h('optgroup', {key: prefix, label},
                    options.map(([key, location]) => h('option', {key, value: key}, location.name))) : null;
            })
        ]), scope);
        scope.value = active;
        const floors = locations.get(active)?.floors;
        const rows = state.ranking.filter(row => row.avg_score != null && matchesFoodType(row, foodType) &&
            row.rating_count >= minimum && (!floors || floors.has(row.category_name)));
        const byScore = (a, b) => b.avg_score - a.avg_score;
        const byCount = (a, b) => b.rating_count - a.rating_count;
        rows.sort((a, b) => (order === 'count' ? byCount(a, b) || byScore(a, b)
            : byScore(a, b) || byCount(a, b)) || a.id - b.id);
        if (count) count.textContent = rows.length ? `${formatNumber(rows.length)} 个档口有评分` : '';

        const top = rows.slice(0, 3);
        podium.classList.toggle('is-two', top.length === 2);
        podium.classList.toggle('is-one', top.length === 1);
        const podiumOrder = top.length === 3 ? [1, 0, 2] : top.map((_, index) => index);
        const metric = row => order === 'count' ? formatNumber(row.rating_count) : formatScore(row.avg_score);
        render(top.length ? h(Fragment, podiumOrder.map(index => {
            const row = top[index];
            return h('article', {key: row.id, class: ['podium-card', {'is-first': index === 0}]}, [
                h('div', {class: 'podium-medal'}, index + 1),
                h('h3', row.name),
                h('p', {class: 'muted'}, row.category_name || '未分类'),
                h('div', {class: 'podium-score'}, [metric(row), h('small', order === 'count' ? ' 条评价' : ' / 5')]),
                rankingDetailButton(row, 'btn btn-soft btn-sm', '查看评价')
            ]);
        })) : h('div', {class: 'empty-state'}, [
            h('div', {class: 'empty-icon', 'aria-hidden': 'true'}, '🍽️'),
            h('h3', state.ranking.length ? '没有符合条件的档口' : '还没有评分'),
            h('p', state.ranking.length ? '试试扩大范围或降低最低评价数。' : '等同学们写下第一条评价，排行榜就会出现在这里。')
        ]), podium);

        const groups = new Map();
        for (const row of rows) {
            const category = row.category_name || '未分类';
            if (!groups.has(category)) groups.set(category, []);
            groups.get(category).push(row);
        }
        const grouped = [...groups];
        render(h(Fragment, state.rankingMode === 'category'
            ? grouped.map(([category, items]) => h('div', {key: category, class: 'ranking-group'}, [
                h('div', {class: 'ranking-group-title'}, [
                    h('span', category), h('span', {class: 'muted'}, formatNumber(items.length) + ' 个档口')
                ]),
                ...items.map(rankingRow)
            ]))
            : rows.map(rankingRow)), list);
        render(h(Fragment, grouped.map(([category, [row]]) => h('div', {key: category, class: 'best-row'}, [
            h('div', {class: 'best-row-main'}, [h('strong', category), h('span', row.name)]),
            h('span', {class: 'best-score'}, metric(row) + (order === 'count' ? ' 条' : ''))
        ]))), best);
    }

    function rankingDetailButton(row, className, label, ariaLabel) {
        return Vue.h('button', {
            type: 'button', class: className, 'data-action': 'open-detail', 'data-id': row.id, 'aria-label': ariaLabel
        }, label);
    }

    function rankingRow(row, index) {
        const {h} = Vue;
        return h('div', {key: row.id, class: 'ranking-row'}, [
            h('span', {class: ['rank-num', {'is-top': index < 3}]}, index + 1),
            h('div', {class: 'ranking-main'}, [
                h('div', {class: 'ranking-name'}, row.name),
                h('div', {class: 'ranking-meta'}, (row.category_name || '未分类') + ' · ' + formatNumber(row.rating_count) + ' 条评价')
            ]),
            h('span', {class: 'ranking-score'}, formatScore(row.avg_score)),
            rankingDetailButton(row, 'ranking-open', '›', '查看 ' + row.name + ' 的评价')
        ]);
    }

    function setRankingMode(mode) {
        state.rankingMode = mode === 'category' ? 'category' : 'all';
        $$('[data-ranking-mode]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.rankingMode === state.rankingMode);
        });
        renderRanking();
    }

    /* ---------------- 视图切换 ---------------- */

    function showView(name) {
        if (name === 'map' && !mapAccess) return;
        if (name === 'admin' && !state.isAdmin) {
            toast('请先用管理员账号登录', 'error');
            return;
        }

        if (!applyingRoute) {
            saveRouteState();
            closeOpenModals();
            state.view = name;
            const hash = listHash();
            if (window.location.hash !== hash) history.pushState(null, '', hash);
            activeRouteHash = hash;
        }
        if (applyingRoute) state.view = name;
        if (!applyingRoute) window.scrollTo({ top: 0, behavior: 'instant' });

        if (name === 'ranking') renderRanking();
        if (name === 'map') {
            const frame = $('#food-map-frame');
            if (!frame.getAttribute('src')) frame.src = frame.dataset.src;
        }
        if (name === 'campus') renderCampusFood();
        if (name === 'forum' && !applyingRoute) loadForum();
        if (name === 'admin') loadAdminAll();
    }

    function renderActiveView(name) {
        $$('.view').forEach(view => {
            const active = view.id === `view-${name}`;
            view.hidden = !active;
            view.classList.toggle('is-active', active);
        });
        renderNavigation();
    }

    async function ensurePostingIdentity() {
        if (state.token || localStorage.getItem('guestToken')) return;
        const guest = await api('/api/guest', { method: 'POST', auth: false });
        localStorage.setItem('guestToken', 'Bearer ' + guest.token);
        updateAuthUI();
    }

    let forumCursor = 0;
    let forumListRequest = 0;
    let forumCachedRows = [];
    let threadId = null;
    let replyCursor = 0;
    let forumReplies = [];
    let forumThreadRequest = 0;

    function forumBadge(kind) {
        const avoid = kind === 'avoid';
        return Vue.h('span', {class: avoid ? 'badge badge-red' : 'badge badge-amber'}, avoid ? '避雷' : '推荐');
    }

    function renderForumRows() {
        const {h, render, Fragment} = Vue;
        render(forumCachedRows.length ? h(Fragment, forumCachedRows.map(post => h('article', {
            key: post.id, class: 'detail-panel stack'
        }, [
            h('div', {class: 'panel-head'}, [h('h3', [forumBadge(post.kind), ' ' + post.name])]),
            h('p', {class: 'muted'}, post.address),
            h('p', {class: 'comment-text'}, post.content),
            h('div', {class: 'panel-head'}, [
                h('span', {class: 'muted'}, post.author + ' · ' + formatTime(post.created_at)),
                h('button', {type: 'button', class: 'btn btn-soft btn-sm', 'data-action': 'forum-open', 'data-id': post.id},
                    '查看帖子 · ' + formatNumber(post.reply_count) + ' 条回复')
            ])
        ]))) : emptyState('这里还没有帖子', '欢迎分享你的校外美食推荐或避雷经历。'),
        $('#forum-post-list'));
    }

    async function loadForum(append = false) {
        const request = ++forumListRequest;
        const list = $('#forum-post-list');
        const more = $('#forum-more');
        more.disabled = true;
        if (!append) {
            forumCursor = 0;
            more.hidden = true;
            Vue.render(Vue.createTextVNode('正在加载帖子…'), list);
        }
        try {
            const kind = $('#forum-kind-filter').value;
            const data = await api(`/api/forum/posts?kind=${encodeURIComponent(kind)}&cursor=${forumCursor}`);
            if (request !== forumListRequest) return;
            forumCachedRows = append ? forumCachedRows.concat(data.rows) : data.rows;
            renderForumRows();
            forumCursor = data.rows.at(-1)?.id ?? forumCursor;
            more.hidden = !data.more;
            saveRouteState();
        } catch (error) {
            if (request !== forumListRequest) return;
            if (append) toast(error.message, 'error');
            else Vue.render(Vue.createTextVNode(error.message), list);
        } finally {
            if (request === forumListRequest) more.disabled = false;
        }
    }

    async function openForumThread(id, append = false) {
        const {h, render, Fragment} = Vue;
        if (!append) openContentRoute('#/forum/posts/' + id);
        const request = ++forumThreadRequest;
        const modal = $('#forum-thread-modal');
        const content = $('#forum-thread-content');
        const replies = $('#forum-replies');
        const more = $('#forum-more-replies');
        const form = $('#forum-reply-form');
        more.disabled = true;
        if (!append) {
            threadId = id;
            replyCursor = 0;
            form.reset();
            clearError($('#forum-reply-error'));
            form.hidden = more.hidden = true;
            forumReplies = [];
            render(null, replies);
            render(Vue.createTextVNode('正在加载帖子…'), content);
            openModal(modal);
        }
        try {
            const { post, rows, more: hasMore } = await api(`/api/forum/posts/${id}?cursor=${replyCursor}`);
            if (request !== forumThreadRequest) return;
            render(h('article', {class: 'detail-panel stack'}, [
                h('h3', [forumBadge(post.kind), ' ' + post.name]),
                h('p', '地址：' + post.address),
                h('p', {class: 'comment-text'}, post.content),
                h('p', {class: 'muted'}, '1 楼 · ' + post.author + ' · ' + formatTime(post.created_at)),
                h('div', [h('button', {type: 'button', class: 'btn btn-soft btn-sm',
                    'data-action': 'copy-content-link'}, '复制帖子链接')]),
                post.can_delete ? h('div', [h('button', {type: 'button', class: 'link-btn',
                    'data-action': 'forum-delete', 'data-id': post.id}, '删除帖子')]) : null
            ]), content);
            forumReplies = append && replyCursor ? forumReplies.concat(rows) : rows;
            render(forumReplies.length ? h(Fragment, forumReplies.map(reply => h('article', {
                key: reply.floor, class: 'detail-panel'
            }, [
                h('p', {class: 'muted'}, formatNumber(reply.floor) + ' 楼 · ' + reply.author + ' · ' + formatTime(reply.created_at)),
                h('p', {class: 'comment-text'}, reply.content)
            ]))) : h('p', {class: 'muted'}, '还没有回复，来盖第一楼吧。'), replies);
            replyCursor = rows.at(-1)?.floor ?? replyCursor;
            more.hidden = !hasMore;
            form.hidden = false;
        } catch (error) {
            if (request !== forumThreadRequest) return;
            if (append) toast(error.message, 'error');
            else {
                render(h(Fragment, [
                    h('p', error.status === 404 ? '帖子已删除或不存在。' : error.message),
                    h('button', {type: 'button', class: 'btn btn-soft', 'data-close-modal': ''}, '返回论坛')
                ]), content);
            }
        } finally {
            if (request === forumThreadRequest) more.disabled = false;
        }
    }

    async function submitForumPost(event) {
        event.preventDefault();
        const form = event.target;
        const button = event.submitter;
        const error = $('#forum-compose-error');
        clearError(error);
        setBusy(button, true);
        try {
            const body = Object.fromEntries(new FormData(form));
            await ensurePostingIdentity();
            const result = await api('/api/forum/posts', { method: 'POST', body });
            closeModal($('#forum-compose-modal'));
            $('#forum-kind-filter').value = '';
            loadForum();
            await openForumThread(result.id);
        } catch (failure) {
            showError(error, failure.message);
        } finally {
            setBusy(button, false);
        }
    }

    async function submitForumReply(event) {
        event.preventDefault();
        const id = threadId;
        const button = event.submitter;
        const error = $('#forum-reply-error');
        clearError(error);
        setBusy(button, true);
        try {
            const body = Object.fromEntries(new FormData(event.target));
            await ensurePostingIdentity();
            const reply = await api(`/api/forum/posts/${id}/replies`, { method: 'POST', body });
            if (threadId === id && isModalOpen($('#forum-thread-modal'))) {
                event.target.reset();
                await openForumThread(id, true);
            }
            toast(`已发布到第 ${reply.floor} 楼`);
            loadForum();
        } catch (failure) {
            showError(error, failure.message);
        } finally {
            setBusy(button, false);
        }
    }

    /* ---------------- 档口详情 ---------------- */

    function destroyChart() {
        if (window.currentHistoryChart) {
            try {
                window.currentHistoryChart.destroy();
            } catch (error) {
                /* ignore */
            }
            window.currentHistoryChart = null;
        }
    }

    async function openDetail(id) {
        const {h, render} = Vue;
        const canteenId = Number(id);
        if (!canteenId) return;

        closeModal($('#recommendation-modal'));
        openContentRoute('#/stalls/' + canteenId);
        state.detailId = canteenId;
        destroyChart();
        openModal($('#detail-modal'));
        const content = $('#detail-content');
        unmountStallControls();
        render(detailSkeleton(), content);

        try {
            const [data, reviewLabels] = await Promise.all([
                api(`/api/canteens/${canteenId}`),
                state.isAdmin ? api('/api/admin/review-labels').catch(() => null) : null
            ]);
            if (state.detailId !== canteenId) return;
            renderDetail(data, reviewLabels);
        } catch (error) {
            if (state.detailId !== canteenId) return;
            render(h('div', {class: 'detail-body'}, [
                h('div', {class: 'empty-state'}, [
                    h('div', {class: 'empty-icon'}, '⚠️'), h('h3', '加载失败'), h('p', error.message),
                    actionButton('重试', 'open-detail', 'btn btn-soft btn-sm', {'data-id': canteenId, style: {marginTop: '14px'}}),
                    h('button', {type: 'button', class: 'btn btn-ghost btn-sm', 'data-close-modal': ''}, '返回列表')
                ])
            ]), content);
        }
    }

    function detailSkeleton() {
        const {h, Fragment} = Vue;
        const skeleton = style => h('div', {class: 'skeleton', style});
        return h(Fragment, [
            h('div', {class: 'detail-hero'}, [
                skeleton('width:110px;height:16px;background:rgba(255,255,255,.2)'),
                skeleton('width:58%;height:32px;margin-top:14px;background:rgba(255,255,255,.18)'),
                skeleton('width:38%;height:14px;margin-top:12px;background:rgba(255,255,255,.14)')
            ]),
            h('div', {class: 'detail-body'}, [skeleton('height:220px'), skeleton('height:160px')])
        ]);
    }

    function renderDetail(data, reviewLabels = null) {
        const content = $('#detail-content');
        if (!content) return;
        data = Vue.reactive(data);
        state.detailData = data;

        const comments = Array.isArray(data.comments) ? data.comments : [];
        const history = Array.isArray(data.history) ? data.history : [];
        Vue.render(null, content);
        stallControlUnmounts.push(window.mountStallDetail(content, data, {
            origin: window.CANTEEN_API_ORIGIN || '',
            meta: `${formatNumber(comments.length)} 条评价${history.length ? ` · ${formatNumber(history.length)} 个历史快照` : ''}`,
            score: formatScore(data.score),
            stars: starNodes(data.score),
            adminPanel: state.isAdmin ? () => renderStallManagement(data) : null,
            hasHistory: Boolean(history.length),
            historyFallback: typeof Chart === 'undefined' ? history.map(item => {
                const average = item.avg_score == null ? '暂无评分' : formatScore(item.avg_score) + ' 分';
                return formatTime(item.date) + '（' + average + ' / ' + formatNumber(item.rating_count) + ' 条）';
            }) : null,
            reviewCount: comments.length,
            emptyReviews: emptyState('还没有评论', '来写下第一条评价吧。', '💬'),
            showDishes: !state.isAdmin,
            formatNumber
        }));

        if (state.isAdmin) mountDetailStallControls(content, data);

        if (comments.length) {
            stallControlUnmounts.push(window.mountStallReviews($('[data-stall-reviews]', content), {
                comments,
                render: (sort, filter) => renderDetailReviews(comments, sort, filter, reviewLabels),
                changeLabel(event) {
                    const select = event.target.closest('[data-review-label-id]');
                    if (select) setReviewLabel(comments.find(comment => comment.id === Number(select.dataset.reviewLabelId)), select);
                }
            }));
        }

        if (history.length) {
            renderHistoryChart(history);
        }
    }

    function renderDetailReviews(reviews, sort, filter, reviewLabels) {
        const comments = reviews.filter(comment => filter === 'all' ||
            (filter === 'untagged' ? !comment.moderation_label : filter === 'label:' + comment.moderation_label));
        const newest = (a, b) => parseApiTime(b.created_at) - parseApiTime(a.created_at) || b.id - a.id;
        const heat = review => (review.likes || 0) - (review.dislikes || 0);
        comments.sort((a, b) => {
            if (sort === 'oldest') return newest(b, a);
            if (sort === 'hot') return heat(b) - heat(a) || newest(a, b);
            return newest(a, b);
        });
        const {h} = Vue;
        if (!comments.length) return [emptyState('没有符合条件的评价', '试试切换标签筛选。', '💬')];
        return comments.map(comment => {
            const profile = comment.author_id ? {
                type: 'button', 'data-action': 'open-public-profile', 'data-id': Number(comment.author_id)
            } : {};
            const action = (label, name, className = 'link-btn') => h('button', {
                type: 'button', class: className, 'data-action': name, 'data-id': Number(comment.id)
            }, label);
            const vote = (value, label, emoji, count) => h('button', {
                type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'review-vote',
                'data-id': Number(comment.id), 'data-vote': value, 'aria-pressed': String(comment.my_vote === value),
                'aria-label': label, title: label
            }, [emoji + ' ', h('span', formatNumber(count))]);
            return h('article', {key: comment.id, class: 'comment-item', 'data-review-id': Number(comment.id)}, [
                h(comment.author_id ? 'button' : 'div', {
                    ...profile, class: 'comment-avatar',
                    'aria-label': comment.author_id ? '查看' + comment.user + '的个人资料' : null
                }, [avatarContent(comment.author_id ? comment.avatar_url : null, comment.user)]),
                h('div', {class: 'comment-main'}, [
                    h('div', {class: 'comment-head'}, [
                        h(comment.author_id ? 'button' : 'span', {
                            ...profile, class: comment.author_id ? 'link-btn comment-user' : 'comment-user'
                        }, comment.user || '匿名用户'),
                        h('span', {class: 'comment-time'}, formatTime(comment.created_at)),
                        h('span', {class: 'stars stars-sm'}, starNodes(comment.score)),
                        comment.moderation_label ? h('span', {class: 'badge badge-amber', title: '管理员标记'}, comment.moderation_label) : null
                    ]),
                    ...(comment.dish_scores || []).map(dish => h('p', {class: 'comment-text'}, dish.name + ' · ' + dish.score + ' 分')),
                    comment.dish_name ? h('p', {class: 'comment-text'}, [h('strong', '菜品：'), comment.dish_name]) : null,
                    h('p', {class: 'comment-text'}, comment.content || '（无文字评价）'),
                    renderReviewPhotos(comment),
                    h('div', {class: 'comment-actions'}, [
                        Number.isInteger(comment.my_vote) ? h('div', {class: 'review-votes', role: 'group', 'aria-label': '评价投票'}, [
                            vote(1, '点赞', '👍', comment.likes), vote(-1, '踩', '👎', comment.dislikes)
                        ]) : null,
                        state.isAdmin && reviewLabels ? reviewLabelSelect(comment, reviewLabels) : null,
                        state.isAdmin ? action('删除评价', 'admin-delete-rating', 'btn btn-danger btn-sm') : null,
                        ...(comment.is_mine ? [action('修改', 'edit-review'), action('撤回', 'withdraw-review')] : [action('举报', 'report')])
                    ])
                ])
            ]);
        });

    }

    function reviewLabelSelect(review, labels) {
        return Vue.h('select', {
            'aria-label': '评价标签', 'data-review-label-id': review.id, value: review.moderation_label || ''
        }, [selectOption('', '无标签'), ...labels.map(({name}) => selectOption(name, name))]);
    }

    function renderStallManagement(stall) {
        const {h} = Vue;
        return h('section', {class: 'detail-panel stack'}, [
            h('div', {class: 'panel-head'}, [h('h3', '档口管理')]),
            h('div', {'data-menu-editor': 'rename-canteen', 'data-id': stall.id}),
            foodCatalog ? h('div', {'data-stall-category-editor': ''}) : null,
            h('div', [h('strong', '档口照片'), photoControls('canteens', stall)]),
            h('div', {class: 'panel-head'}, [h('h3', '菜品管理')]),
            h('div', {'data-add-dish-editor': ''}),
            h('div', {class: 'stack', 'data-managed-dishes': ''}, stall.dishes?.length
                ? stall.dishes.map(renderManagedDish) : [h('p', {class: 'muted', 'data-empty-dishes': ''}, '这个档口还没有菜品。')])
        ]);
    }

    function renderManagedDish(dish) {
        const {h} = Vue;
        return h('div', {key: dish.id, class: 'detail-photo-row dish-photo-row', 'data-managed-dish': dish.id}, [
            h('span', {'data-managed-photo': ''}, [photoNode(dish.photo_url, dish.name)]),
            h('div', [
                h('div', {'data-menu-editor': 'rename-dish', 'data-id': dish.id}),
                h('p', {class: 'muted'}, dish.rating_count ? dish.score + ' / 5 · ' +
                    formatNumber(dish.rating_count) + ' 人评分' : '暂无菜品评分'),
                photoControls('dishes', dish)
            ])
        ]);
    }

    async function saveCategoryName(event) {
        const form = event.target.closest('form[data-menu-action="rename-category"]');
        if (!form) return;
        event.preventDefault();
        const button = $('button[type="submit"]', form);
        setBusy(button, true);
        try {
            await api(`/api/admin/categories/${form.dataset.id}`, {
                method: 'PATCH', body: {name: form.elements.namedItem('name').value.trim()}
            });
            toast('名称已保存');
            await refreshAll();
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    function photoNode(url, alt, className = 'detail-photo') {
        if (!url) return null;
        const {h} = Vue;
        const image = h('img', {class: className, src: (window.CANTEEN_API_ORIGIN || '') + url, alt, loading: 'lazy'});
        return className === 'detail-photo' ? h('button', {type: 'button', class: 'photo-open',
            'data-photo-open': '', 'aria-label': '查看' + alt + '大图'}, [image]) : image;
    }

    function reviewPhotoUrls(review) {
        return review?.photo_urls ?? (review?.photo_url ? [review.photo_url] : []);
    }

    function renderReviewPhotos(review) {
        const {h} = Vue;
        const photos = reviewPhotoUrls(review);
        if (!photos.length) return null;
        return h('div', {class: 'review-photo-gallery'}, photos.map((url, index) => {
            const match = /^\/api\/(?:review-photos\/(\d+)|photos\/ratings\/\d+)$/.exec(url);
            const key = match ? match[1] || 'legacy' : '';
            const fullUrl = (window.CANTEEN_API_ORIGIN || '') + url;
            return h('div', {key: url, class: 'review-photo-tile'}, [
                h('a', {href: fullUrl, target: '_blank', rel: 'noopener', 'aria-label': `查看评价照片 ${index + 1} 的大图`},
                    [photoNode(url, `评价照片 ${index + 1}`, 'review-photo')]),
                review.is_mine && key ? actionButton('×', 'delete-review-photo', 'review-photo-delete', {
                    'data-id': review.id, 'data-photo-key': key, 'aria-label': `删除第 ${index + 1} 张照片`
                }) : null
            ]);
        }));
    }

    async function deleteReviewPhoto(id, button) {
        if (!window.confirm('确定删除这张照片吗？')) return;
        const detailId = state.detailId;
        button.disabled = true;
        try {
            await api(`/api/ratings/${id}/photos/${button.dataset.photoKey}`, { method: 'DELETE' });
            toast('照片已删除');
            if (state.detailId === detailId) await openDetail(detailId);
        } catch (error) {
            toast(error.message, 'error');
            button.disabled = false;
        }
    }

    async function preparePhoto(photo, maxSide = 1400, maxBytes = 1_500_000) {
        if (photo.size > 5 * 1024 * 1024) throw new Error('照片不能超过 5 MB');
        let image;
        try {
            image = await createImageBitmap(photo);
            const canvas = document.createElement('canvas');
            const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
            canvas.width = Math.max(1, Math.round(image.width * ratio));
            canvas.height = Math.max(1, Math.round(image.height * ratio));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            let jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
            if (jpeg && jpeg.size > maxBytes) {
                jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.62));
            }
            if (!jpeg || jpeg.size > maxBytes) throw new Error();
            return new File([jpeg], 'photo.jpg', { type: 'image/jpeg' });
        } catch {
            throw new Error('无法处理这张照片，请换一张 JPEG、PNG 或 WebP 图片');
        } finally {
            image?.close();
        }
    }

    const stallControlUnmounts = [];

    function unmountStallControls() {
        stallControlUnmounts.splice(0).reverse().forEach(unmount => unmount());
    }

    function photoControls(kind, item) {
        return Vue.h('div', {'data-photo-editor': kind, 'data-id': item.id});
    }

    function mountDetailStallControls(content, stall) {
        $$('[data-menu-editor]', content).forEach(target => {
            const action = target.dataset.menuEditor;
            const id = Number(target.dataset.id);
            const isStall = action === 'rename-canteen';
            const item = isStall ? stall : stall.dishes.find(dish => Number(dish.id) === id);
            const fields = [{name: 'name', label: isStall ? '档口名称' : '菜品名称', max: isStall ? 100 : 80}];
            const values = {name: item.name};
            if (isStall) {
                const legacy = splitStallName(item.name);
                values.name = item.display_name ?? legacy.name;
                values.slot_number = item.slot_number ?? legacy.slot;
                fields.unshift({name: 'slot_number', label: '楼层内编号', max: 20, placeholder: '如 03、01-02，可留空'});
            }
            stallControlUnmounts.push(window.mountMenuForm(target, {
                action, id, fields, values, label: isStall ? '保存档口信息' : '保存菜名',
                reportError: error => toast(error.message, 'error'),
                async save(data) {
                    const resource = isStall ? 'canteens' : 'dishes';
                    await api(`/api/admin/${resource}/${id}`, {method: 'PATCH', body: data});
                    const name = isStall ? data.slot_number + data.name : data.name;
                    item.name = name;
                    if (isStall) Object.assign(item, {display_name: data.name, slot_number: data.slot_number});
                    toast('名称已保存');
                    if (isStall) await Promise.allSettled([loadAdminAll(), loadCanteens(), loadRanking()]);
                }
            }));
        });
        const addDishEditor = $('[data-add-dish-editor]', content);
        if (addDishEditor) {
            stallControlUnmounts.push(window.mountMenuForm(addDishEditor, {
                action: 'add-dish', id: stall.id, fields: [{name: 'name', label: '新菜品名称',
                    placeholder: '输入新菜品名称', max: 80}],
                values: {name: ''}, clear: true, label: '添加菜品',
                reportError: error => toast(error.message, 'error'),
                async save(data) {
                    const created = await api(`/api/admin/canteens/${stall.id}/dishes`, {method: 'POST', body: data});
                    if (!addDishEditor.isConnected) return;
                    const dish = {id: created.id, name: created.name, rating_count: 0};
                    stall.dishes.push(dish);
                    await Vue.nextTick();
                    const row = $(`[data-managed-dish="${Number(dish.id)}"]`, content);
                    if (addDishEditor.isConnected && row) mountDetailStallControls(row, stall);
                    toast('菜品已添加');
                }
            }));
        }
        const categoryEditor = $('[data-stall-category-editor]', content);
        if (categoryEditor) {
            const current = () => ({
                selected: stallFoodTypes(stall).map(type => type.id),
                manual: Object.hasOwn(foodCatalog.overrides, stall.id)
            });
            stallControlUnmounts.push(window.mountStallCategoryControls(categoryEditor, {
                id: stall.id,
                types: foodTypes(),
                ...current(),
                async save(types) {
                    await api(`/api/admin/canteens/${stall.id}/food-types`, {method: 'PUT', body: {types}});
                    await loadFoodTypes();
                    toast('餐饮分类已更新');
                    return current();
                },
                reportError: error => toast(error.message, 'error')
            }));
        }
        $$('[data-photo-editor]', content).forEach(target => {
            const kind = target.dataset.photoEditor;
            const isStall = kind === 'canteens';
            const id = Number(target.dataset.id);
            const item = isStall ? stall : stall.dishes.find(dish => Number(dish.id) === id);

            stallControlUnmounts.push(window.mountStallPhotoControls(target, {
                hasPhoto: Boolean(item.photo_url),
                reportError: error => toast(error.message, 'error'),
                async savePhoto(photo) {
                    const body = photo ? new FormData() : undefined;
                    if (photo) body.append('photo', await preparePhoto(photo));
                    const result = await api(`/api/admin/photos/${kind}/${id}`, {
                        method: photo ? 'PUT' : 'DELETE', body
                    });
                    const url = result.photo_url ? result.photo_url + '?v=' + Date.now() : null;
                    item.photo_url = url;
                    if (isStall) {
                        const row = state.canteens.find(entry => Number(entry.id) === id);
                        if (row) row.photo_url = url;
                        clearRandomFoodResult();
                        renderCanteenGrid();
                        renderCampusFood();
                    }
                    toast(photo ? '照片已保存' : '照片已移除');
                    return url;
                }
            }));
        });
    }

    function renderHistoryChart(history) {
        const canvas = $('#history-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        destroyChart();
        const labels = history.map(item => formatTime(item.date));
        const values = history.map(item => item.avg_score === null ? null : Number(item.avg_score));

        window.currentHistoryChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '平均分',
                    data: values,
                    borderColor: '#0f766e',
                    backgroundColor: 'rgba(15, 118, 110, .10)',
                    fill: true,
                    tension: 0.3,
                    spanGaps: true,
                    pointRadius: 3,
                    pointBackgroundColor: '#0f766e',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#7b8d90', font: { size: 10 }, maxRotation: 0, autoSkip: true }
                    },
                    y: {
                        min: 0,
                        max: 5,
                        ticks: { stepSize: 1, color: '#7b8d90', font: { size: 10 } },
                        grid: { color: '#eef3f2' },
                        border: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0f2b2d',
                        padding: 10,
                        cornerRadius: 10,
                        displayColors: false,
                        callbacks: {
                            label: context => `平均分 ${formatScore(context.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    /* ---------------- 写评价 ---------------- */

    function openRating(canteenId = null, review = null, reviewDetail = state.detailData) {
        const id = canteenId ? Number(canteenId) : null;
        const selected = state.canteens.find(stall => stall.id === id);
        const categoryId = selected?.category_id ?? reviewDetail?.category_id;
        const campus = id ? (selected?.category_kind === 'campus' ||
            getCategories().some(category => category.id === categoryId && category.kind === 'campus'))
            : state.view === 'campus';
        state.ratingScope = campus ? 'campus' : 'canteen';
        $('#rating-category-label').textContent = campus ? '楼宇与楼层' : '食堂';
        $('#rating-canteen-label').textContent = campus ? '美食店铺' : '档口';

        const detail = review ? reviewDetail : null;
        if (id && isModalOpen($('#detail-modal'))) {
            state.reopenDetailId = id;
            closeModal($('#detail-modal'));
        } else {
            state.reopenDetailId = null;
        }

        state.editReviewId = review?.id ?? null;
        $('#rating-title').textContent = review ? '修改评价' : '写一条评价';
        $('#rating-submit').textContent = review ? '保存修改' : '提交评价';
        const category = $('#rating-category');
        const canteen = $('#rating-canteen');
        category.disabled = canteen.disabled = Boolean(id);
        $('#rating-location-fields').hidden = Boolean(id);
        const targetSummary = $('#rating-target-summary');
        targetSummary.hidden = !id;
        const {h, render, Fragment} = Vue;
        render(id ? h(Fragment, [
            h('strong', selected?.name || reviewDetail?.name || '当前档口'),
            h('span', getCategories().find(item => item.id === categoryId)?.name || reviewDetail?.category_name || '')
        ]) : null, targetSummary);
        $('#rating-dishes-extra').open = Boolean(review?.dish_scores?.length);
        $('#rating-photos-extra').open = Boolean(reviewPhotoUrls(review).length);
        if (review) {
            render(selectOption(detail.category_id, detail.category_name || '未分类'), category);
            render(selectOption(id, detail.name), canteen);
            loadRatingDishes(detail.dishes);
            for (const dish of review.dish_scores || []) {
                const option = Array.from($('#rating-dish').options).find(item => Number(item.value) === dish.id);
                if (option) addRatingDish(option, dish.score);
            }
        } else {
            fillRatingCategories(id);
        }
        setRatingScore(review?.score ?? 5);
        $('#rating-comment').value = review?.content || '';
        $('#rating-photo').value = '';
        ratingPhotos = [];
        savedRatingPhotoCount = reviewPhotoUrls(review).length;
        $('#rating-remove-photo').checked = false;
        $('#rating-remove-photo-field').hidden = !savedRatingPhotoCount;
        updateRatingPhotoPicker();
        $('#rating-anonymous-field').hidden = !state.token;
        $('#rating-anonymous').checked = Boolean(review?.is_anonymous);
        clearError($('#rating-error'));
        openModal($('#rating-modal'));
        $('.rating-dialog-body').scrollTop = 0;
    }

    async function openMyReviews() {
        const {h, render, Fragment} = Vue;
        const modal = $('#my-reviews-modal');
        const list = $('#my-reviews-list');
        render(Vue.createTextVNode('正在加载评价…'), list);
        $('#my-social-actions').hidden = !state.token;
        selectMySection('my-reviews');
        openModal(modal);
        try {
            const reviews = await api('/api/my/ratings');
            render(reviews.length ? h(Fragment, reviews.map(review => h('article', {key: review.id, class: 'detail-panel'}, [
                h('strong', review.canteen_name),
                h('p', {class: 'muted'}, (review.category_name || '未分类') + ' · ' +
                    formatTime(review.created_at) + ' · ' + review.score + ' 分'),
                h('p', {class: 'comment-text'}, review.content || '（无文字评价）'),
                h('div', {class: 'comment-actions'}, [
                    h('button', {type: 'button', class: 'link-btn', 'data-action': 'edit-my-review',
                        'data-id': review.id, 'data-canteen-id': review.canteen_id}, '修改'),
                    h('button', {type: 'button', class: 'link-btn', 'data-action': 'withdraw-review',
                        'data-id': review.id}, '撤回')
                ])
            ]))) : h('p', {class: 'muted'}, '你还没有发布评价。'), list);
        } catch (error) {
            render(Vue.createTextVNode(error.message), list);
        }
    }

    async function editMyReview(id, button) {
        button.disabled = true;
        try {
            const canteenId = Number(button.dataset.canteenId);
            const detail = await api(`/api/canteens/${canteenId}`);
            const review = detail.comments.find(item => item.id === id && item.is_mine);
            if (!review) throw new Error('这条评价已不可修改');
            const modal = $('#my-reviews-modal');
            if (!isModalOpen(modal)) return;
            closeModal(modal);
            openRating(canteenId, review, detail);
            state.returnToMyReviews = true;
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function withdrawReview(id, button) {
        const detailId = state.detailId;
        const fromMyReviews = Boolean(button.closest('#my-reviews-modal'));
        if (!window.confirm('确定撤回这条评价吗？撤回后可重新评价该档口。')) return;
        button.disabled = true;
        try {
            await api(`/api/ratings/${id}`, { method: 'DELETE' });
            toast('评价已撤回');
            await Promise.all([loadCanteens(), loadRanking()]);
            if (fromMyReviews && isModalOpen($('#my-reviews-modal'))) {
                openMyReviews();
            } else if (detailId && state.detailId === detailId) {
                openDetail(detailId);
            }
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    function renderSelectOptions(select, placeholder, options = []) {
        const {h, render, Fragment} = Vue;
        render(h(Fragment, [h('option', {value: ''}, placeholder), ...options]), select);
        select.value = '';
    }

    function selectOption(value, label) {
        return Vue.h('option', {key: value, value}, label);
    }

    function fillRatingCategories(selectedCanteenId = null) {
        const select = $('#rating-category');
        if (!select) return;

        const campus = state.ratingScope === 'campus';
        const categories = getCategories().filter(category => (category.kind === 'campus') === campus);
        renderSelectOptions(select, campus ? '请选择校内地点' : '请选择食堂和楼层',
            campus ? categories.map(category => selectOption(category.id, category.name)) :
                diningGroups().map(group => Vue.h('optgroup', {key: group.name, label: group.name},
                    group.floors.map(floor => selectOption(floor.id, group.name + ' · ' + floor.label)))));

        const selected = selectedCanteenId
            ? state.canteens.find(canteen => Number(canteen.id) === Number(selectedCanteenId))
            : null;

        if (selected) {
            select.value = String(selected.category_id);
            fillRatingCanteens(selected.category_id, selected.id);
        } else {
            select.value = '';
            fillRatingCanteens('', null);
        }
    }

    function fillRatingCanteens(categoryId, selectedCanteenId = null) {
        const select = $('#rating-canteen');
        if (!select) return;
        const campus = state.ratingScope === 'campus';

        if (!categoryId) {
            renderSelectOptions(select, campus ? '请先选择校内地点' : '请先选择食堂');
            loadRatingDishes();
            return;
        }

        const list = state.canteens.filter(canteen => String(canteen.category_id) === String(categoryId));
        if (!list.length) {
            renderSelectOptions(select, campus ? '该地点暂无美食' : '该食堂暂无档口');
            loadRatingDishes();
            return;
        }

        renderSelectOptions(select, campus ? '请选择美食店铺' : '请选择档口',
            list.map(canteen => selectOption(canteen.id, canteen.name)));

        if (selectedCanteenId) {
            select.value = String(selectedCanteenId);
        }
        loadRatingDishes();
    }

    let ratingDishRequest = 0;

    function selectRatingDish() {
        const select = $('#rating-dish');
        const option = select.selectedOptions[0];
        select.value = '';
        if (option?.value) addRatingDish(option);
    }

    let ratingDishRows = [];
    let ratingDishRowId = 0;

    function renderRatingDishRows() {
        const {h, render, Fragment} = Vue;
        render(h(Fragment, ratingDishRows.map(row => {
            const scores = [5, 4, 3, 2, 1];
            if (row.currentScore !== null && !scores.includes(row.currentScore)) scores.push(row.currentScore);
            return h('div', {key: row.key, class: 'field-row', 'data-dish-id': row.option?.value || ''}, [
                h('label', {class: 'field'}, [
                    h('span', row.option?.textContent || '新菜品名称'),
                    row.option ? null : h('input', {class: 'dish-name-input', maxlength: 80, required: true}),
                    h('select', {class: 'dish-score-input', 'aria-label': '菜品评分', required: true}, [
                        h('option', {value: ''}, '请选择菜品评分'),
                        ...scores.map(score => h('option', {key: score, value: score, selected: row.currentScore === score}, score + ' 分'))
                    ])
                ]),
                h('div', [h('button', {type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => {
                    if (row.option) row.option.disabled = false;
                    ratingDishRows = ratingDishRows.filter(item => item !== row);
                    renderRatingDishRows();
                }}, '移除')])
            ]);
        })), $('#rating-dish-scores'));
    }

    function addRatingDish(option = null, currentScore = null) {
        if (ratingDishRows.length >= 20) {
            showError($('#rating-error'), '每条评价最多可选 20 道菜');
            return;
        }
        clearError($('#rating-error'));
        if (option) option.disabled = true;
        ratingDishRows.push({key: ++ratingDishRowId, option, currentScore});
        renderRatingDishRows();
        if (currentScore === null) $('#rating-dish-scores').lastElementChild.querySelector('input, select').focus();
    }

    async function loadRatingDishes(knownDishes = null) {
        const requestId = ++ratingDishRequest;
        const canteenId = $('#rating-canteen').value;
        const select = $('#rating-dish');
        $('#rating-add-new-dish').disabled = !canteenId;
        select.disabled = true;
        renderSelectOptions(select, canteenId ? '正在加载菜品…' : '请先选择档口');
        ratingDishRows = [];
        renderRatingDishRows();
        if (!canteenId) return;

        try {
            const dishes = knownDishes || await api(`/api/canteens/${canteenId}/dishes`);
            if (requestId !== ratingDishRequest) return;
            renderSelectOptions(select, '请选择菜品（可选）', dishes.map(dish => selectOption(dish.id, dish.name)));
            select.disabled = false;
        } catch {
            if (requestId !== ratingDishRequest) return;
            renderSelectOptions(select, '菜品加载失败，请重新选择档口');
        }
    }

    function setRatingScore(score) {
        const value = Math.min(5, Math.max(1, Number(score) || 5));
        state.ratingScore = value;
        if ($('#rating-score')) $('#rating-score').value = String(value);
        if ($('#star-value')) $('#star-value').textContent = Number(value).toFixed(1);
        $$('.star-btn').forEach(button => {
            const buttonValue = Number(button.dataset.score);
            button.classList.toggle('is-active', buttonValue <= value);
            button.setAttribute('aria-checked', String(buttonValue === value));
        });
    }

    let ratingPhotos = [];
    let savedRatingPhotoCount = 0;
    let ratingPhotoPreviewUrls = [];

    function clearRatingPhotoPreviews() {
        ratingPhotoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        ratingPhotoPreviewUrls = [];
        Vue.render(null, $('#rating-photo-preview'));
    }

    function ratingPhotoCount() {
        return ratingPhotos.length + ($('#rating-remove-photo').checked ? 0 : savedRatingPhotoCount);
    }

    function updateRatingPhotoPicker() {
        const {h, render, Fragment} = Vue;
        const count = ratingPhotoCount();
        $('#rating-photo-hint').textContent = count
            ? `共 ${count}/4 张，新增 ${ratingPhotos.length} 张`
            : '可选，最多 4 张，每张不超过 5 MB';
        $('#rating-photo-clear').hidden = !ratingPhotos.length;
        clearRatingPhotoPreviews();
        ratingPhotoPreviewUrls = ratingPhotos.map(photo => URL.createObjectURL(photo));
        render(h(Fragment, ratingPhotoPreviewUrls.map((url, index) => h('div', {key: url, class: 'review-photo-tile'}, [
            h('a', {href: url, target: '_blank', rel: 'noopener', 'aria-label': `查看第 ${index + 1} 张待上传照片`},
                [h('img', {class: 'review-photo', src: url, alt: `待上传照片 ${index + 1}`})]),
            h('button', {type: 'button', class: 'review-photo-delete', 'data-photo-index': index,
                'aria-label': `移除第 ${index + 1} 张待上传照片`}, '×')
        ]))), $('#rating-photo-preview'));
    }

    async function submitRating(event) {
        event.preventDefault();

        const canteenId = $('#rating-canteen').value;
        const score = Number($('#rating-score').value) || 0;
        const comment = $('#rating-comment').value;
        const dishScores = Array.from($('#rating-dish-scores').children, row => ({
            score: Number(row.querySelector('.dish-score-input').value),
            ...(row.dataset.dishId
                ? { dish_id: Number(row.dataset.dishId) }
                : { dish_name: row.querySelector('.dish-name-input').value.trim() })
        }));
        const errorElement = $('#rating-error');
        const button = event.target.querySelector('button[type="submit"]');
        const reviewId = state.editReviewId;

        clearError(errorElement);
        if (!canteenId) {
            showError(errorElement, '请选择要评价的档口');
            return;
        }
        if (score < 1 || score > 5) {
            showError(errorElement, '请选择 1 到 5 分的评分');
            return;
        }

        if (dishScores.some(dish => dish.dish_name === '')) {
            showError(errorElement, '请输入新菜品名称');
            return;
        }
        if (ratingPhotoCount() > 4) {
            showError(errorElement, '每条评价最多可上传 4 张照片');
            return;
        }

        setBusy(button, true);
        try {
            const rating = {
                canteen_id: Number(canteenId),
                score,
                comment,
                dish_scores: dishScores,
                remove_photo: $('#rating-remove-photo').checked,
                is_anonymous: !state.token || $('#rating-anonymous').checked
            };
            let body = rating;
            if (ratingPhotos.length) {
                body = new FormData();
                body.append('rating', JSON.stringify(rating));
                for (const photo of [...ratingPhotos]) body.append('photos', await preparePhoto(photo));
            }
            const path = reviewId ? `/api/ratings/${reviewId}` : '/api/ratings';
            await ensurePostingIdentity();
            await api(path, { method: reviewId ? 'PATCH' : 'POST', body });

            const reopenId = state.reopenDetailId;
            state.reopenDetailId = null;
            closeModal($('#rating-modal'));
            toast(reviewId ? '评价已更新' : '评价成功，感谢分享！');
            await Promise.all([loadCanteens(), loadRanking()]);

            if (reopenId) {
                openDetail(reopenId);
            }
        } catch (error) {
            showError(errorElement, error.message);
        } finally {
            setBusy(button, false);
        }
    }

    /* ---------------- 举报 ---------------- */

    function openReport(commentId) {
        if (!commentId) return;
        const {h, render, Fragment} = Vue;
        const modal = $('#report-modal');
        render(h(Fragment, [
            h('button', {type: 'button', class: 'icon-btn modal-close', 'data-close-modal': '', 'aria-label': '关闭'}, '×'),
            h('div', {class: 'modal-head'}, [
                h('span', {class: 'modal-icon'}, '!'),
                h('h2', {id: 'report-title'}, '举报这条评价'),
                h('p', '请说明举报理由，管理员会尽快处理。')
            ]),
            h('form', {id: 'report-form', class: 'stack', onSubmit: event => submitReport(event, commentId)}, [
                h('label', {class: 'field'}, [
                    h('span', '举报理由'),
                    h('textarea', {id: 'report-reason', rows: 4, maxlength: 200, required: true,
                        placeholder: '例如：不文明用语、恶意攻击、广告…'})
                ]),
                h('p', {class: 'form-error', id: 'report-error', hidden: true}),
                h('button', {type: 'submit', class: 'btn btn-primary btn-block'}, '提交举报')
            ])
        ]), $('#report-content'));
        openModal(modal);
    }

    async function submitReport(event, commentId) {
        event.preventDefault();
        const reason = $('#report-reason').value.trim();
        const errorElement = $('#report-error');
        const button = event.target.querySelector('button[type="submit"]');

        clearError(errorElement);
        if (!reason) {
            showError(errorElement, '请填写举报理由');
            return;
        }

        setBusy(button, true);
        try {
            await api('/api/report', {
                method: 'POST',
                body: { comment_id: commentId, content: reason }
            });
            closeModal($('#report-modal'));
            toast('举报已提交，管理员会尽快处理', 'info');
        } catch (error) {
            showError(errorElement, error.message);
        } finally {
            setBusy(button, false);
        }
    }

    /* ---------------- 管理后台 ---------------- */

    async function loadAdminAll() {
        if (!state.isAdmin) return;
        setAdminLoading();

        try {
            const [categories, canteens, ratings, reports, actions, reviewLabels] = await Promise.all([
                api('/api/admin/categories'),
                api('/api/admin/canteens'),
                api('/api/admin/ratings'),
                api('/api/admin/reports'),
                api('/api/admin/actions'),
                api('/api/admin/review-labels')
            ]);

            state.admin = {
                categories: Array.isArray(categories) ? categories : [],
                canteens: Array.isArray(canteens) ? canteens : [],
                ratings: Array.isArray(ratings) ? ratings : [],
                reports: Array.isArray(reports) ? reports : [],
                actions: Array.isArray(actions) ? actions : [],
                reviewLabels
            };

            renderAdminStats();
            fillAdminCategorySelect();
            renderAdminTab(state.adminTab);
        } catch (error) {
            if (error.status === 403) {
                forceLogout();
                toast('登录状态已失效，请重新登录', 'error');
                return;
            }
            toast(error.message || '管理数据加载失败', 'error');
            const list = adminListForTab(state.adminTab);
            if (list) renderAdminPlaceholder(list, '加载失败，请稍后重试');
        }
    }

    function setAdminLoading() {
        ['admin-category-list', 'admin-canteen-list', 'admin-rating-list', 'admin-report-list', 'admin-action-list']
            .forEach(id => {
                const element = document.getElementById(id);
                if (element) renderAdminPlaceholder(element, '加载中…');
            });
    }

    function renderAdminPlaceholder(target, message) {
        Vue.render(Vue.h('div', {class: 'admin-empty'}, message), target);
    }

    function adminListForTab(tab) {
        const map = {
            categories: 'admin-category-list',
            canteens: 'admin-canteen-list',
            ratings: 'admin-rating-list',
            reports: 'admin-report-list',
            actions: 'admin-action-list'
        };
        return document.getElementById(map[tab] || '');
    }

    function renderAdminStats() {
        const {h, render, Fragment} = Vue;
        const stats = $('#admin-stats');
        if (!stats || !state.admin) return;

        const activeRatings = state.admin.ratings.filter(rating => !rating.is_deleted).length;
        const activeCanteens = state.admin.canteens.filter(canteen => canteen.is_active !== false).length;
        render(h(Fragment, [
            ['食堂', state.admin.categories.length], ['在售档口', activeCanteens],
            ['有效评价', activeRatings], ['待处理举报', state.admin.reports.length, true]
        ].map(([label, count, accent]) => h('div', {key: label, class: ['stat-card', {'is-accent': accent}]}, [
            h('strong', formatNumber(count)), h('span', label)
        ]))), stats);
    }

    function switchAdminTab(tab) {
        if (tab === 'administrators' && !state.isAdmin) return;
        state.adminTab = tab;
        $$('.admin-tab').forEach(button => button.classList.toggle('is-active', button.dataset.adminTab === tab));
        $$('.admin-section').forEach(section => section.classList.toggle('is-active', section.dataset.adminSection === tab));
        renderAdminTab(tab);
    }

    function renderAdminTab(tab) {
        if (!state.admin) return;
        switch (tab) {
            case 'administrators':
                loadAdministratorAccounts();
                break;
            case 'feedback':
                loadFeedback();
                break;
            case 'categories':
                renderAdminCategories();
                break;
            case 'canteens':
                renderAdminCanteens();
                renderAdminFoodTypes();
                break;
            case 'ratings':
                renderReviewLabels();
                renderAdminRatings();
                break;
            case 'reports':
                renderAdminReports();
                break;
            case 'actions':
                renderAdminActions();
                break;
            default:
                break;
        }
    }

    let adminUsersRequest = 0;

    async function loadAdministratorAccounts() {
        const {h, render, Fragment} = Vue;
        const request = ++adminUsersRequest;
        const list = $('#admin-accounts-list');
        const search = $('#admin-user-search').elements.q.value.trim();
        renderAdminPlaceholder(list, '正在加载…');
        try {
            const accounts = await api('/api/admin/users?q=' + encodeURIComponent(search));
            if (request !== adminUsersRequest) return;
            if (!accounts.length) {
                renderAdminPlaceholder(list, '没有找到匹配的用户。');
                return;
            }
            render(h(Fragment, accounts.map(account => h('div', {key: account.id, class: 'admin-row'}, [
                h('div', {class: 'admin-row-main'}, [
                    h('strong', account.username),
                    h('p', account.nickname || '未设置昵称'),
                    h('p', [(account.is_admin ? '管理员' : '普通用户'),
                        (account.is_banned ? '已封禁' : '可登录'), (account.is_muted ? '已禁言' : '可发言')].join(' · '))
                ]),
                h('div', {class: 'admin-row-actions'}, [
                    actionButton('查看主页', 'open-public-profile', 'btn btn-ghost btn-sm', {
                        'data-id': account.id, 'aria-label': '查看 ' + account.username + ' 的主页'
                    }),
                    ...(account.username === 'admin' ? [h('span', {class: 'muted'}, '主管理员')] : [
                        ['is_admin', account.is_admin ? '撤销管理权限' : '设为管理员'],
                        ['is_banned', account.is_banned ? '解除封禁' : '封禁'],
                        ['is_muted', account.is_muted ? '解除禁言' : '禁言']
                    ].filter(([field]) => field !== 'is_admin' || state.username === 'admin').map(([field, label]) =>
                        actionButton(label, 'moderate-user', 'btn btn-ghost btn-sm', {
                            key: field, 'data-id': account.id, 'data-field': field,
                            'data-enabled': String(!account[field]), 'data-account': account.username,
                            disabled: field === 'is_admin' && account.is_banned && !account.is_admin
                        })))
                ])
            ]))), list);
        } catch (error) {
            if (request === adminUsersRequest) renderAdminPlaceholder(list, error.message);
        }
    }

    async function moderateUser(id, button) {
        if (!window.confirm(`对「${button.dataset.account}」执行「${button.textContent.trim()}」？`)) return;
        setBusy(button, true);
        try {
            await api(`/api/admin/users/${id}`, {method: 'PATCH', body: {
                field: button.dataset.field, enabled: button.dataset.enabled === 'true'
            }});
            toast('用户权限已更新');
            await loadAdministratorAccounts();
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    function openFeedback(kind, target = null) {
        const form = $('#feedback-form');
        const campus = kind === 'campus';
        const stall = kind !== 'issue';
        form.reset();
        form.dataset.kind = kind;
        $('#feedback-title').textContent = campus ? '推荐校内美食' : stall ? '推荐档口' : '问题反馈';
        $('#feedback-name-label').textContent = campus ? '店名或摊位名称' : '档口名称';
        $('#feedback-building-field').hidden = !stall;
        $('#feedback-location-label').textContent = campus ? '所在楼宇与楼层' : '所在位置';
        form.elements.building.required = stall;
        const locations = getCategories().filter(category => (category.kind === 'campus') === campus)
            .map(category => selectOption(category.id, category.name));
        if (kind === 'stall') locations.push(selectOption('other', '其他（手动填写）'));
        renderSelectOptions(form.elements.building, campus ? '请选择楼宇和楼层' : '请选择食堂或其他位置', locations);
        updateFeedbackLocation();
        const context = $('#feedback-stall-context');
        context.hidden = !target;
        context.textContent = target ? `档口：${target.name} · ${target.category_name || '未分类'}（ID ${target.id}）` : '';
        if (target) form.elements.content.maxLength = 1000 - context.textContent.length - 1;
        $('#feedback-name-field').hidden = $('#feedback-photo-field').hidden = !stall;
        form.elements.namedItem('name').required = form.elements.photo.required = stall;
        form.elements.content.required = !stall;
        $('#feedback-content-label').textContent = campus ? '补充说明（可选，可写楼内位置和推荐菜）'
            : stall ? '补充说明（可选，可写食堂和位置）' : '请描述遇到的问题';
        $('#feedback-photo-label').textContent = '最多 5 MB';
        clearError($('#feedback-error'));
        openModal($('#feedback-modal'));
    }

    function updateFeedbackLocation() {
        const form = $('#feedback-form');
        const other = form.elements.building.value === 'other';
        $('#feedback-custom-location-field').hidden = !other;
        form.elements.customLocation.required = other;
        form.elements.content.maxLength = other ? 880 : 1000;
    }

    async function submitFeedback(event) {
        event.preventDefault();
        const form = event.target;
        const button = form.querySelector('button[type="submit"]');
        const error = $('#feedback-error');
        clearError(error);
        setBusy(button, true);
        try {
            let body = { kind: form.dataset.kind, content: form.elements.content.value.trim() };
            if (!$('#feedback-stall-context').hidden && body.content) {
                body.content = $('#feedback-stall-context').textContent + '\n' + body.content;
            }
            if (body.kind !== 'issue') {
                body = new FormData();
                body.append('kind', 'stall');
                const location = form.elements.building.value;
                const content = form.elements.content.value.trim();
                const custom = form.elements.customLocation.value.trim();
                if (location === 'other' && !custom) throw new Error('请填写所在位置');
                body.append('content', location === 'other' ? `用户填写的位置：${custom}\n${content}` : content);
                body.append('name', form.elements.namedItem('name').value.trim());
                body.append('photo', await preparePhoto(form.elements.photo.files[0]));
                if (location !== 'other') body.append('suggested_category_id', location);
            }
            await api('/api/feedback', { method: 'POST', body });
            closeModal($('#feedback-modal'));
            toast('反馈已提交，感谢！');
        } catch (errorMessage) {
            showError(error, errorMessage.message);
        } finally {
            setBusy(button, false);
        }
    }

    let feedbackRequest = 0;

    async function loadFeedback() {
        const {h, render, Fragment} = Vue;
        const request = ++feedbackRequest;
        const list = $('#admin-feedback-list');
        const status = $('#feedback-status').value;
        renderAdminPlaceholder(list, '正在加载…');
        try {
            const rows = await api(`/api/admin/feedback?status=${status}`);
            if (request !== feedbackRequest || $('#feedback-status').value !== status) return;
            if (!rows.length) {
                renderAdminPlaceholder(list, '暂无反馈。');
                return;
            }
            render(h(Fragment, rows.map(row => {
                const categories = state.admin.categories;
                const campus = categories.some(category => category.id === row.suggested_category_id && category.kind === 'campus');
                const isStall = row.kind === 'stall';
                const pending = row.status === 'pending';
                const label = {pending: '待处理', approved: '已入库', closed: isStall ? '已忽略' : '已处理'};
                const id = {'data-id': row.id};
                const approve = () => h('form', {class: 'inline-form', 'data-feedback-approve': ''}, [
                    h('input', {name: 'name', 'aria-label': '正式档口名称', value: row.name, maxlength: 100, required: true}),
                    h('select', {name: 'category', 'aria-label': '所属食堂或楼宇', required: true, value: row.suggested_category_id || ''}, [
                        selectOption('', '请选择所属位置'),
                        ...categories.filter(category => (category.kind === 'campus') === campus)
                            .map(category => selectOption(category.id, category.name))
                    ]),
                    h('div', {class: 'feedback-review-actions'}, [
                        h('button', {type: 'submit', class: 'btn btn-primary'}, '审核并入库'),
                        actionButton('忽略', 'feedback-close', 'btn btn-ghost', id)
                    ])
                ]);
                return h('article', {key: row.id, class: 'detail-panel stack', 'data-feedback-id': row.id}, [
                    h('strong', isStall ? (campus ? '校内美食推荐 · ' : '档口推荐 · ') + row.name : '问题反馈'),
                    h('p', {class: 'muted'}, formatTime(row.created_at) + ' · ' + label[row.status]),
                    h('p', {class: 'comment-text'}, row.content || '（无补充说明）'),
                    row.has_photo ? h('div', [actionButton('查看提交照片', 'feedback-photo', 'btn btn-soft btn-sm', id)]) : null,
                    pending ? (isStall ? approve() : h('div', [actionButton('标为已处理', 'feedback-close', 'btn btn-ghost btn-sm', id)])) : null
                ]);
            })), list);
        } catch (error) {
            if (request === feedbackRequest && $('#feedback-status').value === status) renderAdminPlaceholder(list, error.message);
        }
    }

    async function processFeedback(id, button, body) {
        setBusy(button, true);
        try {
            await api(`/api/admin/feedback/${id}`, { method: 'POST', body });
            const message = body.action === 'approve' ? '档口已入库' : (button.closest('[data-feedback-approve]') ? '已忽略这条推荐' : '反馈已处理');
            toast(message);
            await loadFeedback();
            if (body.action === 'approve') await Promise.all([loadCanteens(), loadAdminAll()]);
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    async function showFeedbackPhoto(id, button) {
        button.disabled = true;
        try {
            const response = await fetch((window.CANTEEN_API_ORIGIN || '') + `/api/admin/feedback/${id}/photo`,
                { headers: { Authorization: state.token } });
            if (!response.ok) throw new Error('照片加载失败');
            const url = URL.createObjectURL(await response.blob());
            const img = new Image();
            img.className = 'review-photo';
            img.alt = '用户提交的档口照片';
            img.onload = img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
            button.replaceWith(img);
        } catch (error) {
            toast(error.message, 'error');
            button.disabled = false;
        }
    }

    function renderAdminCategories() {
        const {h, render, Fragment} = Vue;
        const list = $('#admin-category-list');
        if (!list || !state.admin) return;

        if (!state.admin.categories.length) {
            renderAdminPlaceholder(list, '还没有食堂，在上方输入名称添加。');
            return;
        }
        render(h(Fragment, state.admin.categories.map(category => {
            const count = state.admin.canteens.filter(canteen => canteen.category_id === category.id && canteen.is_active !== false).length;
            return h('div', {key: category.id + ':' + category.name, class: 'admin-row'}, [
                h('div', {class: 'admin-row-main'}, [
                    h('strong', {'data-category-name': ''}, category.name),
                    h('form', {class: 'inline-form', 'data-menu-action': 'rename-category', 'data-id': category.id, hidden: true}, [
                        h('input', {name: 'name', 'aria-label': category.kind === 'campus' ? '校内地点名称' : '食堂名称',
                            defaultValue: category.name, maxlength: 100, required: true}),
                        h('button', {type: 'submit', class: 'btn btn-soft btn-sm'}, '保存'),
                        actionButton('取消', 'cancel-category-edit', 'btn btn-ghost btn-sm')
                    ]),
                    h('p', 'ID ' + category.id + ' · ' + formatNumber(count) + ' 个在售档口')
                ]),
                h('div', {class: 'admin-row-actions'}, [
                    actionButton('编辑', 'edit-category', 'btn btn-soft btn-sm'),
                    actionButton('删除', 'admin-delete-category', 'btn btn-danger btn-sm', {'data-id': category.id})
                ])
            ]);
        })), list);
    }

    function toggleCategoryEdit(button, editing) {
        const row = button.closest('.admin-row');
        const form = row.querySelector('form[data-menu-action="rename-category"]');
        const name = row.querySelector('[data-category-name]');
        row.querySelector('[data-action="edit-category"]').hidden = editing;
        form.hidden = !editing;
        name.hidden = editing;
        if (editing) {
            form.reset();
            form.elements.namedItem('name').select();
        }
    }

    function renderAdminFoodTypes() {
        const {h, render, Fragment} = Vue;
        const list = $('#admin-food-types');
        $('#add-food-type').querySelector('button').disabled = !foodCatalog;
        if (!foodCatalog) {
            renderAdminPlaceholder(list, '暂时无法读取餐饮分类，请刷新后重试。');
            return;
        }
        const stallsByType = new Map();
        for (const stall of state.admin?.canteens || []) {
            for (const {id} of stallFoodTypes(stall)) {
                if (!stallsByType.has(id)) stallsByType.set(id, []);
                stallsByType.get(id).push(stall);
            }
        }
        const types = foodTypes();
        render(types.length ? h(Fragment, types.map(({id, name}) => {
            const stalls = stallsByType.get(id) || [];
            return h('div', {key: id, class: 'admin-review-label', 'data-food-type-id': id}, [
                h('div', {class: 'panel-head'}, [
                    h('details', {'data-food-type-stalls': id}, [
                        h('summary', name + ' · ' + formatNumber(stalls.length) + ' 个档口'),
                        h('div', {class: 'admin-list'}, stalls.length ? stalls.map(stall => h('div', {key: stall.id, class: 'admin-row'}, [
                            h('div', {class: 'admin-row-main'}, [
                                h('strong', stall.name),
                                h('p', (stall.category_name || '未分类') + (stall.is_active === false ? ' · 已归档' : ''))
                            ]),
                            actionButton('管理', 'open-detail', 'btn btn-soft btn-sm', {'data-id': stall.id})
                        ])) : [h('p', {class: 'muted'}, '这个分类还没有档口。')])
                    ]),
                    actionButton('删除分类', 'delete-food-type', 'btn btn-danger btn-sm')
                ]),
                h('details', [
                    h('summary', '改名'),
                    h('form', {class: 'inline-form'}, [
                        h('input', {name: 'name', 'aria-label': '餐饮分类名称', value: name, maxlength: 20, required: true}),
                        h('button', {type: 'submit', class: 'btn btn-soft'}, '保存名称')
                    ])
                ])
            ]);
        })) : h('p', {class: 'muted'}, '暂无餐饮分类。'), list);
    }

    async function saveFoodTypeChange(button, path, method, body) {
        setBusy(button, true);
        try {
            await api(path, {method, body});
            if (method === 'POST') button.form.reset();
            await loadFoodTypes();
            toast('餐饮分类已更新');
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    function renderAdminCanteens() {
        const {h, render, Fragment} = Vue;
        const list = $('#admin-canteen-list');
        if (!list || !state.admin) return;
        const select = $('#admin-canteen-filter');
        const previous = select.value;
        renderSelectOptions(select, '总览 · 全部食堂', state.admin.categories.map(category => selectOption(category.id, category.name)));
        if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
        const stalls = state.admin.canteens.filter(canteen => !select.value || String(canteen.category_id) === select.value);
        if (!stalls.length) {
            renderAdminPlaceholder(list, select.value ? '这个食堂还没有档口。' : '还没有档口，先添加一个吧。');
            return;
        }

        render(h(Fragment, stalls.map(canteen => {
            const archived = canteen.is_active === false;
            const attrs = {'data-id': canteen.id};
            return h('div', {key: canteen.id, class: 'admin-row'}, [
                h('div', {class: 'admin-row-main'}, [
                    h('strong', canteen.name),
                    h('p', [
                        (canteen.category_name || '未分类') + ' · ID ' + canteen.id + ' ',
                        ...stallFoodTypes(canteen).map(({id, name}) => h('span', {key: id, class: 'badge'}, name)),
                        archived ? h('span', {class: 'badge badge-red'}, '已归档') : null
                    ])
                ]),
                h('div', {class: 'admin-row-actions'}, [
                    actionButton('管理', 'open-detail', 'btn btn-soft btn-sm', attrs),
                    archived ? actionButton('恢复上架', 'admin-restore-canteen', 'btn btn-soft btn-sm', attrs)
                        : actionButton('下架', 'admin-archive-canteen', 'btn btn-ghost btn-sm', attrs),
                    actionButton('删除', 'admin-delete-canteen', 'btn btn-danger btn-sm', attrs)
                ])
            ]);
        })), list);
    }

    function renderAdminRatings() {
        const list = $('#admin-rating-list');
        if (!list || !state.admin) return;

        const filter = state.adminRatingFilter;
        const stallSelect = $('#admin-rating-stall');
        const labelSelect = $('#admin-rating-label');
        const stalls = new Map(state.admin.ratings.map(rating => [rating.canteen_id, rating.canteen_name || '未知档口']));
        const selectedStall = stallSelect.value;
        const selectedLabel = labelSelect.value;
        renderSelectOptions(stallSelect, '全部档口', Array.from(stalls, ([id, name]) => selectOption(id, name)));
        renderSelectOptions(labelSelect, '全部标签', [
            selectOption('untagged', '无标签'),
            ...state.admin.reviewLabels.map(({name}) => selectOption('label:' + name, name))
        ]);
        if (Array.from(stallSelect.options).some(option => option.value === selectedStall)) stallSelect.value = selectedStall;
        if (Array.from(labelSelect.options).some(option => option.value === selectedLabel)) labelSelect.value = selectedLabel;
        const query = $('#admin-rating-search').value.trim().toLowerCase();
        const score = $('#admin-rating-score').value;
        const userId = state.adminRatingUserId;
        const rows = state.admin.ratings.filter(rating => {
            if (userId !== null) return Number(rating.user_id) === userId;
            if ((filter === 'active' && rating.is_deleted) || (filter === 'deleted' && !rating.is_deleted)) return false;
            if (stallSelect.value && String(rating.canteen_id) !== stallSelect.value) return false;
            if (score && Number(rating.score) !== Number(score)) return false;
            if (labelSelect.value && labelSelect.value !== (rating.moderation_label ? 'label:' + rating.moderation_label : 'untagged')) return false;
            return !query || [rating.comment, rating.user, rating.canteen_name].some(value => (value || '').toLowerCase().includes(query));
        });
        $('#admin-rating-filters').hidden = userId !== null;
        $('#admin-rating-search-filters').hidden = userId !== null;
        $('#admin-rating-author-scope').hidden = userId === null;
        $('#admin-rating-author-summary').textContent = userId === null ? '' :
            `${rows[0]?.is_guest ? '访客 #' + userId : rows[0]?.user || '该作者'}的全部评价（${rows.length} 条）`;

        if (!rows.length) {
            renderAdminPlaceholder(list, state.admin.ratings.length ? '没有找到符合条件的评价。' : '还没有评价。');
            return;
        }

        const {h, render, Fragment} = Vue;
        const badge = (label, red = false) => h('span', {class: red ? 'badge badge-red' : 'badge badge-amber'}, label);
        render(h(Fragment, rows.map(rating => {
            const id = {'data-id': rating.id};
            return h('div', {key: rating.id, class: 'admin-row'}, [
                h('div', {class: 'admin-row-main'}, [
                    h('strong', [
                        rating.author_id ? actionButton(rating.user, 'open-public-profile', 'link-btn', {
                            'data-id': rating.author_id, 'aria-label': '查看 ' + rating.user + ' 的主页'
                        }) : rating.is_guest ? '访客 #' + rating.user_id : rating.user,
                        ' · ' + (rating.canteen_name || '未知档口')
                    ]),
                    h('p', [
                        formatTime(rating.created_at) + ' ',
                        rating.is_deleted ? badge('已删除', true) : badge(rating.score + ' 分'),
                        badge(rating.is_guest ? '访客评价' : rating.is_anonymous ? '匿名评价' : '公开评价'),
                        rating.moderation_label ? badge(rating.moderation_label) : null
                    ]),
                    h('p', {class: 'admin-comment'}, rating.comment || '（无文字评价）')
                ]),
                h('div', {class: 'admin-row-actions'}, [
                    userId === null && rating.user_id ? actionButton('查看该作者全部评价', 'admin-rating-by-author',
                        'btn btn-ghost btn-sm', {'data-id': rating.user_id}) : null,
                    rating.is_deleted ? null : reviewLabelSelect(rating, state.admin.reviewLabels),
                    rating.is_deleted ? actionButton('恢复', 'admin-restore-rating', 'btn btn-soft btn-sm', id)
                        : actionButton('删除', 'admin-delete-rating', 'btn btn-danger btn-sm', id)
                ])
            ]);
        })), list);
    }

    async function voteOnReview(id, button) {
        const review = state.detailData?.comments?.find(item => item.id === id);
        const buttons = $$('button', button.closest('.review-votes'));
        const vote = button.getAttribute('aria-pressed') === 'true' ? 0 : Number(button.dataset.vote);
        buttons.forEach(item => { item.disabled = true; });
        try {
            await ensurePostingIdentity();
            const result = await api(`/api/ratings/${id}/vote`, { method: 'PUT', body: { vote } });
            if (review) {
                Object.assign(review, result);
                return;
            }
            for (const item of buttons) {
                const like = item.dataset.vote === '1';
                item.setAttribute('aria-pressed', String(result.my_vote === Number(item.dataset.vote)));
                $('span', item).textContent = formatNumber(like ? result.likes : result.dislikes);
            }
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            buttons.forEach(item => { item.disabled = false; });
        }
    }

    function renderReviewLabels() {
        const {h, render, Fragment} = Vue;
        const labels = state.admin.reviewLabels;
        render(labels.length ? h(Fragment, labels.map(({name}) => h('div', {
            key: name, class: 'admin-review-label', 'data-review-label-name': name
        }, [
            h('div', {class: 'panel-head'}, [
                h('strong', name),
                h('button', {type: 'button', class: 'btn btn-danger btn-sm', 'data-action': 'delete-review-label'}, '删除标签')
            ]),
            h('details', [
                h('summary', '改名'),
                h('form', {class: 'inline-form'}, [
                    h('input', {name: 'label', 'aria-label': '标签名称', maxlength: 20, required: true, value: name}),
                    h('button', {type: 'submit', class: 'btn btn-soft'}, '保存名称')
                ])
            ])
        ]))) : h('p', {class: 'muted'}, '暂无标签'), $('#admin-review-label-list'));
    }

    async function saveReviewLabelCatalog(method, button, body) {
        button.disabled = true;
        try {
            await api('/api/admin/review-labels', {method, body});
            if (method === 'POST') button.form.reset();
            await loadAdminAll();
            toast('标签已更新');
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function setReviewLabel(rating, select, render = () => {}) {
        if (!rating) return;
        select.disabled = true;
        try {
            const result = await api(`/api/admin/ratings/${rating.id}/label`, {
                method: 'PUT', body: { label: select.value || null }
            });
            rating.moderation_label = result.moderation_label;
            if (state.isAdmin) render();
            toast(result.moderation_label ? '已添加标签' : '已移除标签');
        } catch (error) {
            select.value = rating.moderation_label || '';
            toast(error.message, 'error');
        } finally {
            select.disabled = false;
        }
    }

    function setRatingFilter(filter) {
        state.adminRatingFilter = filter;
        $$('[data-rating-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.ratingFilter === filter));
        renderAdminRatings();
    }

    function renderAdminReports() {
        const {h, render, Fragment} = Vue;
        const list = $('#admin-report-list');
        if (!list || !state.admin) return;

        if (!state.admin.reports.length) {
            renderAdminPlaceholder(list, '当前没有待处理的举报。');
            return;
        }

        render(h(Fragment, state.admin.reports.map(report => {
            const rating = report.rating || {};
            const hasRating = rating.id !== null && rating.id !== undefined;
            return h('div', {key: report.report_id, class: 'admin-row'}, [
                h('div', {class: 'admin-row-main'}, [
                    h('strong', '举报 #' + report.report_id + ' · ' + (report.reporter || '匿名')),
                    h('p', formatTime(report.reported_at)),
                    h('p', {class: 'admin-comment'}, '理由：' + report.reason),
                    h('p', '被举报评价：' + (rating.user || '未知') + ' / ' + (rating.canteen_name || '未知档口') +
                        ' / ' + formatScore(rating.score) + ' 分'),
                    h('p', {class: 'admin-comment'}, rating.comment || '（评价已删除或无文字内容）')
                ]),
                h('div', {class: 'admin-row-actions'}, [
                    hasRating ? h('button', {type: 'button', class: 'btn btn-danger btn-sm',
                        'data-action': 'admin-delete-rating', 'data-id': rating.id}, '删除评价') : null,
                    h('button', {type: 'button', class: 'btn btn-soft btn-sm',
                        'data-action': 'admin-delete-report', 'data-id': report.report_id}, '标记已处理')
                ])
            ]);
        })), list);
    }

    function renderAdminActions() {
        const {h, render, Fragment} = Vue;
        const list = $('#admin-action-list');
        if (!list || !state.admin) return;

        if (!state.admin.actions.length) {
            renderAdminPlaceholder(list, '还没有管理员操作记录。');
            return;
        }

        render(h(Fragment, state.admin.actions.map(action => {
            const label = ACTION_LABELS[action.action] || action.action;
            const type = TYPE_LABELS[action.target_type] || action.target_type || '对象';
            const targetId = action.target_id === null || action.target_id === undefined ? '-' : action.target_id;
            return h('div', {key: action.id, class: 'admin-row'}, [
                h('div', {class: 'admin-row-main'}, [
                    h('strong', label),
                    h('p', '管理员：' + (action.admin_user || '未知') + ' · ' + formatTime(action.created_at)),
                    h('p', type + ' #' + targetId),
                    h('p', {class: 'admin-comment'}, action.details || '')
                ])
            ]);
        })), list);
    }

    function fillAdminCategorySelect() {
        const select = $('#new-canteen-category');
        if (!select) return;

        const current = select.value;
        const categories = state.admin && state.admin.categories.length
            ? state.admin.categories
            : getCategories();
        renderSelectOptions(select, '选择所属食堂', categories.map(category => selectOption(category.id, category.name)));

        if (current && Array.from(select.options).some(option => option.value === current)) {
            select.value = current;
        }
    }

    async function addCategory(event) {
        event.preventDefault();
        const input = $('#new-category-name');
        const name = input.value.trim();
        const button = event.target.querySelector('button[type="submit"]');

        if (!name) {
            toast('请输入食堂名称', 'error');
            return;
        }

        setBusy(button, true);
        try {
            await api('/api/admin/categories', { method: 'POST', body: { name } });
            input.value = '';
            toast('食堂已添加');
            await refreshAll();
            switchAdminTab('categories');
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    async function addCanteen(event) {
        event.preventDefault();
        const nameInput = $('#new-canteen-name');
        const categorySelect = $('#new-canteen-category');
        const name = nameInput.value.trim();
        const categoryId = categorySelect.value;
        const button = event.target.querySelector('button[type="submit"]');

        if (!name) {
            toast('请输入档口名称', 'error');
            return;
        }
        if (!categoryId) {
            toast('请选择所属食堂', 'error');
            return;
        }

        setBusy(button, true);
        try {
            await api('/api/admin/canteens', {
                method: 'POST',
                body: { name, category_id: Number(categoryId), slot_number: $('#new-canteen-slot').value.trim() }
            });
            nameInput.value = '';
            $('#new-canteen-slot').value = '';
            toast('档口已添加');
            await refreshAll();
            switchAdminTab('canteens');
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    async function deleteCategory(id) {
        if (!window.confirm('确定删除该食堂吗？食堂下仍有档口时无法删除。')) return;
        try {
            await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
            toast('食堂已删除');
            await refreshAll();
            switchAdminTab('categories');
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function deleteCanteen(id) {
        if (!window.confirm('确定删除该档口吗？其评价、举报和历史快照会一并删除。')) return;
        try {
            await api(`/api/admin/canteens/${id}`, { method: 'DELETE' });
            toast('档口已删除');
            await refreshAll();
            switchAdminTab('canteens');
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function restoreCanteen(id) {
        if (!window.confirm('确定将该档口重新上架吗？')) return;
        try {
            await api(`/api/admin/canteens/${id}/restore`, { method: 'POST' });
            toast('档口已重新上架');
            await refreshAll();
            switchAdminTab('canteens');
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function archiveCanteen(id) {
        if (!window.confirm('确定将该档口下架吗？历史评价会保留，但前台不再展示。')) return;
        try {
            await api(`/api/admin/canteens/${id}/archive`, { method: 'POST' });
            toast('档口已下架');
            await refreshAll();
            switchAdminTab('canteens');
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function deleteRating(id, button) {
        if (!window.confirm('确定删除这条评价吗？删除后可以在“已删除”筛选中恢复。')) return;
        const detailId = button.closest('#detail-content') ? state.detailId : null;
        button.disabled = true;
        try {
            await api(`/api/admin/ratings/${id}`, { method: 'DELETE' });
            toast('评价已删除');
            if (detailId && state.detailId === detailId && isModalOpen($('#detail-modal'))) await openDetail(detailId);
            await refreshAll();
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function restoreRating(id) {
        if (!window.confirm('确定恢复这条评价吗？')) return;
        try {
            await api(`/api/admin/ratings/${id}/restore`, { method: 'POST' });
            toast('评价已恢复');
            await refreshAll();
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function deleteReport(id) {
        if (!window.confirm('标记该举报为已处理，并删除举报记录？')) return;
        try {
            await api(`/api/admin/reports/${id}`, { method: 'DELETE' });
            toast('举报已处理');
            await loadAdminAll();
            switchAdminTab('reports');
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function backfillHistory() {
        const button = $('[data-action="admin-backfill"]');
        const hint = $('#admin-backfill-hint');
        if (hint) hint.textContent = '正在回填…';
        setBusy(button, true);

        try {
            const data = await api('/api/admin/backfill_history', { method: 'POST' });
            const results = Array.isArray(data.results) ? data.results : [];
            const okCount = results.filter(item => item.status === 'ok').length;
            const skipped = results.filter(item => item.status === 'skipped').length;
            const message = `回填完成：${okCount} 个档口写入快照${skipped ? `，${skipped} 个无评分档口已跳过` : ''}。`;
            if (hint) hint.textContent = message;
            toast('历史快照已回填');
            await loadAdminAll();
        } catch (error) {
            if (hint) hint.textContent = '';
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    /* ---------------- 弹层交互 ---------------- */

    const modalStack = Vue.shallowRef([]);
    const modalFocusOrigins = new WeakMap();

    function isModalOpen(modal) {
        return modalStack.value.includes(modal);
    }

    function closeOpenModals(except = null) {
        modalStack.value.filter(modal => modal !== except).reverse().forEach(closeModal);
    }

    function renderModalLayers(stack) {
        const top = stack.at(-1);
        $$('.modal').forEach(modal => {
            const index = stack.indexOf(modal);
            modal.classList.toggle('is-open', index !== -1);
            modal.style.zIndex = index < 0 ? '' : String(80 + index * 2);
            modal.inert = modal !== top;
            modal.setAttribute('aria-hidden', String(modal !== top));
        });
        $$('header.site-header, main.page').forEach(region => { region.inert = Boolean(top); });
        document.body.classList.toggle('modal-open', Boolean(top));
    }

    function openModal(modal) {
        if (!modal) return;
        if (!modalStack.value.includes(modal)) {
            modalFocusOrigins.set(modal, document.activeElement);
            modalStack.value = [...modalStack.value, modal];
        }

        const focusTarget = modal.querySelector('input:not([type="hidden"]), textarea, select')
            || modal.querySelector('.modal-close');
        if (focusTarget) {
            window.setTimeout(() => {
                if (modalStack.value.at(-1) === modal) focusTarget.focus({ preventScroll: true });
            }, 60);
        }
    }

    let viewerPhotos = [];
    let viewerIndex = 0;
    let viewerZoom = 1;
    let photoGesture = null;
    let viewerMessage = '';
    let viewerImageStyle = null;

    function renderPhotoViewer() {
        const {h, render, Fragment} = Vue;
        const item = viewerPhotos[viewerIndex];
        render(item ? h(Fragment, [
            h('div', {class: 'photo-viewer-toolbar'}, [
                h('h2', {id: 'photo-viewer-title'}, '查看照片'),
                h('span', {id: 'photo-viewer-count', role: 'status'}, `${viewerIndex + 1} / ${viewerPhotos.length}`),
                actionButton('−', 'photo-zoom-out', 'btn btn-ghost-light btn-sm', {'aria-label': '缩小照片', disabled: viewerZoom <= 1}),
                actionButton('适合屏幕', 'photo-reset', 'btn btn-ghost-light btn-sm'),
                actionButton('＋', 'photo-zoom-in', 'btn btn-ghost-light btn-sm', {'aria-label': '放大照片', disabled: viewerZoom >= 3}),
                h('button', {type: 'button', class: 'icon-btn', 'data-close-modal': '', 'aria-label': '关闭照片'}, '×')
            ]),
            h('div', {
                class: 'photo-viewer-stage', id: 'photo-viewer-stage',
                onPointerdown(event) {
                    photoGesture = event.pointerType === 'touch' && viewerZoom === 1 ? {x: event.clientX, y: event.clientY} : null;
                },
                onPointerup(event) {
                    if (!photoGesture) return;
                    const dx = event.clientX - photoGesture.x;
                    const dy = event.clientY - photoGesture.y;
                    photoGesture = null;
                    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepViewerPhoto(dx < 0 ? 1 : -1);
                },
                onPointercancel() { photoGesture = null; }
            }, [
                h('img', {id: 'photo-viewer-image', alt: item.alt, src: item.src, draggable: false, style: viewerImageStyle,
                    onLoad: () => setViewerMessage(''),
                    onError: () => setViewerMessage('照片加载失败，请关闭后重试。')}),
                h('p', {id: 'photo-viewer-message', role: 'status'}, viewerMessage)
            ]),
            h('div', {class: 'photo-viewer-navigation'}, [
                actionButton('上一张', 'photo-previous', 'btn btn-ghost-light', {id: 'photo-viewer-previous', disabled: viewerIndex === 0}),
                h('span', '左右切换 · 放大后可滚动查看'),
                actionButton('下一张', 'photo-next', 'btn btn-ghost-light', {id: 'photo-viewer-next', disabled: viewerIndex === viewerPhotos.length - 1})
            ])
        ]) : null, $('#photo-viewer-content'));
    }

    function setViewerMessage(message) {
        viewerMessage = message;
        renderPhotoViewer();
    }

    function openPhotoViewer(image) {
        const gallery = image.closest('.review-photo-gallery');
        const images = gallery ? $$('img', gallery) : [image];
        const photos = images.map(item => ({ src: item.currentSrc || item.src, alt: item.alt || '照片' }));
        showPhotoViewer(photos, images.indexOf(image), true);
    }

    function showPhotoViewer(photos, index, record) {
        viewerPhotos = photos;
        viewerIndex = index;
        if (record) {
            history.pushState({ ...history.state, photoViewer: { photos, index } }, '', window.location.href);
        }
        openModal($('#photo-viewer-modal'));
        showViewerPhoto();
    }

    function resizeViewerPhoto() {
        const stage = $('#photo-viewer-stage');
        if (!stage) return;
        viewerImageStyle = {width: stage.clientWidth * viewerZoom + 'px', height: stage.clientHeight * viewerZoom + 'px'};
        renderPhotoViewer();
    }

    function showViewerPhoto() {
        const item = viewerPhotos[viewerIndex];
        if (!item) return;
        viewerZoom = 1;
        setViewerMessage('正在加载照片…');
        $('#photo-viewer-stage').scrollTo(0, 0);
        resizeViewerPhoto();
    }

    function stepViewerPhoto(direction) {
        const index = viewerIndex + direction;
        if (index < 0 || index >= viewerPhotos.length) return;
        viewerIndex = index;
        if (history.state?.photoViewer) {
            history.replaceState({ ...history.state, photoViewer: { photos: viewerPhotos, index } }, '', window.location.href);
        }
        showViewerPhoto();
    }

    function handleModalKeys(event) {
        const top = modalStack.value.at(-1);
        if (!top) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            dismissModal(top);
            return;
        }
        if (top.id === 'photo-viewer-modal') {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                stepViewerPhoto(event.key === 'ArrowLeft' ? -1 : 1);
            }
        }
        if (event.key !== 'Tab') return;
        const controls = $$('button, a[href], input, select, textarea, [tabindex]', top)
            .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) {
            event.preventDefault();
            return;
        }
        if (!top.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function closeModal(modal) {
        if (!modal) return;
        const wasOpen = modalStack.value.includes(modal);
        if (wasOpen && modal.id === 'recommendation-modal') recommendationRequest++;
        if (wasOpen) modalStack.value = modalStack.value.filter(item => item !== modal);
        if (modal.id === 'photo-viewer-modal') {
            viewerPhotos = [];
            photoGesture = null;
            viewerImageStyle = null;
            renderPhotoViewer();
        }
        if (modal.id === 'forum-thread-modal') {
            threadId = null;
            forumThreadRequest++;
        }
        if (wasOpen && modal.id === 'report-modal') Vue.render(null, $('#report-content'));

        if (modal.id === 'detail-modal') {
            unmountStallControls();
            state.detailId = null;
            state.detailData = null;
            destroyChart();
            const content = $('#detail-content');
            if (content) Vue.render(null, content);
        }
        if (modal.id === 'rating-modal') {
            clearRatingPhotoPreviews();
            ratingPhotos = [];
            state.reopenDetailId = null;
            if (state.returnToMyReviews) {
                state.returnToMyReviews = false;
                openMyReviews();
            }
        }
        const target = modalFocusOrigins.get(modal);
        if (wasOpen && target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
    }

    function showFileTip() {
        const {h, render} = Vue;
        render(h('div', {class: 'file-tip'}, [
            '当前页面是通过本地文件打开的，接口请求会失败。请先运行 ',
            h('code', 'python app.py'), '，然后访问 ',
            h('a', {href: 'http://127.0.0.1:5000/'}, 'http://127.0.0.1:5000/'), '。'
        ]), $('#file-tip-container'));
    }

    /* ---------------- 事件 ---------------- */

    function bindEvents() {
        window.addEventListener('message', event => {
            if (event.origin === window.location.origin && event.source === $('#food-map-frame').contentWindow &&
                event.data?.action === 'map-open-stall' && Number.isSafeInteger(event.data.id)) openDetail(event.data.id);
        });
        $('#admin-user-search').addEventListener('submit', event => {
            event.preventDefault();
            loadAdministratorAccounts();
        });
        $('#recommendation-content').addEventListener('submit', submitRecommendation);
        $('#recommendation-content').addEventListener('change', async event => {
            const select = event.target;
            if (!select.matches('input[name="list"]')) return;
            const form = select.form;
            const values = () => new FormData(form).getAll('list');
            const title = $('[data-new-recommendation]', form);
            title.hidden = !values().includes('new');
            title.querySelector('input').disabled = title.hidden;
            title.querySelector('input').required = !title.hidden;
            const selected = values().join(',');
            if (!/^\d+$/.test(selected)) {
                $('button[type="submit"]', form).disabled = false;
                return;
            }
            const submit = $('button[type="submit"]', form);
            submit.disabled = true;
            try {
                const list = await api(recommendationApi + '/' + selected);
                if (values().join(',') !== selected) return;
                const item = list?.items.find(entry => entry.stall_id === Number(form.dataset.id));
                form.elements.reason.value = item?.reason || '';
                $$('input[name="dish"]', form).forEach(input => {
                    input.checked = item?.dish_ids.includes(Number(input.value)) ?? false;
                });
            } catch (error) {
                toast(error.message, 'error');
                if (values().join(',') === selected) select.checked = false;
            } finally {
                if (values().join(',') === selected || !values().length) submit.disabled = false;
            }
        });
        $('#add-food-type').addEventListener('submit', event => {
            event.preventDefault();
            saveFoodTypeChange(event.submitter, '/api/admin/food-types', 'POST', {
                name: event.target.elements.namedItem('name').value.trim()
            });
        });
        $('#admin-food-types').addEventListener('submit', event => {
            event.preventDefault();
            const {foodTypeId} = event.target.closest('[data-food-type-id]').dataset;
            saveFoodTypeChange(event.submitter, '/api/admin/food-types/' + foodTypeId, 'PATCH', {
                name: event.target.elements.namedItem('name').value.trim()
            });
        });
        window.addEventListener('resize', () => {
            if (viewerPhotos.length) resizeViewerPhoto();
        });
        $('#forum-kind-filter').addEventListener('change', () => loadForum());
        $('#forum-more').addEventListener('click', () => loadForum(true));
        $('#forum-more-replies').addEventListener('click', () => openForumThread(threadId, true));
        $('#forum-compose-form').addEventListener('submit', submitForumPost);
        $('#forum-reply-form').addEventListener('submit', submitForumReply);
        $('#campus-food-search').addEventListener('input', renderCampusFood);
        $('#campus-food-directory').addEventListener('click', event => {
            const building = event.target.closest('[data-campus-building]');
            if (building) {
                campusLocationFilter = '';
                campusBuildingFilter = building.dataset.campusBuilding;
                renderCampusFood();
                return;
            }
            const button = event.target.closest('[data-campus-location]');
            if (!button) return;
            campusLocationFilter = button.dataset.campusLocation;
            campusBuildingFilter = '';
            renderCampusFood();
            $('#campus-food-directory [aria-pressed="true"]')?.focus({ preventScroll: true });
        });
        $('#feedback-form').addEventListener('submit', submitFeedback);
        $('#feedback-form').elements.building.addEventListener('change', updateFeedbackLocation);
        $('#feedback-form').elements.photo.addEventListener('change', event => {
            $('#feedback-photo-label').textContent = event.target.files[0]?.name || '最多 5 MB';
        });
        $('#feedback-status').addEventListener('change', loadFeedback);
        $('#admin-add-review-label').addEventListener('submit', event => {
            event.preventDefault();
            saveReviewLabelCatalog('POST', event.submitter, {name: event.target.elements.label.value});
        });
        $('#admin-review-label-list').addEventListener('submit', event => {
            event.preventDefault();
            saveReviewLabelCatalog('PATCH', event.submitter, {
                name: event.target.closest('[data-review-label-name]').dataset.reviewLabelName, new_name: event.target.elements.label.value
            });
        });
        $('#admin-rating-search').addEventListener('input', renderAdminRatings);
        $('#admin-rating-search-filters').addEventListener('change', event => {
            if (event.target.matches('select')) renderAdminRatings();
        });
        $('#admin-rating-list').addEventListener('change', event => {
            const select = event.target.closest('[data-review-label-id]');
            if (select) setReviewLabel(state.admin.ratings.find(item => Number(item.id) === Number(select.dataset.reviewLabelId)), select, renderAdminRatings);
        });
        $('#admin-feedback-list').addEventListener('submit', event => {
            const form = event.target.closest('[data-feedback-approve]');
            if (!form) return;
            event.preventDefault();
            processFeedback(form.closest('[data-feedback-id]').dataset.feedbackId, event.submitter, {
                action: 'approve', name: form.elements.namedItem('name').value.trim(), category_id: Number(form.elements.category.value)
            });
        });
        const loginButton = $('#login-btn');
        const logoutButton = $('#logout-btn');
        if (loginButton) loginButton.addEventListener('click', openAuth);
        if (logoutButton) logoutButton.addEventListener('click', logout);

        const searchInput = $('#search-input');
        if (searchInput) {
            searchInput.addEventListener('input', event => {
                state.search = event.target.value.trim();
                renderCanteenGrid();
            });
        }

        const sortSelect = $('#sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', event => {
                setSort(event.target.value);
            });
        }

        $$('.ranking-filters select').forEach(select => select.addEventListener('change', renderRanking));
        updateFoodTypeOptions();
        $('#random-food-dining').addEventListener('change', clearRandomFoodResult);
        for (const picker of $$('#stall-food-type, #ranking-food-type, #random-food-type')) {
            $('.food-picker-clear', picker).addEventListener('click', () => setFoodPickerSelection(picker, []));
        }

        const ratingForm = $('#rating-form');
        if (ratingForm) ratingForm.addEventListener('submit', submitRating);


        const categoryForm = $('#add-category-form');
        if (categoryForm) categoryForm.addEventListener('submit', addCategory);

        const canteenForm = $('#add-canteen-form');
        if (canteenForm) canteenForm.addEventListener('submit', addCanteen);
        $('#admin-canteen-filter').addEventListener('change', renderAdminCanteens);

        const ratingCategory = $('#rating-category');
        $('#rating-canteen').addEventListener('change', () => loadRatingDishes());
        $('#rating-dish').addEventListener('change', selectRatingDish);
        $('#rating-add-new-dish').addEventListener('click', () => addRatingDish());
        if (ratingCategory) {
            ratingCategory.addEventListener('change', event => {
                fillRatingCanteens(event.target.value, null);
                clearError($('#rating-error'));
            });
        }

        $$('.star-btn').forEach(button => {
            button.addEventListener('click', () => setRatingScore(Number(button.dataset.score)));
        });

        document.addEventListener('click', handleDocumentClick);
        $('#nickname-btn').addEventListener('click', openNickname);
        $('#profile-avatar-input').addEventListener('change', event => {
            const photo = event.target.files[0];
            if (photo) changeProfileAvatar(photo);
        });
        $('#profile-avatar-remove').addEventListener('click', () => changeProfileAvatar(null));
        $('#rating-photo').addEventListener('change', event => {
            const input = event.target;
            const files = Array.from(input.files);
            const error = $('#rating-error');
            input.value = '';
            clearError(error);
            if (files.some(file => file.size > 5 * 1024 * 1024)) {
                showError(error, '每张照片不能超过 5 MB，请重新选择');
                return;
            }
            if (ratingPhotoCount() + files.length > 4) {
                showError(error, '每条评价最多可上传 4 张照片');
                return;
            }
            ratingPhotos.push(...files);
            updateRatingPhotoPicker();
        });
        $('#rating-photo-clear').addEventListener('click', () => {
            ratingPhotos = [];
            clearError($('#rating-error'));
            updateRatingPhotoPicker();
        });
        $('#rating-photo-preview').addEventListener('click', event => {
            const button = event.target.closest('button[data-photo-index]');
            if (!button) return;
            ratingPhotos.splice(Number(button.dataset.photoIndex), 1);
            clearError($('#rating-error'));
            updateRatingPhotoPicker();
        });
        $('#rating-remove-photo').addEventListener('change', updateRatingPhotoPicker);
        $('#my-reviews-btn').addEventListener('click', openMyReviews);
        $('#nickname-form').addEventListener('submit', saveNickname);
        $('#admin-category-list').addEventListener('submit', saveCategoryName);
        document.addEventListener('keydown', handleModalKeys);
    }

    function handleDocumentClick(event) {
        const closeTrigger = event.target.closest('[data-close-modal]');
        if (closeTrigger) {
            dismissModal(closeTrigger.closest('.modal'));
            return;
        }
        const photo = event.target.closest('img.review-photo, img.detail-photo');
        const photoLink = event.target.closest('a, button[data-photo-open]')?.querySelector('img.review-photo, img.detail-photo');
        if (photo || photoLink) {
            event.preventDefault();
            openPhotoViewer(photo || photoLink);
            return;
        }

        const navTrigger = event.target.closest('[data-nav]');
        if (navTrigger) {
            event.preventDefault();
            showView(navTrigger.dataset.nav);
            return;
        }

        const campus = event.target.closest('[data-dining-campus]');
        if (campus) {
            state.categoryFilter = null;
            state.diningGroupFilter = '';
            state.diningCampusFilter = campus.dataset.diningCampus;
            renderCategoryNav();
            renderCanteenGrid();
            return;
        }
        const diningGroup = event.target.closest('[data-dining-group]');
        if (diningGroup) {
            state.categoryFilter = null;
            state.diningGroupFilter = diningGroup.dataset.diningGroup;
            state.diningCampusFilter = '';
            renderCategoryNav();
            renderCanteenGrid();
            return;
        }
        const categoryTrigger = event.target.closest('[data-category]');
        if (categoryTrigger) {
            setCategoryFilter(categoryTrigger.dataset.category);
            return;
        }

        const rankingModeTrigger = event.target.closest('[data-ranking-mode]');
        if (rankingModeTrigger) {
            setRankingMode(rankingModeTrigger.dataset.rankingMode);
            return;
        }

        const adminTab = event.target.closest('[data-admin-tab]');
        if (adminTab) {
            switchAdminTab(adminTab.dataset.adminTab);
            return;
        }

        const ratingFilter = event.target.closest('[data-rating-filter]');
        if (ratingFilter) {
            setRatingFilter(ratingFilter.dataset.ratingFilter);
            return;
        }

        const actionTrigger = event.target.closest('[data-action]');
        if (actionTrigger) {
            handleAction(actionTrigger.dataset.action, actionTrigger);
        }
    }

    function handleAction(action, element) {
        const rawId = element.dataset.id;
        const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;

        switch (action) {
            case 'admin-rating-by-author':
            case 'admin-rating-all-authors':
                if (state.isAdmin) {
                    state.adminRatingUserId = id;
                    renderAdminRatings();
                    const target = id ? $('#admin-rating-author-scope') : $('#admin-rating-filters');
                    target.scrollIntoView({block: 'nearest'});
                    $('#admin-rating-list').scrollTop = 0;
                }
                break;
            case 'my-recommendations':
                selectMySection('my-recommendations');
                loadMyRecommendations();
                break;
            case 'recommendation-open':
                if (id) openRecommendation(id);
                break;
            case 'recommendation-create':
                ++recommendationRequest;
                $('#recommendation-title').textContent = '新建清单';
                Vue.render(recommendationForm(), $('#recommendation-content'));
                openModal($('#recommendation-modal'));
                break;
            case 'recommendation-add-stall':
                addStallToRecommendation(id);
                break;
            case 'recommendation-copy':
                if (id) copyRecommendation(id, element);
                break;
            case 'recommendation-move':
                if (id) moveRecommendationItem(id, Number(element.dataset.stall), element);
                break;
            case 'recommendation-save':
            case 'recommendation-remove-item':
            case 'recommendation-delete':
                if (id) changeRecommendation(action, id, element);
                break;
            case 'photo-previous':
                stepViewerPhoto(-1);
                break;
            case 'photo-next':
                stepViewerPhoto(1);
                break;
            case 'photo-zoom-in':
            case 'photo-zoom-out':
            case 'photo-reset':
                viewerZoom = action === 'photo-reset' ? 1 : Math.min(3, Math.max(1, viewerZoom + (action === 'photo-zoom-in' ? 0.5 : -0.5)));
                resizeViewerPhoto();
                if (viewerZoom === 1) $('#photo-viewer-stage').scrollTo(0, 0);
                break;
            case 'copy-content-link':
                navigator.clipboard.writeText(window.location.href)
                    .then(() => toast('链接已复制'))
                    .catch(() => toast('复制失败，可复制浏览器地址栏里的链接', 'error'));
                break;
            case 'forum-compose':
                $('#forum-compose-form').reset();
                clearError($('#forum-compose-error'));
                openModal($('#forum-compose-modal'));
                break;
            case 'forum-open':
                if (id) openForumThread(id);
                break;
            case 'forum-delete':
                if (id && window.confirm('删除这条帖子及其所有回复？')) {
                    api(`/api/forum/posts/${id}`, { method: 'DELETE' }).then(() => {
                        if (threadId === id) dismissModal($('#forum-thread-modal'));
                        toast('帖子已删除');
                        loadForum();
                    }).catch(error => toast(error.message, 'error'));
                }
                break;
            case 'edit-category':
                toggleCategoryEdit(element, true);
                break;
            case 'cancel-category-edit':
                toggleCategoryEdit(element, false);
                break;
            case 'feedback-issue':
                openFeedback('issue');
                break;
            case 'moderate-user':
                if (id && state.isAdmin) moderateUser(id, element);
                break;
            case 'feedback-stall-issue':
                if (state.detailData) openFeedback('issue', state.detailData);
                break;
            case 'feedback-stall':
                openFeedback('stall');
                break;
            case 'feedback-campus':
                openFeedback('campus');
                break;
            case 'feedback-photo':
                if (id) showFeedbackPhoto(id, element);
                break;
            case 'feedback-close':
                if (id) processFeedback(id, element, { action: 'close' });
                break;
            case 'delete-review-photo':
                if (id) deleteReviewPhoto(id, element);
                break;
            case 'open-public-profile':
                if (id) openPublicProfile(id);
                break;
            case 'toggle-follow':
                if (id && state.token) toggleFollow(id, element);
                break;
            case 'my-following':
                if (state.token) {
                    selectMySection('my-following');
                    loadFollowing('following');
                }
                break;
            case 'follow-list':
                if (state.token) loadFollowing(element.dataset.list === 'followers' ? 'followers' : 'following');
                break;
            case 'my-reviews':
                selectMySection('my-reviews');
                break;
            case 'edit-own-profile':
                if (state.token) openNickname();
                break;
            case 'my-public-profile':
                if (state.token) {
                    selectMySection('my-public-profile');
                    const panel = $('#my-profile-panel');
                    Vue.render(Vue.createTextVNode('正在加载…'), panel);
                    api('/api/profile').then(profile => openPublicProfile(profile.id, true))
                        .catch(error => Vue.render(Vue.createTextVNode(error.message), panel));
                }
                break;
            case 'profile-review-stall':
                closeModal($('#public-profile-modal'));
                if (element.closest('#my-profile-panel')) closeModal($('#my-reviews-modal'));
                if (id) openDetail(id);
                break;
            case 'edit-my-review':
                if (id) editMyReview(id, element);
                break;
            case 'edit-review': {
                const review = state.detailData?.comments.find(item => item.id === id && item.is_mine);
                if (review) openRating(state.detailId, review);
                break;
            }
            case 'withdraw-review':
                if (id) withdrawReview(id, element);
                break;
            case 'toggle-category':
                if (rawId !== undefined) toggleCategory(rawId);
                break;
            case 'expand-all':
                expandAllCategories();
                break;
            case 'collapse-all':
                collapseAllCategories();
                break;
            case 'toggle-rated':
                toggleRatedOnly();
                break;
            case 'open-detail':
                if (id) openDetail(id);
                break;
            case 'open-rating':
                openRating(id);
                break;
            case 'random-food':
                recommendRandomFood();
                break;
            case 'scroll-grid': {
                const grid = $('#canteen-grid');
                if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            }
            case 'report':
                if (id) openReport(id);
                break;
            case 'review-vote':
                if (id) voteOnReview(id, element);
                break;
            case 'delete-review-label': {
                const name = element.closest('[data-review-label-name]').dataset.reviewLabelName;
                if (state.isAdmin && window.confirm(`删除「${name}」？使用该标签的评价会移除此标签。`)) {
                    saveReviewLabelCatalog('DELETE', element, {name});
                }
                break;
            }
            case 'delete-food-type': {
                const {foodTypeId} = element.closest('[data-food-type-id]').dataset;
                if (state.isAdmin && window.confirm('删除这个分类？档口会移除此标签。')) {
                    saveFoodTypeChange(element, '/api/admin/food-types/' + foodTypeId, 'DELETE');
                }
                break;
            }
            case 'reset-filters':
                resetFilters();
                break;
            case 'retry':
                setInitialLoading();
                loadCategories().catch(() => {});
                loadCanteens().catch(() => {});
                loadRanking().catch(() => {});
                break;
            case 'admin-delete-category':
                if (id) deleteCategory(id);
                break;
            case 'admin-delete-canteen':
                if (id) deleteCanteen(id);
                break;
            case 'admin-restore-canteen':
                if (id) restoreCanteen(id);
                break;
            case 'admin-archive-canteen':
                if (id) archiveCanteen(id);
                break;
            case 'admin-delete-rating':
                if (id) deleteRating(id, element);
                break;
            case 'admin-restore-rating':
                if (id) restoreRating(id);
                break;
            case 'admin-delete-report':
                if (id) deleteReport(id);
                break;
            case 'admin-backfill':
                backfillHistory();
                break;
            default:
                break;
        }
    }
    Vue.createApp({
        render: () => Vue.h(window.CanteenShell),
        mounted: init
    }).mount('#canteen-app');
})();
