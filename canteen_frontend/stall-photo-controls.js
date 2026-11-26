(function () {
    'use strict';

    const { h, render, ref } = Vue;
    const PhotoControls = {
        props: ['hasPhoto', 'savePhoto', 'reportError'],
        setup(props) {
            const filename = ref('');
            const hasPhoto = ref(props.hasPhoto);
            const busy = ref(false);

            async function save(photo = null) {
                if (busy.value) return;
                const previous = filename.value;
                if (photo) filename.value = photo.name;
                busy.value = true;
                try {
                    hasPhoto.value = Boolean(await props.savePhoto(photo));
                    if (!hasPhoto.value) filename.value = '';
                } catch (error) {
                    filename.value = previous;
                    props.reportError(error);
                } finally {
                    busy.value = false;
                }
            }

            return () => h('div', {class: 'photo-controls', 'aria-busy': busy.value}, [
                h('label', {class: 'photo-picker'}, [
                    h('span', {class: 'btn btn-ghost btn-sm'}, hasPhoto.value ? '更换照片' : '添加照片'),
                    h('input', {
                        type: 'file', accept: 'image/jpeg,image/png,image/webp',
                        'aria-label': '选择照片', disabled: busy.value,
                        onChange(event) {
                            const [photo] = event.target.files;
                            event.target.value = '';
                            if (photo) save(photo);
                        }
                    })
                ]),
                h('span', {class: 'photo-filename muted', 'aria-live': 'polite'},
                    filename.value || (hasPhoto.value ? '已有照片' : '未选择文件')),
                h('button', {
                    type: 'button', class: 'btn btn-soft btn-sm', hidden: !hasPhoto.value,
                    disabled: busy.value, onClick: () => save()
                }, '移除照片')
            ]);
        }
    };

    window.mountStallPhotoControls = (target, props) => {
        render(h(PhotoControls, props), target);
        return () => render(null, target);
    };
})();
