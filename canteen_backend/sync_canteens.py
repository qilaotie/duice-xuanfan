"""从问卷星抓取「餐厅档口意见建议反馈」的档口菜单，并同步到本地数据库。

用法：
    python sync_canteens.py            # 抓取并更新
    python sync_canteens.py --dry-run  # 只抓取和比对，不写数据库

问卷星的菜单数据来自页面里的多级下拉（第 3 题，ct=5）。
如果本机使用代理访问问卷星，可通过环境变量 WJX_PROXY 指定，例如：
    set WJX_PROXY=http://127.0.0.1:7890
"""

from __future__ import annotations

import argparse
import html as html_module
import json
import os
import re
import sys
from datetime import datetime

import requests

from app import (
    app,
    db,
    Category,
    Canteen,
    Rating,
    RatingHistory,
    ensure_db_schema,
)

SURVEY_URL = "https://www.wjx.cn/vm/OHw5yQ5.aspx"
MENU_URL = "https://www.wjx.cn/joinnew/setmenuselnew.aspx"
DECODE_XOR = 2130030173
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

PLACEHOLDER_WORDS = {"暂定", "暂空", "空", "待定", "待定中"}
MANAGER_RE = re.compile(r"^(餐厅经理|餐厅副经理)|电话[：:]")


def request_with_fallback(url: str, **kwargs):
    """优先走显式代理，失败后再尝试直连。"""
    candidates = []
    explicit = os.environ.get("WJX_PROXY", "").strip()
    if explicit:
        candidates.append(explicit)
    else:
        candidates.extend(["http://127.0.0.1:7890", None])

    request_headers = {**HEADERS, **kwargs.pop("headers", {})}
    last_error = None
    for proxy in candidates:
        proxies = {"http": proxy, "https": proxy} if proxy else None
        try:
            response = requests.get(
                url,
                headers=request_headers,
                proxies=proxies,
                timeout=30,
                **kwargs,
            )
            response.raise_for_status()
            response.encoding = "utf-8"
            return response
        except Exception as error:  # noqa: BLE001
            last_error = error
    raise RuntimeError(
        "无法访问问卷星。若本机使用代理，请设置 WJX_PROXY，例如 "
        "WJX_PROXY=http://127.0.0.1:7890。原始错误：" + str(last_error)
    )


def fetch_survey_menu() -> tuple[str, str]:
    survey = request_with_fallback(SURVEY_URL)
    survey_text = survey.text
    match = re.search(r"var\s+activityId\s*=\s*DecodeId\((\d+)\)", survey_text)
    if not match:
        raise RuntimeError("没有从问卷页面解析到 activityId，问卷结构可能已变化")

    activity_id = int(match.group(1)) ^ DECODE_XOR
    menu = request_with_fallback(
        MENU_URL,
        params={"activityid": activity_id, "ct": 5, "pos": 3},
        headers={**HEADERS, "Referer": SURVEY_URL, "X-Requested-With": "XMLHttpRequest"},
    )
    return survey_text, menu.text


def parse_hidden_level_data(menu_html: str) -> str:
    match = re.search(r'id="hfLevelData"[^>]*value="(.*?)"', menu_html, re.S)
    if not match:
        raise RuntimeError("没有从菜单接口找到 hfLevelData，问卷结构可能已变化")
    return html_module.unescape(match.group(1))


def normalize_spaces(name: str) -> str:
    name = name.split("〒")[0].replace("\u3000", " ")
    return re.sub(r"\s+", " ", name).strip()


def strip_leaf_marker(name: str) -> str:
    if name.endswith("々"):
        return name[:-1].strip()
    return name


def is_manager_line(name: str) -> bool:
    return bool(MANAGER_RE.search(name))


def is_placeholder(name: str) -> bool:
    text = re.sub(r"^[\d\s#\-—–一]+", "", name)
    text = text.replace("╰0╯", "").strip()
    return not text or text in PLACEHOLDER_WORDS


def pad_slot(name: str) -> str:
    """把 2、2-3、01一02 统一成 02、02-03、01-02；0#/5#/8# 保持原样。"""
    match = re.match(r"^0*(\d+)(?:\s*[-–—一]\s*0*(\d+))?", name)
    if not match:
        return name

    rest = name[match.end():]
    if rest.startswith("#"):
        return name

    first = int(match.group(1))
    second = int(match.group(2)) if match.group(2) else None
    prefix = f"{first:02d}" if second is None else f"{first:02d}-{second:02d}"
    return prefix + rest


def clean_stall_name(name: str) -> str:
    name = normalize_spaces(name)
    name = strip_leaf_marker(name)
    name = re.sub(r"(?<=\d)一(?=\d)", "-", name)
    name = name.rstrip("，,").strip()
    return pad_slot(name)


def slot_key(name: str):
    """用于在旧库和新菜单之间按档口编号匹配。"""
    text = name.strip()
    match = re.match(r"^0*(\d+)(?:\s*[-–—一]\s*0*(\d+))?", text)
    if match:
        rest = text[match.end():]
        if rest.startswith("#"):
            return (0, int(match.group(1)), 0, "#")
        first = int(match.group(1))
        second = int(match.group(2)) if match.group(2) else first
        return (0, first, second, "")

    return (1, 0, 0, text.lower())


def body_key(name: str):
    """去掉编号后的菜名，用于档口换号时仍能匹配到原记录。"""
    text = re.sub(r"^[\d\s#\-—–一]+", "", name or "")
    text = re.sub(r"\s+", "", text).lower()
    return text


def parse_hierarchy(value: str):
    value = value.replace("\r\n", "\n").replace("\r", "\n").replace("|---", "\n---")
    parts = [part.strip("\n") for part in value.split("\n---") if part.strip()]
    if not parts:
        raise RuntimeError("hfLevelData 为空")

    root_names = [normalize_spaces(strip_leaf_marker(line)) for line in parts[0].splitlines() if line.strip()]
    segments = []
    for part in parts[1:]:
        lines = [line for line in part.splitlines()]
        if not lines:
            continue
        parent = normalize_spaces(strip_leaf_marker(lines[0]))
        children = [
            normalize_spaces(strip_leaf_marker(line))
            for line in lines[1:]
            if line.strip()
        ]
        segments.append((parent, children))

    # 最后一个选项可能带有“校区|餐厅|档口名称”提示
    if segments:
        parent, children = segments[-1]
        segments[-1] = (parent, [child.split("〒")[0].strip() for child in children])

    level1 = {}
    level2 = {}
    for parent, children in segments[:len(root_names)]:
        level1[parent] = children
    for parent, children in segments[len(root_names):]:
        level2[parent] = children

    areas = []
    for area_name in root_names:
        restaurant_names = level1.get(area_name, [])
        if not restaurant_names:
            continue

        # 找出“西区一层餐厅-03 早餐 套餐”这种被录入到餐厅层的档口
        specials = {}
        for name in restaurant_names:
            bases = [
                candidate for candidate in restaurant_names
                if candidate != name and name.startswith(candidate) and candidate in level2
            ]
            if bases:
                specials[name] = max(bases, key=len)

        restaurants = []
        for restaurant_name in restaurant_names:
            if restaurant_name in specials:
                continue

            stalls = []
            for raw in level2.get(restaurant_name, []):
                cleaned = clean_stall_name(raw)
                if is_manager_line(cleaned) or is_placeholder(cleaned):
                    continue
                if cleaned not in stalls:
                    stalls.append(cleaned)

            restaurants.append({"name": restaurant_name, "stalls": stalls})

        for special_name, base_name in specials.items():
            suffix = normalize_spaces(special_name[len(base_name):]).lstrip(" -－—").strip()
            if not suffix:
                continue
            target = next((item for item in restaurants if item["name"] == base_name), None)
            if target is None:
                target = {"name": base_name, "stalls": []}
                restaurants.append(target)
            if suffix not in target["stalls"]:
                target["stalls"].append(suffix)

        restaurants = [item for item in restaurants if item["stalls"]]
        if restaurants:
            areas.append({"name": area_name, "restaurants": restaurants})

    return areas


def collect_menu(menu_html: str):
    value = parse_hidden_level_data(menu_html)
    areas = parse_hierarchy(value)
    restaurants = sum(len(area["restaurants"]) for area in areas)
    stalls = sum(len(restaurant["stalls"]) for area in areas for restaurant in area["restaurants"])
    if stalls < 50:
        raise RuntimeError(f"解析到的档口数量异常：{stalls}")
    return areas, restaurants, stalls


def sync_database(areas, dry_run=False):
    with app.app_context():
        db.create_all()
        ensure_db_schema()

        categories = {category.name: category for category in Category.query.all()}
        used_category_ids = set()
        matched_ids = set()
        created_categories = []
        created_canteens = []
        updated_canteens = []
        archived_canteens = []
        deleted_canteens = []
        deleted_categories = []

        for area in areas:
            for restaurant in area["restaurants"]:
                name = restaurant["name"]
                category = categories.get(name)
                if category is None:
                    category = Category(name=name)
                    db.session.add(category)
                    db.session.flush()
                    categories[name] = category
                    created_categories.append(name)
                used_category_ids.add(category.id)

                existing = Canteen.query.filter_by(category_id=category.id).all()
                by_slot = {}
                by_body = {}
                for canteen in existing:
                    by_slot.setdefault(slot_key(canteen.name), []).append(canteen)
                    body = body_key(canteen.name)
                    if body:
                        by_body.setdefault(body, []).append(canteen)

                used_existing_ids = set()

                def pick_existing(stall_name: str):
                    key = slot_key(stall_name)
                    body = body_key(stall_name)
                    candidates = [item for item in by_body.get(body, []) if item.id not in used_existing_ids]
                    if candidates:
                        same_slot = [item for item in candidates if slot_key(item.name) == key]
                        return same_slot[0] if same_slot else candidates[0]

                    candidates = [item for item in by_slot.get(key, []) if item.id not in used_existing_ids]
                    return candidates[0] if candidates else None

                for stall_name in restaurant["stalls"]:
                    target = pick_existing(stall_name)

                    if target is not None:
                        used_existing_ids.add(target.id)
                        if target.name != stall_name:
                            updated_canteens.append(f"{target.id}: {target.name} -> {stall_name}")
                            target.name = stall_name
                        target.is_active = True
                        matched_ids.add(target.id)
                    else:
                        canteen = Canteen(name=stall_name, category_id=category.id, is_active=True)
                        db.session.add(canteen)
                        db.session.flush()
                        matched_ids.add(canteen.id)
                        created_canteens.append(stall_name)

        # 未匹配到的旧档口：有评价/历史的归档隐藏，没有的删除
        for canteen in Canteen.query.all():
            if canteen.id in matched_ids:
                continue

            rating_count = Rating.query.filter_by(canteen_id=canteen.id).count()
            history_count = RatingHistory.query.filter_by(canteen_id=canteen.id).count()
            if rating_count or history_count:
                if canteen.is_active:
                    canteen.is_active = False
                    archived_canteens.append(f"{canteen.id}: {canteen.name}（{rating_count} 条评价，{history_count} 条历史）")
            else:
                deleted_canteens.append(f"{canteen.id}: {canteen.name}")
                db.session.delete(canteen)

        # 新菜单里已经不存在的空食堂（且没有残留档口）直接删除
        for category in Category.query.all():
            if category.id in used_category_ids:
                continue
            if Canteen.query.filter_by(category_id=category.id).count() == 0:
                deleted_categories.append(category.name)
                db.session.delete(category)

        report_lines = [
            f"抓取时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"来源：{SURVEY_URL}",
            f"食堂（分类）数量：{sum(len(area['restaurants']) for area in areas)}",
            f"档口数量：{sum(len(r['stalls']) for area in areas for r in area['restaurants'])}",
            "",
            f"新增食堂：{len(created_categories)}",
            *[f"  + {name}" for name in created_categories],
            "",
            f"新增档口：{len(created_canteens)}",
            *[f"  + {name}" for name in created_canteens],
            "",
            f"更新档口名称：{len(updated_canteens)}",
            *[f"  ~ {item}" for item in updated_canteens],
            "",
            f"归档档口（保留历史评价）：{len(archived_canteens)}",
            *[f"  - {item}" for item in archived_canteens],
            "",
            f"删除无评价旧档口：{len(deleted_canteens)}",
            *[f"  - {item}" for item in deleted_canteens],
            "",
            f"删除空食堂：{len(deleted_categories)}",
            *[f"  - {name}" for name in deleted_categories],
        ]
        report = "\n".join(report_lines).strip() + "\n"

        if dry_run:
            db.session.rollback()
            report += "\n（dry-run：以上变更未提交）\n"
        else:
            db.session.commit()

        return {
            "created_categories": created_categories,
            "created_canteens": created_canteens,
            "updated_canteens": updated_canteens,
            "archived_canteens": archived_canteens,
            "deleted_canteens": deleted_canteens,
            "deleted_categories": deleted_categories,
            "report": report,
        }


def main():
    parser = argparse.ArgumentParser(description="从问卷星同步档口数据")
    parser.add_argument("--dry-run", action="store_true", help="只抓取和比对，不写数据库")
    args = parser.parse_args()

    _, menu_html = fetch_survey_menu()
    areas, restaurant_count, stall_count = collect_menu(menu_html)
    print(f"Parsed {restaurant_count} restaurants, {stall_count} stalls")

    result = sync_database(areas, dry_run=args.dry_run)
    report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync_report.txt")
    with open(report_path, "w", encoding="utf-8") as handle:
        handle.write(result["report"])

    print(
        "created_categories={0} created_canteens={1} updated={2} archived={3} deleted={4}".format(
            len(result["created_categories"]),
            len(result["created_canteens"]),
            len(result["updated_canteens"]),
            len(result["archived_canteens"]),
            len(result["deleted_canteens"]),
        )
    )
    print("report:", report_path)
    if args.dry_run:
        print("dry-run: database not modified")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print("SYNC FAILED:", error, file=sys.stderr)
        sys.exit(1)
