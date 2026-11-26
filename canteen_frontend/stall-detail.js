(function () {
    'use strict';
    const {h, render} = Vue;
    window.mountStallDetail = (target, stall, options) => {
        const action = (label, name, primary = false) => h('button', {
            type: 'button', class: 'btn btn-sm ' + (primary ? 'btn-light' : 'btn-ghost-light'),
            'data-action': name, 'data-id': Number(stall.id)
        }, label);
        const component = {
            render() {
                return [
                    h('div', {class: 'detail-hero'}, [
                        h('span', {class: 'tag tag-light'}, stall.category_name || '未分类'),
                        h('div', {class: 'detail-photo-row'}, [
                            stall.photo_url ? h('button', {type: 'button', class: 'photo-open',
                                'data-photo-open': '', 'aria-label': '查看' + stall.name + '大图'}, [
                                h('img', {class: 'detail-photo', src: options.origin + stall.photo_url,
                                    alt: stall.name, loading: 'lazy'})
                            ]) : null,
                            h('div', [h('h2', {id: 'detail-title'}, stall.name)])
                        ]),
                        h('p', {class: 'detail-meta'}, options.meta),
                        h('div', {class: 'detail-score-row'}, [
                            h('div', {class: 'detail-score'}, [options.score, h('small', '/5')]),
                            h('div', [
                                h('div', {class: 'stars'}, options.stars),
                                h('div', {class: 'detail-meta'}, '综合评分')
                            ]),
                            h('div', {class: 'detail-actions'}, [
                                action('写评价', 'open-rating', true),
                                action('复制链接', 'copy-content-link'),
                                action('加入清单', 'recommendation-add-stall'),
                                action('问题反馈', 'feedback-stall-issue')
                            ])
                        ])
                    ]),
                    h('div', {class: 'detail-body'}, [
                        options.showDishes && stall.dishes?.length ? h('section', {class: 'detail-panel'}, [
                            h('div', {class: 'panel-head'}, [h('h3', '档口菜品')]),
                            ...stall.dishes.map(dish => h('div', {
                                key: dish.id, class: 'detail-photo-row dish-photo-row'
                            }, [
                                dish.photo_url ? h('button', {
                                    type: 'button', class: 'photo-open', 'data-photo-open': '',
                                    'aria-label': '查看' + dish.name + '大图'
                                }, [h('img', {class: 'detail-photo', src: options.origin + dish.photo_url,
                                    alt: dish.name, loading: 'lazy'})]) : null,
                                h('div', [
                                    h('strong', dish.name),
                                    h('p', {class: 'muted'}, dish.rating_count
                                        ? `${dish.score} / 5 · ${options.formatNumber(dish.rating_count)} 人评分`
                                        : '暂无菜品评分')
                                ])
                            ]))
                        ]) : null,
                        options.adminPanel?.(),
                        options.hasHistory ? h('section', {class: 'detail-panel'}, [
                            h('div', {class: 'panel-head'}, [
                                h('h3', '评分趋势'), h('span', {class: 'muted'}, '历史平均分')
                            ]),
                            h('div', {class: 'chart-wrap'}, [
                                options.historyFallback
                                    ? h('p', {class: 'muted', style: {fontSize: '12.5px', lineHeight: 2, whiteSpace: 'pre-line'}},
                                        options.historyFallback.join('\n'))
                                    : h('canvas', {id: 'history-chart'})
                            ])
                        ]) : null,
                        h('section', {class: 'detail-panel'}, [
                            h('div', {class: 'panel-head'}, [
                                h('h3', '同学们怎么说'),
                                h('span', {class: 'muted'}, options.formatNumber(options.reviewCount) + ' 条')
                            ]),
                            options.reviewCount ? h('div', {'data-stall-reviews': ''}) : options.emptyReviews
                        ])
                    ])
                ];
            }
        };
        render(h(component), target);
        return () => render(null, target);
    };
})();
