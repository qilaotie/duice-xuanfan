"""Isolated integration tests for the Flask implementation."""
import io
import json
import unittest

from PIL import Image
from sqlalchemy import create_engine

from canteen_backend.app import app, db, init_database, Category, Canteen, User


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.context = app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        self.original_engine = db.engines[None]
        self.engine = create_engine("sqlite://")
        db.engines[None] = self.engine
        self.addCleanup(self.restore_engine)
        init_database()
        db.session.add_all([
            Category(id=1, name="Dining"), Canteen(id=1, name="01 Noodles", category_id=1),
            Canteen(id=2, name="02 Rice", category_id=1),
            User(id=1, username="admin", password="!", token="admin-token", is_admin=True),
            User(id=2, username="member", password="!", token="member-token", nickname="Member"),
            User(id=3, username="other", password="!", token="other-token"),
        ])
        db.session.commit()
        self.client = app.test_client()

    def restore_engine(self):
        db.session.remove()
        db.engines[None] = self.original_engine
        self.engine.dispose()

    def api(self, method, url, status, *, token=None, data=None, files=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        options = {"data": files} if files is not None else {"json": data}
        response = self.client.open(url, method=method, headers=headers, **options)
        self.assertEqual(response.status_code, status, response.get_data()[:200])
        if response.is_json:
            return response.json
        response.close()
        return None

    def admin(self, method, path, status, **kwargs):
        return self.api(method, "/api/admin/" + path, status, token="admin-token", **kwargs)

    @staticmethod
    def photo():
        stream = io.BytesIO()
        Image.new("RGB", (24, 24), "blue").save(stream, "JPEG")
        stream.seek(0)
        return stream, "photo.jpg"

    def test_account_profile_and_avatars(self):
        account = {"username": "new", "password": "test-password", "confirm_password": "test-password"}
        self.api("GET", "/", 200)
        self.api("GET", "/app.js", 200)
        self.api("GET", "/api/missing", 404)
        self.api("POST", "/api/categories", 405)
        self.api("POST", "/api/register", 400, data={**account, "confirm_password": "wrong"})
        self.api("POST", "/api/register", 400, data={**account, "password": ""})
        self.api("POST", "/api/register", 409, data={**account, "username": "admin"})
        token = self.api("POST", "/api/register", 200, data=account)["token"]
        self.api("POST", "/api/register", 409, data=account)
        self.api("POST", "/api/login", 401, data={**account, "password": "wrong"})
        self.assertEqual(self.api("POST", "/api/login", 200, data=account)["token"], token)
        self.api("GET", "/api/profile", 401)
        self.api("PATCH", "/api/profile", 400, token=token, data={"nickname": "攻击"})
        profile = self.api("PATCH", "/api/profile", 200, token=token, data={"nickname": "Tester", "taste": "辣", "birthplace": "西安"})
        self.assertEqual(profile["nickname"], "Tester")
        self.api("PUT", "/api/profile/avatar", 400, token=token, files={"photo": (io.BytesIO(b"bad"), "bad.jpg")})
        avatar = self.api("PUT", "/api/profile/avatar", 200, token=token, files={"photo": self.photo()})["avatar_url"]
        self.api("GET", avatar, 200)
        self.api("DELETE", "/api/profile/avatar", 200, token=token)
        self.api("GET", avatar, 404)
        guest = self.api("POST", "/api/guest", 201)["token"]
        self.api("GET", "/api/profile", 403, token=guest)

    def test_review_lifecycle_and_photos(self):
        token = "member-token"
        for path in ("/api/categories", "/api/canteens", "/api/stalls/ranking", "/api/canteens/1/dishes"):
            self.api("GET", path, 200)
        self.api("GET", "/api/canteens/999", 404)
        self.api("POST", "/api/ratings", 401, data={})
        for data in ({}, {"canteen_id": "bad", "score": 4}, {"canteen_id": 1, "score": "bad"},
                     {"canteen_id": 1, "score": 0}, {"canteen_id": 1, "score": 4, "comment": "攻击"},
                     {"canteen_id": 1, "score": 4, "dish_scores": [{"dish_id": 999, "score": 4}]}):
            self.api("POST", "/api/ratings", 400, token=token, data=data)
        self.api("POST", "/api/ratings", 404, token=token, data={"canteen_id": 99, "score": 4})
        rating = {"canteen_id": 1, "score": 4, "dish_scores": [{"dish_name": "Dish A", "score": 5}]}
        self.api("POST", "/api/ratings", 200, token=token, files={"rating": json.dumps(rating), "photos": [self.photo(), self.photo()]})
        self.api("POST", "/api/ratings", 400, token=token, data=rating)
        review = self.api("GET", "/api/canteens/1", 200, token=token)["comments"][0]
        self.assertTrue(review["is_mine"])
        self.assertEqual(len(review["photo_urls"]), 2)
        path = "/api/ratings/" + str(review["id"])
        first, second = review["photo_urls"]
        self.api("GET", first, 200)
        self.api("DELETE", path + "/photos/" + first.rsplit("/", 1)[1], 404, token="other-token")
        self.api("DELETE", path + "/photos/" + first.rsplit("/", 1)[1], 200, token=token)
        self.api("GET", first, 404)
        self.api("GET", second, 200)
        self.api("GET", "/api/my/ratings", 401)
        self.assertEqual(len(self.api("GET", "/api/my/ratings", 200, token=token)), 1)
        self.api("PATCH", path, 404, token="other-token", data=rating)
        self.api("PATCH", path, 200, token=token, data={**rating, "is_anonymous": True})
        self.assertEqual(self.api("GET", "/api/users/2", 200)["reviews"], [])
        self.api("GET", "/api/users/999", 404)
        self.api("DELETE", path, 200, token=token)
        self.api("GET", second, 404)

    def test_admin_workflows(self):
        self.api("GET", "/api/admin/categories", 403, token="member-token")
        category = self.admin("POST", "categories", 200, data={"name": "New"})["id"]
        stall = self.admin("POST", "canteens", 200, data={"name": "Test Stall", "category_id": category})["id"]
        self.admin("GET", "categories", 200)
        self.admin("GET", "canteens", 200)
        self.admin("DELETE", f"categories/{category}", 400)
        self.admin("PATCH", f"categories/{category}", 200, data={"name": "Renamed"})
        self.admin("PATCH", f"canteens/{stall}", 200, data={"name": "Renamed Stall"})
        self.admin("POST", f"canteens/{stall}/dishes", 200, data={"name": "A"})
        self.admin("POST", f"canteens/{stall}/dishes", 409, data={"name": "A"})
        dish = self.api("GET", f"/api/canteens/{stall}/dishes", 200)[0]["id"]
        self.admin("PATCH", f"dishes/{dish}", 200, data={"name": "B"})
        url = self.admin("PUT", f"photos/dishes/{dish}", 200, files={"photo": self.photo()})["photo_url"]
        self.api("GET", url, 200)
        self.admin("DELETE", f"photos/dishes/{dish}", 200)
        self.admin("POST", f"canteens/{stall}/archive", 200)
        self.admin("POST", f"canteens/{stall}/restore", 200)
        self.api("POST", "/api/ratings", 200, token="member-token", data={"canteen_id": stall, "score": 4})
        review = self.admin("GET", "ratings", 200)[0]["id"]
        self.api("POST", "/api/report", 200, token="other-token", data={"comment_id": review, "content": "Review issue"})
        report = self.admin("GET", "reports", 200)[0]["report_id"]
        self.admin("DELETE", f"reports/{report}", 200)
        self.admin("DELETE", f"ratings/{review}", 200)
        self.admin("POST", f"ratings/{review}/restore", 200)
        self.admin("POST", "backfill_history", 200)
        self.admin("GET", "actions", 200)
        self.admin("DELETE", f"canteens/{stall}", 200)
        self.admin("DELETE", f"categories/{category}", 200)

    def test_feedback_and_forum(self):
        self.api("POST", "/api/feedback", 400, data={"kind": "issue", "content": ""})
        self.api("POST", "/api/feedback", 201, data={"kind": "issue", "content": "Bug"})
        self.api("POST", "/api/feedback", 201, files={"kind": "stall", "name": "Campus", "suggested_category_id": "100001", "photo": self.photo()})
        suggestion, issue = self.admin("GET", "feedback", 200)
        self.admin("GET", f"feedback/{suggestion['id']}/photo", 200)
        self.admin("POST", f"feedback/{suggestion['id']}", 400, data={"action": "approve", "name": "Campus", "category_id": 1})
        self.admin("POST", f"feedback/{suggestion['id']}", 200, data={"action": "approve", "name": "Campus", "category_id": 100001})
        self.admin("POST", f"feedback/{issue['id']}", 200, data={"action": "close"})
        self.assertEqual(len(self.admin("GET", "feedback?status=processed", 200)), 2)
        data = {"kind": "avoid", "name": "Restaurant", "address": "Road", "content": "Cold dish"}
        self.api("POST", "/api/forum/posts", 401, data=data)
        self.api("POST", "/api/forum/posts", 400, token="member-token", data={**data, "address": ""})
        self.api("POST", "/api/forum/posts", 400, token="member-token", data={**data, "kind": "invalid"})
        post = self.api("POST", "/api/forum/posts", 201, token="member-token", data=data)
        path = f"/api/forum/posts/{post['id']}"
        self.assertEqual(self.api("GET", "/api/forum/posts?kind=recommend", 200)["rows"], [])
        self.api("GET", "/api/forum/posts?kind=invalid", 400)
        self.api("GET", "/api/forum/posts?cursor=-1", 400)
        self.assertEqual(self.api("POST", path + "/replies", 201, token="other-token", data={"content": "Reply"})["floor"], 2)
        self.assertEqual(self.api("GET", path, 200)["rows"][0]["content"], "Reply")
        self.api("DELETE", path, 404, token="other-token")
        self.api("DELETE", path, 200, token="admin-token")
        self.api("GET", path, 404)

    def test_validation_and_admin_access_matrix(self):
        guarded = [
            ("GET", "reports"), ("DELETE", "reports/999"), ("POST", "ratings/999/restore"),
            ("GET", "actions"), ("GET", "ratings"), ("DELETE", "ratings/999"),
            ("GET", "categories"), ("POST", "categories"), ("DELETE", "categories/999"),
            ("GET", "canteens"), ("POST", "canteens"), ("PATCH", "canteens/1"),
            ("DELETE", "canteens/999"), ("POST", "canteens/999/archive"), ("POST", "canteens/999/restore"),
            ("POST", "backfill_history"), ("PUT", "photos/canteens/1"), ("GET", "feedback"),
            ("GET", "feedback/999/photo"), ("POST", "feedback/999"),
        ]
        for method, path in guarded:
            with self.subTest(path=path, method=method):
                self.api(method, "/api/admin/" + path, 403, token="member-token")
        missing = [
            ("DELETE", "reports/999"), ("POST", "ratings/999/restore"), ("DELETE", "ratings/999"),
            ("DELETE", "categories/999"), ("DELETE", "canteens/999"),
            ("POST", "canteens/999/archive"), ("POST", "canteens/999/restore"),
            ("PUT", "photos/canteens/999"), ("GET", "feedback/999/photo"),
        ]
        for method, path in missing:
            with self.subTest(path=path, method=method):
                self.admin(method, path, 404)
        self.admin("POST", "categories", 400, data={})
        for data in ({}, {"name": "Missing category"}, {"name": "Unknown", "category_id": 999}):
            self.admin("POST", "canteens", 400, data=data)
        self.admin("PATCH", "canteens/1", 400, data={"name": ""})
        self.admin("POST", "canteens/1/restore", 400)
        self.admin("POST", "canteens/1/archive", 200)
        self.admin("POST", "canteens/1/archive", 400)
        self.admin("POST", "canteens/1/restore", 200)
        self.admin("PUT", "photos/canteens/1", 400, files={})
        self.admin("PUT", "photos/canteens/1", 400, files={"photo": (io.BytesIO(b"bad"), "bad.jpg")})
        self.admin("PUT", "photos/unknown/1", 404)
        self.admin("POST", "feedback/999", 400, data={"action": "bad"})
        self.admin("POST", "feedback/999", 409, data={"action": "close"})
        self.api("POST", "/api/report", 400, data={})
        self.api("POST", "/api/report", 400, data={"content": "攻击"})
        self.api("POST", "/api/feedback", 400, data={"kind": "bad"})
        self.api("POST", "/api/feedback", 400, data={"kind": "issue", "content": 42})
        self.api("POST", "/api/feedback", 400, data={"kind": "stall", "name": "No photo"})
        self.api("POST", "/api/feedback", 400, files={"kind": "stall", "name": "Bad image", "photo": (io.BytesIO(b"bad"), "bad.jpg")})
        self.api("POST", "/api/feedback", 400, files={"kind": "stall", "name": "Bad location", "suggested_category_id": "bad", "photo": self.photo()})
        self.api("POST", "/api/feedback", 400, files={"kind": "stall", "name": "Unknown location", "suggested_category_id": "999", "photo": self.photo()})
        self.api("POST", "/api/register", 400, data={"username": 42, "password": "x"})
        self.api("PUT", "/api/profile/avatar", 401, files={})
        self.api("PUT", "/api/profile/avatar", 400, token="member-token", files={})
        self.api("GET", "/api/photos/unknown/1", 404)
        self.api("DELETE", "/api/ratings/1/photos/legacy", 401)
        self.api("DELETE", "/api/ratings/1/photos/invalid", 404, token="member-token")
