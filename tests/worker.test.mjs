import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../cloudflare/worker.mjs';

const migrations = new URL('../cloudflare/migrations/', import.meta.url);
const origin = 'https://test.invalid';
const admin = 'a'.repeat(32);
const member = 'b'.repeat(32);
const other = 'c'.repeat(32);

function fixture(t) {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec('PRAGMA foreign_keys = ON');
    for (const file of readdirSync(migrations).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    db.exec(`
        INSERT INTO categories(id,name) VALUES(1,'Dining');
        INSERT INTO canteens(id,name,category_id) VALUES(1,'Noodles',1),(2,'Rice',1);
        INSERT INTO users(id,username,password,is_admin,token,nickname) VALUES
            (1,'admin','!',1,'${admin}','Administrator'),(2,'student','!',0,'${member}','Student'),
            (3,'other','!',0,'${other}',NULL);
    `);
    function prepare(sql, args = []) {
        const statement = db.prepare(sql);
        const values = args.map(arg => arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg);
        return {
            sql,
            bind: (...next) => prepare(sql, next),
            first: () => statement.get(...values) ?? null,
            all: () => ({ results: statement.all(...values) }),
            run: () => ({ meta: statement.run(...values) })
        };
    }
    const env = { PAGES_ORIGIN: origin, DB: {
        prepare,
        batch(statements) {
            db.exec('BEGIN');
            try {
                const result = statements.map(statement => /^\s*SELECT\b|\bRETURNING\b/i.test(statement.sql)
                    ? statement.all() : statement.run());
                db.exec('COMMIT');
                return result;
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        }
    } };
    async function api(path, status, { method = 'GET', data, token, requestOrigin = origin } = {}) {
        const headers = { Origin: requestOrigin };
        if (token) headers.Authorization = 'Bearer ' + token;
        if (data !== undefined && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
        const response = await worker.fetch(new Request(origin + path, {
            method, headers, body: data instanceof FormData ? data : JSON.stringify(data)
        }), env);
        const value = response.headers.get('Content-Type')?.includes('json') ? await response.json() : null;
        assert.equal(response.status, status, JSON.stringify(value));
        if (requestOrigin === origin) assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
        return value;
    }
    return { db, api };
}

const jpeg = () => new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });
function uploads(fields, photos = 1, name = 'photo') {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    for (let i = 0; i < photos; i++) form.append(name, jpeg(), 'image.jpg');
    return form;
}

test('AUTH-01 account validation, session, profile and avatar', async t => {
    const { api } = fixture(t);
    const account = { username: 'new-user', password: 'test-password', confirm_password: 'test-password' };
    await api('/api/health', 200);
    await api('/api/categories', 204, { method: 'OPTIONS' });
    await api('/api/categories', 403, { method: 'OPTIONS', requestOrigin: 'https://other.invalid' });
    await api('/api/missing', 404);
    await api('/api/register', 400, { method: 'POST', data: { ...account, confirm_password: 'wrong' } });
    await api('/api/register', 400, { method: 'POST', data: { ...account, password: '' } });
    await api('/api/register', 409, { method: 'POST', data: { ...account, username: 'admin' } });
    const { token } = await api('/api/register', 200, { method: 'POST', data: account });
    await api('/api/register', 409, { method: 'POST', data: account });
    await api('/api/login', 401, { method: 'POST', data: { ...account, password: 'wrong' } });
    assert.equal((await api('/api/login', 200, { method: 'POST', data: account })).token, token);
    await api('/api/profile', 401);
    await api('/api/profile', 400, { method: 'PATCH', token, data: { nickname: '攻击' } });
    await api('/api/profile', 200, { method: 'PATCH', token, data: { nickname: 'Tester', taste: '辣', birthplace: '西安' } });
    const profile = await api('/api/profile', 200, { token });
    assert.equal(profile.nickname, 'Tester');
    await api('/api/profile/avatar', 400, { method: 'PUT', token, data: new FormData() });
    const avatar = await api('/api/profile/avatar', 200, { method: 'PUT', token, data: uploads({}) });
    await api(avatar.avatar_url, 200);
    await api('/api/profile/avatar', 200, { method: 'DELETE', token });
    await api(avatar.avatar_url, 404);
    const guest = await api('/api/guest', 201, { method: 'POST' });
    await api('/api/profile', 403, { token: guest.token });
});

test('REV-01 catalog, rating, dish scores, photos and withdrawal', async t => {
    const { api } = fixture(t);
    await api('/api/categories', 200);
    await api('/api/canteens', 200);
    await api('/api/stalls/ranking', 200);
    await api('/api/canteens/999', 404);
    await api('/api/canteens/1/dishes', 200);
    await api('/api/ratings', 400, { method: 'POST', token: member, data: { canteen_id: 1, score: 6 } });
    await api('/api/ratings', 404, { method: 'POST', token: member, data: { canteen_id: 99, score: 4 } });
    await api('/api/ratings', 400, { method: 'POST', token: member, data: { canteen_id: 1, score: 4, dish_scores: [{ dish_id: 99, score: 4 }] } });
    const rating = { canteen_id: 1, score: 4, dish_scores: [{ dish_name: 'Test dish', score: 4 }] };
    await api('/api/ratings', 200, { method: 'POST', token: member, data: uploads({ rating: JSON.stringify(rating) }, 2, 'photos') });
    await api('/api/ratings', 409, { method: 'POST', token: member, data: rating });
    const result = await api('/api/canteens/1', 200, { token: member });
    const review = result.comments[0];
    assert.equal(review.is_mine, true);
    assert.equal(review.photo_urls.length, 2);
    assert.equal(result.dishes[0].score, 4);
    const votePath = `/api/ratings/${review.id}/vote`;
    const follow = '/api/users/2/follow';
    await api('/api/my/following', 401);
    await api(follow, 400, {method: 'PUT', token: member});
    await api('/api/users/999/follow', 404, {method: 'PUT', token: other});
    for (let i = 0; i < 2; i++) await api(follow, 200, {method: 'PUT', token: other});
    assert.equal((await api('/api/my/following', 200, {token: other})).length, 1);
    assert.equal((await api('/api/my/followers', 200, {token: member}))[0].id, 3);
    assert.equal((await api('/api/users/2', 200, {token: other})).following, true);
    await api(follow, 200, {method: 'DELETE', token: other});
    assert.deepEqual(await api('/api/my/following', 200, {token: other}), []);
    await api(votePath, 200, {method: 'PUT', token: other, data: {vote: 1}});
    assert.equal((await api('/api/users/2', 200)).likes_received, 1);
    await api(votePath, 401, {method: 'PUT', data: {vote: 1}});
    await api(votePath, 400, {method: 'PUT', token: other, data: {vote: 2}});
    for (const [vote, likes, dislikes] of [[1, 1, 0], [1, 1, 0], [-1, 0, 1], [0, 0, 0]]) {
        assert.deepEqual(await api(votePath, 200, {method: 'PUT', token: other, data: {vote}}),
            {likes, dislikes, my_vote: vote});
    }
    const labelPath = `/api/admin/ratings/${review.id}/label`;
    await api(labelPath, 403, {method: 'PUT', token: other, data: {label: '反串'}});
    await api(labelPath, 400, {method: 'PUT', token: admin, data: {label: '其他'}});
    await api(labelPath, 200, {method: 'PUT', token: admin, data: {label: '反串'}});
    assert.equal((await api('/api/canteens/1', 200)).comments[0].moderation_label, '反串');
    await api(labelPath, 200, {method: 'PUT', token: admin, data: {label: null}});
    assert.equal((await api('/api/canteens/1', 200)).comments[0].moderation_label, null);
    const catalog = '/api/admin/review-labels';
    const manage = (method, status, data) => api(catalog, status, {method, token: admin, data});
    await manage('POST', 200, {name: ' 待核实 '});
    await manage('POST', 409, {name: '待核实'});
    await api(labelPath, 200, {method: 'PUT', token: admin, data: {label: '待核实'}});
    await manage('PATCH', 409, {name: '待核实', new_name: '反串'});
    assert.equal((await api('/api/canteens/1', 200)).comments[0].moderation_label, '待核实');
    await manage('PATCH', 200, {name: '待核实', new_name: '情况待确认'});
    assert.equal((await api('/api/canteens/1', 200)).comments[0].moderation_label, '情况待确认');
    await manage('DELETE', 200, {name: '情况待确认'});
    await manage('DELETE', 404, {name: '情况待确认'});
    assert.equal((await api('/api/canteens/1', 200)).comments[0].moderation_label, null);
    assert.deepEqual(await manage('GET', 200), [{name: '反串'}]);
    await api(review.photo_urls[0], 200);
    await api('/api/users/2', 200);
    await api('/api/users/999', 404);
    await api('/api/my/ratings', 401);
    await api('/api/my/ratings', 200, { token: member });
    await api('/api/ratings/' + review.id, 404, { method: 'PATCH', token: other, data: rating });
    await api('/api/ratings/' + review.id, 200, { method: 'PATCH', token: member, data: { ...rating, is_anonymous: true } });
    assert.equal((await api('/api/users/2', 200)).reviews.length, 0);
    assert.equal((await api('/api/users/2', 200)).likes_received, 0);
    await api('/api/ratings/' + review.id, 200, { method: 'DELETE', token: member });
    await api(votePath, 404, {method: 'PUT', token: other, data: {vote: 1}});
    await api(review.photo_urls[0], 404);
});

test('ADM-01 moderation, catalog management and reviewed suggestions', async t => {
    const { api } = fixture(t);
    const food = '/api/admin/food-types';
    const assign = '/api/admin/canteens/1/food-types';
    const edit = (path, method, status, data) => api(path, status, {method, token: admin, data});
    await api(food, 403, {method: 'POST', token: member, data: {name: '烧烤'}});
    await edit(food, 'POST', 400, {name: ' '});
    await edit(food, 'POST', 200, {name: '烧烤'});
    await edit(food, 'POST', 409, {name: '烧烤'});
    let catalog = await api('/api/food-types', 200);
    const custom = catalog.types.find(type => type.name === '烧烤').id;
    await edit(assign, 'PUT', 400, {types: ['missing']});
    await edit(assign, 'PUT', 400, {types: 'rice'});
    await edit('/api/admin/canteens/999/food-types', 'PUT', 404, {types: []});
    await edit(assign, 'PUT', 200, {types: ['rice', custom, custom]});
    await edit(food + '/' + custom, 'PATCH', 200, {name: '烤串'});
    catalog = await api('/api/food-types', 200);
    assert.equal(catalog.types.find(type => type.id === custom).name, '烤串');
    assert.deepEqual(catalog.overrides['1'], ['rice', custom]);
    await edit(food + '/' + custom, 'DELETE', 200);
    await edit(food + '/' + custom, 'DELETE', 404);
    assert.deepEqual((await api('/api/food-types', 200)).overrides['1'], ['rice']);
    await edit(assign, 'PUT', 200, {types: []});
    assert.deepEqual((await api('/api/food-types', 200)).overrides['1'], []);
    await edit(assign, 'PUT', 200, {types: null});
    assert.deepEqual((await api('/api/food-types', 200)).overrides, {});
    const call = (path, status, method = 'GET', data) => api('/api/admin/' + path, status, { method, data, token: admin });
    await api('/api/admin/categories', 403, { token: member });
    const category = await call('categories', 200, 'POST', { name: 'New dining' });
    const stall = await call('canteens', 200, 'POST', { name: 'New stall', category_id: category.id });
    await call('categories/' + category.id, 400, 'DELETE');
    await call('canteens/' + stall.id, 200, 'PATCH', { name: 'Edited' });
    await call('canteens/' + stall.id + '/dishes', 200, 'POST', { name: 'Dish A' });
    await call('canteens/' + stall.id + '/dishes', 409, 'POST', { name: 'Dish A' });
    const [dish] = await api('/api/canteens/' + stall.id + '/dishes', 200);
    await call('dishes/' + dish.id, 200, 'PATCH', { name: 'Dish B' });
    const photo = await call('photos/dishes/' + dish.id, 200, 'PUT', uploads({}));
    await api(photo.photo_url, 200);
    await call('photos/dishes/' + dish.id, 200, 'DELETE');
    await call('canteens/' + stall.id + '/archive', 200, 'POST');
    await call('canteens/' + stall.id + '/restore', 200, 'POST');
    await api('/api/ratings', 200, { method: 'POST', token: member, data: { canteen_id: stall.id, score: 4 } });
    const [review] = await call('ratings', 200);
    await api('/api/report', 200, { method: 'POST', token: other, data: { comment_id: review.id, content: 'Review issue' } });
    const [report] = await call('reports', 200);
    await call('reports/' + report.report_id, 200, 'DELETE');
    await call('ratings/' + review.id, 200, 'DELETE');
    await call('ratings/' + review.id + '/restore', 200, 'POST');
    await call('backfill_history', 200, 'POST');
    await call('actions', 200);
    await call('canteens/' + stall.id, 200, 'DELETE');
    await call('categories/' + category.id, 200, 'DELETE');
    await api('/api/feedback', 201, { method: 'POST', data: { kind: 'issue', content: 'Bug' } });
    await api('/api/feedback', 201, { method: 'POST', data: uploads({ kind: 'stall', name: 'Campus food', suggested_category_id: '100001' }) });
    const [suggestion, issue] = await call('feedback', 200);
    await call('feedback/' + suggestion.id + '/photo', 200);
    await call('feedback/' + suggestion.id, 409, 'POST', { action: 'approve', name: 'Campus food', category_id: 1 });
    await call('feedback/' + suggestion.id, 200, 'POST', { action: 'approve', name: 'Campus food', category_id: 100001 });
    await call('feedback/' + issue.id, 200, 'POST', { action: 'close' });
    assert.equal((await call('feedback?status=processed', 200)).length, 2);
});

test('Only the primary administrator can revoke a maintenance administrator', async t => {
    const { api, db } = fixture(t);
    db.exec('UPDATE users SET is_admin=1 WHERE id=2');
    const path = '/api/admin/administrators';
    await api(path, 403, {token: member});
    await api(path + '/1', 404, {method: 'DELETE', token: admin});
    assert.equal((await api(path, 200, {token: admin}))[0].id, 2);
    await api(path + '/2', 403, {method: 'DELETE', token: member});
    await api(path + '/2', 200, {method: 'DELETE', token: admin});
    await api('/api/profile', 401, {token: member});
    await api('/api/admin/categories', 403, {token: member});
    assert.deepEqual(await api(path, 200, {token: admin}), []);
});

test('FOR-01 posting, filtering, reply floors and ownership', async t => {
    const { api } = fixture(t);
    const data = { kind: 'avoid', name: 'Restaurant', address: 'Street 1', content: 'Dish was cold' };
    await api('/api/forum/posts', 401, { method: 'POST', data });
    await api('/api/forum/posts', 400, { method: 'POST', token: member, data: { ...data, kind: 'invalid' } });
    await api('/api/forum/posts', 400, { method: 'POST', token: member, data: { ...data, address: '' } });
    const { id } = await api('/api/forum/posts', 201, { method: 'POST', token: member, data });
    const path = '/api/forum/posts/' + id;
    assert.equal((await api('/api/forum/posts?kind=recommend', 200)).rows.length, 0);
    assert.equal((await api('/api/forum/posts?kind=avoid', 200)).rows[0].id, id);
    await api('/api/forum/posts?kind=bad', 400);
    await api('/api/forum/posts?cursor=-1', 400);
    await api('/api/forum/posts/999', 404);
    await api('/api/forum/posts/999/replies', 404, { method: 'POST', token: other, data: { content: 'Missing' } });
    assert.equal((await api(path + '/replies', 201, { method: 'POST', token: other, data: { content: 'First' } })).floor, 2);
    assert.equal((await api(path + '/replies', 201, { method: 'POST', token: member, data: { content: 'Second' } })).floor, 3);
    assert.equal((await api(path + '?cursor=2', 200)).rows[0].floor, 3);
    await api(path, 404, { method: 'DELETE', token: other });
    await api(path, 200, { method: 'DELETE', token: admin });
    await api(path, 404);
    await api('/api/forum/missing', 404);
});
