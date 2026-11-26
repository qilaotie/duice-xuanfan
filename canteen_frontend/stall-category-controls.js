(function () {
    'use strict';

    const { h, render, ref } = Vue;
    window.mountStallCategoryControls = (target, options) => {
        const component = {
            setup() {
                const selected = ref(options.selected);
                const manual = ref(options.manual);
                const pending = ref(null);

                async function submit(event) {
                    event.preventDefault();
                    if (pending.value) return;
                    const automatic = event.submitter?.value === 'auto';
                    pending.value = automatic ? 'auto' : 'manual';
                    try {
                        const result = await options.save(automatic ? null : selected.value);
                        selected.value = result.selected;
                        manual.value = result.manual;
                    } catch (error) {
                        options.reportError(error);
                    } finally {
                        pending.value = null;
                    }
                }

                return () => h('form', {class: 'stack', 'data-stall-food-types': options.id, onSubmit: submit}, [
                    h('fieldset', {disabled: Boolean(pending.value)}, [
                        h('legend', '餐饮分类（可多选）'),
                        h('p', {class: 'muted', 'aria-live': 'polite'}, manual.value
                            ? '当前使用手动分类' : '当前根据档口名自动分类'),
                        options.types.length ? h('div', {class: 'review-filters'}, options.types.map(type =>
                            h('label', {key: type.id}, [
                                h('input', {type: 'checkbox', name: 'food-type', value: type.id,
                                    checked: selected.value.includes(type.id),
                                    onChange(event) {
                                        selected.value = event.target.checked ? [...selected.value, type.id] :
                                            selected.value.filter(id => id !== type.id);
                                    }}),
                                ' ' + type.name
                            ]))) : h('p', {class: 'muted'}, '请先在后台新增餐饮分类。')
                    ]),
                    h('div', {class: 'feedback-review-actions'}, [
                        h('button', {type: 'submit', class: 'btn btn-primary btn-sm', disabled: Boolean(pending.value)},
                            pending.value === 'manual' ? '保存中…' : '保存分类'),
                        h('button', {type: 'submit', value: 'auto', class: 'btn btn-ghost btn-sm', disabled: Boolean(pending.value)},
                            pending.value === 'auto' ? '恢复中…' : '恢复自动分类')
                    ])
                ]);
            }
        };
        render(h(component), target);
        return () => render(null, target);
    };
})();
