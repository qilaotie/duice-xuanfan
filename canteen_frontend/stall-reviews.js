(function () {
    'use strict';
    const {h, render, computed, ref, watch} = Vue;

    window.mountStallReviews = (target, options) => {
        const component = {
            setup() {
                const sort = ref('newest');
                const filter = ref('all');
                const labels = computed(() => [...new Set(options.comments
                    .map(comment => comment.moderation_label).filter(Boolean))]);
                watch(labels, available => {
                    if (filter.value.startsWith('label:') && !available.includes(filter.value.slice(6))) filter.value = 'all';
                });
                const select = (id, state, choices) => h('select', {
                    id, value: state.value, onChange: event => { state.value = event.target.value; }
                }, choices.map(([value, label]) => h('option', {key: value, value}, label)));

                return () => [
                    h('div', {class: 'review-filters'}, [
                        h('label', ['排序 ', select('detail-review-sort', sort, [
                            ['newest', '最新'], ['oldest', '最早'], ['hot', '热度（赞 − 踩）']
                        ])]),
                        h('label', ['标签 ', select('detail-review-filter', filter, [
                            ['all', '全部'], ['untagged', '无标签'],
                            ...labels.value.map(label => ['label:' + label, label])
                        ])])
                    ]),
                    h('div', {id: 'detail-review-list', onChange: options.changeLabel},
                        options.render(sort.value, filter.value))
                ];
            }
        };
        render(h(component), target);
        return () => render(null, target);
    };
})();
