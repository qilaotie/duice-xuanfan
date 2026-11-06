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
        search: '',
        ratedOnly: false,
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
        add_category: '新增食堂',
        delete_category: '删除食堂',
        add_canteen: '新增档口',
        delete_canteen: '删除档口',
        delete_rating: '删除评价',
        restore_rating: '恢复评价',
        delete_report: '处理举报',
        backfill_history: '回填历史',
        archive_canteen: '下架档口',
        restore_canteen: '恢复档口'
    };

    const TYPE_LABELS = {
        category: '食堂',
        canteen: '档口',
        rating: '评价',
        report: '举报'
    };

    const numberFormat = new Intl.NumberFormat('zh-CN');

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        restoreAuth();

        if (window.location.protocol === 'file:') {
            showFileTip();
            return;
        }

        bindEvents();
        setInitialLoading();
        if (window.location.hash === '#campus') showView('campus');
        if (window.location.hash === '#forum') showView('forum');
        if (await useBackupIfNeeded()) return;
        loadCategories().catch(() => {});
        loadCanteens().catch(() => {});
        loadRanking().catch(() => {});
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
            toast('昵称已保存');
        } catch (error) {
            showError(errorElement, error.message);
        } finally {
            setBusy(button, false);
        }
    }

    let publicProfileRequest = 0;

    async function openPublicProfile(id) {
        const requestId = ++publicProfileRequest;
        const modal = $('#public-profile-modal');
        const title = $('#public-profile-title');
        const content = $('#public-profile-content');
        title.textContent = '个人资料';
        content.textContent = '正在加载…';
        openModal(modal);
        try {
            const profile = await api(`/api/users/${id}`, { auth: false });
            if (requestId !== publicProfileRequest) return;
            title.textContent = profile.nickname || '同学';
            content.innerHTML = `
                <span class="comment-avatar">${avatarContent(profile.avatar_url, profile.nickname || '同学')}</span>
                <p>口味偏好：${escapeHtml(profile.taste || '未填写')}</p>
                <p>出生地：${escapeHtml(profile.birthplace || '未填写')}</p>
                <h3>历史评价</h3>
                ${profile.reviews.length ? profile.reviews.map(review => `
                    <article class="detail-panel">
                        <button type="button" class="link-btn" data-action="profile-review-stall" data-id="${Number(review.canteen_id)}">${escapeHtml(review.canteen_name)}</button>
                        <p class="muted">${escapeHtml(review.created_at)} · ${escapeHtml(review.score)} 分</p>
                        <p class="comment-text">${escapeHtml(review.content || '（无文字评价）')}</p>
                        ${review.dish_name ? `<p class="comment-text">${escapeHtml(review.dish_name)}</p>` : ''}
                        ${review.dish_scores.map(dish => `<p class="comment-text">${escapeHtml(dish.name)} · ${escapeHtml(dish.score)} 分</p>`).join('')}
                    </article>`).join('') : '<p class="muted">暂无公开评价。</p>'}
            `;
        } catch (error) {
            if (requestId === publicProfileRequest) content.textContent = error.message;
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
            renderCategoryNav();
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
            <div class="stat-card"><strong>${formatNumber(getCategories().filter(category => category.kind !== 'campus').length)}</strong><span>食堂</span></div>
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

        const items = [
            { id: 'all', name: '全部档口', count: stalls.length }
        ].concat(categories.map(category => ({
            id: category.id,
            name: category.name,
            count: counts.get(String(category.id)) || 0
        })));

        nav.innerHTML = items.map((item, index) => {
            const active = item.id === 'all'
                ? state.categoryFilter === null
                : String(state.categoryFilter) === String(item.id);
            const dot = item.id === 'all' ? '#0f766e' : CATEGORY_DOTS[index % CATEGORY_DOTS.length];
            return `<button type="button" class="category-btn${active ? ' is-active' : ''}" data-category="${escapeHtml(item.id)}">
                <span class="cat-dot" style="background:${dot}"></span>
                <span class="cat-name">${escapeHtml(item.name)}</span>
                <span class="cat-count">${formatNumber(item.count)}</span>
            </button>`;
        }).join('');
    }

    function diningStalls() {
        return state.canteens.filter(stall => stall.category_kind !== 'campus');
    }

    let campusLocationFilter = '';

    function renderCampusFood() {
        const list = $('#campus-food-list');
        const buildings = getCategories().filter(category => category.kind === 'campus');
        if (!buildings.length) {
            list.textContent = '正在加载校内楼宇…';
            return;
        }
        const keyword = $('#campus-food-search').value.trim().toLowerCase();
        if (!buildings.some(location => String(location.id) === campusLocationFilter)) campusLocationFilter = '';
        const entriesByLocation = new Map(buildings.map(location => [location.id, []]));
        for (const stall of state.canteens) entriesByLocation.get(stall.category_id)?.push(stall);
        const total = Array.from(entriesByLocation.values()).reduce((sum, entries) => sum + entries.length, 0);
        const directory = [{ id: '', name: '全部地点', count: total }, ...buildings.map(location =>
            ({ ...location, count: entriesByLocation.get(location.id).length }))];
        $('#campus-food-directory').innerHTML = directory.map((location, index) => {
            const selected = String(location.id) === campusLocationFilter;
            return `<button type="button" class="category-btn${selected ? ' is-active' : ''}"
                data-campus-location="${escapeHtml(location.id)}" aria-pressed="${selected}">
                <span class="cat-dot" style="background:${index ? CATEGORY_DOTS[(index - 1) % CATEGORY_DOTS.length] : '#0f766e'}"></span>
                <span class="cat-name">${escapeHtml(location.name)}</span><span class="cat-count">${location.count}</span>
            </button>`;
        }).join('');

        const grouped = new Map();
        const buildingNames = ['老综合楼', '新综合楼', '丁香综合楼'];
        let resultCount = 0;
        for (const location of buildings) {
            if (campusLocationFilter && String(location.id) !== campusLocationFilter) continue;
            const name = buildingNames[Math.floor((location.id - 100001) / 2)] || location.name;
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
        return diningStalls().filter(canteen => {
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
        const dotColor = CATEGORY_DOTS[index % CATEGORY_DOTS.length];
        const stats = `${formatNumber(group.items.length)} 个档口${average ? ` · 均分 ${average}` : ''}`;

        let header = '';
        if (!single) {
            const inner = `<span class="cat-dot" style="background:${dotColor}"></span>
                <span class="category-title">${escapeHtml(group.name)}</span>
                <span class="category-stats">${stats}</span>
                ${collapsible ? `<span class="category-chevron" aria-hidden="true">${expanded ? '▴' : '▾'}</span>` : ''}`;

            header = collapsible
                ? `<button type="button" class="category-head" data-action="toggle-category" data-id="${escapeHtml(group.key)}" aria-expanded="${expanded}">${inner}</button>`
                : `<div class="category-head is-static">${inner}</div>`;
        }

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

        grid.innerHTML = groups.map((group, index) => renderCategoryBlock(group, {
            single,
            searching,
            index,
            rankingById
        })).join('');
    }

    function updateListHeading(rows, groups, rankingById) {
        const title = $('#list-title');
        const subtitle = $('#list-subtitle');
        if (!title || !subtitle) return;

        const single = state.categoryFilter !== null;
        if (!single) {
            title.textContent = '全部档口';
        } else {
            const category = getCategories().find(item => String(item.id) === String(state.categoryFilter));
            title.textContent = category ? category.name : '全部档口';
        }

        const parts = [`${formatNumber(rows.length)} 个档口`];
        if (!single) parts.push(`${formatNumber(groups.length)} 个食堂`);

        if (single) {
            const average = categoryAverage(rows, rankingById);
            if (average) parts.push(`均分 ${average}`);
        }
        if (state.ratedOnly) parts.push('只看有评分');
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
        state.ratedOnly = false;
        state.expandedCategories.clear();
        const input = $('#search-input');
        if (input) input.value = '';
        renderCategoryNav();
        renderCanteenGrid();
    }

    /* ---------------- 排行榜 ---------------- */

    function renderRanking() {
        const podium = $('#podium');
        const list = $('#ranking-list');
        const best = $('#category-best');
        const count = $('#ranking-count');
        if (!podium || !list || !best) return;

        const rows = state.ranking.filter(row => row.avg_score !== null && row.avg_score !== undefined);
        if (count) count.textContent = rows.length ? `${formatNumber(rows.length)} 个档口有评分` : '';

        if (!rows.length) {
            podium.innerHTML = emptyState('还没有评分', '等同学们写下第一条评价，排行榜就会出现在这里。');
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
                <div class="podium-score">${formatScore(row.avg_score)}<small> / 5</small></div>
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
                <span class="best-score">${formatScore(row.avg_score)}</span>
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

        state.view = name;
        $$('.view').forEach(view => view.classList.toggle('is-active', view.id === `view-${name}`));
        $$('.nav-link').forEach(link => link.classList.toggle('is-active', link.dataset.nav === name));
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (name === 'ranking') renderRanking();
        if (name === 'campus') renderCampusFood();
        if (name === 'forum') loadForum();
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
    let threadId = null;
    let replyCursor = 0;
    let forumThreadRequest = 0;

    function forumBadge(kind) {
        return kind === 'avoid' ? '<span class="badge badge-red">避雷</span>' : '<span class="badge badge-amber">推荐</span>';
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
            const html = data.rows.map(post => `<article class="detail-panel stack">
                <div class="panel-head"><h3>${forumBadge(post.kind)} ${escapeHtml(post.name)}</h3></div>
                <p class="muted">${escapeHtml(post.address)}</p>
                <p class="comment-text">${escapeHtml(post.content)}</p>
                <div class="panel-head">
                    <span class="muted">${escapeHtml(post.author)} · ${escapeHtml(post.created_at.slice(0, 16))}</span>
                    <button type="button" class="btn btn-soft btn-sm" data-action="forum-open" data-id="${Number(post.id)}">查看帖子 · ${formatNumber(post.reply_count)} 条回复</button>
                </div>
            </article>`).join('');
            if (append) list.insertAdjacentHTML('beforeend', html);
            else list.innerHTML = html || emptyState('这里还没有帖子', '欢迎分享你的校外美食推荐或避雷经历。');
            forumCursor = data.rows.at(-1)?.id ?? forumCursor;
            more.hidden = !data.more;
        } catch (error) {
            if (request !== forumListRequest) return;
            if (append) toast(error.message, 'error');
            else list.textContent = error.message;
        } finally {
            if (request === forumListRequest) more.disabled = false;
        }
    }

    async function openForumThread(id, append = false) {
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
                <p class="muted">1 楼 · ${escapeHtml(post.author)} · ${escapeHtml(post.created_at.slice(0, 16))}</p>
                ${post.can_delete ? `<div><button type="button" class="link-btn" data-action="forum-delete" data-id="${Number(post.id)}">删除帖子</button></div>` : ''}
            </article>`;
            const html = rows.map(reply => `<article class="detail-panel">
                <p class="muted">${formatNumber(reply.floor)} 楼 · ${escapeHtml(reply.author)} · ${escapeHtml(reply.created_at.slice(0, 16))}</p>
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
            else content.textContent = error.message;
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

        state.detailId = canteenId;
        destroyChart();
        openModal($('#detail-modal'));
        const content = $('#detail-content');
        content.innerHTML = detailSkeleton();

        try {
            const data = await api(`/api/canteens/${canteenId}`);
            if (state.detailId !== canteenId) return;
            renderDetail(data);
        } catch (error) {
            if (state.detailId !== canteenId) return;
            content.innerHTML = `<div class="detail-body">
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>加载失败</h3>
                    <p>${escapeHtml(error.message)}</p>
                    <button type="button" class="btn btn-soft btn-sm" style="margin-top:14px" data-action="open-detail" data-id="${canteenId}">重试</button>
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

    function renderDetail(data) {
        const content = $('#detail-content');
        if (!content) return;
        state.detailData = data;

        const comments = Array.isArray(data.comments) ? data.comments : [];
        const history = Array.isArray(data.history) ? data.history : [];
        const scoreText = formatScore(data.score);

        const commentsHtml = comments.length
            ? comments.map(comment => `
                <article class="comment-item">
                    ${comment.author_id
                        ? `<button type="button" class="comment-avatar" data-action="open-public-profile" data-id="${Number(comment.author_id)}" aria-label="查看${escapeHtml(comment.user)}的个人资料">${avatarContent(comment.avatar_url, comment.user)}</button>`
                        : `<div class="comment-avatar">${avatarContent(null, comment.user)}</div>`}
                    <div class="comment-main">
                        <div class="comment-head">
                            ${comment.author_id
                                ? `<button type="button" class="link-btn comment-user" data-action="open-public-profile" data-id="${Number(comment.author_id)}">${escapeHtml(comment.user)}</button>`
                                : `<span class="comment-user">${escapeHtml(comment.user || '匿名用户')}</span>`}
                            <span class="comment-time">${escapeHtml(comment.created_at)}</span>
                            <span class="stars stars-sm">${starsHtml(comment.score)}</span>
                        </div>
                        ${(comment.dish_scores || []).map(dish => `<p class="comment-text">${escapeHtml(dish.name)} · ${escapeHtml(dish.score)} 分</p>`).join('')}
                        ${comment.dish_name ? `<p class="comment-text"><strong>菜品：</strong>${escapeHtml(comment.dish_name)}</p>` : ''}
                        <p class="comment-text">${escapeHtml(comment.content || '（无文字评价）')}</p>
                        ${renderReviewPhotos(comment)}
                        <div class="comment-actions">
                            ${comment.is_mine ? `
                                <button type="button" class="link-btn" data-action="edit-review" data-id="${Number(comment.id)}">修改</button>
                                <button type="button" class="link-btn" data-action="withdraw-review" data-id="${Number(comment.id)}">撤回</button>
                            ` : `<button type="button" class="link-btn" data-action="report" data-id="${Number(comment.id)}">举报</button>`}
                        </div>
                    </div>
                </article>
            `).join('')
            : emptyState('还没有评论', '来写下第一条评价吧。', '💬');

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
                    <button type="button" class="btn btn-light btn-sm" data-action="open-rating" data-id="${Number(data.id)}">写评价</button>
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
                    ${commentsHtml}
                </section>
            </div>
        `;

        if (history.length) {
            renderHistoryChart(history);
        }
    }

    function renderStallManagement(stall) {
        const id = Number(stall.id);
        return `<section class="detail-panel stack">
            <div class="panel-head"><h3>档口管理</h3></div>
            <form class="inline-form" data-menu-action="rename-canteen" data-id="${id}">
                <input name="name" aria-label="档口名称" value="${escapeHtml(stall.name)}" maxlength="100" required>
                <button type="submit" class="btn btn-primary btn-sm">保存档口名称</button>
            </form>
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
        return url ? `<img class="${className}" src="${escapeHtml((window.CANTEEN_API_ORIGIN || '') + url)}" alt="${escapeHtml(alt)}" loading="lazy">` : '';
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
                return `${escapeHtml(item.date)}（${escapeHtml(avg)} / ${formatNumber(item.rating_count)} 条）`;
            });
            canvas.parentElement.innerHTML = `<p class="muted" style="font-size:12.5px;line-height:2">${lines.join('<br>')}</p>`;
            return;
        }

        destroyChart();
        const labels = history.map(item => item.date);
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
        category.disabled = canteen.disabled = Boolean(review);
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
    }

    async function openMyReviews() {
        const modal = $('#my-reviews-modal');
        const list = $('#my-reviews-list');
        list.textContent = '正在加载评价…';
        openModal(modal);
        try {
            const reviews = await api('/api/my/ratings');
            list.innerHTML = reviews.length ? reviews.map(review => `
                <article class="detail-panel">
                    <strong>${escapeHtml(review.canteen_name)}</strong>
                    <p class="muted">${escapeHtml(review.category_name || '未分类')} · ${escapeHtml(review.created_at)} · ${escapeHtml(review.score)} 分</p>
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
        select.innerHTML = (campus ? '<option value="">请选择校内地点</option>' : '<option value="">请选择食堂</option>') + categories
            .map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
            .join('');

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
            const [categories, canteens, ratings, reports, actions] = await Promise.all([
                api('/api/admin/categories'),
                api('/api/admin/canteens'),
                api('/api/admin/ratings'),
                api('/api/admin/reports'),
                api('/api/admin/actions')
            ]);

            state.admin = {
                categories: Array.isArray(categories) ? categories : [],
                canteens: Array.isArray(canteens) ? canteens : [],
                ratings: Array.isArray(ratings) ? ratings : [],
                reports: Array.isArray(reports) ? reports : [],
                actions: Array.isArray(actions) ? actions : []
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
        state.adminTab = tab;
        $$('.admin-tab').forEach(button => button.classList.toggle('is-active', button.dataset.adminTab === tab));
        $$('.admin-section').forEach(section => section.classList.toggle('is-active', section.dataset.adminSection === tab));
        renderAdminTab(tab);
    }

    function renderAdminTab(tab) {
        if (!state.admin) return;
        switch (tab) {
            case 'feedback':
                loadFeedback();
                break;
            case 'categories':
                renderAdminCategories();
                break;
            case 'canteens':
                renderAdminCanteens();
                break;
            case 'ratings':
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

    function openFeedback(kind) {
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
            await api('/api/feedback', { method: 'POST', body, auth: false });
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
                    <p class="muted">${escapeHtml(row.created_at)} · ${{pending:'待处理',approved:'已入库',closed:'已处理'}[row.status]}</p>
                    <p class="comment-text">${escapeHtml(row.content || '（无补充说明）')}</p>
                    ${row.has_photo ? `<div><button type="button" class="btn btn-soft btn-sm" data-action="feedback-photo" data-id="${Number(row.id)}">查看提交照片</button></div>` : ''}
                    ${row.status === 'pending' && row.kind === 'stall' ? `<form class="inline-form" data-feedback-approve>
                        <input name="name" aria-label="正式档口名称" value="${escapeHtml(row.name)}" maxlength="100" required>
                        <select name="category" aria-label="所属食堂或楼宇" required><option value="">请选择所属位置</option>${options(row)}</select>
                        <button type="submit" class="btn btn-primary">审核并入库</button>
                    </form>` : ''}
                    ${row.status === 'pending' ? `<div><button type="button" class="btn btn-ghost btn-sm" data-action="feedback-close" data-id="${Number(row.id)}">${row.kind === 'stall' ? '关闭建议' : '标为已处理'}</button></div>` : ''}
                </article>`).join('') : adminEmpty('暂无反馈。');
        } catch (error) {
            if ($('#feedback-status').value === status) list.textContent = error.message;
        }
    }

    async function processFeedback(id, button, body) {
        setBusy(button, true);
        try {
            await api(`/api/admin/feedback/${id}`, { method: 'POST', body });
            toast(body.action === 'approve' ? '档口已入库' : '反馈已处理');
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
        const rows = state.admin.ratings.filter(rating => {
            if (filter === 'active') return !rating.is_deleted;
            if (filter === 'deleted') return Boolean(rating.is_deleted);
            return true;
        });

        if (!rows.length) {
            list.innerHTML = adminEmpty(filter === 'all' ? '还没有评价。' : '这个筛选条件下没有评价。');
            return;
        }

        list.innerHTML = rows.map(rating => `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(rating.user)} · ${escapeHtml(rating.canteen_name || '未知档口')}</strong>
                    <p>
                        ${escapeHtml(rating.created_at)}
                        ${rating.is_deleted ? '<span class="badge badge-red">已删除</span>' : '<span class="badge badge-amber">' + escapeHtml(rating.score) + ' 分</span>'}
                    </p>
                    <p class="admin-comment">${escapeHtml(rating.comment || '（无文字评价）')}</p>
                </div>
                <div class="admin-row-actions">
                    ${rating.is_deleted
                        ? `<button type="button" class="btn btn-soft btn-sm" data-action="admin-restore-rating" data-id="${rating.id}">恢复</button>`
                        : `<button type="button" class="btn btn-danger btn-sm" data-action="admin-delete-rating" data-id="${rating.id}">删除</button>`}
                </div>
            </div>
        `).join('');
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
                    <p>${escapeHtml(report.reported_at)}</p>
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
                    <p>管理员：${escapeHtml(action.admin_user || '未知')} · ${escapeHtml(action.created_at)}</p>
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

    async function deleteRating(id) {
        if (!window.confirm('确定删除这条评价吗？删除后可以在“已删除”筛选中恢复。')) return;
        const returnTab = state.adminTab === 'reports' ? 'reports' : 'ratings';
        try {
            await api(`/api/admin/ratings/${id}`, { method: 'DELETE' });
            toast('评价已删除');
            await refreshAll();
            switchAdminTab(returnTab);
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    async function restoreRating(id) {
        if (!window.confirm('确定恢复这条评价吗？')) return;
        try {
            await api(`/api/admin/ratings/${id}/restore`, { method: 'POST' });
            toast('评价已恢复');
            await refreshAll();
            switchAdminTab('ratings');
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

    function openModal(modal) {
        if (!modal) return;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        const focusTarget = modal.querySelector('input:not([type="hidden"]), textarea, select')
            || modal.querySelector('.modal-close');
        if (focusTarget) {
            window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 60);
        }
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
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
        $('#forum-kind-filter').addEventListener('change', () => loadForum());
        $('#forum-more').addEventListener('click', () => loadForum(true));
        $('#forum-more-replies').addEventListener('click', () => openForumThread(threadId, true));
        $('#forum-compose-form').addEventListener('submit', submitForumPost);
        $('#forum-reply-form').addEventListener('submit', submitForumReply);
        $('#campus-food-search').addEventListener('input', renderCampusFood);
        $('#campus-food-directory').addEventListener('click', event => {
            const button = event.target.closest('[data-campus-location]');
            if (!button) return;
            campusLocationFilter = button.dataset.campusLocation;
            renderCampusFood();
            $('#campus-food-directory [aria-pressed="true"]')?.focus({ preventScroll: true });
        });
        $('#feedback-form').addEventListener('submit', submitFeedback);
        $('#feedback-form').elements.building.addEventListener('change', updateFeedbackLocation);
        $('#feedback-form').elements.photo.addEventListener('change', event => {
            $('#feedback-photo-label').textContent = event.target.files[0]?.name || '最多 5 MB';
        });
        $('#feedback-status').addEventListener('change', loadFeedback);
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
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                const openModals = $$('.modal.is-open');
                if (openModals.length) {
                    closeModal(openModals[openModals.length - 1]);
                }
            }
        });
    }

    function handleDocumentClick(event) {
        const closeTrigger = event.target.closest('[data-close-modal]');
        if (closeTrigger) {
            closeModal(closeTrigger.closest('.modal'));
            return;
        }

        const navTrigger = event.target.closest('[data-nav]');
        if (navTrigger) {
            event.preventDefault();
            showView(navTrigger.dataset.nav);
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
                        if (threadId === id) closeModal($('#forum-thread-modal'));
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
            case 'profile-review-stall':
                closeModal($('#public-profile-modal'));
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
            case 'scroll-grid': {
                const grid = $('#canteen-grid');
                if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            }
            case 'report':
                if (id) openReport(id);
                break;
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
                if (id) deleteRating(id);
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
