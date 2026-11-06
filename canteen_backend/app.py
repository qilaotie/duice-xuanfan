import os
import re
import json
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError
from flask import Flask, request, jsonify, send_file, send_from_directory, url_for, abort
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
from sqlalchemy import func, text
from sqlalchemy.orm import deferred, column_property
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.sqlite import insert
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

# 将前端目录作为 Flask 的静态目录，以便同域提供前端页面与后端 API
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', 'canteen_frontend'))

# 如果需要，也可以把 static_url_path 设为空，这样根路径会直接提供静态文件
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')

# ========= 使用 SQLite =========
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///canteen.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['MAX_CONTENT_LENGTH'] = 7 * 1024 * 1024
db = SQLAlchemy(app)
CORS(app)


# 为了同域访问，把前端文件通过 Flask 提供出来。
# 任何未匹配的路径都会返回前端的 index.html（单页应用友好）。
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    # 未命中的 API 路径返回 JSON 404，避免回退到首页造成调试困惑
    if path == 'api' or path.startswith('api/'):
        return jsonify({"msg": "接口不存在"}), 404
    # 如果请求的是前端静态资源且存在，直接返回文件
    target = os.path.join(FRONTEND_DIR, path)
    if path and os.path.exists(target):
        return send_from_directory(FRONTEND_DIR, path)
    # 否则返回主页面（SPA 入口）
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.errorhandler(404)
def handle_not_found(e):
    if request.path == '/api' or request.path.startswith('/api/'):
        return jsonify({"msg": "接口不存在"}), 404
    return e


@app.errorhandler(405)
def handle_method_not_allowed(e):
    if request.path == '/api' or request.path.startswith('/api/'):
        return jsonify({"msg": "请求方法不允许"}), 405
    return e


@app.errorhandler(413)
def handle_upload_too_large(e):
    return jsonify({"msg": "照片不能超过 5 MB"}), 413

# ========= 敏感词示例 =========
SENSITIVE_WORDS = ["脏话", "恶意", "攻击"]


def contains_sensitive(text: str) -> bool:
    if not text:
        return False
    t = text.lower()
    for w in SENSITIVE_WORDS:
        if w.lower() in t:
            return True
    return False


def canteen_sort_key(name: str):
    """按档口编号排序：01、01-02、0#、无编号。"""
    text = (name or "").strip()
    match = re.match(r"^0*(\d+)(?:\s*[-–—一]\s*0*(\d+))?", text)
    if match:
        first = int(match.group(1))
        second = int(match.group(2)) if match.group(2) else first
        return (0, first, second, text)
    return (1, 0, 0, text)


# ========= 数据库模型 =========
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    nickname = db.Column(db.String(24))
    taste = db.Column(db.String(80))
    birthplace = db.Column(db.String(40))
    avatar = deferred(db.Column(db.LargeBinary))
    has_avatar = column_property(avatar.expression.is_not(None))
    password = db.Column(db.String(200), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)  # 是否管理员
    token = db.Column(db.String(64), unique=True, nullable=True)


class Category(db.Model):
    __tablename__ = "categories"  # 逻辑上：食堂
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)


class Canteen(db.Model):
    __tablename__ = "canteens"   # 逻辑上：档口
    photo = deferred(db.Column(db.LargeBinary))
    has_photo = column_property(photo.expression.is_not(None))
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)  # 下架的旧档口仍保留历史评分


class Dish(db.Model):
    __tablename__ = "dishes"
    __table_args__ = (db.UniqueConstraint("canteen_id", "name"),)
    photo = deferred(db.Column(db.LargeBinary))
    has_photo = column_property(photo.expression.is_not(None))
    id = db.Column(db.Integer, primary_key=True)
    canteen_id = db.Column(db.Integer, db.ForeignKey("canteens.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)


class Rating(db.Model):
    __tablename__ = "ratings"
    photo = deferred(db.Column(db.LargeBinary))
    has_photo = column_property(photo.expression.is_not(None))
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    canteen_id = db.Column(db.Integer, db.ForeignKey("canteens.id"), nullable=False)
    score = db.Column(db.Float, nullable=False)
    comment = db.Column(db.Text)
    dish_name = db.Column(db.String(80))
    is_anonymous = db.Column(db.Boolean, nullable=False, default=False)
    dish_scores = db.Column(db.JSON)
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ReviewPhoto(db.Model):
    __tablename__ = "review_photos"
    __table_args__ = (db.Index("review_photos_rating", "rating_id", "id"), {"sqlite_autoincrement": True})
    id = db.Column(db.Integer, primary_key=True)
    rating_id = db.Column(db.Integer, db.ForeignKey("ratings.id", ondelete="CASCADE"), nullable=False)
    photo = deferred(db.Column(db.LargeBinary, nullable=False))


class Feedback(db.Model):
    __tablename__ = "feedback"
    __table_args__ = {"sqlite_autoincrement": True}
    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.Text, nullable=False)
    name = db.Column(db.Text)
    content = db.Column(db.Text, nullable=False)
    photo = deferred(db.Column(db.LargeBinary))
    has_photo = column_property(photo.expression.is_not(None))
    status = db.Column(db.Text, nullable=False, default="pending")
    canteen_id = db.Column(db.Integer, db.ForeignKey("canteens.id", ondelete="SET NULL"))
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().isoformat(sep=" ", timespec="milliseconds"))


class Report(db.Model):
    __tablename__ = "reports"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    comment_id = db.Column(db.Integer, nullable=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# 管理员操作日志（审计）
class AdminAction(db.Model):
    __tablename__ = 'admin_actions'
    id = db.Column(db.Integer, primary_key=True)
    admin_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    target_type = db.Column(db.String(50))
    target_id = db.Column(db.Integer)
    details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class RatingHistory(db.Model):
    __tablename__ = 'rating_history'
    id = db.Column(db.Integer, primary_key=True)
    canteen_id = db.Column(db.Integer, db.ForeignKey('canteens.id'), nullable=False)
    avg_score = db.Column(db.Float, nullable=True)
    rating_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


def record_canteen_history(canteen_id: int):
    """计算档口当前的平均分和评分数，并写入历史表（一次性提交）。"""
    try:
        ratings = Rating.query.filter_by(canteen_id=canteen_id, is_deleted=False).all()
        if ratings:
            avg = sum(r.score for r in ratings) / len(ratings)
            count = len(ratings)
        else:
            avg = None
            count = 0

        rh = RatingHistory(canteen_id=canteen_id, avg_score=avg, rating_count=count)
        db.session.add(rh)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"record_canteen_history error: {e}")


def backfill_missing_history():
    """为已有评分但尚无历史快照的档口补一条当前数据（用于历史趋势图）。"""
    created = 0
    for c in Canteen.query.order_by(Canteen.id.asc()).all():
        if RatingHistory.query.filter_by(canteen_id=c.id).first():
            continue
        if Rating.query.filter_by(canteen_id=c.id, is_deleted=False).count() == 0:
            continue
        record_canteen_history(c.id)
        created += 1
    return created


def log_admin_action(admin_user, action, target_type=None, target_id=None, details=None):
    """添加一条管理员操作日志，由调用方统一提交。"""
    db.session.add(AdminAction(
        admin_user_id=admin_user.id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or f"{action} by admin={admin_user.username}",
    ))


# ========= 登录工具函数 =========
def get_current_user():
    auth = request.headers.get("Authorization", "")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth.replace("Bearer ", "", 1).strip()
    if not token:
        return None
    return User.query.filter_by(token=token).first()


def require_admin():
    user = get_current_user()
    if not user or not user.is_admin:
        return None, jsonify({"msg": "无权限访问"}), 403
    return user, None, None


# ========= 普通用户接口 =========

@app.route("/api/guest", methods=["POST"])
def create_guest():
    token = uuid.uuid4().hex
    db.session.add(User(username="__guest_" + uuid.uuid4().hex, password="!", is_admin=False, token=token))
    db.session.commit()
    return jsonify({"token": token}), 201


@app.route("/api/login", methods=["POST"])
@app.route("/api/register", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"msg": "用户名或密码无效"}), 400
    username, password = username.strip(), password.strip()
    if not username or not password or len(username) > 50 or len(password) > 100:
        return jsonify({"msg": "请输入有效的用户名和密码"}), 400

    user = User.query.filter_by(username=username).first()
    if request.path == "/api/register":
        confirmation = data.get("confirm_password")
        if not isinstance(confirmation, str) or confirmation.strip() != password:
            return jsonify({"msg": "两次输入的密码不一致"}), 400
        if user or username.casefold() == "admin" or username.casefold().startswith("__guest_"):
            return jsonify({"msg": "该账号不可注册"}), 409
        try:
            nickname = validate_nickname(data.get("nickname", ""))
        except ValueError as exc:
            return jsonify({"msg": str(exc)}), 400
        user = User(username=username, nickname=nickname, password=generate_password_hash(password), is_admin=False)
        db.session.add(user)
    elif not user or not check_password_hash(user.password, password):
        return jsonify({"msg": "账号不存在或密码错误"}), 401

    user.token = user.token or uuid.uuid4().hex
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "该账号已注册，请登录"}), 409
    return jsonify({"token": user.token, "is_admin": user.is_admin, "nickname": user.nickname})


def validate_nickname(value, max_length=24, label="昵称"):
    if not isinstance(value, str):
        raise ValueError(f"{label}格式无效")
    nickname = value.strip()
    if nickname and (len(nickname) > max_length or not nickname.isprintable() or contains_sensitive(nickname)):
        raise ValueError(f"请输入 {max_length} 字以内的合规{label}")
    return nickname or None


@app.route("/api/profile", methods=["GET", "PATCH"])
def profile():
    user = get_current_user()
    if not user:
        return jsonify({"msg": "请先登录"}), 401
    if user.username.startswith("__guest_"):
        return jsonify({"msg": "访客没有公开资料"}), 403
    if request.method == "PATCH":
        data = request.get_json() or {}
        try:
            for key, size, label in (("nickname", 24, "昵称"), ("taste", 80, "口味偏好"), ("birthplace", 40, "出生地")):
                if key in data:
                    setattr(user, key, validate_nickname(data[key], size, label))
        except ValueError as exc:
            return jsonify({"msg": str(exc)}), 400
        db.session.commit()
    return jsonify({"nickname": user.nickname, "taste": user.taste, "birthplace": user.birthplace,
                    "avatar_url": url_for("get_avatar", user_id=user.id) if user.has_avatar else None})


@app.route("/api/profile/avatar", methods=["PUT", "DELETE"])
def update_avatar():
    user = get_current_user()
    if not user:
        return jsonify({"msg": "请先登录"}), 401
    if user.username.startswith("__guest_"):
        return jsonify({"msg": "访客没有公开资料"}), 403
    try:
        avatar = read_photo(request.files.get("photo"), size=256) if request.method == "PUT" else None
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400
    if request.method == "PUT" and not avatar:
        return jsonify({"msg": "请选择头像"}), 400
    if avatar and len(avatar) > 50_000:
        return jsonify({"msg": "头像不能超过 50 KB"}), 413
    user.avatar = avatar
    db.session.commit()
    return jsonify({"avatar_url": url_for("get_avatar", user_id=user.id) if avatar else None})


@app.route("/api/avatars/<int:user_id>")
def get_avatar(user_id):
    user = db.session.get(User, user_id)
    if not user or not user.has_avatar or user.username.startswith("__guest_"):
        abort(404)
    return send_file(BytesIO(user.avatar), mimetype="image/jpeg", max_age=0)


@app.route("/api/users/<int:user_id>")
def public_profile(user_id):
    user = db.session.get(User, user_id)
    if not user or user.username.startswith("__guest_"):
        abort(404)
    rows = db.session.query(Rating, Canteen.name).join(Canteen, Rating.canteen_id == Canteen.id).filter(
        Rating.user_id == user_id, Rating.is_deleted.is_(False), Rating.is_anonymous.is_(False)
    ).order_by(Rating.created_at.desc(), Rating.id.desc()).all()
    return jsonify({
        "nickname": user.nickname, "taste": user.taste, "birthplace": user.birthplace,
        "avatar_url": url_for("get_avatar", user_id=user.id) if user.has_avatar else None,
        "reviews": [{
            "id": rating.id, "canteen_id": rating.canteen_id, "canteen_name": name,
            "score": rating.score, "content": rating.comment, "dish_name": rating.dish_name,
            "dish_scores": rating.dish_scores or [],
            "created_at": rating.created_at.strftime("%Y-%m-%d %H:%M")
        } for rating, name in rows]
    })


PHOTO_MODELS = {"canteens": Canteen, "dishes": Dish, "ratings": Rating}


def read_photo(upload, size=1600):
    if not upload or not upload.filename:
        return None
    raw = upload.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise ValueError("照片不能超过 5 MB")
    try:
        with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as source:
            if source.width * source.height > 24_000_000:
                raise ValueError("照片像素过大")
            image = ImageOps.exif_transpose(source)
            image.thumbnail((size, size))
            output = BytesIO()
            image.convert("RGB").save(output, "JPEG", quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("请选择有效的 JPEG、PNG 或 WebP 照片") from exc


def photo_url(kind, item):
    return url_for("get_photo", kind=kind, item_id=item.id) if item.has_photo else None


@app.route("/api/photos/<kind>/<int:item_id>")
def get_photo(kind, item_id):
    model = PHOTO_MODELS.get(kind)
    item = db.session.get(model, item_id) if model else None
    if not item or not item.has_photo or (kind == "ratings" and item.is_deleted):
        abort(404)
    return send_file(BytesIO(item.photo), mimetype="image/jpeg", max_age=0)


@app.route("/api/review-photos/<int:photo_id>")
def get_review_photo(photo_id):
    photo = ReviewPhoto.query.join(Rating).filter(ReviewPhoto.id == photo_id, Rating.is_deleted.is_(False)).first_or_404()
    return send_file(BytesIO(photo.photo), mimetype="image/jpeg", max_age=0)


@app.route("/api/admin/photos/<kind>/<int:item_id>", methods=["PUT", "DELETE"])
def set_photo(kind, item_id):
    user, response, code = require_admin()
    if response is not None:
        return response, code
    model = PHOTO_MODELS.get(kind) if kind != "ratings" else None
    item = db.session.get(model, item_id) if model else None
    if not item:
        abort(404)
    try:
        photo = read_photo(request.files.get("photo")) if request.method == "PUT" else None
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400
    if request.method == "PUT" and photo is None:
        return jsonify({"msg": "请选择照片"}), 400
    item.photo = photo
    log_admin_action(user, "update_photo", kind, item_id)
    db.session.commit()
    return jsonify({"photo_url": photo_url(kind, item)})


# 获取所有“食堂”
@app.route("/api/categories", methods=["GET"])
def get_categories():
    categories = Category.query.order_by(Category.id.asc()).all()
    result = [{"id": c.id, "name": c.name} for c in categories]
    return jsonify(result)


# 获取所有“档口”，并附带所属食堂+平均分（score 字段）
@app.route("/api/canteens", methods=["GET"])
def get_canteens():
    canteens = sorted(
        Canteen.query.filter_by(is_active=True).all(),
        key=lambda c: ((c.category_id or 0), canteen_sort_key(c.name))
    )
    result = []
    for c in canteens:
        ratings = Rating.query.filter_by(canteen_id=c.id, is_deleted=False).all()
        if ratings:
            avg = sum(r.score for r in ratings) / len(ratings)
        else:
            avg = None
        cat = Category.query.get(c.category_id) if c.category_id else None
        result.append({
            "id": c.id,
            "name": c.name,
            "category_id": c.category_id,
            "category_name": cat.name if cat else None,
            "score": round(avg, 2) if avg is not None else None  # ✅ 前端就用 score
        })
    return jsonify(result)


# 某个档口详情 + 评论
@app.route("/api/canteens/<int:canteen_id>", methods=["GET"])
def get_canteen_detail(canteen_id):
    c = Canteen.query.get_or_404(canteen_id)
    viewer = get_current_user()
    ratings = Rating.query.filter_by(canteen_id=c.id, is_deleted=False).order_by(Rating.created_at.desc()).all()
    if ratings:
        avg = sum(r.score for r in ratings) / len(ratings)
    else:
        avg = None

    comments = []
    photos_by_rating = {}
    photo_ids = db.session.query(ReviewPhoto.rating_id, ReviewPhoto.id).join(Rating).filter(
        Rating.canteen_id == c.id, Rating.is_deleted.is_(False)
    ).order_by(ReviewPhoto.id).all()
    for rating_id, photo_id in photo_ids:
        photos_by_rating.setdefault(rating_id, []).append(url_for("get_review_photo", photo_id=photo_id))
    scores_by_dish = {}
    for r in ratings:
        for dish in r.dish_scores or []:
            scores_by_dish.setdefault(dish["id"], []).append(dish["score"])
        user = User.query.get(r.user_id)
        anonymous = not user or user.username.startswith("__guest_") or r.is_anonymous
        photos = photos_by_rating.get(r.id, [])
        if r.has_photo:
            photos.insert(0, photo_url("ratings", r))
        comments.append({
            "id": r.id,
            "is_mine": viewer is not None and viewer.id == r.user_id,
            "user": "匿名同学" if anonymous else user.nickname or "同学",
            "author_id": None if anonymous else user.id,
            "avatar_url": url_for("get_avatar", user_id=user.id) if not anonymous and user.has_avatar else None,
            "is_anonymous": anonymous,
            "content": r.comment,
            "dish_name": r.dish_name,
            "dish_scores": r.dish_scores or [],
            "photo_url": photos[0] if photos else None,
            "photo_urls": photos,
            "score": r.score,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M")
        })
    cat = Category.query.get(c.category_id) if c.category_id else None

    # 获取历史平均分（折线图数据）
    history_rows = RatingHistory.query.filter_by(canteen_id=c.id).order_by(RatingHistory.created_at.asc()).all()
    history = []
    for h in history_rows:
        history.append({
            "date": h.created_at.strftime("%Y-%m-%d %H:%M"),
            "avg_score": round(h.avg_score, 2) if h.avg_score is not None else None,
            "rating_count": int(h.rating_count)
        })

    dishes = list_canteen_dishes(c.id)
    for dish in dishes:
        scores = scores_by_dish.get(dish["id"], [])
        dish["score"] = round(sum(scores) / len(scores), 2) if scores else None
        dish["rating_count"] = len(scores)

    return jsonify({
        "id": c.id,
        "name": c.name,
        "category_id": c.category_id,
        "category_name": cat.name if cat else None,
        "score": round(avg, 2) if avg is not None else None,
        "comments": comments,
        "photo_url": photo_url("canteens", c),
        "dishes": dishes,
        "history": history
    })


@app.route("/api/canteens/<int:canteen_id>/dishes", methods=["GET"])
def get_canteen_dishes(canteen_id):
    Canteen.query.get_or_404(canteen_id)
    return jsonify(list_canteen_dishes(canteen_id))


def list_canteen_dishes(canteen_id):
    dishes = Dish.query.filter_by(canteen_id=canteen_id).order_by(Dish.name).all()
    return [{"id": dish.id, "name": dish.name, "photo_url": photo_url("dishes", dish)} for dish in dishes]


def resolve_rating_dish(canteen_id, selection):
    dish_id = selection.get("dish_id")
    name = selection.get("dish_name")
    if dish_id is not None:
        if type(dish_id) is not int or name is not None:
            raise ValueError("请选择已有菜品或添加一道新菜品")
        dish = Dish.query.filter_by(id=dish_id, canteen_id=canteen_id).first()
        if dish is None:
            raise ValueError("该菜品不属于所选档口")
        return dish
    if name is None:
        return None
    if not isinstance(name, str):
        raise ValueError("菜品名称无效")
    name = " ".join(name.split())
    if not 1 <= len(name) <= 80 or contains_sensitive(name):
        raise ValueError("请输入 1 到 80 个字符的合规菜品名称")
    db.session.execute(
        insert(Dish).values(canteen_id=canteen_id, name=name)
        .on_conflict_do_nothing(index_elements=["canteen_id", "name"])
    )
    return Dish.query.filter_by(canteen_id=canteen_id, name=name).one()


@app.route("/api/my/ratings")
def my_ratings():
    user = get_current_user()
    if not user:
        return jsonify({"msg": "未登录"}), 401
    rows = (
        db.session.query(Rating, Canteen, Category.name)
        .join(Canteen, Rating.canteen_id == Canteen.id)
        .outerjoin(Category, Canteen.category_id == Category.id)
        .filter(Rating.user_id == user.id, Rating.is_deleted.is_(False))
        .order_by(Rating.created_at.desc(), Rating.id.desc())
        .all()
    )
    return jsonify([{
        "id": rating.id,
        "canteen_id": canteen.id,
        "canteen_name": canteen.name,
        "category_name": category_name,
        "content": rating.comment,
        "score": rating.score,
        "created_at": rating.created_at.strftime("%Y-%m-%d %H:%M")
    } for rating, canteen, category_name in rows])


@app.route("/api/ratings/<int:rating_id>/photos/<photo_id>", methods=["DELETE"])
def delete_review_photo(rating_id, photo_id):
    user = get_current_user()
    if not user:
        return jsonify({"msg": "请先登录"}), 401
    owned = Rating.query.filter_by(id=rating_id, user_id=user.id, is_deleted=False)
    if photo_id == "legacy":
        removed = owned.filter(Rating.has_photo).update({Rating.photo: None}, synchronize_session=False)
    elif re.fullmatch(r"[0-9]{1,15}", photo_id):
        removed = ReviewPhoto.query.filter(
            ReviewPhoto.id == int(photo_id), ReviewPhoto.rating_id.in_(owned.with_entities(Rating.id))
        ).delete(synchronize_session=False)
    else:
        abort(404)
    if not removed:
        abort(404)
    db.session.commit()
    return jsonify({"msg": "照片已删除"})


@app.route("/api/feedback", methods=["POST"])
def submit_feedback():
    data = request.form if request.mimetype == "multipart/form-data" else request.get_json(silent=True)
    if not hasattr(data, "get") or data.get("kind") not in ("issue", "stall"):
        return jsonify({"msg": "反馈类型无效"}), 400
    kind = data.get("kind")
    content = data.get("content", "")
    name = data.get("name", "") if kind == "stall" else ""
    if not isinstance(content, str) or not isinstance(name, str):
        return jsonify({"msg": "反馈格式无效"}), 400
    content, name = content.strip(), name.strip()
    if len(content) > 1000 or len(name) > 100 or (kind == "issue" and not content):
        return jsonify({"msg": "反馈内容无效"}), 400
    try:
        photo = read_photo(request.files.get("photo")) if kind == "stall" else None
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400
    if kind == "stall" and (not name or not photo):
        return jsonify({"msg": "请填写档口名称并添加照片"}), 400
    db.session.add(Feedback(kind=kind, name=name or None, content=content, photo=photo))
    db.session.commit()
    return jsonify({"msg": "反馈已提交"}), 201


@app.route("/api/admin/feedback", methods=["GET"])
def list_feedback():
    _, response, code = require_admin()
    if response is not None:
        return response, code
    pending = request.args.get("status") != "processed"
    condition = Feedback.status == "pending" if pending else Feedback.status != "pending"
    rows = Feedback.query.filter(condition).order_by(Feedback.id.desc()).limit(100)
    return jsonify([{key: getattr(row, key) for key in (
        "id", "kind", "name", "content", "status", "canteen_id", "created_at", "has_photo"
    )} for row in rows])


@app.route("/api/admin/feedback/<int:item_id>/photo")
def feedback_photo(item_id):
    _, response, code = require_admin()
    if response is not None:
        return response, code
    row = Feedback.query.get_or_404(item_id)
    if not row.has_photo:
        abort(404)
    return send_file(BytesIO(row.photo), mimetype="image/jpeg", max_age=0)


@app.route("/api/admin/feedback/<int:item_id>", methods=["POST"])
def process_feedback(item_id):
    _, response, code = require_admin()
    if response is not None:
        return response, code
    data = request.get_json(silent=True)
    action = data.get("action") if isinstance(data, dict) else None
    if action not in ("approve", "close"):
        return jsonify({"msg": "审核操作无效"}), 400
    query = Feedback.query.filter_by(id=item_id, status="pending")
    if action == "approve":
        query = query.filter_by(kind="stall")
    if not query.update({"status": "closed" if action == "close" else "approved"}, synchronize_session=False):
        return jsonify({"msg": "此反馈已处理或不存在"}), 409
    if action == "close":
        db.session.commit()
        return jsonify({"msg": "反馈已处理"})
    value = data.get("name")
    name = " ".join(value.split()) if isinstance(value, str) else ""
    category = data.get("category_id")
    if not name or len(name) > 100 or type(category) is not int or not db.session.get(Category, category):
        db.session.rollback()
        return jsonify({"msg": "请填写正式名称并选择食堂"}), 400
    if Canteen.query.filter_by(name=name, category_id=category).first():
        db.session.rollback()
        return jsonify({"msg": "该食堂已有同名档口"}), 409
    row = db.session.get(Feedback, item_id)
    stall = Canteen(name=name, category_id=category, is_active=True, photo=row.photo)
    db.session.add(stall)
    db.session.flush()
    row.canteen_id = stall.id
    db.session.commit()
    return jsonify({"msg": "档口已入库", "id": stall.id})


# 提交评分
@app.route("/api/ratings", methods=["POST"])
@app.route("/api/ratings/<int:rating_id>", methods=["PATCH", "DELETE"])
def create_rating(rating_id=None):
    user = get_current_user()
    if not user:
        return jsonify({"msg": "未登录"}), 401

    rating = None
    if rating_id is not None:
        rating = Rating.query.filter_by(id=rating_id, user_id=user.id, is_deleted=False).first_or_404()
        if request.method == "DELETE":
            canteen_id = rating.canteen_id
            Report.query.filter_by(comment_id=rating.id).delete()
            ReviewPhoto.query.filter_by(rating_id=rating.id).delete()
            db.session.delete(rating)
            db.session.commit()
            record_canteen_history(canteen_id)
            return jsonify({"msg": "评价已撤回"})

    photos = []
    try:
        if request.mimetype == "multipart/form-data":
            data = json.loads(request.form.get("rating", "{}"))
            photo = read_photo(request.files.get("photo"))
            uploads = request.files.getlist("photos")
            if len(uploads) > 4 or (photo and uploads):
                raise ValueError("每条评价最多可上传 4 张照片")
            for upload in uploads:
                image = read_photo(upload)
                if not image:
                    raise ValueError("照片格式无效")
                photos.append(image)
        else:
            data = request.get_json() or {}
            photo = None
        if not isinstance(data, dict):
            raise ValueError("评价格式无效")
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400
    if "is_anonymous" in data and not isinstance(data["is_anonymous"], bool):
        return jsonify({"msg": "匿名设置无效"}), 400
    anonymous = user.username.startswith("__guest_") or data.get("is_anonymous", bool(rating and rating.is_anonymous))
    canteen_id = rating.canteen_id if rating else data.get("canteen_id")
    score = data.get("score")
    comment = data.get("comment", "")
    # 参数校验
    if canteen_id is None or score is None:
        return jsonify({"msg": "参数不完整"}), 400

    try:
        canteen_id = int(canteen_id)
    except Exception:
        return jsonify({"msg": "canteen_id 参数无效"}), 400

    try:
        score = float(score)
    except Exception:
        return jsonify({"msg": "score 参数无效"}), 400

    if not 1 <= score <= 5:
        return jsonify({"msg": "分数必须在 1 到 5 之间"}), 400

    if not isinstance(comment, str):
        return jsonify({"msg": "评论格式无效"}), 400
    if contains_sensitive(comment):
        return jsonify({"msg": "评论包含不当用语，请修改后再提交"}), 400

    # 检查档口存在且仍在售
    canteen_obj = Canteen.query.get(canteen_id)
    if not canteen_obj or (rating is None and not canteen_obj.is_active):
        return jsonify({"msg": "档口不存在或已下架"}), 404

    if rating is None and Rating.query.filter_by(user_id=user.id, canteen_id=canteen_id, is_deleted=False).first():
        return jsonify({"msg": "您已评价过该档口"}), 400
    replace_photos = photo is not None or data.get("remove_photo") is True
    if rating is not None and photos and not replace_photos:
        saved_count = ReviewPhoto.query.filter_by(rating_id=rating.id).count() + int(rating.has_photo)
        if saved_count + len(photos) > 4:
            return jsonify({"msg": "每条评价最多可上传 4 张照片"}), 400

    dish_name = rating.dish_name if rating else None
    dish_scores = []
    try:
        if "dish_scores" in data:
            selections = data["dish_scores"]
            if not isinstance(selections, list) or len(selections) > 20:
                raise ValueError("每条评价最多可选 20 道菜")
            seen = set()
            for selection in selections:
                if not isinstance(selection, dict):
                    raise ValueError("菜品评分格式无效")
                dish_score = selection.get("score")
                if type(dish_score) not in (int, float) or not 1 <= dish_score <= 5:
                    raise ValueError("每道菜的评分必须在 1 到 5 之间")
                dish = resolve_rating_dish(canteen_id, selection)
                if dish is None or dish.id in seen:
                    raise ValueError("请选择菜品，且每道菜只能评分一次")
                seen.add(dish.id)
                dish_scores.append({"id": dish.id, "name": dish.name, "score": dish_score})
        else:
            dish = resolve_rating_dish(canteen_id, data)
            dish_name = dish.name if dish else None
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"msg": str(exc)}), 400

    if rating is None:
        rating = Rating(user_id=user.id, canteen_id=canteen_id)
        db.session.add(rating)
    rating.score = score
    rating.comment = comment
    rating.dish_name = dish_name
    rating.is_anonymous = anonymous
    rating.dish_scores = dish_scores
    if replace_photos:
        if rating.id is not None:
            ReviewPhoto.query.filter_by(rating_id=rating.id).delete()
        rating.photo = photo
    if photos:
        db.session.flush()
        db.session.add_all(ReviewPhoto(rating_id=rating.id, photo=image) for image in photos)
    db.session.commit()
    # 记录档口历史平均分（用于折线图）
    try:
        record_canteen_history(canteen_id)
    except Exception:
        pass
    return jsonify({"msg": "评分成功"})


# 举报评论
@app.route("/api/report", methods=["POST"])
def create_report():
    user = get_current_user()
    data = request.get_json() or {}
    content = data.get("content", "").strip()
    comment_id = data.get("comment_id")

    if not content:
        return jsonify({"msg": "举报内容不能为空"}), 400
    if contains_sensitive(content):
        return jsonify({"msg": "举报内容包含不当用语"}), 400

    report = Report(
        user_id=user.id if user else None,
        comment_id=comment_id,
        content=content
    )
    db.session.add(report)
    db.session.commit()
    return jsonify({"msg": "举报成功"})


# ========= 热门档口排行榜（所有人可访问） =========
@app.route("/api/stalls/ranking", methods=["GET"])
def get_stall_ranking():
    # 只统计有评分的档口
    rows = (
        db.session.query(
            Canteen.id,
            Canteen.name,
            Category.name.label("category_name"),
            func.avg(Rating.score).label("avg_score"),
            func.count(Rating.id).label("rating_count")
        )
        .join(Rating, (Rating.canteen_id == Canteen.id) & (Rating.is_deleted == False))
        .outerjoin(Category, Canteen.category_id == Category.id)
        .filter(Canteen.is_active == True)
        .group_by(Canteen.id)
        .order_by(func.avg(Rating.score).desc())
        .all()
    )

    result = []
    for s in rows:
        result.append({
            "id": s.id,
            "name": s.name,
            "category_name": s.category_name,
            "avg_score": round(s.avg_score, 2) if s.avg_score is not None else None,
            "rating_count": int(s.rating_count)
        })
    return jsonify(result)


# ========= 管理员接口 =========

@app.route("/api/admin/reports", methods=["GET"])
def admin_get_reports():
    user, resp, code = require_admin()
    if resp:
        return resp, code
    reports = Report.query.order_by(Report.created_at.desc()).all()
    result = []
    for rep in reports:
        # 报告的举报人
        reporter = User.query.get(rep.user_id) if rep.user_id else None
        # 被举报的评分/评论（可能不存在）
        rating = Rating.query.get(rep.comment_id) if rep.comment_id else None
        rating_user = None
        canteen = None
        if rating:
            rating_user = User.query.get(rating.user_id)
            canteen = Canteen.query.get(rating.canteen_id)

        result.append({
            "report_id": rep.id,
            "reporter_id": rep.user_id,
            "reporter": reporter.username if reporter else None,
            "reason": rep.content,
            "reported_at": rep.created_at.strftime("%Y-%m-%d %H:%M"),
            "rating": {
                "id": rating.id if rating else None,
                "user_id": rating.user_id if rating else None,
                "user": rating_user.username if rating_user else None,
                "canteen_id": rating.canteen_id if rating else None,
                "canteen_name": canteen.name if canteen else None,
                "score": rating.score if rating else None,
                "comment": rating.comment if rating else None,
                "created_at": rating.created_at.strftime("%Y-%m-%d %H:%M") if rating else None
            }
        })
    return jsonify(result)


@app.route("/api/admin/reports/<int:report_id>", methods=["DELETE"])
def admin_delete_report(report_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code

    rep = Report.query.get(report_id)
    if not rep:
        return jsonify({"msg": "举报记录不存在"}), 404

    log_admin_action(user, 'delete_report', 'report', report_id,
                     f'Processed report id={report_id} by admin={user.username}')
    db.session.delete(rep)
    db.session.commit()
    return jsonify({"msg": "举报已标记为已处理并删除"})


@app.route("/api/admin/ratings/<int:rating_id>/restore", methods=["POST"])
def admin_restore_rating(rating_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code

    r = Rating.query.get(rating_id)
    if not r:
        return jsonify({"msg": "评分/评论不存在"}), 404
    if not r.is_deleted:
        return jsonify({"msg": "该评分未被删除"}), 400

    r.is_deleted = False
    action = AdminAction(
        admin_user_id=user.id,
        action='restore_rating',
        target_type='rating',
        target_id=rating_id,
        details=f'Restored rating id={rating_id} by admin={user.username}'
    )
    db.session.add(action)
    db.session.commit()
    # 恢复后更新档口历史记录
    try:
        record_canteen_history(r.canteen_id)
    except Exception:
        pass
    return jsonify({"msg": "已恢复该评分/评论并记录操作"})


@app.route("/api/admin/actions", methods=["GET"])
def admin_get_actions():
    user, resp, code = require_admin()
    if resp:
        return resp, code

    rows = AdminAction.query.order_by(AdminAction.created_at.desc()).limit(200).all()
    result = []
    for a in rows:
        admin_user = User.query.get(a.admin_user_id)
        result.append({
            "id": a.id,
            "admin_user": admin_user.username if admin_user else None,
            "action": a.action,
            "target_type": a.target_type,
            "target_id": a.target_id,
            "details": a.details,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return jsonify(result)


# 管理员：查看所有评分/评论（Rating）
@app.route("/api/admin/ratings", methods=["GET"])
def admin_get_ratings():
    user, resp, code = require_admin()
    if resp:
        return resp, code

    # 管理员可以看到被软删除的记录
    ratings = Rating.query.order_by(Rating.created_at.desc()).all()
    result = []
    for r in ratings:
        u = User.query.get(r.user_id)
        c = Canteen.query.get(r.canteen_id)
        result.append({
            "id": r.id,
            "user_id": r.user_id,
            "user": u.username if u else "匿名",
            "canteen_id": r.canteen_id,
            "canteen_name": c.name if c else None,
            "is_deleted": bool(r.is_deleted),
            "score": r.score,
            "comment": r.comment,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M")
        })
    return jsonify(result)


# 管理员：删除评分/评论（同时删除相关举报）
@app.route("/api/admin/ratings/<int:rating_id>", methods=["DELETE"])
def admin_delete_rating(rating_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code
    r = Rating.query.get(rating_id)
    if not r:
        return jsonify({"msg": "评分/评论不存在"}), 404

    # 软删除：标记为已删除，并记录管理员操作日志；保留数据以供审计
    if not r.is_deleted:
        r.is_deleted = True
        # 删除与该评分相关的举报记录（避免重复处理）
        Report.query.filter_by(comment_id=rating_id).delete()
        # 记录管理员操作日志
        action = AdminAction(
            admin_user_id=user.id,
            action='delete_rating',
            target_type='rating',
            target_id=rating_id,
            details=f'Deleted rating id={rating_id} by admin={user.username}'
        )
        db.session.add(action)
        db.session.commit()
        # 删除后更新档口历史记录
        try:
            record_canteen_history(r.canteen_id)
        except Exception:
            pass
        return jsonify({"msg": "已软删除该评分/评论并记录操作"})
    else:
        return jsonify({"msg": "该评分已被删除"}), 400


# 管理员：食堂列表（分类）
@app.route("/api/admin/categories", methods=["GET"])
def admin_get_categories():
    user, resp, code = require_admin()
    if resp:
        return resp, code

    categories = Category.query.order_by(Category.id.asc()).all()
    result = [{"id": c.id, "name": c.name} for c in categories]
    return jsonify(result)


@app.route("/api/admin/categories", methods=["POST"])
def admin_add_category():
    user, resp, code = require_admin()
    if resp:
        return resp, code

    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"msg": "食堂名称不能为空"}), 400

    c = Category(name=name)
    db.session.add(c)
    db.session.flush()
    log_admin_action(user, 'add_category', 'category', c.id,
                     f'Added category "{name}" by admin={user.username}')
    db.session.commit()
    return jsonify({"msg": "新增食堂成功", "id": c.id})


@app.route("/api/admin/categories/<int:category_id>", methods=["DELETE"])
def admin_delete_category(category_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code

    cat = Category.query.get(category_id)
    if not cat:
        return jsonify({"msg": "食堂不存在"}), 404

    used = Canteen.query.filter_by(category_id=category_id).first()
    if used:
        return jsonify({"msg": "该食堂下仍有档口，无法删除"}), 400

    log_admin_action(user, 'delete_category', 'category', category_id,
                     f'Deleted category "{cat.name}" by admin={user.username}')
    db.session.delete(cat)
    db.session.commit()
    return jsonify({"msg": "删除食堂成功"})


# 管理员：档口列表
@app.route("/api/admin/canteens", methods=["GET"])
def admin_canteen_list():
    user, resp, code = require_admin()
    if resp:
        return resp, code

    canteens = sorted(
        Canteen.query.all(),
        key=lambda c: (
            c.category_id or 0,
            0 if c.is_active else 1,
            canteen_sort_key(c.name)
        )
    )
    result = []
    for c in canteens:
        cat = Category.query.get(c.category_id) if c.category_id else None
        result.append({
            "id": c.id,
            "name": c.name,
            "category_id": c.category_id,
            "category_name": cat.name if cat else None,
            "is_active": bool(c.is_active)
        })
    return jsonify(result)


@app.route("/api/admin/canteens", methods=["POST"])
def admin_add_canteen():
    user, resp, code = require_admin()
    if resp:
        return resp, code

    data = request.get_json() or {}
    name = data.get("name", "").strip()
    category_id = data.get("category_id")

    if not name:
        return jsonify({"msg": "档口名称不能为空"}), 400
    if not category_id:
        return jsonify({"msg": "请选择所属食堂"}), 400

    cat = Category.query.get(category_id)
    if not cat:
        return jsonify({"msg": "食堂不存在"}), 400

    c = Canteen(name=name, category_id=category_id, is_active=True)
    db.session.add(c)
    db.session.flush()
    log_admin_action(user, 'add_canteen', 'canteen', c.id,
                     f'Added canteen "{name}" under category id={category_id} by admin={user.username}')
    db.session.commit()
    return jsonify({"msg": "新增档口成功", "id": c.id})


@app.route("/api/admin/canteens/<int:item_id>", methods=["PATCH"])
@app.route("/api/admin/canteens/<int:item_id>/dishes", methods=["POST"])
@app.route("/api/admin/dishes/<int:item_id>", methods=["PATCH"])
def admin_update_menu(item_id):
    user, response, code = require_admin()
    if response is not None:
        return response, code
    add_dish = request.method == "POST"
    edit_dish = request.path.startswith("/api/admin/dishes/")
    model = Dish if edit_dish else Canteen
    item = model.query.get_or_404(item_id)
    value = (request.get_json() or {}).get("name")
    name = " ".join(value.split()) if isinstance(value, str) else ""
    if not name or len(name) > (80 if add_dish or edit_dish else 100):
        return jsonify({"msg": "名称无效"}), 400
    if add_dish:
        item = Dish(canteen_id=item_id, name=name)
        db.session.add(item)
    else:
        item.name = name
    try:
        db.session.flush()
        action = "add_dish" if add_dish else "rename_dish" if edit_dish else "rename_canteen"
        log_admin_action(user, action, "dish" if add_dish or edit_dish else "canteen", item.id)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "该档口已有同名菜品"}), 409
    return jsonify({"msg": "操作成功"})


@app.route("/api/admin/canteens/<int:canteen_id>", methods=["DELETE"])
def admin_delete_canteen(canteen_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code

    c = Canteen.query.get(canteen_id)
    if not c:
        return jsonify({"msg": "档口不存在"}), 404

    # 级联清理：该档口的评分、相关举报、历史快照
    rating_ids = [r.id for r in Rating.query.filter_by(canteen_id=canteen_id).all()]
    if rating_ids:
        Report.query.filter(Report.comment_id.in_(rating_ids)).delete(synchronize_session=False)
        ReviewPhoto.query.filter(ReviewPhoto.rating_id.in_(rating_ids)).delete(synchronize_session=False)
        Rating.query.filter(Rating.id.in_(rating_ids)).delete(synchronize_session=False)
    RatingHistory.query.filter_by(canteen_id=canteen_id).delete(synchronize_session=False)
    Dish.query.filter_by(canteen_id=canteen_id).delete(synchronize_session=False)

    log_admin_action(user, 'delete_canteen', 'canteen', canteen_id,
                     f'Deleted canteen "{c.name}" with {len(rating_ids)} rating(s) by admin={user.username}')
    Feedback.query.filter_by(canteen_id=c.id).update({"canteen_id": None}, synchronize_session=False)
    db.session.delete(c)
    db.session.commit()
    return jsonify({"msg": "删除档口成功"})


@app.route("/api/admin/canteens/<int:canteen_id>/archive", methods=["POST"])
def admin_archive_canteen(canteen_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code

    c = Canteen.query.get(canteen_id)
    if not c:
        return jsonify({"msg": "档口不存在"}), 404
    if not c.is_active:
        return jsonify({"msg": "该档口已经是下架状态"}), 400

    c.is_active = False
    log_admin_action(user, 'archive_canteen', 'canteen', canteen_id,
                     f'Archived canteen "{c.name}" by admin={user.username}')
    db.session.commit()
    return jsonify({"msg": "档口已下架，历史评价会保留"})


@app.route("/api/admin/canteens/<int:canteen_id>/restore", methods=["POST"])
def admin_restore_canteen(canteen_id):
    user, resp, code = require_admin()
    if resp:
        return resp, code

    c = Canteen.query.get(canteen_id)
    if not c:
        return jsonify({"msg": "档口不存在"}), 404
    if c.is_active:
        return jsonify({"msg": "该档口已经是上架状态"}), 400

    c.is_active = True
    log_admin_action(user, 'restore_canteen', 'canteen', canteen_id,
                     f'Restored canteen "{c.name}" by admin={user.username}')
    db.session.commit()
    return jsonify({"msg": "档口已重新上架"})


@app.route('/api/admin/backfill_history', methods=['POST'])
def admin_backfill_history():
    """管理员接口：为有评分的档口写入一条当前的历史记录（回填）。"""
    user, resp, code = require_admin()
    if resp:
        return resp, code

    canteens = Canteen.query.filter_by(is_active=True).order_by(Canteen.id.asc()).all()
    results = []
    for c in canteens:
        # 没有有效评分的档口不写快照，避免趋势图出现无意义的空点
        if Rating.query.filter_by(canteen_id=c.id, is_deleted=False).count() == 0:
            results.append({'canteen_id': c.id, 'status': 'skipped'})
            continue
        try:
            record_canteen_history(c.id)
            results.append({'canteen_id': c.id, 'status': 'ok'})
        except Exception as e:
            results.append({'canteen_id': c.id, 'status': 'error', 'error': str(e)})

    ok_count = sum(1 for r in results if r['status'] == 'ok')
    log_admin_action(user, 'backfill_history', 'canteen', None,
                     f'Backfilled rating history for {ok_count} canteen(s) by admin={user.username}')
    db.session.commit()
    return jsonify({'msg': 'backfill finished', 'results': results})


# ========= 启动初始化 =========
def ensure_db_schema():
    """对旧版 SQLite 数据库做小迁移（无需 Alembic）。"""
    try:
        # 使用 session.execute 兼容 SQLAlchemy 1.4+ 的执行方式
        user_columns = db.session.execute(text("PRAGMA table_info(users)")).fetchall()
        if not any(column[1] == "nickname" for column in user_columns):
            db.session.execute(text("ALTER TABLE users ADD COLUMN nickname VARCHAR(24)"))
        if not any(column[1] == "taste" for column in user_columns):
            db.session.execute(text("ALTER TABLE users ADD COLUMN taste VARCHAR(80)"))
        if not any(column[1] == "birthplace" for column in user_columns):
            db.session.execute(text("ALTER TABLE users ADD COLUMN birthplace VARCHAR(40)"))
        if not any(column[1] == "avatar" for column in user_columns):
            db.session.execute(text("ALTER TABLE users ADD COLUMN avatar BLOB"))
        for table in ("canteens", "dishes", "ratings"):
            columns = db.session.execute(text(f"PRAGMA table_info({table})")).fetchall()
            if columns and not any(column[1] == "photo" for column in columns):
                db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN photo BLOB"))
        db.session.commit()
        res = db.session.execute(text("PRAGMA table_info(ratings)")).fetchall()
        cols = [row[1] for row in res] if res else []
        if 'is_anonymous' not in cols:
            db.session.execute(text("ALTER TABLE ratings ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT 0"))
        if 'is_deleted' not in cols:
            db.session.execute(text("ALTER TABLE ratings ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
            db.session.commit()
        if 'dish_scores' not in cols:
            db.session.execute(text('ALTER TABLE ratings ADD COLUMN dish_scores JSON'))
            db.session.commit()
        if 'dish_name' not in cols:
            db.session.execute(text("ALTER TABLE ratings ADD COLUMN dish_name VARCHAR(80)"))
            db.session.commit()

        res = db.session.execute(text("PRAGMA table_info(canteens)")).fetchall()
        canteen_cols = [row[1] for row in res] if res else []
        if 'is_active' not in canteen_cols:
            db.session.execute(text("ALTER TABLE canteens ADD COLUMN is_active BOOLEAN DEFAULT 1"))
            db.session.commit()

        # 检查 admin_actions 表是否存在
        t = db.session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_actions'")).fetchone()
        if not t:
            db.session.execute(text('''
                CREATE TABLE admin_actions (
                    id INTEGER PRIMARY KEY,
                    admin_user_id INTEGER NOT NULL,
                    action VARCHAR(100) NOT NULL,
                    target_type VARCHAR(50),
                    target_id INTEGER,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            '''))
            db.session.commit()

        # 检查 rating_history 表是否存在并修补结构
        t2 = db.session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='rating_history'")).fetchone()
        if not t2:
            db.session.execute(text('''
                CREATE TABLE rating_history (
                    id INTEGER PRIMARY KEY,
                    canteen_id INTEGER NOT NULL,
                    avg_score FLOAT,
                    rating_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            '''))
            db.session.commit()
        else:
            res2 = db.session.execute(text("PRAGMA table_info(rating_history)")).fetchall()
            existing_cols = [row[1] for row in res2] if res2 else []
            # 早期版本曾把 ratings 的字段（user_id/score/comment，且 NOT NULL）复制进
            # rating_history，导致历史快照永远写不进去。这里重建为标准结构并尽量保留数据。
            if 'user_id' in existing_cols or 'score' in existing_cols:
                db.session.execute(text("ALTER TABLE rating_history RENAME TO rating_history_legacy"))
                db.session.execute(text('''
                    CREATE TABLE rating_history (
                        id INTEGER PRIMARY KEY,
                        canteen_id INTEGER NOT NULL,
                        avg_score FLOAT,
                        rating_count INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                '''))
                legacy_avg = 'avg_score' if 'avg_score' in existing_cols else 'NULL'
                legacy_count = 'rating_count' if 'rating_count' in existing_cols else '0'
                legacy_created = 'created_at' if 'created_at' in existing_cols else 'CURRENT_TIMESTAMP'
                db.session.execute(text(f'''
                    INSERT INTO rating_history (canteen_id, avg_score, rating_count, created_at)
                    SELECT canteen_id, {legacy_avg}, {legacy_count}, {legacy_created}
                    FROM rating_history_legacy
                    WHERE canteen_id IS NOT NULL
                '''))
                db.session.execute(text("DROP TABLE rating_history_legacy"))
                db.session.commit()
            else:
                # 如果表已存在，检查必要列并尝试添加（SQLite 支持 ADD COLUMN）
                if 'avg_score' not in existing_cols:
                    db.session.execute(text("ALTER TABLE rating_history ADD COLUMN avg_score FLOAT"))
                    db.session.commit()
                if 'rating_count' not in existing_cols:
                    db.session.execute(text("ALTER TABLE rating_history ADD COLUMN rating_count INTEGER DEFAULT 0"))
                    db.session.commit()
    except Exception as e:
        # 启动时打印错误但不阻塞服务
        db.session.rollback()
        print('ensure_db_schema error:', e)


def init_database():
    """建表、迁移旧库、初始化管理员，并补齐历史快照。"""
    with app.app_context():
        db.create_all()
        ensure_db_schema()

        # 仅在显式提供初始密码时创建管理员。
        admin = User.query.filter_by(username="admin").first()
        initial_password = os.environ.get("CANTEEN_ADMIN_PASSWORD", "").strip()
        if admin is None and initial_password:
            if not 12 <= len(initial_password) <= 100:
                raise ValueError("CANTEEN_ADMIN_PASSWORD must contain 12 to 100 characters")
            db.session.add(User(username="admin", password=generate_password_hash(initial_password), is_admin=True))
            db.session.commit()

        # 老数据若没有历史快照，启动时自动补一条，保证趋势图有内容
        created = backfill_missing_history()
        if created:
            print(f"backfilled rating history for {created} canteen(s)")


if __name__ == "__main__":
    init_database()
    app.run(host="0.0.0.0", port=5000, debug=True)
