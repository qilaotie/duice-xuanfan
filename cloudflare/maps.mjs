export async function maps({path,method,request,viewer,first,all,q,json,fail,body}) {
    const admin = Boolean(viewer?.is_admin);
    const settings = await first('SELECT enabled FROM map_settings WHERE id=1');
    if (path === '/api/maps/status' && method === 'GET') return json({enabled:Boolean(settings?.enabled),can_edit:admin});
    if (path === '/api/maps/status' && method === 'PUT') {
        if (!admin) fail(403,'无权限访问');
        const {enabled} = await body(request);
        if(typeof enabled !== 'boolean') fail(400,'开放设置无效');
        await q('UPDATE map_settings SET enabled=? WHERE id=1',Number(enabled)).run();
        return json({enabled});
    }
    if (!admin && !settings?.enabled) fail(403,'地图暂未开放');
    const match = /^\/api\/maps\/(\d+)$/.exec(path);
    if (!match) fail(404,'地图不存在');
    const id = Number(match[1]);
    if(method==='GET'){
        const row=await first('SELECT shapes FROM floor_maps WHERE category_id=?',id);
        return json({shapes:row?JSON.parse(row.shapes):null,can_edit:admin});
    }
    if(method!=='PUT') fail(405,'操作不受支持');
    if(!admin) fail(403,'无权限访问');
    const {shapes}=await body(request);
    if(!Array.isArray(shapes)||shapes.length>500) fail(400,'地图格式无效');
    const menu=await all('SELECT id FROM canteens WHERE category_id=? AND is_active=1',id);
    const ids=new Set();
    const clean=shapes.map(shape=>{
        if(!shape || typeof shape.id!=='string'||shape.id.length>100||ids.has(shape.id)||
            !['shop','entrance','stairs'].includes(shape.kind)||
            !['x','y','width','height'].every(key=>Number.isFinite(shape[key])&&shape[key]>=0&&shape[key]<=20000)||
            shape.width<40||shape.height<40||
            (shape.kind==='shop'&&!menu.some(stall=>stall.id===shape.stallId))) fail(400,'铺位格式或所属楼层无效');
        ids.add(shape.id);
        return {id:shape.id,kind:shape.kind,stallId:shape.kind==='shop'?shape.stallId:null,x:shape.x,y:shape.y,width:shape.width,height:shape.height};
    });
    if(!await first('SELECT id FROM categories WHERE id=?',id)) fail(404,'楼层不存在');
    await q('INSERT INTO floor_maps(category_id,shapes) VALUES(?,?) ON CONFLICT(category_id) DO UPDATE SET shapes=excluded.shapes',id,JSON.stringify(clean)).run();
    return json({ok:true});
}
