export async function forum({ path, method, request, viewer, auth, q, all, first, json, fail, body, now, getText }) {
    const url = new URL(request.url);
    const cursor = Number(url.searchParams.get('cursor') || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) fail(400, '分页参数无效');
    const author = "CASE WHEN u.username GLOB '__guest_*' THEN '匿名同学' ELSE COALESCE(u.nickname,'同学') END author";
    const page = (rows, size) => ({ rows: rows.slice(0, size), more: rows.length > size });
    const text = (value, max, label) => {
        const result = getText(value, max, label);
        if (!result) fail(400, '请填写' + label);
        return result;
    };
    if (path === '/api/forum/posts') {
        if (method === 'GET') {
            const kind = url.searchParams.get('kind') || '';
            if (kind && !['recommend', 'avoid'].includes(kind)) fail(400, '帖子类型无效');
            return json(page(await all(`SELECT p.id,p.kind,p.name,p.address,substr(p.content,1,160) content,
                p.created_at,${author},(SELECT COUNT(*) FROM forum_replies WHERE post_id=p.id) reply_count
                FROM forum_posts p JOIN users u ON u.id=p.user_id
                WHERE (?=0 OR p.id<?) AND (?='' OR p.kind=?) ORDER BY p.id DESC LIMIT 31`, cursor, cursor, kind, kind), 30));
        }
        if (method === 'POST') {
            const user = auth();
            const data = await body(request);
            if (!['recommend', 'avoid'].includes(data.kind)) fail(400, '请选择推荐或避雷');
            const row = await first(`INSERT INTO forum_posts (user_id,kind,name,address,content,created_at)
                VALUES (?,?,?,?,?,?) RETURNING id`, user.id, data.kind, text(data.name, 100, '店名'),
                text(data.address, 200, '地址'), text(data.content, 2000, '菜品或理由'), now());
            return json(row, 201);
        }
    }
    const match = /^\/api\/forum\/posts\/(\d+)(\/replies)?$/.exec(path);
    if (match) {
        const id = Number(match[1]);
        if (!Number.isSafeInteger(id)) fail(404, '帖子不存在');
        if (method === 'GET') {
            const post = await first(`SELECT p.id,p.kind,p.name,p.address,p.content,p.created_at,${author},
                (p.user_id=? OR ?=1) can_delete
                FROM forum_posts p JOIN users u ON u.id=p.user_id WHERE p.id=?`, viewer?.id ?? 0, Number(Boolean(viewer?.is_admin)), id);
            if (!post) fail(404, '帖子不存在');
            const replies = await all(`SELECT r.floor,r.content,r.created_at,${author}
                FROM forum_replies r JOIN users u ON u.id=r.user_id WHERE r.post_id=? AND r.floor>?
                ORDER BY r.floor LIMIT 51`, id, cursor);
            return json({ post, ...page(replies, 50) });
        }
        if (method === 'POST' && match[2]) {
            const user = auth();
            const content = text((await body(request)).content, 1000, '回复');
            const result = await first(`INSERT INTO forum_replies (post_id,user_id,floor,content,created_at)
                SELECT p.id,?,COALESCE((SELECT MAX(floor) FROM forum_replies WHERE post_id=p.id),1)+1,?,?
                FROM forum_posts p WHERE p.id=? RETURNING floor`, user.id, content, now(), id);
            if (!result) fail(404, '帖子不存在');
            return json(result, 201);
        }
        if (method === 'DELETE' && !match[2]) {
            const user = auth();
            const result = await q('DELETE FROM forum_posts WHERE id=? AND (user_id=? OR ?=1)', id, user.id, Number(Boolean(viewer.is_admin))).run();
            if (!result.meta.changes) fail(404, '帖子不存在或无权删除');
            return json({ msg: '帖子已删除' });
        }
    }
    fail(404, '论坛接口不存在');
}
