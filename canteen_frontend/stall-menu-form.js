(function () {
    'use strict';
    const {h, render, reactive, ref} = Vue;

    window.mountMenuForm = (target, options) => {
        const component = {
            setup() {
                const values = reactive({...options.values});
                const busy = ref(false);

                async function submit(event) {
                    event.preventDefault();
                    if (busy.value) return;
                    busy.value = true;
                    try {
                        const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
                        await options.save(fields);
                        Object.assign(values, options.clear ? {name: ''} : fields);
                    } catch (error) {
                        options.reportError(error);
                    } finally {
                        busy.value = false;
                    }
                }

                return () => h('form', {class: 'inline-form', 'data-menu-action': options.action,
                    'data-id': options.id, onSubmit: submit}, [
                    ...options.fields.map(field => {
                        const input = h('input', {
                            name: field.name, 'aria-label': field.label, maxlength: field.max,
                            placeholder: field.placeholder, required: field.name === 'name',
                            disabled: busy.value, value: values[field.name],
                            onInput: event => values[field.name] = event.target.value
                        });
                        return options.action === 'rename-canteen' ? h('label', [field.label, input]) : input;
                    }),
                    h('button', {type: 'submit', class: 'btn btn-primary btn-sm', disabled: busy.value},
                        busy.value ? '处理中…' : options.label)
                ]);
            }
        };
        render(h(component), target);
        return () => render(null, target);
    };
})();
