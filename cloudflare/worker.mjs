import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { admin } from './admin.mjs';
import { forum } from './forum.mjs';

const derive = promisify(scrypt);
const sensitive = value => /脏话|恶意|攻击/.test(value);
const json = (data, status = 200) => Response.json(data, { status });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const photoUrl = (table, row) => row.has_photo ? `/api/photos/${table}/${row.id}` : null;
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 23);
const minute = value => value?.slice(0, 16) ?? null;
const getText = (value, max, label) => {
    if (typeof value !== 'string' || value.trim().length > max) fail(400, label + '格式无效');
    return value.trim();
};
const active = 'is_deleted = 0';
const history = (q, id) => q(`INSERT INTO rating_history (canteen_id, avg_score, rating_count, created_at)
    SELECT ?, AVG(score), COUNT(*), ? FROM ratings WHERE canteen_id = ? AND ${active}`, id, now(), id);

async function passwordHash(password, salt = randomBytes(12).toString('hex')) {
    const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return 'scrypt:32768:8:1$' + salt + '$' + key.toString('hex');
}

async function body(request) {
    try {
        const value = await request.json();
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {}
    fail(400, '请求格式无效');
}

async function form(request) {
    if (Number(request.headers.get('content-length')) > 7_000_000) fail(413, '照片过大');
    try { return await request.formData(); } catch { fail(400, '上传格式无效'); }
}

async function photoBytes(upload, maxBytes = 1_500_000) {
    if (!upload || typeof upload === 'string' || !upload.size) return null;
    if (upload.size > maxBytes) fail(413, maxBytes === 50_000 ? '头像不能超过 50 KB' : '照片处理后不能超过 1.5 MB');
    const data = await upload.arrayBuffer();
    const bytes = new Uint8Array(data);
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
        fail(400, '请上传 JPEG 照片');
    }
    return data;
}

function profileText(value, max, label) {
    const text = getText(value, max, label);
    if (sensitive(text) || /[\p{Cc}\p{Cf}]/u.test(text)) fail(400, label + '包含不合规字符');
    return text || null;
}

function score(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 5) fail(400, '评分须为 1 到 5 分');
    return value;
}

function decodeScores(value) {
    return JSON.parse(value || 'null') || [];
}

const stallsSql = `SELECT c.id,c.name,c.category_id,g.name category_name,COALESCE(g.kind,'canteen') category_kind,c.is_active,
    ROUND(AVG(r.score),2) score, COUNT(r.id) rating_count
    FROM canteens c LEFT JOIN categories g ON g.id=c.category_id
    LEFT JOIN ratings r ON r.canteen_id=c.id AND r.is_deleted=0`;

async function route(request, env) {
    const path = new URL(request.url).pathname;
    const method = request.method;
    const q = (sql, ...args) => args.length ? env.DB.prepare(sql).bind(...args) : env.DB.prepare(sql);
    const first = (sql, ...args) => q(sql, ...args).first();
    const all = async (sql, ...args) => (await q(sql, ...args).all()).results;
    const batch = statements => env.DB.batch(statements);
    const token = /^Bearer ([a-f0-9]{32})$/.exec(request.headers.get('Authorization') || '')?.[1];
    const viewer = token ? await first('SELECT id,username,nickname,taste,birthplace,is_admin FROM users WHERE token=?', token) : null;
    const auth = () => { if (!viewer) fail(401, '请先登录'); return viewer; };

    if (method === 'GET' && path === '/api/food-types') {
        const [types, overrides] = await batch([
            q('SELECT id,name FROM food_types ORDER BY rowid'),
            q('SELECT canteen_id,types FROM stall_food_overrides')
        ]);
        return json({types: types.results, overrides: Object.fromEntries(
            overrides.results.map(row => [row.canteen_id, JSON.parse(row.types)]))});
    }

    if (method === 'GET' && path === '/api/health') {
        await first('SELECT 1 FROM categories LIMIT 1');
        return json({ ok: true });
    }
    if (method === 'POST' && path === '/api/guest') {
        const token = randomBytes(16).toString('hex');
        await q('INSERT INTO users (username,password,is_admin,token) VALUES (?,?,0,?)',
            '__guest_' + randomBytes(16).toString('hex'), '!', token).run();
        return json({ token }, 201);
    }
    if (method === 'POST' && ['/api/register', '/api/login'].includes(path)) {
        const data = await body(request);
        const username = getText(data.username, 50, '账号');
        const password = getText(data.password, 100, '密码');
        if (!username || !password) fail(400, '账号和密码不能为空');
        let user = await first('SELECT id,password,token,nickname,is_admin FROM users WHERE username=?', username);
        if (path === '/api/register') {
            if (typeof data.confirm_password !== 'string' || data.confirm_password.trim() !== password) fail(400, '两次输入的密码不一致');
            if (user || username.toLowerCase() === 'admin' || username.toLowerCase().startsWith('__guest_')) fail(409, '该账号不可注册');
            const name = profileText(data.nickname ?? '', 24, '昵称');
            user = await first(`INSERT INTO users (username,password,is_admin,token,nickname)
                VALUES (?,?,0,?,?) ON CONFLICT(username) DO NOTHING RETURNING *`,
                username, await passwordHash(password), randomBytes(16).toString('hex'), name);
            if (!user) fail(409, '该账号已注册，请登录');
        } else {
            if (!user) fail(401, '账号不存在或密码错误');
            const [scheme, salt] = user.password.split('$');
            if (scheme !== 'scrypt:32768:8:1') fail(401, '账号不存在或密码错误');
            const computed = Buffer.from(await passwordHash(password, salt));
            const stored = Buffer.from(user.password);
            if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) fail(401, '账号不存在或密码错误');
            if (!user.token) {
                user = await first('UPDATE users SET token=COALESCE(token,?) WHERE id=? RETURNING *',
                    randomBytes(16).toString('hex'), user.id);
            }
        }
        return json({ token: user.token, nickname: user.nickname, is_admin: Boolean(user.is_admin) });
    }

    if (path === '/api/profile' && ['GET', 'PATCH'].includes(method)) {
        const user = auth();
        if (user.username.startsWith('__guest_')) fail(403, '访客没有公开资料');
        if (method === 'PATCH') {
            const data = await body(request);
            if ('nickname' in data) user.nickname = profileText(data.nickname, 24, '昵称');
            if ('taste' in data) user.taste = profileText(data.taste, 80, '口味偏好');
            if ('birthplace' in data) user.birthplace = profileText(data.birthplace, 40, '出生地');
            await q('UPDATE users SET nickname=?,taste=?,birthplace=? WHERE id=?',
                user.nickname, user.taste, user.birthplace, user.id).run();
        }
        const avatar = await first('SELECT avatar IS NOT NULL has_avatar FROM users WHERE id=?', user.id);
        return json({ id: user.id, nickname: user.nickname, taste: user.taste, birthplace: user.birthplace,
            avatar_url: avatar.has_avatar ? `/api/avatars/${user.id}` : null });
    }

    if (path === '/api/profile/avatar' && ['PUT', 'DELETE'].includes(method)) {
        const user = auth();
        if (user.username.startsWith('__guest_')) fail(403, '访客没有公开资料');
        const avatar = method === 'PUT' ? await photoBytes((await form(request)).get('photo'), 50_000) : null;
        if (method === 'PUT' && !avatar) fail(400, '请选择头像');
        await q('UPDATE users SET avatar=? WHERE id=?', avatar, user.id).run();
        return json({ avatar_url: avatar ? `/api/avatars/${user.id}` : null });
    }

    const avatarMatch = /^\/api\/avatars\/(\d+)$/.exec(path);
    if (method === 'GET' && avatarMatch) {
        const row = await first("SELECT avatar FROM users WHERE id=? AND username NOT GLOB '__guest_*'", Number(avatarMatch[1]));
        if (!row?.avatar) fail(404, '头像不存在');
        return new Response(new Uint8Array(row.avatar), { headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } });
    }

    if (method === 'GET' && ['/api/my/following', '/api/my/followers'].includes(path)) {
        const user = auth();
        if (user.username.startsWith('__guest_')) fail(403, '请先登录账号');
        const followers = path.endsWith('/followers');
        const person = followers ? 'follower_id' : 'followed_id';
        const owner = followers ? 'followed_id' : 'follower_id';
        const users = await all(`SELECT u.id,u.nickname,u.avatar IS NOT NULL has_avatar FROM user_follows f
            JOIN users u ON u.id=f.${person} WHERE f.${owner}=? ORDER BY f.rowid DESC`, user.id);
        return json(users.map(({id, nickname, has_avatar}) => ({
            id, nickname, avatar_url: has_avatar ? `/api/avatars/${id}` : null
        })));
    }

    const followMatch = /^\/api\/users\/(\d+)\/follow$/.exec(path);
    if (followMatch && ['PUT', 'DELETE'].includes(method)) {
        const user = auth();
        const id = Number(followMatch[1]);
        if (user.username.startsWith('__guest_')) fail(403, '请先登录账号');
        if (id === user.id) fail(400, '不能关注自己');
        if (!await first("SELECT id FROM users WHERE id=? AND substr(username,1,8)<>'__guest_'", id)) fail(404, '用户不存在');
        if (method === 'PUT') await q('INSERT OR IGNORE INTO user_follows VALUES (?,?)', user.id, id).run();
        else await q('DELETE FROM user_follows WHERE follower_id=? AND followed_id=?', user.id, id).run();
        return json({ following: method === 'PUT' });
    }

    const profileMatch = /^\/api\/users\/(\d+)$/.exec(path);
    if (method === 'GET' && profileMatch) {
        const id = Number(profileMatch[1]);
        const profile = await first(`SELECT nickname,taste,birthplace,avatar IS NOT NULL has_avatar FROM users
            WHERE id=? AND username NOT GLOB '__guest_*'`, id);
        if (!profile) fail(404, '用户不存在');
        const rows = await all(`SELECT r.id,r.canteen_id,c.name canteen_name,r.score,r.comment content,
            r.dish_name,r.dish_scores,substr(r.created_at,1,16) created_at
            FROM ratings r JOIN canteens c ON c.id=r.canteen_id
            WHERE r.user_id=? AND r.is_deleted=0 AND r.is_anonymous=0 ORDER BY r.created_at DESC,r.id DESC`, id);
        const likes = await first(`SELECT COUNT(*) total FROM review_votes v JOIN ratings r ON r.id=v.rating_id
            WHERE r.user_id=? AND r.is_deleted=0 AND r.is_anonymous=0 AND v.vote=1`, id);
        const following = viewer && await first('SELECT 1 FROM user_follows WHERE follower_id=? AND followed_id=?', viewer.id, id);
        return json({ ...profile, likes_received: likes.total, following: Boolean(following), is_self: viewer?.id === id,
            avatar_url: profile.has_avatar ? `/api/avatars/${id}` : null,
            reviews: rows.map(row => ({ ...row, dish_scores: decodeScores(row.dish_scores) })) });
    }

    if (method === 'GET' && path === '/api/categories') return json(await all('SELECT * FROM categories ORDER BY id'));
    if (method === 'GET' && path === '/api/canteens') {
        return json(await all(stallsSql + ' WHERE c.is_active=1 GROUP BY c.id ORDER BY c.category_id,c.name'));
    }
    if (method === 'GET' && path === '/api/stalls/ranking') {
        const rows = await all(stallsSql + " WHERE c.is_active=1 AND COALESCE(g.kind,'canteen')='canteen' GROUP BY c.id HAVING COUNT(r.id)>0 ORDER BY score DESC,c.id");
        return json(rows.map(row => ({ ...row, avg_score: row.score })));
    }

    let match = /^\/api\/canteens\/(\d+)(\/dishes)?$/.exec(path);
    if (method === 'GET' && match) {
        const id = Number(match[1]);
        const [stallResult, dishResult, ratingResult, historyResult] = await batch([
            q(`SELECT c.id,c.name,c.category_id,g.name category_name,c.photo IS NOT NULL has_photo
                FROM canteens c LEFT JOIN categories g ON g.id=c.category_id WHERE c.id=?`, id),
            q('SELECT id,name,photo IS NOT NULL has_photo FROM dishes WHERE canteen_id=? ORDER BY name', id),
            q(`SELECT r.id,r.user_id,u.nickname,u.username GLOB '__guest_*' is_guest,
                u.avatar IS NOT NULL has_avatar,r.is_anonymous,r.score,r.comment,r.created_at,r.dish_name,r.dish_scores,
                r.photo IS NOT NULL has_photo,r.moderation_label,
                (SELECT COUNT(*) FROM review_votes WHERE rating_id=r.id AND vote=1) likes,
                (SELECT COUNT(*) FROM review_votes WHERE rating_id=r.id AND vote=-1) dislikes,
                (SELECT vote FROM review_votes WHERE rating_id=r.id AND user_id=?) my_vote,
                (SELECT json_group_array(id) FROM (SELECT id FROM review_photos WHERE rating_id=r.id ORDER BY id)) photo_ids
                FROM ratings r JOIN users u ON u.id=r.user_id
                WHERE r.canteen_id=? AND r.is_deleted=0 ORDER BY r.created_at DESC,r.id DESC`, viewer?.id ?? null, id),
            q('SELECT created_at,avg_score,rating_count FROM rating_history WHERE canteen_id=? ORDER BY created_at', id)
        ].slice(0, match[2] ? 2 : 4));
        const stall = stallResult.results[0];
        if (!stall) fail(404, '档口不存在');
        const dishes = dishResult.results.map(dish => ({ id: dish.id, name: dish.name, photo_url: photoUrl('dishes', dish) }));
        if (match[2]) return json(dishes);
        const scores = new Map();
        const comments = ratingResult.results.map(row => {
            const dishScores = decodeScores(row.dish_scores);
            for (const dish of dishScores) {
                if (!scores.has(dish.id)) scores.set(dish.id, []);
                scores.get(dish.id).push(dish.score);
            }
            const anonymous = Boolean(row.is_anonymous || row.is_guest);
            const photos = JSON.parse(row.photo_ids).map(id => `/api/review-photos/${id}`);
            if (row.has_photo) photos.unshift(photoUrl('ratings', row));
            return { id: row.id, user: anonymous ? '匿名同学' : row.nickname || '同学',
                avatar_url: !anonymous && row.has_avatar ? `/api/avatars/${row.user_id}` : null,
                author_id: anonymous ? null : row.user_id, is_anonymous: anonymous, is_mine: viewer?.id === row.user_id,
                content: row.comment, score: row.score, created_at: minute(row.created_at), dish_name: row.dish_name,
                moderation_label: row.moderation_label, likes: row.likes, dislikes: row.dislikes, my_vote: row.my_vote ?? 0,
                dish_scores: dishScores, photo_url: photos[0] ?? null, photo_urls: photos };
        });
        const mean = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 100 / values.length) / 100 : null;
        for (const dish of dishes) {
            const values = scores.get(dish.id) || [];
            dish.score = mean(values);
            dish.rating_count = values.length;
        }
        return json({ ...stall, score: mean(comments.map(row => row.score)), comments, dishes,
            photo_url: photoUrl('canteens', stall),
            history: historyResult.results.map(row => ({ ...row, date: minute(row.created_at) })) });
    }

    match = /^\/api\/review-photos\/(\d+)$/.exec(path);
    if (method === 'GET' && match) {
        const row = await first(`SELECT p.photo FROM review_photos p JOIN ratings r ON r.id=p.rating_id
            WHERE p.id=? AND r.is_deleted=0`, Number(match[1]));
        if (!row) fail(404, '照片不存在');
        return new Response(new Uint8Array(row.photo), { headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } });
    }

    match = /^\/api\/photos\/(canteens|dishes|ratings)\/(\d+)$/.exec(path);
    if (method === 'GET' && match) {
        const [, kind, id] = match;
        const row = await first(`SELECT photo FROM ${kind} WHERE id=?${kind === 'ratings' ? ' AND is_deleted=0' : ''}`, Number(id));
        if (!row?.photo) fail(404, '照片不存在');
        return new Response(new Uint8Array(row.photo), { headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } });
    }

    const voteMatch = /^\/api\/ratings\/(\d+)\/vote$/.exec(path);
    if (voteMatch && method === 'PUT') {
        const user = auth();
        const id = Number(voteMatch[1]);
        const { vote } = await body(request);
        if (![1, -1, 0].includes(vote)) fail(400, '无效的投票');
        const write = vote === 0
            ? q(`DELETE FROM review_votes WHERE user_id=? AND rating_id IN
                (SELECT id FROM ratings WHERE id=? AND is_deleted=0)`, user.id, id)
            : q(`INSERT INTO review_votes (rating_id,user_id,vote)
                SELECT id,?,? FROM ratings WHERE id=? AND is_deleted=0
                ON CONFLICT(rating_id,user_id) DO UPDATE SET vote=excluded.vote`, user.id, vote, id);
        const [, result] = await batch([write, q(`SELECT
            (SELECT COUNT(*) FROM review_votes WHERE rating_id=r.id AND vote=1) likes,
            (SELECT COUNT(*) FROM review_votes WHERE rating_id=r.id AND vote=-1) dislikes,
            COALESCE((SELECT vote FROM review_votes WHERE rating_id=r.id AND user_id=?),0) my_vote
            FROM ratings r WHERE r.id=? AND r.is_deleted=0`, user.id, id)]);
        const counts = result.results[0];
        if (!counts) fail(404, '评价不存在');
        return json(counts);
    }

    if (method === 'GET' && path === '/api/my/ratings') {
        return json(await all(`SELECT r.id,r.canteen_id,c.name canteen_name,g.name category_name,
            r.comment content,r.score,substr(r.created_at,1,16) created_at
            FROM ratings r JOIN canteens c ON c.id=r.canteen_id LEFT JOIN categories g ON g.id=c.category_id
            WHERE r.user_id=? AND r.is_deleted=0 ORDER BY r.created_at DESC,r.id DESC`, auth().id));
    }

    match = /^\/api\/ratings\/(\d+)\/photos\/(legacy|\d+)$/.exec(path);
    if (method === 'DELETE' && match) {
        const user = auth();
        const ratingId = Number(match[1]);
        const photoId = match[2];
        const result = photoId === 'legacy'
            ? await q('UPDATE ratings SET photo=NULL WHERE id=? AND user_id=? AND is_deleted=0 AND photo IS NOT NULL', ratingId, user.id).run()
            : await q(`DELETE FROM review_photos WHERE id=? AND rating_id IN
                (SELECT id FROM ratings WHERE id=? AND user_id=? AND is_deleted=0)`, Number(photoId), ratingId, user.id).run();
        if (!result.meta.changes) fail(404, '照片不存在');
        return json({ msg: '照片已删除' });
    }

    match = /^\/api\/ratings\/(\d+)$/.exec(path);
    if ((match && ['PATCH', 'DELETE'].includes(method)) || (path === '/api/ratings' && method === 'POST')) {
        const user = auth();
        const id = match ? Number(match[1]) : null;
        const existing = id ? await first('SELECT id,canteen_id,is_anonymous FROM ratings WHERE id=? AND user_id=? AND is_deleted=0', id, user.id) : null;
        if (id && !existing) fail(404, '评价不存在');
        if (method === 'DELETE') {
            await batch([
                q('DELETE FROM reports WHERE comment_id=?', id),
                q('DELETE FROM ratings WHERE id=? AND user_id=? AND is_deleted=0', id, user.id),
                history(q, existing.canteen_id)
            ]);
            return json({ msg: '评价已撤回' });
        }
        let data, photo;
        const photos = [];
        if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
            const fields = await form(request);
            try { data = JSON.parse(fields.get('rating')); } catch { fail(400, '评价格式无效'); }
            photo = await photoBytes(fields.get('photo'));
            const uploads = fields.getAll('photos');
            if (uploads.length > 4 || (photo && uploads.length)) fail(400, '每条评价最多可上传 4 张照片');
            for (const upload of uploads) {
                const bytes = await photoBytes(upload);
                if (!bytes) fail(400, '照片格式无效');
                photos.push(bytes);
            }
        } else data = await body(request);
        if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, '评价格式无效');
        if ('is_anonymous' in data && typeof data.is_anonymous !== 'boolean') fail(400, '匿名设置无效');
        const anonymous = Number(user.username.startsWith('__guest_') || (data.is_anonymous ?? Boolean(existing?.is_anonymous)));
        const stall = existing?.canteen_id ?? Number(data.canteen_id);
        const ratingScore = score(data.score);
        const comment = getText(data.comment ?? '', 500, '评论');
        if (sensitive(comment)) fail(400, '评论包含不当用语');
        const canteen = await first('SELECT is_active FROM canteens WHERE id=?', stall);
        if (!canteen || (!id && !canteen.is_active)) fail(404, '档口不存在或已下架');

        const selections = data.dish_scores ?? [];
        if (!Array.isArray(selections) || selections.length > 20) fail(400, '每条评价最多可选 20 道菜');
        const menu = await all('SELECT id,name FROM dishes WHERE canteen_id=?', stall);
        const used = new Set();
        const dishes = selections.map(item => {
            if (!item || typeof item !== 'object') fail(400, '菜品格式无效');
            const dishScore = score(item.score);
            const name = item.dish_id != null
                ? menu.find(dish => dish.id === item.dish_id)?.name
                : getText(item.dish_name, 80, '菜品').replace(/\s+/gu, ' ');
            if (!name || sensitive(name)) fail(400, '请选择该档口的菜品或输入新菜名');
            if (used.has(name)) fail(400, '每道菜只能评分一次');
            used.add(name);
            return { name, score: dishScore };
        });

        const writes = dishes.filter(dish => !menu.some(item => item.name === dish.name)).map(dish =>
            q('INSERT INTO dishes (canteen_id,name) VALUES (?,?) ON CONFLICT(canteen_id,name) DO NOTHING', stall, dish.name));
        const dishSql = `(SELECT COALESCE(json_group_array(json_object('id',d.id,'name',d.name,'score',json_extract(j.value,'$.score'))),'[]')
            FROM json_each(?) j JOIN dishes d ON d.canteen_id=? AND d.name=json_extract(j.value,'$.name'))`;
        if (id) {
            if (photo || data.remove_photo === true) {
                writes.push(q(`DELETE FROM review_photos WHERE rating_id IN
                    (SELECT id FROM ratings WHERE id=? AND user_id=? AND is_deleted=0)`, id, user.id));
            }
            writes.push(q(`UPDATE ratings SET score=?,comment=?,is_anonymous=?,dish_scores=${dishSql},
                photo=CASE WHEN ? THEN ? ELSE photo END WHERE id=? AND user_id=? AND is_deleted=0`,
                ratingScore, comment, anonymous, JSON.stringify(dishes), stall, Number(Boolean(photo || data.remove_photo === true)), photo ?? null, id, user.id));
        } else {
            writes.push(q(`INSERT INTO ratings (user_id,canteen_id,score,comment,is_deleted,is_anonymous,created_at,dish_scores,photo)
                VALUES (?,?,?,?,0,?,?,${dishSql},?)`, user.id, stall, ratingScore, comment, anonymous, now(), JSON.stringify(dishes), stall, photo ?? null));
        }
        const ratingWrite = writes.length - 1;
        for (const bytes of photos) {
            writes.push(q(`INSERT INTO review_photos (rating_id,photo)
                SELECT id,? FROM ratings WHERE user_id=? AND canteen_id=? AND is_deleted=0 AND (? IS NULL OR id=?)`,
                bytes, user.id, stall, id, id));
        }
        writes.push(history(q, stall));
        let result;
        try { result = await batch(writes); } catch (error) {
            if (String(error).includes('ratings.user_id, ratings.canteen_id')) fail(409, '您已评价过该档口');
            if (String(error).includes('review photo limit')) fail(400, '每条评价最多可上传 4 张照片');
            throw error;
        }
        if (!result[ratingWrite].meta.changes) fail(404, '评价不存在');
        return json({ msg: id ? '评价已更新' : '评分成功' });
    }

    if (method === 'POST' && path === '/api/report') {
        const data = await body(request);
        const id = Number(data.comment_id);
        const reason = getText(data.content, 500, '举报原因');
        if (!reason) fail(400, '请输入举报原因');
        if (!await first('SELECT id FROM ratings WHERE id=? AND is_deleted=0', id)) fail(404, '评价不存在');
        await q('INSERT INTO reports (user_id,comment_id,content,created_at) VALUES (?,?,?,?)', viewer?.id ?? null, id, reason, now()).run();
        return json({ msg: '举报成功' });
    }

    if (path.startsWith('/api/forum/')) {
        return forum({ path, method, request, viewer, auth, q, all, first, json, fail, body, now, getText });
    }

    if (method === 'POST' && path === '/api/feedback') {
        const fields = request.headers.get('content-type')?.startsWith('multipart/form-data') ? await form(request) : null;
        const data = fields ? Object.fromEntries(fields) : await body(request);
        const kind = data.kind;
        if (!['issue', 'stall'].includes(kind)) fail(400, '反馈类型无效');
        const name = kind === 'stall' ? getText(data.name, 100, '档口名称') : null;
        const content = getText(data.content ?? '', 1000, '反馈内容');
        const photo = kind === 'stall' ? await photoBytes(fields?.get('photo')) : null;
        if (kind === 'issue' ? !content : !name || !photo) fail(400, kind === 'issue' ? '请输入反馈内容' : '请填写档口名称并添加照片');
        const category = data.suggested_category_id ? Number(data.suggested_category_id) : null;
        if (category !== null && (kind !== 'stall' || !Number.isSafeInteger(category) ||
            !await first("SELECT id FROM categories WHERE id=?", category))) fail(400, '请选择有效位置');
        await q('INSERT INTO feedback (kind,name,content,photo,created_at,suggested_category_id) VALUES (?,?,?,?,?,?)',
            kind, name, content, photo, now(), category).run();
        return json({ msg: '反馈已提交' }, 201);
    }

    if (path.startsWith('/api/admin/')) {
        if (!viewer?.is_admin) fail(403, '无权限访问');
        return admin({ path, method, request, viewer, q, all, first, batch, json, fail, body, form, photoBytes, now, history, getText });
    }
    fail(404, '接口不存在');
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin');
        const allowed = origin === env.PAGES_ORIGIN;
        let result;
        if (request.method === 'OPTIONS') {
            result = new Response(null, { status: allowed ? 204 : 403 });
        } else {
            try { result = await route(request, env); }
            catch (error) {
                if (!error.status) console.error(error);
                result = json({ msg: error.status ? error.message : '服务暂时不可用' }, error.status || 500);
            }
        }
        result.headers.set('Cache-Control', 'no-store');
        result.headers.set('Vary', 'Origin');
        if (allowed) {
            result.headers.set('Access-Control-Allow-Origin', origin);
            result.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            result.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
        }
        return result;
    }
};
