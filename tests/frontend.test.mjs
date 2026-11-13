import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import v8toIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';

async function waitFor(page, selector) {
    await page.locator(selector).first().waitFor({ state: 'visible' });
}

test('browser workflows and branch coverage', { timeout: 120_000 }, async t => {
    const server = spawn(process.env.PYTHON || 'python', ['tests/serve_frontend.py'], { stdio: ['ignore', 'pipe', 'ignore'] });
    t.after(() => server.kill());
    const port = String((await once(server.stdout, 'data'))[0]).trim();
    assert.match(port, /^\d+$/);
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
    t.after(() => browser.close());
    const coverage = libCoverage.createCoverageMap({});
    async function scenario(name, actions) {
        await t.test(name, async () => {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(String(error)));
            page.on('response', response => {
                if (response.status() >= 400 && response.url().includes('/api/')) errors.push(response.status() + ' ' + response.url());
            });
            try {
                await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
                await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
                await page.coverage.startJSCoverage({ resetOnNavigation: false });
                await page.goto('http://127.0.0.1:' + port);
                await waitFor(page, '#canteen-grid [data-action="open-detail"]');
                await actions(page);
            } catch (error) {
                await mkdir('test-results', { recursive: true });
                const file = name.split(' ')[0];
                await page.screenshot({ path: 'test-results/' + file + '.png', fullPage: true });
                await writeFile('test-results/' + file + '.txt', JSON.stringify({ url: page.url(), errors, text: await page.locator('body').innerText() }, null, 2));
                throw error;
            } finally {
                for (const entry of await page.coverage.stopJSCoverage()) {
                    const file = basename(new URL(entry.url).pathname);
                    if (!['app.js', 'config.js'].includes(file)) continue;
                    const converter = v8toIstanbul(resolve('canteen_frontend', file), 0, { source: entry.source });
                    await converter.load();
                    converter.applyCoverage(entry.functions);
                    coverage.merge(converter.toIstanbul());
                }
                await page.close();
            }
        });
    }
    await scenario('TIME-01 UTC dates display in Beijing time across browser timezones', async page => {
        await page.route('**/api/canteens/1', async route => {
            const response = await route.fetch();
            const data = await response.json();
            data.comments = [
                { id: 9001, username: '时间测试', content: 'UTC时间', score: 4, created_at: '2026-11-10 14:03', likes: 5, dislikes: 1, moderation_label: '反串' },
                { id: 9002, username: '时间测试', content: '跨日时间', score: 4, created_at: '2026-11-10T18:03:00Z' },
                { id: 9003, username: '时间测试', content: '已有时区', score: 4, created_at: '2026-11-10T22:03:00+08:00' }
            ];
            data.history = [{date: '2026-11-10 14:03', avg_score: 4, rating_count: 3}];
            await route.fulfill({response, json: data});
        });
        const session = await page.context().newCDPSession(page);
        for (const timezoneId of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai']) {
            await session.send('Emulation.setTimezoneOverride', {timezoneId});
            await page.locator('#canteen-grid [data-action="open-detail"][data-id="1"]').click();
            await waitFor(page, '.comment-time');
            assert.deepEqual(await page.locator('.comment-time').allTextContents(), [
                '2026-11-11 02:03', '2026-11-10 22:03', '2026-11-10 22:03'
            ]);
            const reviews = page.locator('#detail-review-list .comment-item');
            await page.locator('#detail-review-sort').selectOption('oldest');
            assert.equal(await reviews.first().getAttribute('data-review-id'), '9001');
            await page.locator('#detail-review-sort').selectOption('hot');
            assert.equal(await reviews.first().getAttribute('data-review-id'), '9001');
            await page.locator('#detail-review-filter').selectOption('label:反串');
            assert.equal(await reviews.count(), 1);
            assert.match(await page.locator('.chart-wrap').innerText(), /2026-11-10 22:03/);
            await page.locator('#detail-modal .detail-close').click();
        }
    });
    await scenario('AUTH-UI-01 admin stays hidden for ordinary accounts without CSS', async page => {
        const base = new URL(page.url()).origin;
        const credentials = {username: 'ordinary-browser', password: 'test-member-password', confirm_password: 'test-member-password'};
        const response = await page.request.post(base + '/api/register', {data: credentials});
        assert.equal(response.status(), 200);
        const session = await response.json();
        assert.equal(session.is_admin, false);
        await page.evaluate(token => {
            localStorage.setItem('token', 'Bearer ' + token);
            localStorage.setItem('isAdmin', '0');
        }, session.token);
        let stylesheetBlocked = false;
        await page.route('**/styles.css*', route => {
            stylesheetBlocked = true;
            return route.abort();
        });
        await page.goto(base + '/?no-css=1#/admin');
        await waitFor(page, '#canteen-grid [data-action="open-detail"]');
        assert.equal(stylesheetBlocked, true);
        assert.equal(await page.locator('#view-admin').isVisible(), false);
        assert.equal(await page.locator('.nav-link[data-nav="admin"]').isVisible(), false);
        const admin = await page.request.get(base + '/api/admin/categories', {
            headers: {Authorization: 'Bearer ' + session.token}
        });
        assert.equal(admin.status(), 403);
    });
    await scenario('SOCIAL-01 follow a reviewer and find their profile again', async page => {
        const base = new URL(page.url()).origin;
        const password = 'test-social-password';
        const register = async username => (await page.request.post(base + '/api/register', {
            data: {username, password, confirm_password: password}
        })).json();
        const author = await register('social-author');
        const viewer = await register('social-viewer');
        const review = await page.request.post(base + '/api/ratings', {
            headers: {Authorization: 'Bearer ' + author.token},
            data: {canteen_id: 4, score: 5, comment: '关注测试评价'}
        });
        assert.equal(review.status(), 200);
        await page.evaluate(token => localStorage.setItem('token', 'Bearer ' + token), viewer.token);
        await page.goto(base + '/?social=1#/stalls/4');
        await page.locator('#detail-content .comment-user[data-action="open-public-profile"]').first().click();
        const profile = page.locator('#public-profile-modal');
        await profile.getByRole('button', {name: '关注', exact: true}).click();
        await profile.getByRole('button', {name: '取消关注'}).waitFor();
        await profile.getByRole('button', {name: '关闭', exact: true}).click();
        await page.locator('#detail-modal .detail-close').click();
        await page.locator('#my-reviews-btn').click();
        await page.getByRole('button', {name: '我的关注'}).click();
        assert.equal(await page.locator('#my-reviews-list').isVisible(), false);
        await page.locator('#my-following-list button').click();
        await profile.getByText('关注测试评价').waitFor();
        await profile.getByRole('button', {name: '取消关注'}).click();
        await profile.getByRole('button', {name: '关注', exact: true}).waitFor();
        await profile.getByRole('button', {name: '关注', exact: true}).click();
        await profile.getByRole('button', {name: '取消关注'}).waitFor();
        await page.evaluate(token => localStorage.setItem('token', 'Bearer ' + token), author.token);
        await page.goto(base + '/?social=2#/canteens');
        await page.locator('#my-reviews-btn').click();
        await page.getByRole('button', {name: '我的关注'}).click();
        await page.getByRole('button', {name: '关注我的人'}).click();
        await page.locator('#my-following-list button').waitFor();
        await page.getByRole('button', {name: '我的个人主页'}).click();
        await page.locator('#my-profile-panel').getByText('关注测试评价').waitFor();
        assert.equal(await page.locator('#my-following-panel').isVisible(), false);
    });
    await scenario('RANK-01 ranking scope, order and minimum review count', async page => {
        await page.route('**/api/stalls/ranking', route => route.fulfill({json: [
            {id: 3, name: '竹园面馆', category_name: '竹园一层餐厅', avg_score: 5, rating_count: 1},
            {id: 4, name: '竹园饭馆', category_name: '竹园二层餐厅', avg_score: 4, rating_count: 8},
            {id: 7, name: '西军电咖啡', category_name: '西军电餐厅', avg_score: 4.5, rating_count: 10}
        ]}));
        await page.reload();
        await page.locator('button[data-nav="ranking"]').click();
        const names = page.locator('#ranking-list .ranking-name');
        await names.first().waitFor();
        assert.deepEqual(await names.allTextContents(), ['竹园面馆', '西军电咖啡', '竹园饭馆']);
        await page.locator('#ranking-order').selectOption('count');
        assert.equal(await names.first().textContent(), '西军电咖啡');
        await page.locator('#ranking-scope').selectOption('dining:竹园');
        assert.deepEqual(await names.allTextContents(), ['竹园饭馆', '竹园面馆']);
        await page.locator('#ranking-min').selectOption('3');
        assert.deepEqual(await names.allTextContents(), ['竹园饭馆']);
        await page.locator('#ranking-scope').selectOption('floor:14');
        assert.deepEqual(await names.allTextContents(), ['西军电咖啡']);
        await page.locator('#ranking-scope').selectOption('campus:北校区');
        assert.deepEqual(await names.allTextContents(), ['西军电咖啡']);
        await page.locator('#ranking-scope').selectOption('floor:6');
        await page.getByText('没有符合条件的档口').waitFor();
        await page.locator('#ranking-min').selectOption('1');
        await page.locator('#ranking-scope').selectOption('');
        const rankTypes = page.locator('#ranking-food-type');
        await rankTypes.locator('summary').click();
        await rankTypes.locator('button[value="drinks"]').click();
        assert.deepEqual(await names.allTextContents(), ['西军电咖啡']);
        await rankTypes.locator('button[value="noodles"]').click();
        assert.deepEqual(await names.allTextContents(), ['西军电咖啡', '竹园面馆']);
        await rankTypes.getByRole('button', {name: '清空选择'}).click();
        assert.equal(await names.count(), 3);
        await page.locator('button[data-nav="stalls"]').click();
        const stallTypes = page.locator('#stall-food-type');
        await stallTypes.locator('summary').click();
        await stallTypes.locator('button[value="noodles"]').click();
        await page.waitForURL(/food=noodles/);
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="3"]').waitFor();
        assert.equal(await page.locator('#canteen-grid [data-action="open-detail"][data-id="7"]').count(), 0);
        await stallTypes.locator('button[value="drinks"]').click();
        await page.waitForURL(/food=noodles&food=drinks/);
        await page.reload();
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="3"]').waitFor();
        assert.equal(await stallTypes.locator('.food-choice[aria-pressed="true"]').count(), 2);
        assert.equal(await page.locator('#canteen-grid [data-action="open-detail"][data-id="7"]').count(), 1);
    });
    await scenario('UI-01 campus search and empty results', async page => {
        await page.locator('[data-nav="campus"]').click();
        await waitFor(page, '#campus-food-list [data-id="2"]');
        await page.locator('#campus-food-search').fill('不匹配');
        await page.getByText('没有找到相关美食').waitFor();
        await page.locator('#campus-food-search').fill('轻食');
        await page.locator('[data-campus-location="100001"]').click();
        assert.equal(await page.locator('#campus-food-count').textContent(), '1 家');
        await page.locator('[data-campus-location="100002"]').click();
        await page.getByText('没有找到相关美食').waitFor();
    });
    await scenario('UI-02 guest review, dish and withdrawal', async page => {
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="1"]').click();
        await page.locator('#detail-content [data-action="open-rating"]').click();
        assert.equal(await page.locator('#rating-location-fields').isVisible(), false);
        assert.equal(await page.locator('#rating-target-summary').isVisible(), true);
        assert.equal(await page.locator('#rating-dishes-extra').getAttribute('open'), null);
        assert.equal(await page.locator('#rating-photos-extra').getAttribute('open'), null);
        await page.locator('#rating-dishes-extra > summary').click();
        await page.locator('#rating-add-new-dish').click();
        await page.locator('.dish-name-input').fill('测试凉面');
        await page.locator('.dish-score-input').selectOption('4');
        await page.locator('#rating-comment').fill('不错');
        await page.locator('#rating-submit').click();
        await page.locator('#detail-content').getByText('不错', { exact: true }).waitFor();
        const like = page.locator('#detail-content [data-action="review-vote"][data-vote="1"]');
        const dislike = page.locator('#detail-content [data-action="review-vote"][data-vote="-1"]');
        await like.click();
        await page.locator('[data-vote="1"][aria-pressed="true"]').waitFor();
        await dislike.click();
        await page.locator('[data-vote="-1"][aria-pressed="true"]').waitFor();
        assert.equal(await like.getAttribute('aria-pressed'), 'false');
        await dislike.click();
        await page.locator('[data-vote="-1"][aria-pressed="false"]').waitFor();
        await page.locator('#detail-content [data-action="edit-review"]').click();
        await page.locator('#rating-comment').fill('更新后的评价');
        await page.locator('#rating-submit').click();
        await page.locator('#detail-content').getByText('更新后的评价').waitFor();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#detail-content [data-action="withdraw-review"]').click();
        await page.getByText('还没有评论').waitFor();
    });
    await scenario('UI-03 guest forum post, filter and reply', async page => {
        await page.locator('[data-nav="forum"]').click();
        await page.locator('[data-action="forum-compose"]').click();
        const form = page.locator('#forum-compose-form');
        await form.locator('[name=kind]').selectOption('avoid');
        await form.locator('[name=name]').fill('测试餐馆');
        await form.locator('[name=address]').fill('测试路 1 号');
        await form.locator('[name=content]').fill('面太咸');
        await form.locator('button[type=submit]').click();
        await waitFor(page, '#forum-reply-form');
        await page.locator('#forum-reply-form textarea').fill('下次试试少盐');
        await page.locator('#forum-reply-form button[type=submit]').click();
        await page.locator('#forum-replies').getByText('下次试试少盐').waitFor();
        assert.match(await page.locator('#forum-replies').textContent(), /2 楼/);
        await page.locator('#forum-thread-modal .modal-close').click();
        await page.locator('#forum-kind-filter').selectOption('recommend');
        await page.getByText('这里还没有帖子').waitFor();
        await page.locator('#forum-kind-filter').selectOption('avoid');
        await page.locator('#forum-post-list').getByText('测试餐馆').waitFor();
    });
    await scenario('UI-04 admin login, category rename and feedback', async page => {
        await page.locator('#login-btn').click();
        await page.locator('#auth-username').fill('admin');
        await page.locator('#auth-password').fill('test-admin-password');
        await page.locator('#auth-submit').click();
        await page.locator('[data-nav="admin"]').click();
        await page.locator('[data-admin-tab="administrators"]').click();
        await page.getByText('暂无其他管理员账号。', {exact: true}).waitFor();
        await page.locator('[data-admin-tab="categories"]').click();
        const row = page.locator('#admin-category-list .admin-row').filter({ hasText: '测试食堂' });
        await row.locator('[data-action="edit-category"]').click();
        await row.locator('input').fill('改名测试食堂');
        await row.getByRole('button', { name: '保存', exact: true }).click();
        await page.locator('#admin-category-list [data-category-name]').getByText('改名测试食堂', { exact: true }).waitFor();
        await page.locator('[data-admin-tab="feedback"]').click();
        await page.getByText('暂无反馈。').waitFor();
        await page.locator('button[data-nav="stalls"]').click();
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="1"]').click();
        await page.locator('#detail-content [data-action="feedback-stall-issue"]').click();
        assert.match(await page.locator('#feedback-stall-context').innerText(), /测试面馆.*ID 1/);
        await page.locator('#feedback-form textarea').fill('浏览器测试反馈');
        await page.locator('#feedback-form button[type=submit]').click();
        await page.getByText('反馈已提交，感谢！').waitFor();
        await page.locator('#detail-modal .detail-close').click();
        await page.locator('[data-nav="admin"]').click();
        const issue = page.locator('#admin-feedback-list article').filter({hasText: '浏览器测试反馈'});
        await issue.waitFor();
        assert.match(await issue.innerText(), /测试面馆.*ID 1/);
        await page.locator('button[data-nav="stalls"]').click();
        await page.locator('[data-action="feedback-stall"]').click();
        await page.locator('#feedback-form input[name="name"]').fill('测试忽略档口');
        await page.locator('#feedback-form select[name="building"]').selectOption('other');
        await page.locator('#feedback-form input[name="customLocation"]').fill('测试地点');
        const photo = await page.evaluate(() => document.createElement('canvas').toDataURL('image/jpeg').split(',')[1]);
        await page.locator('#feedback-form input[name="photo"]').setInputFiles({
            name: 'stall.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo, 'base64')
        });
        await page.locator('#feedback-form button[type=submit]').click();
        await page.locator('#feedback-modal').waitFor({state: 'hidden'});
        await page.locator('[data-nav="admin"]').click();
        const suggestion = page.locator('[data-feedback-id]').filter({hasText: '测试忽略档口'});
        await suggestion.getByRole('button', {name: '忽略', exact: true}).click();
        await suggestion.waitFor({state: 'hidden'});
        await page.locator('#feedback-status').selectOption('processed');
        await suggestion.getByText('已忽略').waitFor();
        await page.locator('button[data-nav="stalls"]').click();
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="1"]').click();
        await page.locator('#detail-content [data-action="open-rating"]').click();
        await page.locator('#rating-comment').fill('标签测试评价');
        await page.locator('#rating-submit').click();
        await page.locator('#detail-content').getByText('标签测试评价', {exact: true}).waitFor();
        await page.locator('#detail-modal .detail-close').click();
        await page.locator('[data-nav="admin"]').click();
        await page.locator('[data-admin-tab="ratings"]').click();
        const addLabel = page.locator('#admin-add-review-label');
        await addLabel.locator('input').fill('待核实');
        await addLabel.getByRole('button').click();
        await page.locator('#admin-review-label-list [data-review-label-name="待核实"]').waitFor();
        await page.locator('button[data-nav="stalls"]').click();
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="1"]').click();
        await page.locator('#detail-review-list').getByLabel('评价标签').selectOption('待核实');
        await page.locator('#detail-review-list .badge').getByText('待核实', {exact: true}).waitFor();
        await page.locator('#detail-modal .detail-close').click();
        await page.locator('[data-nav="admin"]').click();
        const rating = page.locator('#admin-rating-list .admin-row').filter({hasText: '标签测试评价'});
        await rating.getByText('待核实', {exact: true}).first().waitFor();
        const label = page.locator('#admin-review-label-list [data-review-label-name]').filter({hasText: '待核实'});
        await label.locator('summary').click();
        await label.locator('input').fill('情况待确认');
        await label.getByRole('button', {name: '保存名称'}).click();
        const renamed = page.locator('#admin-review-label-list [data-review-label-name]').filter({hasText: '情况待确认'});
        await renamed.waitFor();
        assert.equal(await rating.getByLabel('评价标签').inputValue(), '情况待确认');
        page.once('dialog', dialog => dialog.accept());
        await renamed.getByRole('button', {name: '删除标签'}).click();
        await renamed.waitFor({state: 'detached'});
        assert.equal(await rating.getByLabel('评价标签').inputValue(), '');
        await page.locator('[data-admin-tab="canteens"]').click();
        await page.getByLabel('新餐饮分类名称').fill('烧烤');
        await page.getByRole('button', {name: '新增分类', exact: true}).click();
        await page.getByText('查看分类和档口', {exact: true}).click();
        const type = page.locator('#admin-food-types [data-food-type-id]').filter({hasText: '烧烤'});
        await type.waitFor();
        const typeId = await type.getAttribute('data-food-type-id');
        await page.locator('#admin-canteen-list [data-action="open-detail"][data-id="1"]').click();
        const form = page.locator('[data-stall-food-types="1"]');
        await form.getByRole('checkbox', {name: '烧烤'}).check();
        await form.getByRole('button', {name: '保存分类', exact: true}).click();
        await form.getByText('当前使用手动分类').waitFor();
        await page.locator('#detail-modal .detail-close').click();
        await type.locator('summary').first().click();
        await type.locator('[data-action="open-detail"][data-id="1"]').waitFor();
        await page.locator('button[data-nav="stalls"]').click();
        await page.locator('#stall-food-type summary').click();
        await page.locator(`#stall-food-type button[value="${typeId}"]`).click();
        await page.locator('#canteen-grid [data-action="open-detail"][data-id="1"]').waitFor();
    });
    await scenario('ROUTE-01 detail refresh, return filters and browser history', async page => {
        await page.locator('#search-input').fill('测试面馆');
        await page.locator('[data-category="1"]').click();
        await page.waitForURL(/location=1/);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(80);
        const scroll = await page.evaluate(() => window.scrollY);
        await page.locator('#canteen-grid [data-id="1"][data-action="open-detail"]').click();
        await page.waitForURL('**/#/stalls/1');
        await page.reload();
        await waitFor(page, '#detail-content [data-action="open-rating"]');
        await page.locator('#detail-modal .detail-close').click();
        await page.waitForURL(/canteens\?/);
        await page.locator('#detail-modal').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#search-input').inputValue(), '测试面馆');
        assert.match(page.url(), /location=1/);
        await page.waitForTimeout(100);
        assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - scroll) < 5);
        await page.goForward();
        await waitFor(page, '#detail-content [data-action="open-rating"]');
        await page.goBack();
        await page.locator('#detail-modal').waitFor({ state: 'hidden' });
    });
    await scenario('ROUTE-02 direct campus and missing forum links', async page => {
        const origin = new URL(page.url()).origin;
        await page.goto(origin + '/#/stalls/2');
        await waitFor(page, '#detail-content [data-action="open-rating"]');
        await page.locator('#detail-modal .detail-close').click();
        await page.waitForURL('**/#/campus');
        await page.goto(origin + '/#/forum/posts/99999');
        await page.getByText('帖子已删除或不存在。').waitFor();
        await page.getByRole('button', { name: '返回论坛', exact: true }).click();
        await page.waitForURL('**/#/forum');
    });
    await scenario('ROUTE-03 forum filters survive thread refresh and close', async page => {
        await page.locator('[data-nav="forum"]').click();
        await page.locator('#forum-kind-filter').selectOption('avoid');
        await page.waitForURL(/kind=avoid/);
        await page.locator('#forum-post-list [data-action="forum-open"]').first().click();
        await page.waitForURL(/#\/forum\/posts\/\d+$/);
        const link = page.url();
        await page.reload();
        await waitFor(page, '#forum-reply-form');
        await page.locator('#forum-thread-modal .modal-close').click();
        await page.waitForURL(/#\/forum\?kind=avoid$/);
        assert.equal(await page.locator('#forum-kind-filter').inputValue(), 'avoid');
        await page.goto(link);
        await waitFor(page, '#forum-reply-form');
    });
    await scenario('PHOTO-01 draft gallery, zoom, keyboard and nested modal focus', async page => {
        await page.locator('#canteen-grid [data-id="1"][data-action="open-detail"]').click();
        await page.locator('#detail-content [data-action="open-rating"]').click();
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO9sAAAAASUVORK5CYII=', 'base64');
        await page.locator('#rating-photos-extra > summary').click();
        await page.locator('#rating-photo').setInputFiles([
            { name: 'one.png', mimeType: 'image/png', buffer: png },
            { name: 'two.png', mimeType: 'image/png', buffer: png }
        ]);
        const first = page.locator('#rating-photo-preview a').first();
        await first.click();
        const viewer = page.locator('#photo-viewer-modal');
        await viewer.waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelector('#photo-viewer-image').naturalWidth > 0);
        assert.equal(await page.locator('#photo-viewer-count').textContent(), '1 / 2');
        assert.equal(await page.locator('#rating-modal').evaluate(element => element.inert), true);
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#photo-viewer-count').textContent(), '2 / 2');
        await page.getByRole('button', { name: '放大照片', exact: true }).click();
        assert.ok(await page.locator('#photo-viewer-image').evaluate(image => image.clientWidth > image.parentElement.clientWidth));
        await page.getByRole('button', { name: '适合屏幕', exact: true }).click();
        await page.getByRole('button', { name: '关闭照片', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(await viewer.evaluate(element => element.contains(document.activeElement)), true);
        await page.keyboard.press('Escape');
        await viewer.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#rating-modal').evaluate(element => element.inert), false);
        assert.equal(await first.evaluate(element => element === document.activeElement), true);
        assert.equal(await page.locator('#rating-photo-preview img').count(), 2);
        await page.goForward();
        await viewer.waitFor({ state: 'visible' });
        await page.goBack();
        await viewer.waitFor({ state: 'hidden' });
        await page.locator('#rating-modal').waitFor({ state: 'visible' });
    });
    await scenario('LAYOUT-01 compact mobile headings and viewport', async page => {
        await page.setViewportSize({width: 320, height: 780});
        const recommendationTypes = page.locator('#random-food-type');
        await recommendationTypes.locator('summary').click();
        await recommendationTypes.locator('button[value="noodles"]').click();
        await recommendationTypes.locator('button[value="drinks"]').click();
        const dining = recommendationTypes.locator('#random-food-dining');
        await dining.selectOption('东区');
        await page.getByRole('button', {name: '随机推荐'}).click();
        assert.equal(await page.locator('#random-food-result button').getAttribute('data-id'), '7');
        await dining.selectOption('竹园');
        await page.getByRole('button', {name: '随机推荐'}).click();
        assert.equal(await page.locator('#random-food-result button').getAttribute('data-id'), '3');
        await dining.selectOption('');
        const random = page.getByRole('button', {name: '随机推荐'});
        await random.click();
        const result = page.locator('#random-food-result');
        const detail = result.getByRole('button', {name: '查看档口'});
        const first = await detail.getAttribute('data-id');
        assert.ok(['1', '3', '7'].includes(first));
        await page.getByRole('button', {name: '换一个'}).click();
        const next = await detail.getAttribute('data-id');
        assert.ok(['1', '3', '7'].includes(next));
        assert.notEqual(next, first);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await detail.click();
        await page.waitForURL(new RegExp('#/stalls/' + next + '$'));
        await page.locator('#detail-modal .detail-close').click();
        const picker = page.locator('#stall-food-type');
        await picker.locator('summary').click();
        for (const width of [320, 390, 414, 520]) {
            await page.setViewportSize({width, height: 844});
            const panel = await picker.boundingBox();
            const rated = await page.locator('#rated-toggle').boundingBox();
            const sort = await page.locator('#sort-select').boundingBox();
            assert.ok(rated.y >= panel.y + panel.height && sort.y >= panel.y + panel.height);
            assert.ok(sort.x + sort.width <= width);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        for (const view of ['campus', 'forum', 'ranking']) {
            await page.locator('[data-nav="' + view + '"]').click();
            const heading = page.locator('#view-' + view + ' .section-hero');
            assert.ok((await heading.boundingBox()).height < 215, view + ' header should be compact');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        }
    });
    await scenario('DINING-01 parent filters, floors, east district exception and URL restore', async page => {
        await page.locator('[data-dining-campus="南校区"]').click();
        assert.equal(await page.locator('#canteen-grid .stall-row').count(), 4);
        await page.locator('[data-dining-campus="北校区"]').click();
        assert.equal(await page.locator('#canteen-grid .stall-row').count(), 2);
        await page.locator('[data-dining-group="竹园"]').click();
        await page.waitForURL(/group=/);
        assert.equal(await page.locator('#canteen-grid .stall-row').count(), 3);
        await page.locator('[data-category="7"]').click();
        assert.equal(await page.locator('#canteen-grid .stall-row').count(), 1);
        await page.locator('[data-dining-group="东区"]').click();
        assert.equal(await page.locator('#canteen-grid .stall-row').count(), 2);
        await page.reload();
        await page.locator('#canteen-grid .stall-row').first().waitFor();
        assert.equal(await page.locator('#canteen-grid .stall-row').count(), 2);
        await page.locator('[data-category="14"]').click();
        await page.locator('#canteen-grid [data-id="7"][data-action="open-detail"]').waitFor();
        await page.locator('#canteen-grid [data-id="7"][data-action="open-detail"]').click();
        await page.locator('#detail-content [data-action="open-rating"]').click();
        assert.equal(await page.locator('#rating-category option[value="14"]').textContent(), '东区 · 二楼 · 西军电餐厅');
    });
    await scenario('CAMPUS-01 building directory and floor filters', async page => {
        await page.locator('[data-nav="campus"]').click();
        await page.locator('[data-campus-building="老综合楼"]').click();
        assert.equal(await page.locator('#campus-food-count').textContent(), '1 家');
        await page.reload();
        await page.locator('#campus-food-directory').getByRole('button', { name: /老综合楼/ }).waitFor();
        assert.match(page.url(), /building=/);
        await page.locator('[data-campus-location="100002"]').click();
        assert.equal(await page.locator('#campus-food-count').textContent(), '0 家');
        await page.locator('[data-campus-building="家属区（综合楼）"]').click();
        assert.equal(await page.locator('#campus-food-count').textContent(), '0 家');
    });
    const summary = coverage.getCoverageSummary().toJSON();
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/frontend-coverage.json', JSON.stringify(coverage.toJSON(), null, 2));
    console.log('Frontend branches:', summary.branches);
    assert.equal(coverage.files().length, 2, 'Both shipped frontend scripts must be measured');
    assert.ok(summary.branches.covered * 100 >= summary.branches.total * 80, 'Frontend branch coverage must be at least 80%');
});
