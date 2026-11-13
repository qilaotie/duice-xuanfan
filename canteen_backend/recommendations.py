import json
from sqlite3 import complete_statement
from pathlib import Path

from flask import jsonify, request
from sqlalchemy import text


def register_recommendations(app, db, current_user):
    def execute(sql, **params):
        return db.session.execute(text(sql), params)

    def rows(sql, **params):
        return [dict(row) for row in execute(sql, **params).mappings()]

    @app.route("/api/recommendations", defaults={"list_id": None}, methods=["GET", "POST"])
    @app.route("/api/recommendations/items", defaults={"list_id": None, "section": "bulk"}, methods=["POST"])
    @app.route("/api/recommendations/<int:list_id>", methods=["GET", "PATCH", "DELETE"])
    @app.route("/api/recommendations/<int:list_id>/copy", defaults={"section": "copy"}, methods=["POST"])
    @app.route("/api/recommendations/<int:list_id>/move/<int:stall_id>", defaults={"section": "move"}, methods=["POST"])
    @app.route("/api/recommendations/<int:list_id>/save", defaults={"section": "save"}, methods=["PUT", "DELETE"])
    @app.route("/api/recommendations/<int:list_id>/items/<int:stall_id>", defaults={"section": "items"}, methods=["PUT", "DELETE"])
    def recommendation_api(list_id, section=None, stall_id=None):
        user = current_user()
        if user and user.username.startswith("__guest_"):
            user = None
        method = request.method
        data = request.get_json(silent=True)
        data = data if isinstance(data, dict) else {}
        summary = "SELECT l.id,l.title,l.description,l.is_public FROM recommendation_lists l"

        def error(message, status):
            return jsonify(msg=message), status

        if list_id is None and method == "GET":
            if "author" in request.args:
                author = request.args.get("author", type=int)
                if author is None:
                    return error("作者无效", 400)
                return jsonify(rows(summary + " WHERE l.user_id=:uid AND l.is_public=1 ORDER BY l.id DESC", uid=author))
            if not user:
                return error("请先登录账号", 401)
            if request.args.get("saved") == "1":
                return jsonify(rows(summary + """ JOIN recommendation_saves s ON s.list_id=l.id
                    WHERE s.user_id=:uid AND l.is_public=1 ORDER BY l.id DESC""", uid=user.id))
            return jsonify(rows(summary + " WHERE l.user_id=:uid ORDER BY l.id DESC", uid=user.id))

        if list_id is not None:
            record = execute("""SELECT l.*,u.nickname FROM recommendation_lists l
                JOIN users u ON u.id=l.user_id WHERE l.id=:id""", id=list_id).mappings().first()
            own = bool(record and user and user.id == record["user_id"])
            if not record or not (record["is_public"] or own):
                return error("清单不存在或尚未公开", 404)
            if method == "GET":
                items = rows("""SELECT i.stall_id,i.reason,i.dish_ids,COALESCE(i.removed_name,c.name) name,g.name category_name,c.is_active
                    FROM recommendation_items i LEFT JOIN canteens c ON c.id=i.stall_id AND i.removed_name IS NULL
                    LEFT JOIN categories g ON g.id=c.category_id WHERE i.list_id=:id ORDER BY i.rowid""", id=list_id)
                for item in items:
                    item["dishes"] = [dish["name"] for dish in rows("""SELECT d.name FROM json_each(:ids) j
                        JOIN dishes d ON d.id=j.value AND d.canteen_id=:stall""",
                        ids=item["dish_ids"], stall=item["stall_id"])]
                    item["dish_ids"] = json.loads(item["dish_ids"])
                saved = user and execute("SELECT 1 FROM recommendation_saves WHERE user_id=:uid AND list_id=:id",
                                         uid=user.id, id=list_id).scalar()
                return jsonify(**record, own=own, saved=bool(saved), items=items)
        if not user:
            return error("请先登录账号", 401)
        if section == "bulk":
            ids, stall, dishes, reason = (data.get(key) for key in ("list_ids", "stall_id", "dish_ids", "reason"))
            def valid_id(value):
                return type(value) is int and 0 < value < 2**53

            if (not isinstance(ids, list) or not 1 <= len(ids) <= 100 or not all(map(valid_id, ids))
                    or not valid_id(stall) or not isinstance(dishes, list) or len(dishes) > 30
                    or not all(map(valid_id, dishes)) or not isinstance(reason, str) or len(reason) > 300):
                return error("请检查清单、菜品和推荐理由", 400)
            targets = json.dumps(list(dict.fromkeys(ids)))
            matching = rows("""SELECT id,is_public FROM recommendation_lists
                WHERE user_id=:uid AND id IN (SELECT value FROM json_each(:targets))""", uid=user.id, targets=targets)
            if len(matching) != len(set(ids)):
                return error("只能加入自己的清单", 403)
            if user.is_muted and any(row["is_public"] for row in matching):
                return error("账号已被禁言，暂时无法发布内容", 403)
            if not execute("SELECT id FROM canteens WHERE id=:stall AND is_active=1", stall=stall).scalar():
                return error("档口已下架或不存在", 404)
            allowed = {row["id"] for row in rows("SELECT id FROM dishes WHERE canteen_id=:stall", stall=stall)}
            if not set(dishes) <= allowed:
                return error("所选菜品不属于此档口", 400)
            result = execute("""INSERT OR IGNORE INTO recommendation_items(list_id,stall_id,dish_ids,reason)
                SELECT id,:stall,:dishes,:reason FROM recommendation_lists
                WHERE user_id=:uid AND id IN (SELECT value FROM json_each(:targets))""",
                uid=user.id, targets=targets, stall=stall, dishes=json.dumps(list(dict.fromkeys(dishes))), reason=reason.strip())
            db.session.commit()
            return jsonify(added=result.rowcount, skipped=len(matching) - result.rowcount)
        if section == "save":
            if own:
                return error("只能收藏他人的公开清单", 403)
            sql = ("INSERT OR IGNORE INTO recommendation_saves VALUES(:uid,:id)" if method == "PUT" else
                   "DELETE FROM recommendation_saves WHERE user_id=:uid AND list_id=:id")
            execute(sql, uid=user.id, id=list_id)
        elif list_id is not None and not own:
            return error("只能编辑自己的清单", 403)
        elif section == "copy":
            result = execute("""INSERT INTO recommendation_lists(user_id,title,description,is_public)
                SELECT user_id,substr(title,1,55)||'（副本）',description,0 FROM recommendation_lists WHERE id=:id""", id=list_id)
            execute("""INSERT INTO recommendation_items(list_id,stall_id,removed_name,dish_ids,reason)
                SELECT :target,stall_id,removed_name,dish_ids,reason FROM recommendation_items WHERE list_id=:id""",
                id=list_id, target=result.lastrowid)
            db.session.commit()
            return jsonify(id=result.lastrowid), 201
        elif section == "move":
            target = data.get("target_id")
            if type(target) is not int or not 0 < target < 2**53 or target == list_id:
                return error("请选择另一份清单", 400)
            destination = execute("SELECT is_public FROM recommendation_lists WHERE id=:id AND user_id=:uid",
                                  id=target, uid=user.id).first()
            if not destination:
                return error("只能移到自己的清单", 403)
            if destination.is_public and user.is_muted:
                return error("账号已被禁言，暂时无法发布内容", 403)
            moved = execute("UPDATE OR IGNORE recommendation_items SET list_id=:target WHERE list_id=:id AND stall_id=:stall",
                            target=target, id=list_id, stall=stall_id)
            if not moved.rowcount:
                return error("档口已移出或目标清单已有该档口", 409)
        elif section == "items":
            if method == "DELETE":
                execute("DELETE FROM recommendation_items WHERE list_id=:id AND stall_id=:stall", id=list_id, stall=stall_id)
            else:
                if record["is_public"] and user.is_muted:
                    return error("账号已被禁言，暂时无法发布内容", 403)
                ids, reason = data.get("dish_ids"), data.get("reason")
                if (not isinstance(ids, list) or len(ids) > 30 or any(type(i) is not int or i <= 0 for i in ids)
                        or not isinstance(reason, str) or len(reason) > 300):
                    return error("请检查菜品和推荐理由", 400)
                allowed = {row["id"] for row in rows("SELECT id FROM dishes WHERE canteen_id=:stall", stall=stall_id)}
                if not set(ids) <= allowed:
                    return error("所选菜品不属于此档口", 400)
                result = execute("""INSERT INTO recommendation_items(list_id,stall_id,dish_ids,reason)
                    SELECT :id,id,:ids,:reason FROM canteens WHERE id=:stall AND is_active=1
                    ON CONFLICT(list_id,stall_id) DO UPDATE SET dish_ids=excluded.dish_ids,reason=excluded.reason,removed_name=NULL""",
                    id=list_id, stall=stall_id, ids=json.dumps(list(dict.fromkeys(ids))), reason=reason.strip())
                if not result.rowcount:
                    return error("档口已下架或不存在", 404)
        elif method == "DELETE":
            execute("DELETE FROM recommendation_saves WHERE list_id=:id", id=list_id)
            execute("DELETE FROM recommendation_items WHERE list_id=:id", id=list_id)
            execute("DELETE FROM recommendation_lists WHERE id=:id", id=list_id)
        else:
            title, description, public = data.get("title"), data.get("description", ""), data.get("is_public")
            if (not isinstance(title, str) or not 1 <= len(title.strip()) <= 60 or
                    not isinstance(description, str) or len(description.strip()) > 500 or type(public) is not bool):
                return error("请检查标题、简介和公开状态", 400)
            if public and user.is_muted:
                return error("账号已被禁言，暂时无法发布内容", 403)
            if method == "POST":
                result = execute("""INSERT INTO recommendation_lists(user_id,title,description,is_public)
                    VALUES(:uid,:title,:description,:public)""", uid=user.id, title=title.strip(),
                    description=description.strip(), public=int(public))
                db.session.commit()
                return jsonify(id=result.lastrowid), 201
            execute("""UPDATE recommendation_lists SET title=:title,description=:description,is_public=:public
                WHERE id=:id""", id=list_id, title=title.strip(), description=description.strip(), public=int(public))
        db.session.commit()
        return jsonify(ok=True)


def init_recommendations(db):
    migration = Path(__file__).resolve().parent.parent / "cloudflare" / "migrations" / "0013_recommendations.sql"
    statement = ""
    for line in migration.read_text(encoding="utf-8-sig").splitlines(keepends=True):
        statement += line
        if complete_statement(statement):
            db.session.execute(text(statement))
            statement = ""
