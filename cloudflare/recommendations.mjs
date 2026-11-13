const summaries = 'SELECT l.id,l.title,l.description,l.is_public FROM recommendation_lists l';

export async function recommendations({ request, path, method, viewer, q, first, all, batch, json, fail, body }) {
    const collection = '/api/recommendations';
    const url = new URL(request.url);
    const member = viewer && !viewer.username.startsWith('__guest_') ? viewer : null;
    const login = () => { if (!member) fail(401, '请先登录账号'); return member; };
    const publish = () => { if (login().is_muted) fail(403, '账号已被禁言，暂时无法发布内容'); };
    const fields = data => {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        const description = (data.description ?? '').trim?.();
        if (!title || title.length > 60 || typeof description !== 'string' || description.length > 500 || typeof data.is_public !== 'boolean') fail(400, '请检查标题、简介和公开状态');
        if (data.is_public) publish();
        return [title, description, Number(data.is_public)];
    };
    if (path === collection && method === 'GET') {
        const author = url.searchParams.get('author');
        if (author !== null) {
            if (!/^\d+$/.test(author)) fail(400, '作者无效');
            return json(await all(summaries + ' WHERE l.user_id=? AND l.is_public=1 ORDER BY l.id DESC', Number(author)));
        }
        const user = login();
        if (url.searchParams.get('saved') === '1') return json(await all(summaries +
            ' JOIN recommendation_saves s ON s.list_id=l.id WHERE s.user_id=? AND l.is_public=1 ORDER BY l.id DESC', user.id));
        return json(await all(summaries + ' WHERE l.user_id=? ORDER BY l.id DESC', user.id));
    }
    if (path === collection && method === 'POST') {
        const user = login();
        return json(await first('INSERT INTO recommendation_lists(user_id,title,description,is_public) VALUES(?,?,?,?) RETURNING id',
            user.id, ...fields(await body(request))), 201);
    }
    if (path === collection + '/items' && method === 'POST') {
        const user = login();
        const data = await body(request);
        const {list_ids, stall_id, dish_ids, reason} = data;
        const validId = id => Number.isSafeInteger(id) && id > 0;
        if (!Array.isArray(list_ids) || !list_ids.length || list_ids.length > 100 || !list_ids.every(validId) ||
            !validId(stall_id) || !Array.isArray(dish_ids) || dish_ids.length > 30 || !dish_ids.every(validId) ||
            typeof reason !== 'string' || reason.length > 300) fail(400, '请检查清单、菜品和推荐理由');
        const ids = [...new Set(list_ids)];
        const lists = await all('SELECT id,is_public FROM recommendation_lists WHERE user_id=? AND id IN (SELECT value FROM json_each(?))',
            user.id, JSON.stringify(ids));
        if (lists.length !== ids.length) fail(403, '只能加入自己的清单');
        if (lists.some(list => list.is_public)) publish();
        if (!await first('SELECT id FROM canteens WHERE id=? AND is_active=1', stall_id)) fail(404, '档口已下架或不存在');
        const dishes = await all('SELECT id FROM dishes WHERE canteen_id=?', stall_id);
        if (dish_ids.some(id => !dishes.some(dish => dish.id === id))) fail(400, '所选菜品不属于此档口');
        const result = await q(`INSERT OR IGNORE INTO recommendation_items(list_id,stall_id,dish_ids,reason)
            SELECT id,?,?,? FROM recommendation_lists WHERE user_id=? AND id IN (SELECT value FROM json_each(?))`,
            stall_id, JSON.stringify([...new Set(dish_ids)]), reason.trim(), user.id, JSON.stringify(ids)).run();
        return json({added: result.meta.changes, skipped: ids.length - result.meta.changes});
    }
    const match = /^\/api\/recommendations\/(\d+)(?:\/(save|items|copy|move)(?:\/(\d+))?)?$/.exec(path);
    if (!match) fail(404, '清单不存在');
    const [, rawId, section, stall] = match;
    const id = Number(rawId);
    const list = await first(`SELECT l.id,l.title,l.description,l.is_public,l.user_id,u.nickname
        FROM recommendation_lists l JOIN users u ON u.id=l.user_id WHERE l.id=?`, id);
    const own = Boolean(list && member?.id === list.user_id);
    if (!list || (!list.is_public && !own)) fail(404, '清单不存在或尚未公开');
    if (!section && method === 'GET') {
        const items = await all(`SELECT i.stall_id,i.reason,i.dish_ids,COALESCE(i.removed_name,c.name) name,g.name category_name,c.is_active,
            COALESCE((SELECT json_group_array(d.name) FROM json_each(i.dish_ids) j
                JOIN dishes d ON d.id=j.value AND d.canteen_id=i.stall_id),'[]') dishes
            FROM recommendation_items i LEFT JOIN canteens c ON c.id=i.stall_id AND i.removed_name IS NULL
            LEFT JOIN categories g ON g.id=c.category_id WHERE i.list_id=? ORDER BY i.rowid`, id);
        const saved = member && await first('SELECT 1 FROM recommendation_saves WHERE user_id=? AND list_id=?', member.id, id);
        return json({...list, own, saved: Boolean(saved), items: items.map(item => ({
            ...item, dish_ids: JSON.parse(item.dish_ids), dishes: JSON.parse(item.dishes)
        }))});
    }
    if (section === 'save' && !stall && ['PUT', 'DELETE'].includes(method)) {
        const user = login();
        if (!list.is_public || own) fail(403, '只能收藏他人的公开清单');
        if (method === 'PUT') await q('INSERT OR IGNORE INTO recommendation_saves VALUES(?,?)', user.id, id).run();
        else await q('DELETE FROM recommendation_saves WHERE user_id=? AND list_id=?', user.id, id).run();
        return json({ok: true});
    }
    if (!own) fail(403, '只能编辑自己的清单');
    if (section === 'copy' && !stall && method === 'POST') {
        const results = await batch([
            q(`INSERT INTO recommendation_lists(user_id,title,description,is_public)
                SELECT user_id,substr(title,1,55)||'（副本）',description,0 FROM recommendation_lists WHERE id=? RETURNING id`, id),
            q(`WITH target AS MATERIALIZED (SELECT last_insert_rowid() id)
                INSERT INTO recommendation_items(list_id,stall_id,removed_name,dish_ids,reason)
                SELECT target.id,stall_id,removed_name,dish_ids,reason FROM recommendation_items CROSS JOIN target WHERE list_id=?`, id)
        ]);
        if (!results[0].results.length) fail(404, '清单不存在');
        return json(results[0].results[0], 201);
    }
    if (section === 'move' && stall && method === 'POST') {
        const {target_id} = await body(request);
        if (!Number.isSafeInteger(target_id) || target_id <= 0 || target_id === id) fail(400, '请选择另一份清单');
        const target = await first('SELECT is_public FROM recommendation_lists WHERE id=? AND user_id=?', target_id, member.id);
        if (!target) fail(403, '只能移到自己的清单');
        if (target.is_public) publish();
        const moved = await q('UPDATE OR IGNORE recommendation_items SET list_id=? WHERE list_id=? AND stall_id=?',
            target_id, id, Number(stall)).run();
        if (!moved.meta.changes) fail(409, '档口已移出或目标清单已有该档口');
        return json({ok: true});
    }
    if (!section && method === 'PATCH') {
        await q('UPDATE recommendation_lists SET title=?,description=?,is_public=? WHERE id=?', ...fields(await body(request)), id).run();
        return json({ok: true});
    }
    if (!section && method === 'DELETE') {
        await q('DELETE FROM recommendation_lists WHERE id=?', id).run();
        return json({ok: true});
    }
    if (section === 'items' && stall && method === 'DELETE') {
        await q('DELETE FROM recommendation_items WHERE list_id=? AND stall_id=?', id, Number(stall)).run();
        return json({ok: true});
    }
    if (section === 'items' && stall && method === 'PUT') {
        if (list.is_public) publish();
        const data = await body(request);
        const stallId = Number(stall);
        const ids = data.dish_ids;
        if (!Array.isArray(ids) || ids.length > 30 || ids.some(value => !Number.isSafeInteger(value) || value <= 0) ||
            typeof data.reason !== 'string' || data.reason.length > 300) fail(400, '请检查菜品和推荐理由');
        const dishes = await all('SELECT id FROM dishes WHERE canteen_id=?', stallId);
        if (ids.some(value => !dishes.some(dish => dish.id === value))) fail(400, '所选菜品不属于此档口');
        const result = await q(`INSERT INTO recommendation_items(list_id,stall_id,dish_ids,reason)
            SELECT ?,id,?,? FROM canteens WHERE id=? AND is_active=1
            ON CONFLICT(list_id,stall_id) DO UPDATE SET dish_ids=excluded.dish_ids,reason=excluded.reason,removed_name=NULL`,
            id, JSON.stringify([...new Set(ids)]), data.reason.trim(), stallId).run();
        if (!result.meta.changes) fail(404, '档口已下架或不存在');
        return json({ok: true});
    }
    fail(405, '操作不受支持');
}
