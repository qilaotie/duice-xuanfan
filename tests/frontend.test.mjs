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
            try {
                await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
                await page.coverage.startJSCoverage({ resetOnNavigation: false });
                await page.goto('http://127.0.0.1:' + port);
                await waitFor(page, '#canteen-grid [data-action="open-detail"]');
                await actions(page);
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
    const summary = coverage.getCoverageSummary().toJSON();
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/frontend-coverage.json', JSON.stringify(coverage.toJSON(), null, 2));
    console.log('Frontend branches:', summary.branches);
    assert.equal(coverage.files().length, 2, 'Both shipped frontend scripts must be measured');
    assert.ok(summary.branches.covered * 100 >= summary.branches.total * 80, 'Frontend branch coverage must be at least 80%');
});
