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
                { id: 9001, username: '时间测试', content: 'UTC时间', score: 4, created_at: '2026-11-10 14:03' },
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
                '2026-11-10 22:03', '2026-11-11 02:03', '2026-11-10 22:03'
            ]);
            assert.match(await page.locator('.chart-wrap').innerText(), /2026-11-10 22:03/);
            await page.locator('#detail-modal .detail-close').click();
        }
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
        const row = page.locator('#admin-category-list .admin-row').filter({ hasText: '测试食堂' });
        await row.locator('[data-action="edit-category"]').click();
        await row.locator('input').fill('改名测试食堂');
        await row.getByRole('button', { name: '保存', exact: true }).click();
        await page.locator('#admin-category-list [data-category-name]').getByText('改名测试食堂', { exact: true }).waitFor();
        await page.locator('[data-admin-tab="feedback"]').click();
        await page.getByText('暂无反馈。').waitFor();
        await page.locator('button[data-nav="stalls"]').click();
        await page.locator('[data-action="feedback-issue"]').click();
        await page.locator('#feedback-form textarea').fill('浏览器测试反馈');
        await page.locator('#feedback-form button[type=submit]').click();
        await page.getByText('反馈已提交，感谢！').waitFor();
        await page.locator('[data-nav="admin"]').click();
        await page.locator('#admin-feedback-list').getByText('浏览器测试反馈').waitFor();
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
