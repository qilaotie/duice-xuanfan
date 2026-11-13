(() => {
    'use strict';

    const state = {
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
        adminRatingFilter: 'all'
    };

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
        return $$('.food-choice[aria-pressed="true"]', picker).map(button => button.value);
    }

    function updateFoodPickerSummary(picker) {
        const count = selectedFoodTypes(picker).length;
        const label = picker.id === 'random-food-type' ? '推荐品类' : '餐饮分类';
        $('summary', picker).textContent = count ? `${label}（已选 ${count} 项）` : `${label}（全部）`;
    }

    function updateFoodTypeOptions() {
        const types = foodTypes();
        state.foodType = state.foodType.filter(id => types.some(type => type.id === id));
        for (const selector of ['#stall-food-type', '#ranking-food-type', '#random-food-type']) {
            const picker = $(selector);
            const previous = selector === '#stall-food-type' ? state.foodType : selectedFoodTypes(picker);
            $('.food-picker-options', picker).innerHTML = types.map(({id, name}) =>
                `<button type="button" class="food-choice" value="${escapeHtml(id)}" aria-pressed="${previous.includes(id)}">${escapeHtml(name)}</button>`
            ).join('');
            updateFoodPickerSummary(picker);
        }
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

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        restoreAuth();

        if (window.location.protocol === 'file:') {
            showFileTip();
            return;
        }

        bindEvents();
        setInitialLoading();
        if (await useBackupIfNeeded()) return;
        await Promise.allSettled([loadCategories(), loadCanteens(), loadRanking(), loadFoodTypes()]);
        window.addEventListener('popstate', applyRoute);
        window.addEventListener('hashchange', () => {
            if (window.location.hash !== activeRouteHash) applyRoute();
        });
        history.scrollRestoration = 'manual';
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

    const viewPaths = { stalls: '/canteens', campus: '/campus', forum: '/forum', ranking: '/ranking', admin: '/admin' };

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
            if (photoModal.classList.contains('is-open') && !history.state?.photoViewer) {
                closeModal(photoModal);
                return;
            }
            if (history.state?.photoViewer && !photoModal.classList.contains('is-open')) {
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
        const snapshot = parent?.ui || history.state?.ui;
        $$('.modal.is-open').forEach(closeModal);
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
                $('#forum-post-list').innerHTML = forumRowsHtml(forumCachedRows);
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

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatNumber(value) {
        return numberFormat.format(Number(value) || 0);
    }

    function formatScore(value) {
        if (value === null || value === undefined || value === '') return '—';
        return Number(value).toFixed(1);
    }

    function starsHtml(score) {
        const rounded = Math.round(Number(score) || 0);
        return [1, 2, 3, 4, 5]
            .map(i => `<span${i > rounded ? ' class="is-empty"' : ''}>★</span>`)
            .join('');
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

    function toast(message, type = 'success') {
        const stack = $('#toast-stack');
        if (!stack) return;
        const element = document.createElement('div');
        const icon = type === 'error' ? '!' : type === 'info' ? 'i' : '✓';
        element.className = `toast toast-${type}`;
        element.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
        stack.appendChild(element);
        requestAnimationFrame(() => element.classList.add('is-visible'));
        window.setTimeout(() => {
            element.classList.remove('is-visible');
            window.setTimeout(() => element.remove(), 250);
        }, 3200);
    }

    function emptyState(title, text, icon = '🍽️') {
        return `<div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(text)}</p>
        </div>`;
    }

    function errorState(title, text) {
        return `<div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(text)}</p>
            <button type="button" class="btn btn-soft btn-sm" style="margin-top:14px" data-action="retry">重新加载</button>
        </div>`;
    }

    function adminEmpty(message) {
        return `<div class="admin-empty">${escapeHtml(message)}</div>`;
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
        $('[data-admin-tab="administrators"]').hidden = !state.isAdmin;
        if (!state.isAdmin && state.adminTab === 'administrators') switchAdminTab('categories');
        const loggedIn = Boolean(state.token);
        $('#my-reviews-btn').hidden = !loggedIn && !localStorage.getItem('guestToken');

        const loginButton = $('#login-btn');
        const userMenu = $('#user-menu');
        if (loginButton) loginButton.hidden = loggedIn;
        if (userMenu) userMenu.hidden = !loggedIn;

        if (loggedIn) {
            const name = state.nickname || state.username || '同学';
            if ($('#user-name')) $('#user-name').textContent = name;
            if ($('#user-avatar')) $('#user-avatar').textContent = name.slice(0, 1);
            if ($('#admin-badge')) $('#admin-badge').hidden = !state.isAdmin;
        } else if ($('#admin-badge')) {
            $('#admin-badge').hidden = true;
        }

        $$('.nav-link[data-nav="admin"]').forEach(link => {
            link.hidden = !state.isAdmin;
        });

        if (!state.isAdmin && state.view === 'admin') {
            showView('stalls');
        }
    }

    function forceLogout() {
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
        $('#auth-title').textContent = register ? '注册' : '登录';
        $('#auth-submit').textContent = register ? '注册' : '登录';
        $('#auth-toggle').textContent = register ? '已有账号？登录' : '没有账号？注册';
        $('#auth-confirm-field').hidden = !register;
        $('#auth-confirm').disabled = !register;
        $('#auth-confirm').required = register;
        $('#auth-confirm').value = '';
        $('#auth-nickname-field').hidden = !register;
        $('#auth-nickname').disabled = !register;
        $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
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
        return photoImage(url, '', 'avatar-image') || escapeHtml(initialOf(name));
    }

    function showProfileAvatar(url) {
        $('#profile-avatar-preview').innerHTML = avatarContent(url, state.nickname || '同学');
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
        if (id && !$('#my-profile-panel').hidden && $('#my-reviews-modal').classList.contains('is-open')) {
            return openPublicProfile(id, true);
        }
    }

    async function openPublicProfile(id, inline = false) {
        const requestId = ++publicProfileRequest;
        const modal = $('#public-profile-modal');
        const title = $('#public-profile-title');
        const content = $(inline ? '#my-profile-panel' : '#public-profile-content');
        if (!inline) title.textContent = '个人资料';
        content.textContent = '正在加载…';
        if (!inline) openModal(modal);
        try {
            const profile = await api(`/api/users/${id}`);
            if (requestId !== publicProfileRequest) return;
            if (!inline) title.textContent = profile.nickname || '同学';
            if (inline && profile.is_self) ownProfileId = id;
            content.innerHTML = `
                <div class="profile-heading">
                    <span class="comment-avatar">${avatarContent(profile.avatar_url, profile.nickname || '同学')}</span>
                    ${inline ? `<h3>${escapeHtml(profile.nickname || '同学')}</h3>` : ''}
                    ${profile.is_self ? '<button type="button" class="btn btn-soft btn-sm" data-action="edit-own-profile">编辑资料</button>' : ''}
                </div>
                <p>口味偏好：${escapeHtml(profile.taste || '未填写')}</p>
                <p>出生地：${escapeHtml(profile.birthplace || '未填写')}</p>
                <p>获赞 ${formatNumber(profile.likes_received)} <small>（公开评价）</small></p>
                ${state.token && !profile.is_self ? `<div><button type="button" class="btn btn-soft btn-sm"
                    data-action="toggle-follow" data-id="${Number(id)}" aria-pressed="${profile.following === true}">${profile.following ? '取消关注' : '关注'}</button></div>` : ''}
                <div class="stack" data-author-recommendations></div>
                <h3>历史评价</h3>
                ${profile.reviews.length ? profile.reviews.map(review => `
                    <article class="detail-panel">
                        <button type="button" class="link-btn" data-action="profile-review-stall" data-id="${Number(review.canteen_id)}">${escapeHtml(review.canteen_name)}</button>
                        <p class="muted">${escapeHtml(formatTime(review.created_at))} · ${escapeHtml(review.score)} 分</p>
                        <p class="comment-text">${escapeHtml(review.content || '（无文字评价）')}</p>
                        ${review.dish_name ? `<p class="comment-text">${escapeHtml(review.dish_name)}</p>` : ''}
                        ${review.dish_scores.map(dish => `<p class="comment-text">${escapeHtml(dish.name)} · ${escapeHtml(dish.score)} 分</p>`).join('')}
                    </article>`).join('') : '<p class="muted">暂无公开评价。</p>'}
            `;
            loadAuthorRecommendations(id, $('[data-author-recommendations]', content));
        } catch (error) {
            if (requestId === publicProfileRequest) content.textContent = error.message;
        }
    }

    const recommendationApi = '/api/recommendations';

    function recommendationCards(lists, emptyText) {
        return lists.length ? lists.map(list => `<article class="detail-panel">
            <button type="button" class="link-btn" data-action="recommendation-open" data-id="${Number(list.id)}">${escapeHtml(list.title)}</button>
            ${list.is_public ? '' : '<span class="badge badge-amber">草稿</span>'}
            ${list.description ? `<p class="comment-text">${escapeHtml(list.description)}</p>` : ''}
        </article>`).join('') : `<p class="muted">${emptyText}</p>`;
    }

    async function loadAuthorRecommendations(id, content) {
        try {
            const lists = await api(recommendationApi + '?author=' + id);
            if (lists.length) content.innerHTML = '<h3>公开清单</h3>' + recommendationCards(lists, '');
        } catch (error) {
            content.textContent = error.message;
        }
    }

    async function loadMyRecommendations() {
        const content = $('#my-recommendations-panel');
        content.textContent = '正在加载…';
        try {
            const [own, saved] = await Promise.all([api(recommendationApi), api(recommendationApi + '?saved=1')]);
            content.innerHTML = `<div><button type="button" class="btn btn-primary btn-sm" data-action="recommendation-create">新建清单</button></div>
                <h3>我创建的</h3>${recommendationCards(own, '还没有创建清单。')}
                <h3>我收藏的</h3>${recommendationCards(saved, '还没有收藏清单。')}`;
        } catch (error) {
            content.textContent = error.message;
        }
    }

    function recommendationForm(list = {}) {
        return `<form class="stack" data-recommendation-form="metadata" data-id="${Number(list.id || 0)}">
            <label>标题<input name="title" required maxlength="60" value="${escapeHtml(list.title || '')}"></label>
            <label>简介<textarea name="description" maxlength="500" rows="3">${escapeHtml(list.description || '')}</textarea></label>
            <label>可见范围<select name="visibility"><option value="draft">仅自己可见 · 草稿</option>
                <option value="public"${list.is_public ? ' selected' : ''}>公开 · 可分享</option></select></label>
            <div><button type="submit" class="btn btn-primary btn-sm">${list.id ? '保存修改' : '创建清单'}</button></div>
        </form>`;
    }

    let recommendationRequest = 0;

    async function openRecommendation(id) {
        const version = ++recommendationRequest;
        const modal = $('#recommendation-modal');
        const content = $('#recommendation-content');
        $$('.modal.is-open').filter(item => item !== modal).forEach(closeModal);
        openContentRoute('#/recommendations/' + id);
        $('#recommendation-title').textContent = '美食清单';
        content.textContent = '正在加载…';
        openModal(modal);
        try {
            const list = await api(recommendationApi + '/' + id);
            if (version !== recommendationRequest) return;
            $('#recommendation-title').textContent = list.title;
            content.innerHTML = `
                <p class="muted">${escapeHtml(list.nickname || '同学')} · ${list.is_public ? '公开清单' : '草稿'}</p>
                ${list.description ? `<p class="comment-text">${escapeHtml(list.description)}</p>` : ''}
                <div class="feedback-review-actions">
                    ${list.is_public ? '<button type="button" class="btn btn-ghost btn-sm" data-action="copy-content-link">复制清单链接</button>' : ''}
                    ${list.is_public && !list.own ? `<button type="button" class="btn btn-soft btn-sm" data-action="recommendation-save" data-id="${id}" aria-pressed="${list.saved}">${list.saved ? '取消收藏' : '收藏清单'}</button>` : ''}
                </div>
                ${list.items.length ? list.items.map(item => `<article class="detail-panel stack">
                    <div>
                        ${item.is_active ? `<button type="button" class="link-btn" data-action="open-detail" data-id="${Number(item.stall_id)}">${escapeHtml(item.name)}</button>` :
                            `<strong>${escapeHtml(item.name || '档口已移除')}</strong> <span class="badge badge-amber">已下架</span>`}
                        <p class="muted">${escapeHtml(item.category_name || '')}</p>
                    </div>
                    ${item.dishes.length ? `<p>推荐菜品 · ${item.dishes.map(escapeHtml).join('、')}</p>` : ''}
                    ${item.reason ? `<p class="comment-text">${escapeHtml(item.reason)}</p>` : ''}
                    ${list.own ? `<div><button type="button" class="btn btn-ghost btn-sm" data-action="recommendation-remove-item" data-id="${id}" data-stall="${Number(item.stall_id)}">移出清单</button></div>` : ''}
                </article>`).join('') : '<p class="muted">还没有收录档口。</p>'}
                ${list.own ? `<details><summary>编辑清单</summary>${recommendationForm(list)}
                    <button type="button" class="btn btn-danger btn-sm" data-action="recommendation-delete" data-id="${id}">删除清单</button>
                </details>` : ''}
            `;
        } catch (error) {
            if (version === recommendationRequest) content.textContent = error.message;
        }
    }

    async function addStallToRecommendation(stallId) {
        if (!state.token) return openAuth();
        if (!stallId) return;
        const version = ++recommendationRequest;
        const content = $('#recommendation-content');
        $('#recommendation-title').textContent = '加入清单';
        content.textContent = '正在加载…';
        openModal($('#recommendation-modal'));
        try {
            const [lists, stall] = await Promise.all([
                api(recommendationApi),
                state.detailData?.id === stallId ? state.detailData : api('/api/canteens/' + stallId)
            ]);
            if (version !== recommendationRequest) return;
            content.innerHTML = `<form class="stack" data-recommendation-form="stall" data-id="${Number(stall.id)}">
                <strong>${escapeHtml(stall.name)}</strong>
                ${lists.length ? `<label>选择清单<select name="list" required><option value="">请选择</option>
                    ${lists.map(list => `<option value="${Number(list.id)}">${escapeHtml(list.title)}${list.is_public ? '' : '（草稿）'}</option>`).join('')}
                    <option value="new">新建草稿</option></select></label>` : '<input type="hidden" name="list" value="new">'}
                <label data-new-recommendation${lists.length ? ' hidden' : ''}>新清单标题<input name="title" maxlength="60"${lists.length ? ' disabled' : ' required'}></label>
                ${stall.dishes?.length ? `<fieldset><legend>推荐菜品（可多选）</legend>
                    ${stall.dishes.map(dish => `<div><label><input type="checkbox" name="dish" value="${Number(dish.id)}"> ${escapeHtml(dish.name)}</label></div>`).join('')}</fieldset>` : ''}
                <label>推荐理由（选填）<textarea name="reason" maxlength="300" rows="3"></textarea></label>
                <div><button type="submit" class="btn btn-primary btn-sm">保存档口</button></div>
            </form>`;
        } catch (error) {
            if (version === recommendationRequest) content.textContent = error.message;
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
                if (form.isConnected && $('#recommendation-modal').classList.contains('is-open')) await openRecommendation(id || result.id);
            } else {
                let listId = data.get('list');
                const dishIds = data.getAll('dish').map(Number);
                if (dishIds.length > 30) throw new Error('最多可选择 30 道菜');
                if (listId === 'new') {
                    const result = await api(recommendationApi, {method: 'POST', body: {title: data.get('title'), is_public: false}});
                    listId = String(result.id);
                    const select = form.elements.list;
                    if (select instanceof HTMLSelectElement) select.add(new Option(data.get('title') + '（草稿）', listId));
                    select.value = listId;
                    const title = $('[data-new-recommendation]', form);
                    title.hidden = true;
                    title.querySelector('input').disabled = true;
                }
                await api(recommendationApi + '/' + listId + '/items/' + id, {
                    method: 'PUT', body: {dish_ids: dishIds, reason: data.get('reason')}
                });
                if (form.isConnected) closeModal($('#recommendation-modal'));
                toast('档口已保存到清单');
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
        followDirection = direction;
        const requestId = ++followRequest;
        const list = $('#my-following-list');
        $$('[data-action="follow-list"]').forEach(button => {
            const active = button.dataset.list === direction;
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('btn-soft', active);
            button.classList.toggle('btn-ghost', !active);
        });
        list.textContent = '正在加载…';
        try {
            const users = await api('/api/my/' + direction);
            if (requestId !== followRequest) return;
            list.innerHTML = users.map(user => `<button type="button" class="btn btn-ghost follow-user"
                data-action="open-public-profile" data-id="${Number(user.id)}">
                <span class="comment-avatar" aria-hidden="true">${avatarContent(user.avatar_url, user.nickname || '同学')}</span>
                <strong>${escapeHtml(user.nickname || '同学')}</strong><span aria-hidden="true">›</span>
                </button>`).join('')
                || `<p class="muted">${direction === 'followers' ? '还没有人关注你。' : '还没有关注的人。'}</p>`;
        } catch (error) {
            if (requestId === followRequest) list.textContent = error.message;
        }
    }

    async function toggleFollow(id, button) {
        const method = button.getAttribute('aria-pressed') === 'true' ? 'DELETE' : 'PUT';
        button.disabled = true;
        try {
            const result = await api(`/api/users/${id}/follow`, {method});
            button.setAttribute('aria-pressed', String(result.following));
            button.textContent = result.following ? '取消关注' : '关注';
            if (!$('#my-following-panel').hidden && $('#my-reviews-modal').classList.contains('is-open')) await loadFollowing();
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
            grid.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton skeleton-section"></div>').join('');
        }
        const nav = $('#category-nav');
        if (nav) {
            nav.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton skeleton-line"></div>').join('');
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
            dining.replaceChildren(new Option('全部食堂', ''), ...diningGroups().map(({name}) => new Option(name, name)));
            if (Array.from(dining.options).some(option => option.value === previousDining)) dining.value = previousDining;
            renderCategoryNav();
            if (state.view === 'ranking') renderRanking();
            renderCampusFood();
            if (state.canteensLoaded) renderHeroStats();
            if (!$('#rating-modal').classList.contains('is-open')) fillRatingCategories();
            fillAdminCategorySelect();
        } catch (error) {
            const nav = $('#category-nav');
            if (nav) nav.innerHTML = '<div class="admin-empty">食堂加载失败</div>';
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
            if (grid) grid.innerHTML = errorState('档口加载失败', '请确认后端 Flask 正在运行，然后重试。');
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
            if (podium) podium.innerHTML = errorState('排行榜加载失败', '请稍后重试。');
            const list = $('#ranking-list');
            if (list) list.innerHTML = '';
            const best = $('#category-best');
            if (best) best.innerHTML = '';
            throw error;
        }
    }

    async function refreshAll() {
        await Promise.all([loadCategories(), loadCanteens(), loadRanking()]);
        if (state.isAdmin) await loadAdminAll();
    }

    /* ---------------- 首页 / 档口列表 ---------------- */

    function renderHeroStats() {
        const container = $('#hero-stats');
        if (!container) return;

        const ratingRows = state.ranking.filter(row => row.avg_score !== null && row.avg_score !== undefined);
        const totalRatings = ratingRows.reduce((sum, row) => sum + (Number(row.rating_count) || 0), 0);
        container.innerHTML = `
            <div class="stat-card"><strong>${formatNumber(diningGroups().length)}</strong><span>食堂</span></div>
            <div class="stat-card"><strong>${formatNumber(diningStalls().length)}</strong><span>档口</span></div>
            <div class="stat-card"><strong>${formatNumber(totalRatings)}</strong><span>条评价</span></div>
        `;
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
        nav.innerHTML = `<button type="button" class="category-btn${state.categoryFilter === null && !state.diningGroupFilter && !state.diningCampusFilter ? ' is-active' : ''}" data-category="all">
            <span class="cat-name">全部档口</span><span class="cat-count">${stalls.length}</span>
        </button>` + campuses.map(campus => {
            const campusGroups = groups.filter(group => group.campus === campus);
            const campusTotal = campusGroups.reduce((sum, group) => sum + group.floors.reduce((count, floor) => count + (counts.get(String(floor.id)) || 0), 0), 0);
            return `<div class="directory-campus">
                <button type="button" class="category-btn campus-directory-heading${state.diningCampusFilter === campus ? ' is-active' : ''}" data-dining-campus="${escapeHtml(campus)}">
                    <span class="cat-name">${escapeHtml(campus)}</span><span class="cat-count">${campusTotal}</span>
                </button>
                ${campusGroups.map((group, index) => {
            const total = group.floors.reduce((sum, floor) => sum + (counts.get(String(floor.id)) || 0), 0);
            return `<div class="dining-directory-group">
                <button type="button" class="category-btn${state.diningGroupFilter === group.name ? ' is-active' : ''}" data-dining-group="${escapeHtml(group.name)}">
                    <span class="cat-dot" style="background:${CATEGORY_DOTS[index % CATEGORY_DOTS.length]}"></span>
                    <span class="cat-name">${escapeHtml(group.name)}</span><span class="cat-count">${total}</span>
                </button>
                <div class="dining-floor-links">${group.floors.map(floor => `<button type="button" class="category-btn${state.categoryFilter === floor.id ? ' is-active' : ''}" data-category="${floor.id}">
                    <span class="cat-name">${escapeHtml(floor.label)}</span><span class="cat-count">${counts.get(String(floor.id)) || 0}</span>
                </button>`).join('')}</div>
            </div>`;
                }).join('')}
            </div>`;
        }).join('');
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
        const copy = $('#random-food-copy');
        const name = document.createElement('strong');
        name.textContent = stall.name;
        const location = document.createElement('span');
        location.textContent = [stall.category_name || '位置待补充',
            stall.score == null ? '暂无评分' : '评分 ' + formatScore(stall.score)].join(' · ');
        copy.replaceChildren(name, location);
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
        const list = $('#campus-food-list');
        const buildings = getCategories().filter(category => category.kind === 'campus');
        if (!buildings.length) {
            list.textContent = '正在加载校内楼宇…';
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
        const renderFloor = (location, index) => {
            const selected = String(location.id) === campusLocationFilter;
            return `<button type="button" class="category-btn${selected ? ' is-active' : ''}"
                data-campus-location="${escapeHtml(location.id)}" aria-pressed="${selected}">
                <span class="cat-dot" style="background:${index ? CATEGORY_DOTS[(index - 1) % CATEGORY_DOTS.length] : '#0f766e'}"></span>
                <span class="cat-name">${escapeHtml(location.name)}</span><span class="cat-count">${location.count}</span>
            </button>`;
        };
        const directoryNode = $('#campus-food-directory');
        directoryNode.classList.add('dining-directory');
        directoryNode.innerHTML = `<button type="button" class="category-btn${!campusLocationFilter && !campusBuildingFilter ? ' is-active' : ''}"
            data-campus-location="" aria-pressed="${!campusLocationFilter && !campusBuildingFilter}">
            <span class="cat-name">全部地点</span><span class="cat-count">${total}</span></button>` +
            directoryGroups.map(name => {
                const locations = directory.filter(location => campusBuildingName(location) === name);
                const selected = campusBuildingFilter === name;
                return `<div class="dining-directory-group">
                    <button type="button" class="category-btn${selected ? ' is-active' : ''}" data-campus-building="${escapeHtml(name)}" aria-pressed="${selected}">
                        <span class="cat-name">${escapeHtml(name)}</span><span class="cat-count">${locations.reduce((sum, location) => sum + location.count, 0)}</span>
                    </button>
                    ${locations.length > 1 ? `<div class="dining-floor-links">${locations.map((location, index) =>
                        renderFloor({ ...location, name: location.name.startsWith(name) ? location.name.slice(name.length) : location.name }, index)).join('')}</div>` : ''}
                </div>`;
            }).join('');

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
            list.innerHTML = emptyState('没有找到相关美食', '试试其他关键词，或切回全部地点。');
            return;
        }
        list.innerHTML = Array.from(grouped, ([building, locations]) => `<section class="detail-panel stack">
            <div class="panel-head"><h2>${escapeHtml(building)}</h2></div>
            ${locations.map(({ location, entries }) => {
            return `<div>
                <div class="panel-head"><h3>${escapeHtml((location.name.startsWith(building) ? location.name.slice(building.length) : location.name) || '全部美食')}</h3><span class="muted">${entries.length} 家</span></div>
                ${entries.length ? entries.map(stall => `<div class="admin-row">
                    <div class="admin-row-main"><strong>${escapeHtml(stall.name)}</strong>
                    <p>${stall.score == null ? '暂无评分' : `${escapeHtml(stall.score)} / 5`}</p></div>
                    <button type="button" class="btn btn-soft btn-sm" data-action="open-detail" data-id="${Number(stall.id)}">查看详情</button>
                </div>`).join('') : '<p class="muted">还没有收录美食，欢迎推荐。</p>'}
            </div>`;
            }).join('')}
        </section>`).join('');
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

    function stallRowHtml(canteen, rankingById) {
        const parts = splitStallName(canteen.name);
        const ranking = rankingById.get(canteen.id);
        const hasScore = canteen.score !== null && canteen.score !== undefined;
        const reviews = ranking ? Number(ranking.rating_count) || 0 : 0;

        return `<button type="button" class="stall-row" data-action="open-detail" data-id="${canteen.id}" title="${escapeHtml(canteen.name)}">
            <span class="slot-badge${parts.slot ? '' : ' is-empty'}">${escapeHtml(parts.slot || '·')}</span>
            <span class="stall-row-main">
                <span class="stall-row-name">${escapeHtml(parts.name)}</span>
            </span>
            <span class="stall-row-score${hasScore ? '' : ' is-empty'}">${hasScore ? `★ ${formatScore(canteen.score)}` : '暂无评分'}</span>
            <span class="stall-row-reviews">${reviews ? `${formatNumber(reviews)} 条` : ''}</span>
            <span class="stall-row-arrow" aria-hidden="true">›</span>
        </button>`;
    }

    function renderCategoryBlock(group, options) {
        const { single, searching, index, rankingById } = options;
        const expanded = single || searching || state.expandedCategories.has(group.key);
        const visibleItems = expanded ? group.items : group.items.slice(0, 3);
        const collapsible = !single && !searching && group.items.length > 3;
        const average = categoryAverage(group.items, rankingById);
        const stats = `${formatNumber(group.items.length)} 个档口${average ? ` · 均分 ${average}` : ''}`;
        const floor = diningGroups().flatMap(parent => parent.floors).find(item => item.id === group.id);
        const floorName = floor?.label.split(' · ')[0];
        const hasFloor = /^[一二三四五六七八九十\d]+楼$/.test(floorName || '');
        const inner = `<span class="floor-heading-badge">${escapeHtml(hasFloor ? floorName : '餐厅')}</span>
                <span class="category-title">${escapeHtml(group.name)}</span>
                <span class="category-stats">${stats}</span>
                ${collapsible ? `<span class="category-chevron" aria-hidden="true">${expanded ? '▴' : '▾'}</span>` : ''}`;

        const header = collapsible
                ? `<button type="button" class="category-head" data-action="toggle-category" data-id="${escapeHtml(group.key)}" aria-expanded="${expanded}">${inner}</button>`
                : `<div class="category-head is-static">${inner}</div>`;
        const rows = visibleItems.map(canteen => stallRowHtml(canteen, rankingById)).join('');
        const footer = collapsible
            ? `<button type="button" class="category-more" data-action="toggle-category" data-id="${escapeHtml(group.key)}">${expanded ? '收起' : `展开全部 ${formatNumber(group.items.length)} 个档口`}</button>`
            : '';

        return `<section class="category-block${single ? ' is-single' : ''}">
            ${header}
            <div class="stall-list">${rows}</div>
            ${footer}
        </section>`;
    }

    function updateListToolbar(single, searching) {
        const picker = $('#stall-food-type');
        $$('.food-choice', picker).forEach(button => button.setAttribute('aria-pressed', String(state.foodType.includes(button.value))));
        updateFoodPickerSummary(picker);
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
        if (!grid || !state.canteensLoaded) return;

        if (!diningStalls().length) {
            grid.innerHTML = emptyState('还没有档口', '请管理员先在后台添加食堂和档口。');
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
            grid.innerHTML = `<div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>没有找到相关档口</h3>
                <p>换个关键词，或者看看全部档口。</p>
                <button type="button" class="btn btn-soft btn-sm" style="margin-top:14px" data-action="reset-filters">查看全部</button>
            </div>`;
            return;
        }

        const blocks = groups.map((group, index) => ({ group, html: renderCategoryBlock(group, {
            single,
            searching,
            index,
            rankingById
        }) }));
        if (single) grid.innerHTML = blocks.map(block => block.html).join('');
        else {
            const parents = diningGroups();
            grid.innerHTML = [...new Set(parents.map(parent => parent.campus))].map(campus => {
                const sections = parents.filter(parent => parent.campus === campus).map(parent => {
                const floors = blocks.filter(block => parent.floors.some(floor => floor.id === block.group.id));
                return floors.length ? `<section class="dining-result-group stack"><h2>${escapeHtml(parent.name)}</h2>${floors.map(floor => floor.html).join('')}</section>` : '';
                }).join('');
                return sections ? `<section class="campus-result-section stack"><h2 class="campus-result-title">${escapeHtml(campus)}</h2>${sections}</section>` : '';
            }).join('');
            const ungrouped = blocks.filter(block => !parents.some(parent => parent.floors.some(floor => floor.id === block.group.id)));
            grid.insertAdjacentHTML('beforeend', ungrouped.map(block => block.html).join(''));
        }
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
        scope.replaceChildren(new Option('全部食堂', ''));
        for (const [prefix, title] of [['campus:', '校区'], ['dining:', '食堂'], ['floor:', '楼层']]) {
            const options = document.createElement('optgroup');
            options.label = title;
            for (const [key, location] of locations) {
                if (key.startsWith(prefix)) options.append(new Option(location.name, key));
            }
            if (options.children.length) scope.append(options);
        }
        if (locations.has(selected)) scope.value = selected;
        const floors = locations.get(scope.value)?.floors;
        const rows = state.ranking.filter(row => row.avg_score != null && matchesFoodType(row, foodType) &&
            row.rating_count >= minimum && (!floors || floors.has(row.category_name)));
        const byScore = (a, b) => b.avg_score - a.avg_score;
        const byCount = (a, b) => b.rating_count - a.rating_count;
        rows.sort((a, b) => (order === 'count' ? byCount(a, b) || byScore(a, b)
            : byScore(a, b) || byCount(a, b)) || a.id - b.id);
        if (count) count.textContent = rows.length ? `${formatNumber(rows.length)} 个档口有评分` : '';

        if (!rows.length) {
            podium.innerHTML = state.ranking.length
                ? emptyState('没有符合条件的档口', '试试扩大范围或降低最低评价数。')
                : emptyState('还没有评分', '等同学们写下第一条评价，排行榜就会出现在这里。');
            list.innerHTML = '';
            best.innerHTML = '';
            return;
        }

        const top = rows.slice(0, 3);
        const podiumItems = [];
        if (top.length >= 3) {
            podiumItems.push({ row: top[1], rank: 2 });
            podiumItems.push({ row: top[0], rank: 1 });
            podiumItems.push({ row: top[2], rank: 3 });
        } else if (top.length === 2) {
            podiumItems.push({ row: top[0], rank: 1 });
            podiumItems.push({ row: top[1], rank: 2 });
        } else if (top.length === 1) {
            podiumItems.push({ row: top[0], rank: 1 });
        }
        podium.classList.toggle('is-two', top.length === 2);
        podium.classList.toggle('is-one', top.length === 1);

        podium.innerHTML = podiumItems.map(({ row, rank }) => `
            <article class="podium-card${rank === 1 ? ' is-first' : ''}">
                <div class="podium-medal">${rank}</div>
                <h3>${escapeHtml(row.name)}</h3>
                <p class="muted">${escapeHtml(row.category_name || '未分类')}</p>
                <div class="podium-score">${order === 'count'
                    ? `${formatNumber(row.rating_count)}<small> 条评价</small>`
                    : `${formatScore(row.avg_score)}<small> / 5</small>`}</div>
                <button type="button" class="btn btn-soft btn-sm" data-action="open-detail" data-id="${row.id}">查看评价</button>
            </article>
        `).join('');

        if (state.rankingMode === 'category') {
            const grouped = new Map();
            rows.forEach(row => {
                const key = row.category_name || '未分类';
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(row);
            });

            list.innerHTML = Array.from(grouped.entries()).map(([category, items]) => `
                <div class="ranking-group">
                    <div class="ranking-group-title">
                        <span>${escapeHtml(category)}</span>
                        <span class="muted">${formatNumber(items.length)} 个档口</span>
                    </div>
                    ${items.map((row, index) => rankingRowHtml(row, index)).join('')}
                </div>
            `).join('');
        } else {
            list.innerHTML = rows.map((row, index) => rankingRowHtml(row, index)).join('');
        }

        const groups = new Map();
        rows.forEach(row => {
            const key = row.category_name || '未分类';
            if (!groups.has(key)) groups.set(key, row);
        });

        best.innerHTML = Array.from(groups.entries()).map(([category, row]) => `
            <div class="best-row">
                <div class="best-row-main">
                    <strong>${escapeHtml(category)}</strong>
                    <span>${escapeHtml(row.name)}</span>
                </div>
                <span class="best-score">${order === 'count' ? formatNumber(row.rating_count) + ' 条' : formatScore(row.avg_score)}</span>
            </div>
        `).join('');
    }

    function rankingRowHtml(row, index) {
        return `<div class="ranking-row">
            <span class="rank-num${index < 3 ? ' is-top' : ''}">${index + 1}</span>
            <div class="ranking-main">
                <div class="ranking-name">${escapeHtml(row.name)}</div>
                <div class="ranking-meta">${escapeHtml(row.category_name || '未分类')} · ${formatNumber(row.rating_count)} 条评价</div>
            </div>
            <span class="ranking-score">${formatScore(row.avg_score)}</span>
            <button type="button" class="ranking-open" data-action="open-detail" data-id="${row.id}" aria-label="查看 ${escapeHtml(row.name)} 的评价">›</button>
        </div>`;
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
        if (name === 'admin' && !state.isAdmin) {
            toast('请先用管理员账号登录', 'error');
            return;
        }

        if (!applyingRoute) {
            saveRouteState();
            $$('.modal.is-open').forEach(closeModal);
            state.view = name;
            const hash = listHash();
            if (window.location.hash !== hash) history.pushState(null, '', hash);
            activeRouteHash = hash;
        }
        state.view = name;
        $$('.view').forEach(view => {
            const active = view.id === `view-${name}`;
            view.hidden = !active;
            view.classList.toggle('is-active', active);
        });
        $$('.nav-link').forEach(link => link.classList.toggle('is-active', link.dataset.nav === name));
        if (!applyingRoute) window.scrollTo({ top: 0, behavior: 'instant' });

        if (name === 'ranking') renderRanking();
        if (name === 'campus') renderCampusFood();
        if (name === 'forum' && !applyingRoute) loadForum();
        if (name === 'admin') loadAdminAll();
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
    let forumThreadRequest = 0;

    function forumBadge(kind) {
        return kind === 'avoid' ? '<span class="badge badge-red">避雷</span>' : '<span class="badge badge-amber">推荐</span>';
    }

    function forumRowsHtml(rows) {
        return rows.map(post => `<article class="detail-panel stack">
            <div class="panel-head"><h3>${forumBadge(post.kind)} ${escapeHtml(post.name)}</h3></div>
            <p class="muted">${escapeHtml(post.address)}</p>
            <p class="comment-text">${escapeHtml(post.content)}</p>
            <div class="panel-head">
                <span class="muted">${escapeHtml(post.author)} · ${escapeHtml(formatTime(post.created_at))}</span>
                <button type="button" class="btn btn-soft btn-sm" data-action="forum-open" data-id="${Number(post.id)}">查看帖子 · ${formatNumber(post.reply_count)} 条回复</button>
            </div>
        </article>`).join('');
    }

    async function loadForum(append = false) {
        const request = ++forumListRequest;
        const list = $('#forum-post-list');
        const more = $('#forum-more');
        more.disabled = true;
        if (!append) {
            forumCursor = 0;
            more.hidden = true;
            list.textContent = '正在加载帖子…';
        }
        try {
            const kind = $('#forum-kind-filter').value;
            const data = await api(`/api/forum/posts?kind=${encodeURIComponent(kind)}&cursor=${forumCursor}`);
            if (request !== forumListRequest) return;
            const html = forumRowsHtml(data.rows);
            forumCachedRows = append ? forumCachedRows.concat(data.rows) : data.rows;
            if (append) list.insertAdjacentHTML('beforeend', html);
            else list.innerHTML = html || emptyState('这里还没有帖子', '欢迎分享你的校外美食推荐或避雷经历。');
            forumCursor = data.rows.at(-1)?.id ?? forumCursor;
            more.hidden = !data.more;
            saveRouteState();
        } catch (error) {
            if (request !== forumListRequest) return;
            if (append) toast(error.message, 'error');
            else list.textContent = error.message;
        } finally {
            if (request === forumListRequest) more.disabled = false;
        }
    }

    async function openForumThread(id, append = false) {
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
            replies.replaceChildren();
            content.textContent = '正在加载帖子…';
            openModal(modal);
        }
        try {
            const { post, rows, more: hasMore } = await api(`/api/forum/posts/${id}?cursor=${replyCursor}`);
            if (request !== forumThreadRequest) return;
            content.innerHTML = `<article class="detail-panel stack">
                <h3>${forumBadge(post.kind)} ${escapeHtml(post.name)}</h3>
                <p>地址：${escapeHtml(post.address)}</p>
                <p class="comment-text">${escapeHtml(post.content)}</p>
                <p class="muted">1 楼 · ${escapeHtml(post.author)} · ${escapeHtml(formatTime(post.created_at))}</p>
                <div><button type="button" class="btn btn-soft btn-sm" data-action="copy-content-link">复制帖子链接</button></div>
                ${post.can_delete ? `<div><button type="button" class="link-btn" data-action="forum-delete" data-id="${Number(post.id)}">删除帖子</button></div>` : ''}
            </article>`;
            const html = rows.map(reply => `<article class="detail-panel">
                <p class="muted">${formatNumber(reply.floor)} 楼 · ${escapeHtml(reply.author)} · ${escapeHtml(formatTime(reply.created_at))}</p>
                <p class="comment-text">${escapeHtml(reply.content)}</p>
            </article>`).join('');
            if (append && replyCursor) replies.insertAdjacentHTML('beforeend', html);
            else replies.innerHTML = html || '<p class="muted">还没有回复，来盖第一楼吧。</p>';
            replyCursor = rows.at(-1)?.floor ?? replyCursor;
            more.hidden = !hasMore;
            form.hidden = false;
        } catch (error) {
            if (request !== forumThreadRequest) return;
            if (append) toast(error.message, 'error');
            else {
                content.replaceChildren();
                const message = document.createElement('p');
                message.textContent = error.status === 404 ? '帖子已删除或不存在。' : error.message;
                const back = document.createElement('button');
                back.type = 'button';
                back.className = 'btn btn-soft';
                back.textContent = '返回论坛';
                back.setAttribute('data-close-modal', '');
                content.append(message, back);
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
            if (threadId === id && $('#forum-thread-modal').classList.contains('is-open')) {
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
        const canteenId = Number(id);
        if (!canteenId) return;

        closeModal($('#recommendation-modal'));
        openContentRoute('#/stalls/' + canteenId);
        state.detailId = canteenId;
        destroyChart();
        openModal($('#detail-modal'));
        const content = $('#detail-content');
        content.innerHTML = detailSkeleton();

        try {
            const [data, reviewLabels] = await Promise.all([
                api(`/api/canteens/${canteenId}`),
                state.isAdmin ? api('/api/admin/review-labels').catch(() => null) : null
            ]);
            if (state.detailId !== canteenId) return;
            renderDetail(data, reviewLabels);
        } catch (error) {
            if (state.detailId !== canteenId) return;
            content.innerHTML = `<div class="detail-body">
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>加载失败</h3>
                    <p>${escapeHtml(error.message)}</p>
                    <button type="button" class="btn btn-soft btn-sm" style="margin-top:14px" data-action="open-detail" data-id="${canteenId}">重试</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-close-modal>返回列表</button>
                </div>
            </div>`;
        }
    }

    function detailSkeleton() {
        return `<div class="detail-hero">
            <div class="skeleton" style="width:110px;height:16px;background:rgba(255,255,255,.2)"></div>
            <div class="skeleton" style="width:58%;height:32px;margin-top:14px;background:rgba(255,255,255,.18)"></div>
            <div class="skeleton" style="width:38%;height:14px;margin-top:12px;background:rgba(255,255,255,.14)"></div>
        </div>
        <div class="detail-body">
            <div class="skeleton" style="height:220px"></div>
            <div class="skeleton" style="height:160px"></div>
        </div>`;
    }

    function renderDetail(data, reviewLabels = null) {
        const content = $('#detail-content');
        if (!content) return;
        state.detailData = data;

        const comments = Array.isArray(data.comments) ? data.comments : [];
        const history = Array.isArray(data.history) ? data.history : [];
        const scoreText = formatScore(data.score);

        content.innerHTML = `
            <div class="detail-hero">
                <span class="tag tag-light">${escapeHtml(data.category_name || '未分类')}</span>
                <div class="detail-photo-row">
                    ${photoImage(data.photo_url, data.name)}
                    <div>
                        <h2 id="detail-title">${escapeHtml(data.name)}</h2>
                    </div>
                </div>
                <p class="detail-meta">${formatNumber(comments.length)} 条评价${history.length ? ` · ${formatNumber(history.length)} 个历史快照` : ''}</p>
                <div class="detail-score-row">
                    <div class="detail-score">${scoreText}<small>/5</small></div>
                    <div>
                        <div class="stars">${starsHtml(data.score)}</div>
                        <div class="detail-meta">综合评分</div>
                    </div>
                    <div class="detail-actions">
                        <button type="button" class="btn btn-light btn-sm" data-action="open-rating" data-id="${Number(data.id)}">写评价</button>
                        <button type="button" class="btn btn-ghost-light btn-sm" data-action="copy-content-link">复制链接</button>
                        <button type="button" class="btn btn-ghost-light btn-sm" data-action="recommendation-add-stall" data-id="${Number(data.id)}">加入清单</button>
                        <button type="button" class="btn btn-ghost-light btn-sm" data-action="feedback-stall-issue">问题反馈</button>
                    </div>
                </div>
            </div>
            <div class="detail-body">
                ${state.isAdmin ? renderStallManagement(data) : ''}
                ${data.dishes?.length && !state.isAdmin ? `<section class="detail-panel">
                    <div class="panel-head"><h3>档口菜品</h3></div>
                    ${data.dishes.map(dish => `<div class="detail-photo-row dish-photo-row">
                        ${photoImage(dish.photo_url, dish.name)}
                        <div><strong>${escapeHtml(dish.name)}</strong>
                            <p class="muted">${dish.rating_count ? `${escapeHtml(dish.score)} / 5 · ${formatNumber(dish.rating_count)} 人评分` : '暂无菜品评分'}</p>
                        </div>
                    </div>`).join('')}
                </section>` : ''}
                ${history.length ? `<section class="detail-panel">
                    <div class="panel-head">
                        <h3>评分趋势</h3>
                        <span class="muted">历史平均分</span>
                    </div>
                    <div class="chart-wrap"><canvas id="history-chart"></canvas></div>
                </section>` : ''}
                <section class="detail-panel">
                    <div class="panel-head">
                        <h3>同学们怎么说</h3>
                        <span class="muted">${formatNumber(comments.length)} 条</span>
                    </div>
                    ${comments.length ? `<div class="review-filters">
                        <label>排序 <select id="detail-review-sort">
                            <option value="newest">最新</option><option value="oldest">最早</option><option value="hot">热度（赞 − 踩）</option>
                        </select></label>
                        <label>标签 <select id="detail-review-filter"></select></label>
                    </div><div id="detail-review-list"></div>` : emptyState('还没有评论', '来写下第一条评价吧。', '💬')}
                </section>
            </div>
        `;

        if (comments.length) {
            const sort = $('#detail-review-sort');
            const filter = $('#detail-review-filter');
            const list = $('#detail-review-list');
            const render = () => {
                const selected = filter.value;
                const labels = [...new Set(comments.map(comment => comment.moderation_label).filter(Boolean))];
                filter.replaceChildren(new Option('全部', 'all'), new Option('无标签', 'untagged'),
                    ...labels.map(label => new Option(label, 'label:' + label)));
                if (Array.from(filter.options).some(option => option.value === selected)) filter.value = selected;
                list.innerHTML = renderDetailReviews(comments, sort.value, filter.value, reviewLabels);
            };
            sort.addEventListener('change', render);
            filter.addEventListener('change', render);
            list.addEventListener('change', event => {
                const select = event.target.closest('[data-review-label-id]');
                if (select) setReviewLabel(comments.find(comment => comment.id === Number(select.dataset.reviewLabelId)), select, render);
            });
            render();
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
        return comments.length
            ? comments.map(comment => `
                <article class="comment-item" data-review-id="${Number(comment.id)}">
                    ${comment.author_id
                        ? `<button type="button" class="comment-avatar" data-action="open-public-profile" data-id="${Number(comment.author_id)}" aria-label="查看${escapeHtml(comment.user)}的个人资料">${avatarContent(comment.avatar_url, comment.user)}</button>`
                        : `<div class="comment-avatar">${avatarContent(null, comment.user)}</div>`}
                    <div class="comment-main">
                        <div class="comment-head">
                            ${comment.author_id
                                ? `<button type="button" class="link-btn comment-user" data-action="open-public-profile" data-id="${Number(comment.author_id)}">${escapeHtml(comment.user)}</button>`
                                : `<span class="comment-user">${escapeHtml(comment.user || '匿名用户')}</span>`}
                            <span class="comment-time">${escapeHtml(formatTime(comment.created_at))}</span>
                            <span class="stars stars-sm">${starsHtml(comment.score)}</span>
                            ${comment.moderation_label ? `<span class="badge badge-amber" title="管理员标记">${escapeHtml(comment.moderation_label)}</span>` : ''}
                        </div>
                        ${(comment.dish_scores || []).map(dish => `<p class="comment-text">${escapeHtml(dish.name)} · ${escapeHtml(dish.score)} 分</p>`).join('')}
                        ${comment.dish_name ? `<p class="comment-text"><strong>菜品：</strong>${escapeHtml(comment.dish_name)}</p>` : ''}
                        <p class="comment-text">${escapeHtml(comment.content || '（无文字评价）')}</p>
                        ${renderReviewPhotos(comment)}
                        <div class="comment-actions">
                            ${Number.isInteger(comment.my_vote) ? `<div class="review-votes" role="group" aria-label="评价投票">
                                <button type="button" class="btn btn-ghost btn-sm" data-action="review-vote" data-id="${Number(comment.id)}" data-vote="1" aria-pressed="${comment.my_vote === 1}" aria-label="点赞" title="点赞">👍 <span>${formatNumber(comment.likes)}</span></button>
                                <button type="button" class="btn btn-ghost btn-sm" data-action="review-vote" data-id="${Number(comment.id)}" data-vote="-1" aria-pressed="${comment.my_vote === -1}" aria-label="踩" title="踩">👎 <span>${formatNumber(comment.dislikes)}</span></button>
                            </div>` : ''}
                            ${state.isAdmin && reviewLabels ? reviewLabelSelect(comment, reviewLabels) : ''}
                            ${state.isAdmin ? `<button type="button" class="btn btn-danger btn-sm" data-action="admin-delete-rating" data-id="${Number(comment.id)}">删除评价</button>` : ''}
                            ${comment.is_mine ? `
                                <button type="button" class="link-btn" data-action="edit-review" data-id="${Number(comment.id)}">修改</button>
                                <button type="button" class="link-btn" data-action="withdraw-review" data-id="${Number(comment.id)}">撤回</button>
                            ` : `<button type="button" class="link-btn" data-action="report" data-id="${Number(comment.id)}">举报</button>`}
                        </div>
                    </div>
                </article>
            `).join('')
            : emptyState('没有符合条件的评价', '试试切换标签筛选。', '💬');

    }

    function reviewLabelSelect(review, labels) {
        return `<select aria-label="评价标签" data-review-label-id="${Number(review.id)}">
            <option value="">无标签</option>
            ${labels.map(({name}) => `<option value="${escapeHtml(name)}"${name === review.moderation_label ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}
        </select>`;
    }

    function renderStallManagement(stall) {
        const id = Number(stall.id);
        return `<section class="detail-panel stack">
            <div class="panel-head"><h3>档口管理</h3></div>
            <form class="inline-form" data-menu-action="rename-canteen" data-id="${id}">
                <input name="name" aria-label="档口名称" value="${escapeHtml(stall.name)}" maxlength="100" required>
                <button type="submit" class="btn btn-primary btn-sm">保存档口名称</button>
            </form>
            ${foodCatalog ? `<form class="stack" data-stall-food-types="${id}">
                <fieldset>
                    <legend>餐饮分类（可多选）</legend>
                    <p class="muted">${Object.hasOwn(foodCatalog.overrides, id) ? '当前使用手动分类' : '当前根据档口名自动分类'}</p>
                    <div class="review-filters">
                        ${foodTypes().map(type => `<label><input type="checkbox" name="food-type" value="${escapeHtml(type.id)}"${stallFoodTypes(stall).some(item => item.id === type.id) ? ' checked' : ''}> ${escapeHtml(type.name)}</label>`).join('') || '<p class="muted">请先在后台新增餐饮分类。</p>'}
                    </div>
                </fieldset>
                <div class="feedback-review-actions">
                    <button type="submit" class="btn btn-primary btn-sm">保存分类</button>
                    <button type="submit" value="auto" class="btn btn-ghost btn-sm">恢复自动分类</button>
                </div>
            </form>` : ''}
            <div><strong>档口照片</strong>${photoControls('canteens', stall)}</div>
            <div class="panel-head"><h3>菜品管理</h3></div>
            <form class="inline-form" data-menu-action="add-dish" data-id="${id}">
                <input name="name" aria-label="新菜品名称" placeholder="输入新菜品名称" maxlength="80" required>
                <button type="submit" class="btn btn-primary btn-sm">添加菜品</button>
            </form>
            ${(stall.dishes || []).map(dish => `<div class="detail-photo-row dish-photo-row">
                ${photoImage(dish.photo_url, dish.name)}
                <div>
                    <form class="inline-form" data-menu-action="rename-dish" data-id="${Number(dish.id)}">
                        <input name="name" aria-label="菜品名称" value="${escapeHtml(dish.name)}" maxlength="80" required>
                        <button type="submit" class="btn btn-soft btn-sm">保存菜名</button>
                    </form>
                    <p class="muted">${dish.rating_count ? `${escapeHtml(dish.score)} / 5 · ${formatNumber(dish.rating_count)} 人评分` : '暂无菜品评分'}</p>
                    ${photoControls('dishes', dish)}
                </div>
            </div>`).join('') || '<p class="muted">这个档口还没有菜品。</p>'}
        </section>`;
    }

    async function saveMenuChange(event) {
        const form = event.target.closest('form[data-menu-action]');
        if (!form) return;
        event.preventDefault();
        const detailId = state.detailId;
        const { menuAction, id } = form.dataset;
        const add = menuAction === 'add-dish';
        const group = menuAction === 'rename-category' ? 'categories' : menuAction === 'rename-dish' ? 'dishes' : 'canteens';
        const path = `/api/admin/${group}/${id}${add ? '/dishes' : ''}`;
        const button = form.querySelector('button[type="submit"]');
        setBusy(button, true);
        try {
            await api(path, { method: add ? 'POST' : 'PATCH', body: { name: form.elements.namedItem('name').value.trim() } });
            toast(add ? '菜品已添加' : '名称已保存');
            if (detailId && state.detailId === detailId) await openDetail(detailId);
            if (group === 'categories') {
                await refreshAll();
            } else if (menuAction === 'rename-canteen') {
                await Promise.all([loadAdminAll(), loadCanteens(), loadRanking()]);
            }
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    function photoImage(url, alt, className = 'detail-photo') {
        if (!url) return '';
        const image = `<img class="${className}" src="${escapeHtml((window.CANTEEN_API_ORIGIN || '') + url)}" alt="${escapeHtml(alt)}" loading="lazy">`;
        return className === 'detail-photo'
            ? `<button type="button" class="photo-open" data-photo-open aria-label="查看${escapeHtml(alt)}大图">${image}</button>`
            : image;
    }

    function reviewPhotoUrls(review) {
        return review?.photo_urls ?? (review?.photo_url ? [review.photo_url] : []);
    }

    function renderReviewPhotos(review) {
        const photos = reviewPhotoUrls(review);
        if (!photos.length) return '';
        return `<div class="review-photo-gallery">${photos.map((url, index) => {
            const match = /^\/api\/(?:review-photos\/(\d+)|photos\/ratings\/\d+)$/.exec(url);
            const key = match ? match[1] || 'legacy' : '';
            const fullUrl = (window.CANTEEN_API_ORIGIN || '') + url;
            return `<div class="review-photo-tile">
                <a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener" aria-label="查看评价照片 ${index + 1} 的大图">
                    ${photoImage(url, `评价照片 ${index + 1}`, 'review-photo')}
                </a>
                ${review.is_mine && key ? `<button type="button" class="review-photo-delete" data-action="delete-review-photo"
                    data-id="${Number(review.id)}" data-photo-key="${key}" aria-label="删除第 ${index + 1} 张照片">×</button>` : ''}
            </div>`;
        }).join('')}</div>`;
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

    function photoControls(kind, item) {
        if (!state.isAdmin) return '';
        return `<div class="photo-controls">
            <label class="field">
                <span>${item.photo_url ? '更换照片' : '添加照片'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-kind="${kind}" data-id="${Number(item.id)}">
            </label>
            ${item.photo_url ? `<button type="button" class="btn btn-soft btn-sm" data-action="remove-photo" data-photo-kind="${kind}" data-id="${Number(item.id)}">移除照片</button>` : ''}
        </div>`;
    }

    async function updateDisplayPhoto(control, photo = null) {
        const detailId = state.detailId;
        const { photoKind, id } = control.dataset;
        const body = photo ? new FormData() : undefined;
        control.disabled = true;
        try {
            if (photo) body.append('photo', await preparePhoto(photo));
            await api(`/api/admin/photos/${photoKind}/${id}`, { method: photo ? 'PUT' : 'DELETE', body });
            if (state.detailId === detailId) await openDetail(detailId);
            toast(photo ? '照片已保存' : '照片已移除');
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            control.disabled = false;
            if (photo) control.value = '';
        }
    }

    function renderHistoryChart(history) {
        const canvas = $('#history-chart');
        if (!canvas) return;

        if (typeof Chart === 'undefined') {
            const lines = history.map(item => {
                const avg = item.avg_score === null || item.avg_score === undefined
                    ? '暂无评分'
                    : `${formatScore(item.avg_score)} 分`;
                return `${escapeHtml(formatTime(item.date))}（${escapeHtml(avg)} / ${formatNumber(item.rating_count)} 条）`;
            });
            canvas.parentElement.innerHTML = `<p class="muted" style="font-size:12.5px;line-height:2">${lines.join('<br>')}</p>`;
            return;
        }

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
        if (id && $('#detail-modal').classList.contains('is-open')) {
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
        targetSummary.replaceChildren();
        if (id) {
            const name = document.createElement('strong');
            name.textContent = selected?.name || reviewDetail?.name || '当前档口';
            const location = document.createElement('span');
            location.textContent = getCategories().find(item => item.id === categoryId)?.name || reviewDetail?.category_name || '';
            targetSummary.append(name, location);
        }
        $('#rating-dishes-extra').open = Boolean(review?.dish_scores?.length);
        $('#rating-photos-extra').open = Boolean(reviewPhotoUrls(review).length);
        if (review) {
            category.replaceChildren(new Option(detail.category_name || '未分类', detail.category_id));
            canteen.replaceChildren(new Option(detail.name, id));
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
        const modal = $('#my-reviews-modal');
        const list = $('#my-reviews-list');
        list.textContent = '正在加载评价…';
        $('#my-social-actions').hidden = !state.token;
        selectMySection('my-reviews');
        openModal(modal);
        try {
            const reviews = await api('/api/my/ratings');
            list.innerHTML = reviews.length ? reviews.map(review => `
                <article class="detail-panel">
                    <strong>${escapeHtml(review.canteen_name)}</strong>
                    <p class="muted">${escapeHtml(review.category_name || '未分类')} · ${escapeHtml(formatTime(review.created_at))} · ${escapeHtml(review.score)} 分</p>
                    <p class="comment-text">${escapeHtml(review.content || '（无文字评价）')}</p>
                    <div class="comment-actions">
                        <button type="button" class="link-btn" data-action="edit-my-review" data-id="${Number(review.id)}" data-canteen-id="${Number(review.canteen_id)}">修改</button>
                        <button type="button" class="link-btn" data-action="withdraw-review" data-id="${Number(review.id)}">撤回</button>
                    </div>
                </article>`).join('') : '<p class="muted">你还没有发布评价。</p>';
        } catch (error) {
            list.textContent = error.message;
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
            if (!modal.classList.contains('is-open')) return;
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
            if (fromMyReviews && $('#my-reviews-modal').classList.contains('is-open')) {
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

    function fillRatingCategories(selectedCanteenId = null) {
        const select = $('#rating-category');
        if (!select) return;

        const campus = state.ratingScope === 'campus';
        const categories = getCategories().filter(category => (category.kind === 'campus') === campus);
        select.innerHTML = campus
            ? '<option value="">请选择校内地点</option>' + categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')
            : '<option value="">请选择食堂和楼层</option>' + diningGroups().map(group => `<optgroup label="${escapeHtml(group.name)}">${group.floors.map(floor =>
                `<option value="${floor.id}">${escapeHtml(group.name + ' · ' + floor.label)}</option>`).join('')}</optgroup>`).join('');

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
            select.innerHTML = campus ? '<option value="">请先选择校内地点</option>' : '<option value="">请先选择食堂</option>';
            loadRatingDishes();
            return;
        }

        const list = state.canteens.filter(canteen => String(canteen.category_id) === String(categoryId));
        if (!list.length) {
            select.innerHTML = campus ? '<option value="">该地点暂无美食</option>' : '<option value="">该食堂暂无档口</option>';
            loadRatingDishes();
            return;
        }

        select.innerHTML = (campus ? '<option value="">请选择美食店铺</option>' : '<option value="">请选择档口</option>') + list
            .map(canteen => `<option value="${canteen.id}">${escapeHtml(canteen.name)}</option>`)
            .join('');

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

    function addRatingDish(option = null, currentScore = null) {
        const list = $('#rating-dish-scores');
        if (list.children.length >= 20) {
            showError($('#rating-error'), '每条评价最多可选 20 道菜');
            return;
        }
        clearError($('#rating-error'));
        const adding = !option;
        const row = document.createElement('div');
        row.className = 'field-row';
        row.dataset.dishId = adding ? '' : option.value;
        row.innerHTML = `
            <label class="field">
                <span>${adding ? '新菜品名称' : escapeHtml(option.textContent)}</span>
                ${adding ? '<input class="dish-name-input" maxlength="80" required>' : ''}
                <select class="dish-score-input" aria-label="菜品评分" required>
                    <option value="">请选择菜品评分</option>
                    ${[5, 4, 3, 2, 1].map(score => `<option value="${score}">${score} 分</option>`).join('')}
                </select>
            </label>
            <div><button type="button" class="btn btn-ghost btn-sm">移除</button></div>`;
        if (!adding) option.disabled = true;
        row.querySelector('button').addEventListener('click', () => {
            if (option) option.disabled = false;
            row.remove();
        });
        list.append(row);
        const scoreInput = row.querySelector('.dish-score-input');
        if (currentScore !== null) {
            if (![1, 2, 3, 4, 5].includes(currentScore)) {
                scoreInput.add(new Option(`${currentScore} 分`, currentScore));
            }
            scoreInput.value = String(currentScore);
        } else {
            row.querySelector('input, select').focus();
        }
    }

    async function loadRatingDishes(knownDishes = null) {
        const requestId = ++ratingDishRequest;
        const canteenId = $('#rating-canteen').value;
        const select = $('#rating-dish');
        $('#rating-add-new-dish').disabled = !canteenId;
        select.disabled = true;
        select.replaceChildren(new Option(canteenId ? '正在加载菜品…' : '请先选择档口', ''));
        $("#rating-dish-scores").replaceChildren();
        if (!canteenId) return;

        try {
            const dishes = knownDishes || await api(`/api/canteens/${canteenId}/dishes`);
            if (requestId !== ratingDishRequest) return;
            select.replaceChildren(new Option('请选择菜品（可选）', ''));
            dishes.forEach(dish => select.add(new Option(dish.name, dish.id)));
            select.disabled = false;
        } catch {
            if (requestId !== ratingDishRequest) return;
            select.replaceChildren(new Option('菜品加载失败，请重新选择档口', ''));
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
        $('#rating-photo-preview').replaceChildren();
    }

    function ratingPhotoCount() {
        return ratingPhotos.length + ($('#rating-remove-photo').checked ? 0 : savedRatingPhotoCount);
    }

    function updateRatingPhotoPicker() {
        const count = ratingPhotoCount();
        $('#rating-photo-hint').textContent = count
            ? `共 ${count}/4 张，新增 ${ratingPhotos.length} 张`
            : '可选，最多 4 张，每张不超过 5 MB';
        $('#rating-photo-clear').hidden = !ratingPhotos.length;
        clearRatingPhotoPreviews();
        ratingPhotoPreviewUrls = ratingPhotos.map(photo => URL.createObjectURL(photo));
        $('#rating-photo-preview').innerHTML = ratingPhotoPreviewUrls.map((url, index) => `
            <div class="review-photo-tile">
                <a href="${url}" target="_blank" rel="noopener" aria-label="查看第 ${index + 1} 张待上传照片">
                    <img class="review-photo" src="${url}" alt="待上传照片 ${index + 1}">
                </a>
                <button type="button" class="review-photo-delete" data-photo-index="${index}" aria-label="移除第 ${index + 1} 张待上传照片">×</button>
            </div>
        `).join('');
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
        $('#report-form').reset();
        $('#report-comment-id').value = String(commentId);
        clearError($('#report-error'));
        openModal($('#report-modal'));
    }

    async function submitReport(event) {
        event.preventDefault();
        const commentId = Number($('#report-comment-id').value);
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
            if (list) list.innerHTML = adminEmpty('加载失败，请稍后重试');
        }
    }

    function setAdminLoading() {
        ['admin-category-list', 'admin-canteen-list', 'admin-rating-list', 'admin-report-list', 'admin-action-list']
            .forEach(id => {
                const element = document.getElementById(id);
                if (element) element.innerHTML = adminEmpty('加载中…');
            });
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
        const stats = $('#admin-stats');
        if (!stats || !state.admin) return;

        const activeRatings = state.admin.ratings.filter(rating => !rating.is_deleted).length;
        const activeCanteens = state.admin.canteens.filter(canteen => canteen.is_active !== false).length;
        stats.innerHTML = `
            <div class="stat-card"><strong>${formatNumber(state.admin.categories.length)}</strong><span>食堂</span></div>
            <div class="stat-card"><strong>${formatNumber(activeCanteens)}</strong><span>在售档口</span></div>
            <div class="stat-card"><strong>${formatNumber(activeRatings)}</strong><span>有效评价</span></div>
            <div class="stat-card is-accent"><strong>${formatNumber(state.admin.reports.length)}</strong><span>待处理举报</span></div>
        `;
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

    async function loadAdministratorAccounts() {
        const list = $('#admin-accounts-list');
        const search = $('#admin-user-search').elements.q.value.trim();
        list.textContent = '正在加载…';
        try {
            const accounts = await api('/api/admin/users?q=' + encodeURIComponent(search));
            list.innerHTML = accounts.map(account => `
                <div class="admin-row">
                    <div class="admin-row-main">
                        <strong>${escapeHtml(account.username)}</strong>
                        <p>${escapeHtml(account.nickname || '未设置昵称')}</p>
                        <p>${account.is_admin ? '管理员' : '普通用户'} · ${account.is_banned ? '已封禁' : '可登录'} · ${account.is_muted ? '已禁言' : '可发言'}</p>
                    </div>
                    <div class="admin-row-actions">
                        <button type="button" class="btn btn-ghost btn-sm" data-action="open-public-profile"
                            data-id="${Number(account.id)}" aria-label="查看 ${escapeHtml(account.username)} 的主页">查看主页</button>
                        ${account.username === 'admin' ? '<span class="muted">主管理员</span>' : [
                            ['is_admin', account.is_admin ? '撤销管理权限' : '设为管理员'],
                            ['is_banned', account.is_banned ? '解除封禁' : '封禁'],
                            ['is_muted', account.is_muted ? '解除禁言' : '禁言']
                        ].filter(([field]) => field !== 'is_admin' || state.username === 'admin').map(([field, label]) => `<button type="button" class="btn btn-ghost btn-sm"
                            data-action="moderate-user" data-id="${Number(account.id)}" data-field="${field}"
                            data-enabled="${!account[field]}" data-account="${escapeHtml(account.username)}"
                            ${field === 'is_admin' && account.is_banned && !account.is_admin ? 'disabled' : ''}>${label}</button>`).join('')}
                    </div>
                </div>`).join('') || adminEmpty('没有找到匹配的用户。');
        } catch (error) {
            list.textContent = error.message;
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
        form.elements.building.replaceChildren(new Option(campus ? '请选择楼宇和楼层' : '请选择食堂或其他位置', ''), ...getCategories()
            .filter(category => (category.kind === 'campus') === campus).map(category => new Option(category.name, category.id)));
        if (kind === 'stall') form.elements.building.add(new Option('其他（手动填写）', 'other'));
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

    async function loadFeedback() {
        const list = $('#admin-feedback-list');
        const status = $('#feedback-status').value;
        list.textContent = '正在加载…';
        try {
            const rows = await api(`/api/admin/feedback?status=${status}`);
            if ($('#feedback-status').value !== status) return;
            const isCampus = row => state.admin.categories.some(category => category.id === row.suggested_category_id && category.kind === 'campus');
            const options = row => state.admin.categories
                .filter(category => (category.kind === 'campus') === isCampus(row))
                .map(category => `<option value="${Number(category.id)}"${category.id === row.suggested_category_id ? ' selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
            list.innerHTML = rows.length ? rows.map(row => `
                <article class="detail-panel stack" data-feedback-id="${Number(row.id)}">
                    <strong>${row.kind === 'stall' ? (isCampus(row) ? '校内美食推荐 · ' : '档口推荐 · ') + escapeHtml(row.name) : '问题反馈'}</strong>
                    <p class="muted">${escapeHtml(formatTime(row.created_at))} · ${{pending:'待处理',approved:'已入库',closed:row.kind === 'stall' ? '已忽略' : '已处理'}[row.status]}</p>
                    <p class="comment-text">${escapeHtml(row.content || '（无补充说明）')}</p>
                    ${row.has_photo ? `<div><button type="button" class="btn btn-soft btn-sm" data-action="feedback-photo" data-id="${Number(row.id)}">查看提交照片</button></div>` : ''}
                    ${row.status === 'pending' && row.kind === 'stall' ? `<form class="inline-form" data-feedback-approve>
                        <input name="name" aria-label="正式档口名称" value="${escapeHtml(row.name)}" maxlength="100" required>
                        <select name="category" aria-label="所属食堂或楼宇" required><option value="">请选择所属位置</option>${options(row)}</select>
                        <div class="feedback-review-actions">
                            <button type="submit" class="btn btn-primary">审核并入库</button>
                            <button type="button" class="btn btn-ghost" data-action="feedback-close" data-id="${Number(row.id)}">忽略</button>
                        </div>
                    </form>` : ''}
                    ${row.status === 'pending' && row.kind !== 'stall' ? `<div><button type="button" class="btn btn-ghost btn-sm" data-action="feedback-close" data-id="${Number(row.id)}">标为已处理</button></div>` : ''}
                </article>`).join('') : adminEmpty('暂无反馈。');
        } catch (error) {
            if ($('#feedback-status').value === status) list.textContent = error.message;
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
        const list = $('#admin-category-list');
        if (!list || !state.admin) return;

        if (!state.admin.categories.length) {
            list.innerHTML = adminEmpty('还没有食堂，在上方输入名称添加。');
            return;
        }

        list.innerHTML = state.admin.categories.map(category => {
            const count = state.admin.canteens.filter(canteen => canteen.category_id === category.id && canteen.is_active !== false).length;
            return `<div class="admin-row">
                <div class="admin-row-main">
                    <strong data-category-name>${escapeHtml(category.name)}</strong>
                    <form class="inline-form" data-menu-action="rename-category" data-id="${Number(category.id)}" hidden>
                        <input name="name" aria-label="${category.kind === 'campus' ? '校内地点名称' : '食堂名称'}" value="${escapeHtml(category.name)}" maxlength="100" required>
                        <button type="submit" class="btn btn-soft btn-sm">保存</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-action="cancel-category-edit">取消</button>
                    </form>
                    <p>ID ${escapeHtml(category.id)} · ${formatNumber(count)} 个在售档口</p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn btn-soft btn-sm" data-action="edit-category">编辑</button>
                    <button type="button" class="btn btn-danger btn-sm" data-action="admin-delete-category" data-id="${category.id}">删除</button>
                </div>
            </div>`;
        }).join('');
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
        const list = $('#admin-food-types');
        const add = $('#add-food-type');
        add.querySelector('button').disabled = !foodCatalog;
        if (!foodCatalog) {
            list.textContent = '暂时无法读取餐饮分类，请刷新后重试。';
            return;
        }
        const expanded = new Set($$('details[data-food-type-stalls][open]', list).map(item => item.dataset.foodTypeStalls));
        const stallsByType = new Map();
        for (const stall of state.admin?.canteens || []) {
            for (const {id} of stallFoodTypes(stall)) {
                if (!stallsByType.has(id)) stallsByType.set(id, []);
                stallsByType.get(id).push(stall);
            }
        }
        list.innerHTML = foodTypes().map(({id, name}) => {
            const stalls = stallsByType.get(id) || [];
            return `
            <div class="admin-review-label" data-food-type-id="${escapeHtml(id)}">
                <div class="panel-head">
                    <details data-food-type-stalls="${escapeHtml(id)}"${expanded.has(id) ? ' open' : ''}>
                        <summary>${escapeHtml(name)} · ${formatNumber(stalls.length)} 个档口</summary>
                        <div class="admin-list">
                            ${stalls.map(stall => `<div class="admin-row">
                                <div class="admin-row-main">
                                    <strong>${escapeHtml(stall.name)}</strong>
                                    <p>${escapeHtml(stall.category_name || '未分类')}${stall.is_active === false ? ' · 已归档' : ''}</p>
                                </div>
                                <button type="button" class="btn btn-soft btn-sm" data-action="open-detail" data-id="${Number(stall.id)}">管理</button>
                            </div>`).join('') || '<p class="muted">这个分类还没有档口。</p>'}
                        </div>
                    </details>
                    <button type="button" class="btn btn-danger btn-sm" data-action="delete-food-type">删除分类</button>
                </div>
                <details>
                    <summary>改名</summary>
                    <form class="inline-form">
                        <input name="name" aria-label="餐饮分类名称" value="${escapeHtml(name)}" maxlength="20" required>
                        <button type="submit" class="btn btn-soft">保存名称</button>
                    </form>
                </details>
            </div>`;
        }).join('') || '<p class="muted">暂无餐饮分类。</p>';
    }

    async function saveFoodTypeChange(button, path, method, body, detailId = null) {
        setBusy(button, true);
        try {
            await api(path, {method, body});
            if (method === 'POST') button.form.reset();
            await loadFoodTypes();
            if (detailId && state.detailId === detailId && $('#detail-modal').classList.contains('is-open')) {
                await openDetail(detailId);
            }
            toast('餐饮分类已更新');
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            setBusy(button, false);
        }
    }

    function renderAdminCanteens() {
        const list = $('#admin-canteen-list');
        if (!list || !state.admin) return;
        const select = $('#admin-canteen-filter');
        const previous = select.value;
        select.replaceChildren(new Option('总览 · 全部食堂', ''));
        state.admin.categories.forEach(category => select.add(new Option(category.name, category.id)));
        if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
        const stalls = state.admin.canteens.filter(canteen => !select.value || String(canteen.category_id) === select.value);

        if (!stalls.length) {
            list.innerHTML = adminEmpty(select.value ? '这个食堂还没有档口。' : '还没有档口，先添加一个吧。');
            return;
        }

        list.innerHTML = stalls.map(canteen => `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(canteen.name)}</strong>
                    <p>
                        ${escapeHtml(canteen.category_name || '未分类')} · ID ${escapeHtml(canteen.id)}
                        ${stallFoodTypes(canteen).map(({name}) => `<span class="badge">${escapeHtml(name)}</span>`).join('')}
                        ${canteen.is_active === false ? '<span class="badge badge-red">已归档</span>' : ''}
                    </p>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="btn btn-soft btn-sm" data-action="open-detail" data-id="${canteen.id}">管理</button>
                    ${canteen.is_active === false
                        ? `<button type="button" class="btn btn-soft btn-sm" data-action="admin-restore-canteen" data-id="${canteen.id}">恢复上架</button>`
                        : `<button type="button" class="btn btn-ghost btn-sm" data-action="admin-archive-canteen" data-id="${canteen.id}">下架</button>`}
                    <button type="button" class="btn btn-danger btn-sm" data-action="admin-delete-canteen" data-id="${canteen.id}">删除</button>
                </div>
            </div>
        `).join('');
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
        stallSelect.replaceChildren(new Option('全部档口', ''), ...Array.from(stalls, ([id, name]) => new Option(name, id)));
        labelSelect.replaceChildren(new Option('全部标签', ''), new Option('无标签', 'untagged'),
            ...state.admin.reviewLabels.map(({name}) => new Option(name, 'label:' + name)));
        if (Array.from(stallSelect.options).some(option => option.value === selectedStall)) stallSelect.value = selectedStall;
        if (Array.from(labelSelect.options).some(option => option.value === selectedLabel)) labelSelect.value = selectedLabel;
        const query = $('#admin-rating-search').value.trim().toLowerCase();
        const score = $('#admin-rating-score').value;
        const rows = state.admin.ratings.filter(rating => {
            if ((filter === 'active' && rating.is_deleted) || (filter === 'deleted' && !rating.is_deleted)) return false;
            if (stallSelect.value && String(rating.canteen_id) !== stallSelect.value) return false;
            if (score && Number(rating.score) !== Number(score)) return false;
            if (labelSelect.value && labelSelect.value !== (rating.moderation_label ? 'label:' + rating.moderation_label : 'untagged')) return false;
            return !query || [rating.comment, rating.user, rating.canteen_name].some(value => (value || '').toLowerCase().includes(query));
        });

        if (!rows.length) {
            list.innerHTML = adminEmpty(state.admin.ratings.length ? '没有找到符合条件的评价。' : '还没有评价。');
            return;
        }

        list.innerHTML = rows.map(rating => `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(rating.user)} · ${escapeHtml(rating.canteen_name || '未知档口')}</strong>
                    <p>
                        ${escapeHtml(formatTime(rating.created_at))}
                        ${rating.is_deleted ? '<span class="badge badge-red">已删除</span>' : '<span class="badge badge-amber">' + escapeHtml(rating.score) + ' 分</span>'}
                        ${rating.moderation_label ? `<span class="badge badge-amber">${escapeHtml(rating.moderation_label)}</span>` : ''}
                    </p>
                    <p class="admin-comment">${escapeHtml(rating.comment || '（无文字评价）')}</p>
                </div>
                <div class="admin-row-actions">
                    ${!rating.is_deleted ? reviewLabelSelect(rating, state.admin.reviewLabels) : ''}
                    ${rating.is_deleted
                        ? `<button type="button" class="btn btn-soft btn-sm" data-action="admin-restore-rating" data-id="${rating.id}">恢复</button>`
                        : `<button type="button" class="btn btn-danger btn-sm" data-action="admin-delete-rating" data-id="${rating.id}">删除</button>`}
                </div>
            </div>
        `).join('');
    }

    async function voteOnReview(id, button) {
        const list = button.closest('#detail-review-list');
        const review = state.detailData?.comments?.find(item => item.id === id);
        const buttons = $$('button', button.closest('.review-votes'));
        const vote = button.getAttribute('aria-pressed') === 'true' ? 0 : Number(button.dataset.vote);
        buttons.forEach(item => { item.disabled = true; });
        try {
            await ensurePostingIdentity();
            const result = await api(`/api/ratings/${id}/vote`, { method: 'PUT', body: { vote } });
            if (review) Object.assign(review, result);
            const sort = list?.isConnected && $('#detail-review-sort');
            if (sort && (sort.value === 'hot' || !button.isConnected)) {
                sort.dispatchEvent(new Event('change'));
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
        $('#admin-review-label-list').innerHTML = state.admin.reviewLabels.map(({name}) => `
            <div class="admin-review-label" data-review-label-name="${escapeHtml(name)}">
                <div class="panel-head">
                    <strong>${escapeHtml(name)}</strong>
                    <button type="button" class="btn btn-danger btn-sm" data-action="delete-review-label">删除标签</button>
                </div>
                <details>
                    <summary>改名</summary>
                    <form class="inline-form">
                        <input name="label" aria-label="标签名称" maxlength="20" required value="${escapeHtml(name)}">
                        <button type="submit" class="btn btn-soft">保存名称</button>
                    </form>
                </details>
            </div>`).join('') || '<p class="muted">暂无标签</p>';
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

    async function setReviewLabel(rating, select, render) {
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
        const list = $('#admin-report-list');
        if (!list || !state.admin) return;

        if (!state.admin.reports.length) {
            list.innerHTML = adminEmpty('当前没有待处理的举报。');
            return;
        }

        list.innerHTML = state.admin.reports.map(report => {
            const rating = report.rating || {};
            const hasRating = rating.id !== null && rating.id !== undefined;
            return `<div class="admin-row">
                <div class="admin-row-main">
                    <strong>举报 #${escapeHtml(report.report_id)} · ${escapeHtml(report.reporter || '匿名')}</strong>
                    <p>${escapeHtml(formatTime(report.reported_at))}</p>
                    <p class="admin-comment">理由：${escapeHtml(report.reason)}</p>
                    <p>被举报评价：${escapeHtml(rating.user || '未知')} / ${escapeHtml(rating.canteen_name || '未知档口')} / ${escapeHtml(formatScore(rating.score))} 分</p>
                    <p class="admin-comment">${escapeHtml(rating.comment || '（评价已删除或无文字内容）')}</p>
                </div>
                <div class="admin-row-actions">
                    ${hasRating ? `<button type="button" class="btn btn-danger btn-sm" data-action="admin-delete-rating" data-id="${rating.id}">删除评价</button>` : ''}
                    <button type="button" class="btn btn-soft btn-sm" data-action="admin-delete-report" data-id="${report.report_id}">标记已处理</button>
                </div>
            </div>`;
        }).join('');
    }

    function renderAdminActions() {
        const list = $('#admin-action-list');
        if (!list || !state.admin) return;

        if (!state.admin.actions.length) {
            list.innerHTML = adminEmpty('还没有管理员操作记录。');
            return;
        }

        list.innerHTML = state.admin.actions.map(action => {
            const label = ACTION_LABELS[action.action] || action.action;
            const type = TYPE_LABELS[action.target_type] || action.target_type || '对象';
            const targetId = action.target_id === null || action.target_id === undefined ? '-' : action.target_id;
            return `<div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(label)}</strong>
                    <p>管理员：${escapeHtml(action.admin_user || '未知')} · ${escapeHtml(formatTime(action.created_at))}</p>
                    <p>${escapeHtml(type)} #${escapeHtml(targetId)}</p>
                    <p class="admin-comment">${escapeHtml(action.details || '')}</p>
                </div>
            </div>`;
        }).join('');
    }

    function fillAdminCategorySelect() {
        const select = $('#new-canteen-category');
        if (!select) return;

        const current = select.value;
        const categories = state.admin && state.admin.categories.length
            ? state.admin.categories
            : getCategories();
        select.innerHTML = '<option value="">选择所属食堂</option>' + categories
            .map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
            .join('');

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
                body: { name, category_id: Number(categoryId) }
            });
            nameInput.value = '';
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
            if (detailId && state.detailId === detailId && $('#detail-modal').classList.contains('is-open')) await openDetail(detailId);
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

    const modalStack = [];
    const modalFocusOrigins = new WeakMap();

    function updateModalLayers() {
        const top = modalStack.at(-1);
        $$('.modal').forEach(modal => {
            const index = modalStack.indexOf(modal);
            modal.style.zIndex = index < 0 ? '' : String(80 + index * 2);
            modal.inert = modal !== top;
            modal.setAttribute('aria-hidden', String(modal !== top));
        });
        $$('header.site-header, main.page').forEach(region => { region.inert = Boolean(top); });
    }

    function openModal(modal) {
        if (!modal) return;
        if (!modalStack.includes(modal)) {
            modalFocusOrigins.set(modal, document.activeElement);
            modalStack.push(modal);
        }
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        updateModalLayers();

        const focusTarget = modal.querySelector('input:not([type="hidden"]), textarea, select')
            || modal.querySelector('.modal-close');
        if (focusTarget) {
            window.setTimeout(() => {
                if (modalStack.at(-1) === modal) focusTarget.focus({ preventScroll: true });
            }, 60);
        }
    }

    let viewerPhotos = [];
    let viewerIndex = 0;
    let viewerZoom = 1;
    let photoGesture = null;

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
        const image = $('#photo-viewer-image');
        image.style.width = stage.clientWidth * viewerZoom + 'px';
        image.style.height = stage.clientHeight * viewerZoom + 'px';
        $('#photo-viewer-modal [data-action="photo-zoom-in"]').disabled = viewerZoom >= 3;
        $('#photo-viewer-modal [data-action="photo-zoom-out"]').disabled = viewerZoom <= 1;
    }

    function showViewerPhoto() {
        const item = viewerPhotos[viewerIndex];
        if (!item) return;
        viewerZoom = 1;
        const stage = $('#photo-viewer-stage');
        stage.scrollTo(0, 0);
        $('#photo-viewer-message').textContent = '正在加载照片…';
        const image = $('#photo-viewer-image');
        image.alt = item.alt;
        image.src = item.src;
        $('#photo-viewer-count').textContent = `${viewerIndex + 1} / ${viewerPhotos.length}`;
        $('#photo-viewer-previous').disabled = viewerIndex === 0;
        $('#photo-viewer-next').disabled = viewerIndex === viewerPhotos.length - 1;
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
        const top = modalStack.at(-1);
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
        const wasOpen = modal.classList.contains('is-open');
        if (wasOpen && modal.id === 'recommendation-modal') recommendationRequest++;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        const stackIndex = modalStack.indexOf(modal);
        if (stackIndex !== -1) modalStack.splice(stackIndex, 1);
        if (modal.id === 'photo-viewer-modal') {
            viewerPhotos = [];
            $('#photo-viewer-image').removeAttribute('src');
        }
        if (modal.id === 'forum-thread-modal') {
            threadId = null;
            forumThreadRequest++;
        }

        if (modal.id === 'detail-modal') {
            state.detailId = null;
            state.detailData = null;
            destroyChart();
            const content = $('#detail-content');
            if (content) content.innerHTML = '';
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
        if (!document.querySelector('.modal.is-open')) {
            document.body.classList.remove('modal-open');
        }
        updateModalLayers();
        const target = modalFocusOrigins.get(modal);
        if (wasOpen && target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
    }

    function showFileTip() {
        const header = $('.site-header');
        const tip = `<div class="file-tip">当前页面是通过本地文件打开的，接口请求会失败。请先运行 <code>python app.py</code>，然后访问 <a href="http://127.0.0.1:5000/">http://127.0.0.1:5000/</a>。</div>`;
        if (header) {
            header.insertAdjacentHTML('afterend', tip);
        } else {
            document.body.insertAdjacentHTML('afterbegin', tip);
        }
    }

    /* ---------------- 事件 ---------------- */

    function bindEvents() {
        $('#admin-user-search').addEventListener('submit', event => {
            event.preventDefault();
            loadAdministratorAccounts();
        });
        $('#recommendation-content').addEventListener('submit', submitRecommendation);
        $('#recommendation-content').addEventListener('change', async event => {
            const select = event.target;
            if (!select.matches('select[name="list"]')) return;
            const form = select.form;
            const title = $('[data-new-recommendation]', form);
            title.hidden = select.value !== 'new';
            title.querySelector('input').disabled = title.hidden;
            title.querySelector('input').required = !title.hidden;
            const selected = select.value;
            const submit = $('button[type="submit"]', form);
            submit.disabled = true;
            try {
                const list = /^\d+$/.test(selected) ? await api(recommendationApi + '/' + selected) : null;
                if (select.value !== selected) return;
                const item = list?.items.find(entry => entry.stall_id === Number(form.dataset.id));
                form.elements.reason.value = item?.reason || '';
                $$('input[name="dish"]', form).forEach(input => {
                    input.checked = item?.dish_ids.includes(Number(input.value)) ?? false;
                });
            } catch (error) {
                toast(error.message, 'error');
                if (select.value === selected) select.value = '';
            } finally {
                if (select.value === selected || !select.value) submit.disabled = false;
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
        $('#detail-content').addEventListener('submit', event => {
            const form = event.target.closest('[data-stall-food-types]');
            if (!form) return;
            event.preventDefault();
            const id = Number(form.dataset.stallFoodTypes);
            const types = event.submitter.value === 'auto' ? null : new FormData(form).getAll('food-type');
            saveFoodTypeChange(event.submitter, `/api/admin/canteens/${id}/food-types`, 'PUT', {types}, id);
        });
        $('#photo-viewer-image').addEventListener('load', () => {
            $('#photo-viewer-message').textContent = '';
        });
        $('#photo-viewer-image').addEventListener('error', () => {
            if (viewerPhotos.length) $('#photo-viewer-message').textContent = '照片加载失败，请关闭后重试。';
        });
        window.addEventListener('resize', () => {
            if (viewerPhotos.length) resizeViewerPhoto();
        });
        $('#photo-viewer-stage').addEventListener('pointerdown', event => {
            photoGesture = event.pointerType === 'touch' && viewerZoom === 1
                ? { x: event.clientX, y: event.clientY } : null;
        });
        $('#photo-viewer-stage').addEventListener('pointerup', event => {
            if (!photoGesture) return;
            const dx = event.clientX - photoGesture.x;
            const dy = event.clientY - photoGesture.y;
            photoGesture = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepViewerPhoto(dx < 0 ? 1 : -1);
        });
        $('#photo-viewer-stage').addEventListener('pointercancel', () => { photoGesture = null; });
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

        const authForm = $('#auth-form');
        if (authForm) authForm.addEventListener('submit', submitAuth);

        $$('.ranking-filters select').forEach(select => select.addEventListener('change', renderRanking));
        updateFoodTypeOptions();
        $('#random-food-dining').addEventListener('change', clearRandomFoodResult);
        for (const selector of ['#stall-food-type', '#ranking-food-type', '#random-food-type']) {
            const picker = $(selector);
            const apply = () => {
                updateFoodPickerSummary(picker);
                if (selector === '#stall-food-type') {
                    state.foodType = selectedFoodTypes(picker);
                    renderCanteenGrid();
                } else if (selector === '#ranking-food-type') {
                    renderRanking();
                } else {
                    clearRandomFoodResult();
                }
            };
            picker.addEventListener('click', event => {
                const button = event.target.closest('.food-choice, .food-picker-clear');
                if (!button) return;
                if (button.matches('.food-choice')) {
                    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
                } else {
                    $$('.food-choice', picker).forEach(choice => choice.setAttribute('aria-pressed', 'false'));
                }
                apply();
            });
        }

        const ratingForm = $('#rating-form');
        if (ratingForm) ratingForm.addEventListener('submit', submitRating);

        const reportForm = $('#report-form');
        if (reportForm) reportForm.addEventListener('submit', submitReport);

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
        $('#auth-toggle').addEventListener('click', () => setAuthMode($('#auth-confirm').disabled));
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
        $('#detail-content').addEventListener('submit', saveMenuChange);
        $('#admin-category-list').addEventListener('submit', saveMenuChange);
        $('#detail-content').addEventListener('change', event => {
            const input = event.target;
            if (input.matches('input[data-photo-kind]') && input.files[0]) {
                updateDisplayPhoto(input, input.files[0]);
            }
        });
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
                $('#recommendation-content').innerHTML = recommendationForm();
                openModal($('#recommendation-modal'));
                break;
            case 'recommendation-add-stall':
                addStallToRecommendation(id);
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
                    panel.textContent = '正在加载…';
                    api('/api/profile').then(profile => openPublicProfile(profile.id, true))
                        .catch(error => { panel.textContent = error.message; });
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
            case 'remove-photo':
                updateDisplayPhoto(element);
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
})();
