import json
from pathlib import Path
from flask import jsonify, request
from sqlalchemy import text


def register_maps(app, db, current_user):
    @app.route("/api/maps/status", methods=["GET", "PUT"])
    @app.route("/api/maps/<int:category_id>", methods=["GET", "PUT"])
    def floor_map(category_id=None):
        user = current_user()
        admin = bool(user and user.is_admin)
        enabled = bool(db.session.execute(text("SELECT enabled FROM map_settings WHERE id=1")).scalar())
        data = request.get_json(silent=True) or {}
        if category_id is None:
            if request.method == "GET":
                return jsonify(enabled=enabled, can_edit=admin)
            if not admin:
                return jsonify(msg="无权限访问"), 403
            if not isinstance(data, dict) or type(data.get("enabled")) is not bool:
                return jsonify(msg="开放设置无效"), 400
            db.session.execute(text("UPDATE map_settings SET enabled=:value WHERE id=1"), {"value":int(data["enabled"])})
            db.session.commit()
            return jsonify(enabled=data["enabled"])
        if not admin and not enabled:
            return jsonify(msg="地图暂未开放"), 403
        if request.method == "GET":
            value = db.session.execute(text("SELECT shapes FROM floor_maps WHERE category_id=:id"), {"id":category_id}).scalar()
            return jsonify(shapes=json.loads(value) if value is not None else None, can_edit=admin)
        if not admin:
            return jsonify(msg="无权限访问"), 403
        shapes = data.get("shapes") if isinstance(data, dict) else None
        if not isinstance(shapes, list) or len(shapes)>500:
            return jsonify(msg="地图格式无效"), 400
        menu = set(db.session.execute(text("SELECT id FROM canteens WHERE category_id=:id AND is_active=1"), {"id":category_id}).scalars())
        clean, ids = [], set()
        for shape in shapes:
            if (not isinstance(shape, dict) or not isinstance(shape.get("id"),str) or len(shape["id"])>100
                or shape["id"] in ids or shape.get("kind") not in ("shop","entrance","stairs")
                or any(type(shape.get(key)) not in (int,float) or not 0<=shape[key]<=20000 for key in ("x","y","width","height"))
                or shape["width"]<40 or shape["height"]<40
                or (shape["kind"]=="shop" and shape.get("stallId") not in menu)):
                return jsonify(msg="铺位格式或所属楼层无效"), 400
            ids.add(shape["id"])
            clean.append({key:shape.get(key) for key in ("id","kind","stallId","x","y","width","height")})
        if not db.session.execute(text("SELECT id FROM categories WHERE id=:id"),{"id":category_id}).scalar():
            return jsonify(msg="楼层不存在"),404
        db.session.execute(text("""INSERT INTO floor_maps(category_id,shapes) VALUES(:id,:shapes)
            ON CONFLICT(category_id) DO UPDATE SET shapes=excluded.shapes"""), {"id":category_id,"shapes":json.dumps(clean)})
        db.session.commit()
        return jsonify(ok=True)


def init_maps(db):
    path=Path(__file__).resolve().parent.parent/"cloudflare/migrations/0014_floor_maps.sql"
    for statement in path.read_text(encoding="utf-8-sig").split(";"):
        if statement.strip():
            db.session.execute(text(statement))
