'use strict';
const {h, render: patch, Fragment} = Vue;

Vue.createApp({
    render() {
        const button = (id, label, attrs = {}) => h('button', {id, type: 'button', ...attrs}, label);
        return h('div', {class: 'shell'}, [
            h('div', {class: 'bar'}, [
                h('input', {id: 'search', type: 'search', placeholder: '搜索当前楼层档口', 'aria-label': '搜索当前楼层档口'}),
                h('div', {class: 'tools'}, [
                    button('out', '−', {'aria-label': '缩小'}),
                    button('fit', '适应'),
                    button('in', '＋', {'aria-label': '放大'}),
                    button('edit', '编辑布局', {'aria-pressed': 'false', hidden: true})
                ])
            ]),
            h('div', {id: 'buildings', class: 'choices', 'aria-label': '建筑'}),
            h('div', {id: 'floors', class: 'choices', 'aria-label': '楼层'}),
            h('p', {id: 'notice'}, '预览示意布局 · 位置尚未核实。拖动查看，双指或滚轮缩放，点档口查看详情。'),
            h('div', {class: 'canvas'}, [h('svg', {id: 'map', role: 'img', 'aria-label': '楼层位置示意图'})]),
            h('div', {id: 'selection', class: 'selection', hidden: true}, [
                h('strong', {id: 'selected-name'}), button('detail', '查看档口'), button('clear', '取消选择')
            ]),
            h('div', {id: 'editor', class: 'editor', hidden: true}, [
                button('entrance', '添加入口'), button('stairs', '添加楼梯'),
                h('label', ['宽', h('input', {id: 'width', type: 'number', min: 40, max: 400, value: 150})]),
                h('label', ['高', h('input', {id: 'height', type: 'number', min: 40, max: 300, value: 80})]),
                button('save', '保存到云端'), button('reset', '重置此层'), button('export', '导出布局'),
                button('visibility', '向普通用户开放地图'),
                h('p', '调整后点击保存到云端，其他管理员可继续维护。确认各层位置后再开放地图。')
            ])
        ]);
    }
}).mount('#food-map-app');

const el = id => document.getElementById(id);
const svg = el('map');
let categories = [], stalls = [], groups = [], building = '', floor = null;
let shapes = [], selected = null, editing = false;
let canEdit=false, mapEnabled=false, floorRequest=0;
async function api(path,options={}) {
    const response=await fetch(path,{...options,headers:{Authorization:localStorage.getItem('token')||'',
        'Content-Type':'application/json'}});
    const data=await response.json();
    if(!response.ok)throw Error(data.msg||'请求失败');
    return data;
}
let view = {x: 0, y: 0, w: 900, h: 600};
let floorSize = {w:900,h:600};
const pointers = new Map();
let gesture = null;
const storageKey = id => 'duice-map-preview-v1-' + id;
const groupName = name => {
    if (name.includes('西军电')) return '东区';
    const match = name.match(/^(.*?)(?:[一二三四五六七八九十d]+[层楼])/);
    return match ? match[1] : name;
};
function tabs(container, items, current, click) {
    patch(h(Fragment, items.map(item => h('button', {
        key: item.id, type: 'button', 'aria-pressed': String(item.id === current), onClick: () => click(item.id)
    }, item.name))), container);
}
function selectBuilding(id) {
    building = id;
    tabs(el('buildings'), groups, building, selectBuilding);
    const floors = categories.filter(category => groupName(category.name) === building);
    tabs(el('floors'), floors, floors[0]?.id, selectFloor);
    if (floors.length) selectFloor(floors[0].id);
}
async function selectFloor(id) {
    const version=++floorRequest;
    floor = id; selected = null;
    const floors = categories.filter(category => groupName(category.name) === building);
    tabs(el('floors'), floors, floor, selectFloor);
    const menu = stalls.filter(stall => stall.category_id === floor);
    shapes = menu.map((stall,index) => ({
        id:'stall-' + stall.id, stallId:stall.id, kind:'shop',
        x:50+(index%4)*205, y:65+Math.floor(index/4)*125, width:175, height:86
    }));
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(floor)));
        if (Array.isArray(saved)) {
            const valid = saved.filter(shape => ['shop','entrance','stairs'].includes(shape.kind) &&
                ['x','y','width','height'].every(key => Number.isFinite(shape[key])) && shape.width >=40 && shape.height>=40);
            shapes = valid.filter(shape => shape.kind !== 'shop' || menu.some(stall=>stall.id===shape.stallId));
            const existing = new Set(shapes.map(shape=>shape.stallId));
            menu.filter(stall=>!existing.has(stall.id)).forEach(stall=>shapes.push({
                id:'stall-'+stall.id,stallId:stall.id,kind:'shop',x:50,y:Math.max(65,...shapes.map(shape=>shape.y+shape.height))+30,width:175,height:86
            }));
        }
    } catch {}
    try {
        const saved=await api('/api/maps/'+id);
        if(version!==floorRequest)return;
        if(saved.shapes!==null)shapes=saved.shapes;
        else if(!canEdit)shapes=[];
        el('notice').textContent=saved.shapes===null?'此楼层尚未绘制，当前为待核实的示意布局。':'楼层位置示意图 · 拖动查看，双指或滚轮缩放。';
    } catch(error) {
        if(version!==floorRequest)return;
        shapes=[];el('notice').textContent=error.message;
    }
    el('search').value='';
    fit(); render();
}
function fit() {
    floorSize = {w:Math.max(900,...shapes.map(s=>s.x+s.width+50)),h:Math.max(500,...shapes.map(s=>s.y+s.height+50))};
    const bounds=svg.getBoundingClientRect();
    const width=bounds.width<600?500:Math.min(floorSize.w,1000);
    view={x:0,y:0,w:width,h:width*Math.max(180,bounds.height)/Math.max(1,bounds.width)};
    updateView();
}
function updateView(){svg.setAttribute('viewBox', [view.x,view.y,view.w,view.h].join(' '));}
function render() {
    const query=el('search').value.trim().toLowerCase();
    const stallsById = new Map(stalls.map(stall => [stall.id, stall]));
    const shapeColors = {shop: '#f4d3ad', stairs: '#bfccec', entrance: '#b7dfbd'};
    patch(h(Fragment, shapes.map(shape => {
        const label = shape.kind === 'shop' ? stallsById.get(shape.stallId)?.name || '档口' : shape.kind === 'stairs' ? '楼梯' : '入口';
        const active = selected === shape.id;
        const x = shape.x + shape.width / 2;
        const y = shape.y + shape.height / 2;
        const lineLength = Math.max(4, Math.floor(shape.width / 16));
        const lines = [];
        for (const [index, char] of Array.from(label).entries()) {
            const line = Math.floor(index / lineLength);
            lines[line] = (lines[line] || '') + char;
        }
        return h('g', {
            key: shape.id, 'data-shape': shape.id, tabindex: 0, role: 'button', 'aria-label': label,
            opacity: query && !label.toLowerCase().includes(query) ? 0.22 : 1,
            onKeydown(event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selected = shape.id;
                render();
            }
        }, [
            h('rect', {x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: 12,
                fill: active ? '#2a8077' : shapeColors[shape.kind] || shapeColors.entrance,
                stroke: active ? '#155c53' : '#9dbdb3', 'stroke-width': active ? 3 : 1.5}),
            h('text', {x, y, 'text-anchor': 'middle', fill: active ? 'white' : '#234d46', 'font-size': 15, 'pointer-events': 'none'},
                lines.map((line, index) => h('tspan', {key: index, x, dy: index ? 20 : -(lines.length - 1) * 10}, line)))
        ]);
    })), svg, 'svg');
    const shape=shapes.find(s=>s.id===selected);
    const stall=stalls.find(stall=>stall.id===shape?.stallId);
    el('selection').hidden=!shape;
    el('selected-name').textContent=stall?.name || (shape?.kind==='stairs'?'楼梯':'入口');
    el('detail').hidden=!stall;
    if(shape){el('width').value=shape.width;el('height').value=shape.height;}
}
function point(event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function zoom(factor){const w=Math.max(200,Math.min(4000,view.w*factor)), ratio=w/view.w;view.x+=(view.w-w)/2;view.y+=(view.h-view.h*ratio)/2;view.w=w;view.h*=ratio;updateView();}
svg.onwheel=event=>{event.preventDefault();zoom(event.deltaY>0?1.1:0.9);};
svg.onpointerdown=event=>{
    svg.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const shape=shapes.find(s=>s.id===event.target.closest('[data-shape]')?.dataset.shape);
    gesture={start:point(event),view:{...view},shape:editing?shape:null,origin:shape?{x:shape.x,y:shape.y}:null,id:shape?.id,moved:false};
    if(pointers.size===2){const [a,b]=[...pointers.values()];gesture={distance:Math.hypot(a.x-b.x,a.y-b.y),moved:true};}
};
svg.onpointermove=event=>{
    if(!pointers.has(event.pointerId)||!gesture)return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(gesture.distance>0&&distance>0)zoom(gesture.distance/distance);gesture.distance=distance;gesture.moved=true;return;}
    if(!gesture.start)return;
    const p=point(event),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
    if(Math.abs(dx)+Math.abs(dy)<3&&!gesture.moved)return;
    gesture.moved=true;
    if(gesture.shape){gesture.shape.x=Math.max(0,gesture.origin.x+dx);gesture.shape.y=Math.max(0,gesture.origin.y+dy);selected=gesture.id;render();}
    else{view.x-=dx;view.y-=dy;updateView();}
};
function release(event){
    pointers.delete(event.pointerId);
    if(gesture&&!gesture.moved){selected=gesture.id||null;render();}
    gesture=null;
}
svg.onpointerup=release;svg.onpointercancel=()=>{pointers.clear();gesture=null;};
el('in').onclick=()=>zoom(0.8);el('out').onclick=()=>zoom(1.25);el('fit').onclick=fit;
el('search').oninput=render;
el('edit').onclick=()=>{if(!canEdit)return;editing=!editing;el('edit').setAttribute('aria-pressed',String(editing));el('editor').hidden=!editing;};
el('clear').onclick=()=>{selected=null;render();};
el('detail').onclick=()=>{
    const shape=shapes.find(s=>s.id===selected);
    if(shape?.stallId)parent.postMessage({action:'map-open-stall',id:shape.stallId},location.origin);
};
for(const kind of ['entrance','stairs'])el(kind).onclick=()=>{
    const shape={id:crypto.randomUUID(),kind,x:100,y:100,width:100,height:60};
    shapes.push(shape);selected=shape.id;render();
};
for(const key of ['width','height'])el(key).onchange=()=>{
    const shape=shapes.find(s=>s.id===selected),value=Number(el(key).value);
    if(shape&&Number.isFinite(value))shape[key]=Math.max(40,Math.min(key==='width'?400:300,value));
    render();
};
el('save').onclick=async()=>{
    const button=el('save');button.disabled=true;
    try{await api('/api/maps/'+floor,{method:'PUT',body:JSON.stringify({shapes})});localStorage.removeItem(storageKey(floor));el('notice').textContent='此层布局已保存到云端。';}
    catch(error){el('notice').textContent=error.message;}
    finally{button.disabled=false;}
};
el('visibility').onclick=async()=>{
    if(!confirm(mapEnabled?'确定隐藏普通用户的地图入口？':'确认已核实各楼层位置，向普通用户开放地图？'))return;
    const button=el('visibility');button.disabled=true;
    try{const result=await api('/api/maps/status',{method:'PUT',body:JSON.stringify({enabled:!mapEnabled})});mapEnabled=result.enabled;button.textContent=mapEnabled?'隐藏普通用户地图入口':'向普通用户开放地图';}
    catch(error){el('notice').textContent=error.message;}
    finally{button.disabled=false;}
};
el('reset').onclick=()=>{if(confirm('重置当前楼层为示意布局？')){localStorage.removeItem(storageKey(floor));selectFloor(floor);}};
el('export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({categoryId:floor,verified:false,shapes},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='楼层地图-'+floor+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
(async()=>{
 try{
    const status=await api('/api/maps/status');
    canEdit=status.can_edit;mapEnabled=status.enabled;
    if(!canEdit&&!mapEnabled)throw Error('地图暂未开放');
    el('edit').hidden=!canEdit;
    el('visibility').textContent=mapEnabled?'隐藏普通用户地图入口':'向普通用户开放地图';
    const responses=await Promise.all(['/api/categories','/api/canteens'].map(path=>fetch(path)));
    if(responses.some(response=>!response.ok))throw Error('地点数据加载失败');
    [categories,stalls]=await Promise.all(responses.map(response=>response.json()));
    groups=[...new Set(categories.map(category=>groupName(category.name)))].map(name=>({id:name,name}));
    if(groups.length)selectBuilding(groups[0].id);
 }catch(error){el('notice').textContent=error.message;}
})();
