export async function admin(ctx) {
    const { path, method, request, viewer, q, all, first, batch, json, fail, body, form, photoBytes, now, history, getText } = ctx;
    const action = (name, type, id) => q(`INSERT INTO admin_actions
        (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)`,
        viewer.id, name, type, id, name + ' by ' + viewer.username, now());
    const success = () => json({ msg: '操作成功' });
    let match = /^\/api\/admin\/photos\/(canteens|dishes)\/(\d+)$/.exec(path);
    if (match && ['PUT', 'DELETE'].includes(method)) {
        const [, kind, raw] = match;
        const id = Number(raw);
        const photo = method === 'PUT' ? await photoBytes((await form(request)).get('photo')) : null;
        if (method === 'PUT' && !photo) fail(400, '请选择照片');
        if (!await first(`SELECT id FROM ${kind} WHERE id=?`, id)) fail(404, '目标不存在');
        await batch([q(`UPDATE ${kind} SET photo=? WHERE id=?`, photo, id), action('update_photo', kind, id)]);
        return json({ photo_url: photo ? `/api/photos/${kind}/${id}` : null });
    }

    match = /^\/api\/admin\/(canteens|dishes)\/(\d+)(\/dishes)?$/.exec(path);
    if (match && ((method === 'PATCH' && !match[3]) ||
        (method === 'POST' && match[1] === 'canteens' && match[3]))) {
        const [, table, raw, addDish] = match;
        const id = Number(raw);
        const dish = addDish || table === 'dishes';
        const name = getText((await body(request)).name, dish ? 80 : 100, '名称').replace(/\s+/gu, ' ');
        if (!name) fail(400, '名称不能为空');
        if (!await first(`SELECT id FROM ${table} WHERE id=?`, id)) fail(404, '记录不存在');
        if (addDish) {
            const row = await first(`INSERT INTO dishes (canteen_id,name) VALUES (?,?)
                ON CONFLICT(canteen_id,name) DO NOTHING RETURNING id`, id, name);
            if (!row) fail(409, '该档口已有同名菜品');
            await action('add_dish', 'dish', row.id).run();
        } else {
            try {
                await batch([q(`UPDATE ${table} SET name=? WHERE id=?`, name, id),
                    action(dish ? 'rename_dish' : 'rename_canteen', dish ? 'dish' : 'canteen', id)]);
            } catch (error) {
                if (dish && String(error).includes('dishes.canteen_id, dishes.name')) fail(409, '该档口已有同名菜品');
                throw error;
            }
        }
        return success();
    }

    if (method === 'GET') {
        if (path === '/api/admin/categories') return json(await all('SELECT * FROM categories ORDER BY id'));
        if (path === '/api/admin/canteens') {
            const rows = await all(`SELECT c.id,c.name,c.category_id,c.is_active,g.name category_name
                FROM canteens c LEFT JOIN categories g ON g.id=c.category_id ORDER BY c.category_id,c.name`);
            return json(rows.map(row => ({ ...row, is_active: Boolean(row.is_active) })));
        }
        if (path === '/api/admin/ratings') {
            const rows = await all(`SELECT r.id,r.user_id,u.username user,r.canteen_id,c.name canteen_name,
                r.is_deleted,r.score,r.comment,substr(r.created_at,1,16) created_at
                FROM ratings r JOIN users u ON u.id=r.user_id JOIN canteens c ON c.id=r.canteen_id ORDER BY r.created_at DESC`);
            return json(rows.map(row => ({ ...row, is_deleted: Boolean(row.is_deleted) })));
        }
        if (path === '/api/admin/reports') {
            const rows = await all(`SELECT p.id report_id,p.user_id reporter_id,u.username reporter,p.content reason,
                substr(p.created_at,1,16) reported_at,p.comment_id rating_id,r.canteen_id,c.name canteen_name,
                a.username rating_user,r.score,r.comment,substr(r.created_at,1,16) created_at,r.is_deleted
                FROM reports p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN ratings r ON r.id=p.comment_id
                LEFT JOIN users a ON a.id=r.user_id LEFT JOIN canteens c ON c.id=r.canteen_id ORDER BY p.created_at DESC`);
            return json(rows.map(({ report_id, reporter_id, reporter, reason, reported_at, ...rating }) => ({
                report_id, reporter_id, reporter, reason, reported_at,
                rating: { ...rating, id: rating.rating_id, user: rating.rating_user, is_deleted: Boolean(rating.is_deleted) }
            })));
        }
        if (path === '/api/admin/actions') {
            return json(await all(`SELECT a.id,a.admin_user_id,u.username admin_user,a.action,a.target_type,
                a.target_id,a.details,substr(a.created_at,1,16) created_at
                FROM admin_actions a LEFT JOIN users u ON u.id=a.admin_user_id ORDER BY a.created_at DESC LIMIT 200`));
        }
    }

    if (method === 'POST' && path === '/api/admin/backfill_history') {
        const result = await q(`INSERT INTO rating_history (canteen_id,avg_score,rating_count,created_at)
            SELECT r.canteen_id,AVG(r.score),COUNT(*),? FROM ratings r WHERE r.is_deleted=0
            AND NOT EXISTS (SELECT 1 FROM rating_history h WHERE h.canteen_id=r.canteen_id)
            GROUP BY r.canteen_id`, now()).run();
        return json({ msg: '历史快照已回填', results: Array.from({ length: result.meta.changes }, () => ({ status: 'ok' })) });
    }

    if (method === 'POST' && ['/api/admin/categories', '/api/admin/canteens'].includes(path)) {
        const data = await body(request);
        const name = getText(data.name, 100, '名称');
        if (!name) fail(400, '请输入名称');
        const category = path.endsWith('/categories');
        const categoryId = Number(data.category_id);
        if (!category && !await first('SELECT id FROM categories WHERE id=?', categoryId)) fail(400, '食堂不存在');
        const row = category
            ? await first('INSERT INTO categories (name) VALUES (?) RETURNING id', name)
            : await first('INSERT INTO canteens (name,category_id,is_active) VALUES (?,?,1) RETURNING id', name, categoryId);
        await action(category ? 'add_category' : 'add_canteen', category ? 'category' : 'canteen', row.id).run();
        return json({ msg: '新增成功', id: row.id });
    }

    match = /^\/api\/admin\/(reports|ratings|categories|canteens)\/(\d+)(?:\/(archive|restore))?$/.exec(path);
    if (!match) fail(404, '接口不存在');
    const [, table, raw, operation] = match;
    const id = Number(raw);
    if (!((method === 'DELETE' && !operation) || (method === 'POST' && operation))) fail(405, '请求方法不允许');
    const row = await first(`SELECT id${table === 'ratings' ? ',canteen_id,is_deleted' : ''} FROM ${table} WHERE id=?`, id);
    if (!row) fail(404, '记录不存在');
    if (table === 'categories' && !operation) {
        if (await first('SELECT id FROM canteens WHERE category_id=? LIMIT 1', id)) fail(400, '食堂下仍有档口');
        await batch([q('DELETE FROM categories WHERE id=?', id), action('delete_category', 'category', id)]);
    } else if (table === 'reports' && !operation) {
        await batch([q('DELETE FROM reports WHERE id=?', id), action('delete_report', 'report', id)]);
    } else if (table === 'canteens') {
        if (operation) {
            await batch([q('UPDATE canteens SET is_active=? WHERE id=?', Number(operation === 'restore'), id),
                action(operation + '_canteen', 'canteen', id)]);
        } else {
            await batch([
                q('DELETE FROM reports WHERE comment_id IN (SELECT id FROM ratings WHERE canteen_id=?)', id),
                q('DELETE FROM ratings WHERE canteen_id=?', id),
                q('DELETE FROM dishes WHERE canteen_id=?', id),
                q('DELETE FROM rating_history WHERE canteen_id=?', id),
                q('DELETE FROM canteens WHERE id=?', id),
                action('delete_canteen', 'canteen', id)
            ]);
        }
    } else if (table === 'ratings' && operation !== 'archive') {
        const restore = operation === 'restore';
        if (restore === !row.is_deleted) fail(400, restore ? '评价未被删除' : '评价已被删除');
        const writes = [q('UPDATE ratings SET is_deleted=? WHERE id=?', Number(!restore), id),
            action(restore ? 'restore_rating' : 'delete_rating', 'rating', id), history(q, row.canteen_id)];
        if (!restore) writes.unshift(q('DELETE FROM reports WHERE comment_id=?', id));
        try { await batch(writes); } catch (error) {
            if (String(error).includes('ratings.user_id, ratings.canteen_id')) fail(409, '该用户已有新的有效评价');
            throw error;
        }
    } else fail(404, '接口不存在');
    return success();
}
