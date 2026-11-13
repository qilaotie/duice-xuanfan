export async function admin(ctx) {
    const { path, method, request, viewer, q, all, first, batch, json, fail, body, form, photoBytes, now, history, getText } = ctx;
    const action = (name, type, id) => q(`INSERT INTO admin_actions
        (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)`,
        viewer.id, name, type, id, name + ' by ' + viewer.username, now());
    const success = () => json({ msg: '操作成功' });
    const managedUser = /^\/api\/admin\/users(?:\/(\d+))?$/.exec(path);
    if (managedUser) {
        const primary = viewer.username === 'admin';
        if (method === 'GET' && !managedUser[1]) {
            const search = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) || '';
            return json(await all(`SELECT id,username,nickname,is_admin,is_banned,is_muted FROM users
                WHERE substr(username,1,8)<>'__guest_' AND
                    (?=1 OR (COALESCE(is_admin,0)=0 AND username<>'admin')) AND
                    (instr(lower(username),lower(?))>0 OR instr(lower(COALESCE(nickname,'')),lower(?))>0 OR ?='')
                ORDER BY id DESC LIMIT 50`, Number(primary), search, search, search));
        }
        if (method === 'PATCH' && managedUser[1]) {
            const id = Number(managedUser[1]);
            const {field, enabled} = await body(request);
            if (!['is_admin','is_banned','is_muted'].includes(field) || typeof enabled !== 'boolean') fail(400, '权限设置无效');
            if (!primary && field === 'is_admin') fail(403, '仅主管理员可以调整管理员权限');
            const revoke = field === 'is_banned' && enabled || field === 'is_admin' && !enabled;
            const [result] = await batch([
                q(`UPDATE users SET ${field}=?${revoke ? ',token=NULL' : ''}
                    WHERE id=? AND username<>'admin' AND substr(username,1,8)<>'__guest_'
                    AND (?=1 OR COALESCE(is_admin,0)=0)
                    AND (is_banned=0 OR ?=0) RETURNING id`, Number(enabled), id, Number(primary), Number(field === 'is_admin' && enabled)),
                q(`INSERT INTO admin_actions (admin_user_id,action,target_type,target_id,details,created_at)
                    SELECT ?, 'moderate_user', 'user', id, ?, ? FROM users WHERE id=? AND changes()=1`,
                    viewer.id, field + '=' + Number(enabled), now(), id)
            ]);
            if (!result.results.length) fail(409, '账号不存在、受保护或处于封禁状态');
            return success();
        }
    }
    if (path === '/api/admin/administrators' || path.startsWith('/api/admin/administrators/')) {
        if (viewer.username !== 'admin') fail(403, '仅主管理员可以管理管理员账号');
        if (method === 'GET' && path === '/api/admin/administrators') {
            return json(await all("SELECT id,username,nickname FROM users WHERE is_admin=1 AND username<>'admin' ORDER BY username"));
        }
        const target = /^\/api\/admin\/administrators\/(\d+)$/.exec(path);
        if (target && method === 'DELETE') {
            const id = Number(target[1]);
            const [result] = await batch([
                q("UPDATE users SET is_admin=0,token=NULL WHERE id=? AND is_admin=1 AND username<>'admin' RETURNING id", id),
                q(`INSERT INTO admin_actions (admin_user_id,action,target_type,target_id,details,created_at)
                    SELECT ?, 'revoke_admin', 'user', id, username, ? FROM users WHERE id=? AND changes()=1`, viewer.id, now(), id)
            ]);
            if (!result.results.length) fail(404, '没有可撤销的管理员账号');
            return success();
        }
    }
    const foodType = /^\/api\/admin\/food-types(?:\/([a-z0-9-]+))?$/.exec(path);
    if (foodType && ((method === 'POST' && !foodType[1]) || (foodType[1] && ['PATCH', 'DELETE'].includes(method)))) {
        const id = foodType[1] || crypto.randomUUID();
        const name = method === 'DELETE' ? null : getText((await body(request)).name, 20, '分类名称');
        if (name === '') fail(400, '请输入分类名称');
        try {
            if (method === 'POST') {
                await q('INSERT INTO food_types (id,name) VALUES (?,?)', id, name).run();
            } else {
                const result = method === 'PATCH'
                    ? await q('UPDATE food_types SET name=? WHERE id=? RETURNING id', name, id).first()
                    : (await batch([
                        q(`UPDATE stall_food_overrides SET types=(SELECT json_group_array(value)
                            FROM json_each(types) WHERE value<>?) WHERE ? IN (SELECT value FROM json_each(types))`, id, id),
                        q('DELETE FROM food_types WHERE id=? RETURNING id', id)
                    ]))[1].results[0];
                if (!result) fail(404, '分类不存在');
            }
        } catch (error) {
            if (String(error).includes('UNIQUE constraint failed: food_types.name')) fail(409, '分类名称已存在');
            throw error;
        }
        return success();
    }
    const stallTypes = /^\/api\/admin\/canteens\/(\d+)\/food-types$/.exec(path);
    if (stallTypes && method === 'PUT') {
        const id = Number(stallTypes[1]);
        const {types} = await body(request);
        if (types !== null && (!Array.isArray(types) || types.length > 50 ||
            types.some(type => typeof type !== 'string' || type.length > 36))) fail(400, '无效的餐饮分类');
        if (!await first('SELECT id FROM canteens WHERE id=?', id)) fail(404, '档口不存在');
        if (types === null) {
            await q('DELETE FROM stall_food_overrides WHERE canteen_id=?', id).run();
        } else {
            const selected = JSON.stringify([...new Set(types)]);
            const result = await q(`INSERT INTO stall_food_overrides (canteen_id,types)
                SELECT id,? FROM canteens WHERE id=? AND NOT EXISTS (
                    SELECT 1 FROM json_each(?) chosen LEFT JOIN food_types t ON t.id=chosen.value WHERE t.id IS NULL
                ) ON CONFLICT(canteen_id) DO UPDATE SET types=excluded.types RETURNING canteen_id`, selected, id, selected).first();
            if (!result) fail(400, '分类已变更，请刷新后重试');
        }
        return success();
    }
    const labelName = value => {
        const name = getText(value, 20, '标签名称');
        if (!name) fail(400, '请输入标签名称');
        return name;
    };
    if (path === '/api/admin/review-labels') {
        if (method === 'GET') return json(await all('SELECT name FROM review_labels ORDER BY name'));
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
            const input = await body(request);
            const name = labelName(input.name);
            const replacement = method === 'PATCH' ? labelName(input.new_name) : null;
            try {
                if (method === 'POST') {
                    await q('INSERT INTO review_labels (name) VALUES (?)', name).run();
                } else {
                    const [, result] = await batch([
                        q(`UPDATE ratings SET moderation_label=? WHERE moderation_label=?
                            AND EXISTS (SELECT 1 FROM review_labels WHERE name=?)`, replacement, name, name),
                        method === 'PATCH'
                            ? q('UPDATE review_labels SET name=? WHERE name=? RETURNING name', replacement, name)
                            : q('DELETE FROM review_labels WHERE name=? RETURNING name', name)
                    ]);
                    if (!result.results.length) fail(404, '标签不存在');
                }
            } catch (error) {
                if (String(error).includes('UNIQUE constraint failed: review_labels.name')) fail(409, '标签名称已存在');
                throw error;
            }
            return success();
        }
    }
    if (method === 'GET' && path === '/api/admin/feedback') {
        const status = new URL(request.url).searchParams.get('status') === 'processed' ? '!=' : '=';
        return json(await all(`SELECT f.id,f.kind,f.name,f.content,f.status,f.canteen_id,f.created_at,
            f.photo IS NOT NULL has_photo,f.suggested_category_id,g.name suggested_category_name
            FROM feedback f LEFT JOIN categories g ON g.id=f.suggested_category_id
            WHERE f.status ${status} 'pending' ORDER BY f.id DESC LIMIT 100`));
    }
    const labelMatch = /^\/api\/admin\/ratings\/(\d+)\/label$/.exec(path);
    if (labelMatch && method === 'PUT') {
        const id = Number(labelMatch[1]);
        const input = await body(request);
        const label = input.label === null ? null : labelName(input.label);
        const [result] = await batch([
            q(`UPDATE ratings SET moderation_label=? WHERE id=? AND is_deleted=0
                AND (? IS NULL OR EXISTS (SELECT 1 FROM review_labels WHERE name=?)) RETURNING id`, label, id, label, label),
            q(`INSERT INTO admin_actions (admin_user_id,action,target_type,target_id,details,created_at)
                SELECT ?,?,'rating',id,?,? FROM ratings WHERE id=? AND changes()=1`,
                viewer.id, label ? 'set_rating_label' : 'remove_rating_label', label || '移除标签', now(), id)
        ]);
        if (!result.results.length) {
            if (label !== null && !await first('SELECT name FROM review_labels WHERE name=?', label)) fail(400, '标签不存在');
            fail(404, '评价不存在');
        }
        return json({ moderation_label: label });
    }
    const feedback = /^\/api\/admin\/feedback\/(\d+)(\/photo)?$/.exec(path);
    if (feedback && method === 'GET' && feedback[2]) {
        const row = await first('SELECT photo FROM feedback WHERE id=?', Number(feedback[1]));
        if (!row?.photo) fail(404, '照片不存在');
        return new Response(new Uint8Array(row.photo), { headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (feedback && method === 'POST' && !feedback[2]) {
        const id = Number(feedback[1]);
        const data = await body(request);
        if (data.action === 'close') {
            const result = await q("UPDATE feedback SET status='closed' WHERE id=? AND status='pending'", id).run();
            if (!result.meta.changes) fail(409, '此反馈已处理或不存在');
            return success();
        }
        if (data.action !== 'approve') fail(400, '审核操作无效');
        const name = getText(data.name, 100, '档口名称').replace(/\s+/gu, ' ');
        const category = Number(data.category_id);
        if (!name || !Number.isSafeInteger(category) || category < 1) fail(400, '请填写正式名称并选择食堂');
        const rows = await batch([
            q(`INSERT INTO canteens (name,category_id,is_active,photo)
                SELECT ?,?,1,photo FROM feedback WHERE id=? AND kind='stall' AND status='pending'
                AND EXISTS (SELECT 1 FROM categories WHERE id=? AND kind=COALESCE(
                    (SELECT kind FROM categories WHERE id=feedback.suggested_category_id), 'canteen'))
                AND NOT EXISTS (SELECT 1 FROM canteens WHERE category_id=? AND name=?)
                RETURNING id`, name, category, id, category, category, name),
            q(`UPDATE feedback SET status='approved',canteen_id=last_insert_rowid()
                WHERE id=? AND changes()=1 AND status='pending'`, id),
        ]);
        const created = rows[0].results[0];
        if (!created) fail(409, '无法入库，请确认食堂有效、没有同名档口且建议仍待处理');
        return json({ msg: '档口已入库', id: created.id });
    }
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

    match = /^\/api\/admin\/(categories|canteens|dishes)\/(\d+)(\/dishes)?$/.exec(path);
    if (match && ((method === 'PATCH' && !match[3]) ||
        (method === 'POST' && match[1] === 'canteens' && match[3]))) {
        const [, table, raw, addDish] = match;
        const id = Number(raw);
        const dish = addDish || table === 'dishes';
        const name = getText((await body(request)).name, dish ? 80 : 100, '名称').replace(/\s+/gu, ' ');
        if (!name) fail(400, '名称不能为空');
        const category = table === 'categories';
        if (!await first(`SELECT id FROM ${table} WHERE id=?`, id)) fail(404, '记录不存在');
        if (addDish) {
            const row = await first(`INSERT INTO dishes (canteen_id,name) VALUES (?,?)
                ON CONFLICT(canteen_id,name) DO NOTHING RETURNING id`, id, name);
            if (!row) fail(409, '该档口已有同名菜品');
            await action('add_dish', 'dish', row.id).run();
        } else {
            try {
                await batch([q(`UPDATE ${table} SET name=? WHERE id=?`, name, id),
                    action(category ? 'rename_category' : dish ? 'rename_dish' : 'rename_canteen',
                        category ? 'category' : dish ? 'dish' : 'canteen', id)]);
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
                CASE WHEN substr(u.username,1,8)<>'__guest_' THEN u.id END author_id,
                COALESCE(r.is_anonymous,0) is_anonymous,substr(u.username,1,8)='__guest_' is_guest,
                r.is_deleted,r.score,r.comment,r.moderation_label,substr(r.created_at,1,16) created_at
                FROM ratings r JOIN users u ON u.id=r.user_id JOIN canteens c ON c.id=r.canteen_id ORDER BY r.created_at DESC`);
            return json(rows.map(row => ({ ...row, is_deleted: Boolean(row.is_deleted),
                is_anonymous: Boolean(row.is_anonymous), is_guest: Boolean(row.is_guest) })));
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
