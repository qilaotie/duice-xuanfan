(function () {
    'use strict';

    const {h} = Vue;

    function SiteHeader() {
        return h("header", {class: "site-header"}, [
            h("div", {class: "header-inner"}, [
                h("a", {class: "brand", href: "#", "data-nav": "stalls", "aria-label": "对策选饭首页"}, [
                    h("span", {class: "brand-mark"}, [
                        h("svg", {width: "23", height: "23", viewbox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"}, [
                            h("path", {d: "M4 11h16a8 8 0 0 1-16 0Z"}),
                            h("path", {d: "M8 7c0-1.5 1-2 1-3"}),
                            h("path", {d: "M12 7c0-1.5 1-2 1-3"}),
                            h("path", {d: "M16 7c0-1.5 1-2 1-3"})
                        ])
                    ]),
                    h("span", {class: "brand-text"}, [
                        h("strong", "对策选饭"),
                        h("small", "CAMPUS DINING")
                    ])
                ]),
                h("nav", {class: "main-nav", "aria-label": "主导航"}),
                h("div", {class: "header-actions"})
            ])
        ]);
    }

    function DiningPage() {
        return h("section", {class: "view is-active", id: "view-stalls"}, [
            h("div", {class: "hero"}, [
                h("div", {class: "hero-copy"}, [
                    h("span", {class: "eyebrow"}, "CAMPUS DINING GUIDE"),
                    h("h1", "今天，吃点好的。"),
                    h("p", "看看同学们正在推荐哪些档口，也给你的宝藏窗口打个分。"),
                    h("div", {class: "hero-actions"}, [
                        h("button", {type: "button", class: "btn btn-light", id: "random-food-button", "data-action": "random-food", "aria-controls": "random-food-result"}, "随机推荐"),
                        h("button", {type: "button", class: "btn btn-light", "data-action": "open-rating"}, "写一条评价"),
                        h("button", {type: "button", class: "btn btn-ghost-light btn-sm", "data-action": "feedback-issue"}, "问题反馈"),
                        h("button", {type: "button", class: "btn btn-ghost-light btn-sm", "data-action": "feedback-stall"}, "推荐档口"),
                        h("button", {type: "button", class: "btn btn-ghost-light", "data-action": "scroll-grid"}, [
                            "浏览档口 ",
                            h("span", {"aria-hidden": "true"}, "→")
                        ])
                    ]),
                    h("details", {class: "food-picker random-food-picker", id: "random-food-type"}, [
                        h("summary"),
                        h("label", {class: "sort-control"}, [
                            "食堂 ",
                            h("select", {id: "random-food-dining"}),
                            " "
                        ]),
                        h("div", {class: "food-picker-options", role: "group", "aria-label": "推荐品类，可多选"}),
                        h("button", {type: "button", class: "btn btn-ghost-light btn-sm food-picker-clear"}, "清空选择")
                    ]),
                    h("div", {class: "random-food-result", id: "random-food-result", hidden: true}, [
                        h("div", {class: "random-food-preview"}, [
                            h("div", {id: "random-food-photo", "aria-hidden": "true"}),
                            h("div", {id: "random-food-copy", "aria-live": "polite"})
                        ]),
                        h("button", {type: "button", class: "btn btn-light btn-sm", "data-action": "open-detail"}, "查看档口")
                    ])
                ]),
                h("div", {class: "hero-stats", id: "hero-stats"})
            ]),
            h("div", {class: "layout"}, [
                h("aside", {class: "sidebar card"}, [
                    h("div", {class: "sidebar-head"}, [
                        h("h2", "按食堂浏览"),
                        h("span", {class: "muted", id: "sidebar-total"}, "—")
                    ]),
                    h("div", {class: "category-nav", id: "category-nav"}),
                    h("div", {class: "sidebar-note"}, [
                        h("span", {class: "dot"}),
                        " 评分来自同学们的真实评价，实时更新"
                    ])
                ]),
                h("div", {class: "content"}, [
                    h("div", {class: "content-head"}, [
                        h("div", [
                            h("h2", {id: "list-title"}, "全部档口"),
                            h("p", {class: "muted", id: "list-subtitle"}, "正在加载档口…")
                        ]),
                        h("label", {class: "search-box"}, [
                            h("svg", {width: "17", height: "17", viewbox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "aria-hidden": "true"}, [
                                h("circle", {cx: "11", cy: "11", r: "7"}),
                                h("path", {d: "m20 20-3.2-3.2"})
                            ]),
                            " ",
                            h("input", {type: "search", id: "search-input", placeholder: "搜索档口或食堂…", autocomplete: "off", "aria-label": "搜索档口或食堂"}),
                            " "
                        ])
                    ]),
                    h("div", {class: "list-toolbar", id: "list-toolbar"}, [
                        h("details", {class: "food-picker", id: "stall-food-type"}, [
                            h("summary"),
                            h("div", {class: "food-picker-options", role: "group", "aria-label": "餐饮分类，可多选"}),
                            h("button", {type: "button", class: "btn btn-ghost btn-sm food-picker-clear"}, "清空选择")
                        ]),
                        h("div", {class: "toolbar-left"}, [
                            h("button", {type: "button", class: "chip", id: "rated-toggle", "data-action": "toggle-rated", "aria-pressed": "false"}, "只看有评分"),
                            h("button", {type: "button", class: "chip", id: "expand-all", "data-action": "expand-all"}, "全部展开"),
                            h("button", {type: "button", class: "chip", id: "collapse-all", "data-action": "collapse-all"}, "全部收起")
                        ]),
                        h("label", {class: "sort-control"}, [
                            " 排序 ",
                            h("select", {id: "sort-select", "aria-label": "档口排序"}, [
                                h("option", {value: "number"}, "按编号"),
                                h("option", {value: "score"}, "按评分"),
                                h("option", {value: "reviews"}, "按评价数")
                            ]),
                            " "
                        ])
                    ]),
                    h("div", {class: "directory", id: "canteen-grid"})
                ])
            ])
        ]);
    }

    function MapPage() {
        return h("section", {class: "view", id: "view-map", hidden: true}, [
            h("iframe", {id: "food-map-frame", title: "食堂与综合楼位置示意图", style: "width:100%;height:calc(100dvh - 190px);min-height:480px;border:0;border-radius:20px", "data-src": "food-map.html"})
        ]);
    }

    function CampusFoodPage() {
        return h("section", {class: "view", id: "view-campus", hidden: true}, [
            h("div", {class: "hero-copy section-hero"}, [
                h("span", {class: "eyebrow"}, "CAMPUS FOOD"),
                h("h1", "校内美食"),
                h("p", "找找食堂之外的好吃的，按综合楼和楼层浏览同学们的推荐。"),
                h("div", {class: "hero-actions"}, [
                    h("button", {type: "button", class: "btn btn-light", "data-action": "feedback-campus"}, "＋ 推荐校内美食"),
                    h("button", {type: "button", class: "btn btn-ghost-light", "data-action": "open-rating"}, "写一条评价")
                ])
            ]),
            h("div", {class: "layout campus-layout"}, [
                h("div", {class: "content-head campus-content-head"}, [
                    h("div", [
                        h("h2", "校内美食列表"),
                        h("p", {id: "campus-food-count", class: "muted", role: "status"})
                    ]),
                    h("label", {class: "search-box"}, [
                        h("svg", {width: "17", height: "17", viewbox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "aria-hidden": "true"}, [
                            h("circle", {cx: "11", cy: "11", r: "7"}),
                            h("path", {d: "m20 20-3.2-3.2"})
                        ]),
                        " ",
                        h("input", {type: "search", id: "campus-food-search", placeholder: "搜索店名、楼宇或楼层…", "aria-label": "搜索校内美食"}),
                        " "
                    ])
                ]),
                h("aside", {class: "sidebar card campus-directory"}, [
                    h("div", {class: "sidebar-head"}, [
                        h("h2", "按地点浏览")
                    ]),
                    h("div", {class: "category-nav", id: "campus-food-directory", "aria-label": "按楼层筛选"})
                ]),
                h("div", {id: "campus-food-list", class: "stack campus-results", "aria-live": "polite"})
            ])
        ]);
    }

    function ForumPage() {
        return h("section", {class: "view", id: "view-forum", hidden: true}, [
            h("div", {class: "hero-copy section-hero"}, [
                h("span", {class: "eyebrow"}, "OFF-CAMPUS FOOD"),
                h("h1", "校外美食论坛"),
                h("p", "分享喜欢的店，也给同学们提个醒。欢迎在帖子底下盖楼。"),
                h("div", {class: "hero-actions"}, [
                    h("button", {type: "button", class: "btn btn-light", "data-action": "forum-compose"}, "＋ 发帖子")
                ])
            ]),
            h("div", {class: "content-head"}, [
                h("h2", "最新帖子"),
                h("label", {class: "field"}, [
                    h("span", "帖子类型"),
                    " ",
                    h("select", {id: "forum-kind-filter"}, [
                        h("option", {value: ""}, "全部"),
                        h("option", {value: "recommend"}, "推荐"),
                        h("option", {value: "avoid"}, "避雷")
                    ]),
                    " "
                ])
            ]),
            h("div", {id: "forum-post-list", class: "stack", "aria-live": "polite"}),
            h("button", {type: "button", class: "btn btn-soft", id: "forum-more", hidden: true}, "查看更多帖子")
        ]);
    }

    function RankingPage() {
        return h("section", {class: "view", id: "view-ranking", hidden: true}, [
            h("div", {class: "hero-copy section-hero"}, [
                h("span", {class: "eyebrow"}, "TOP RATED"),
                h("h1", "口碑排行榜"),
                h("p", "按校区、食堂或楼层找档口，只统计有效评价。")
            ]),
            h("div", {class: "card ranking-filters"}, [
                h("details", {class: "food-picker", id: "ranking-food-type"}, [
                    h("summary"),
                    h("div", {class: "food-picker-options", role: "group", "aria-label": "餐饮分类，可多选"}),
                    h("button", {type: "button", class: "btn btn-ghost btn-sm food-picker-clear"}, "清空选择")
                ]),
                h("label", [
                    "范围 ",
                    h("select", {id: "ranking-scope"})
                ]),
                h("label", [
                    "排序 ",
                    h("select", {id: "ranking-order"}, [
                        h("option", {value: "score"}, "评分最高"),
                        h("option", {value: "count"}, "评价最多")
                    ])
                ]),
                h("label", [
                    "评价数 ",
                    h("select", {id: "ranking-min"}, [
                        h("option", {value: "1"}, "不限"),
                        h("option", {value: "3"}, "至少 3 条"),
                        h("option", {value: "5"}, "至少 5 条"),
                        h("option", {value: "10"}, "至少 10 条")
                    ])
                ])
            ]),
            h("div", {class: "podium", id: "podium"}),
            h("div", {class: "ranking-layout"}, [
                h("div", {class: "card ranking-card"}, [
                    h("div", {class: "card-head"}, [
                        h("h2", "完整榜单"),
                        h("div", {class: "ranking-tools"}, [
                            h("span", {class: "muted", id: "ranking-count"}),
                            h("div", {class: "mode-switch", id: "ranking-mode"}, [
                                h("button", {type: "button", class: "mode-btn is-active", "data-ranking-mode": "all"}, "合并排行"),
                                h("button", {type: "button", class: "mode-btn", "data-ranking-mode": "category"}, "按楼层分组")
                            ])
                        ])
                    ]),
                    h("div", {id: "ranking-list"})
                ]),
                h("div", {class: "card category-best-card"}, [
                    h("div", {class: "card-head"}, [
                        h("h2", "各楼层榜首")
                    ]),
                    h("div", {id: "category-best"})
                ])
            ])
        ]);
    }

    function AdminPage() {
        return h("section", {class: "view", id: "view-admin", hidden: true}, [
            h("div", {class: "hero-copy section-hero"}, [
                h("span", {class: "eyebrow"}, "ADMIN CONSOLE"),
                h("h1", "管理后台"),
                h("p", "维护食堂与档口，处理评价和举报，查看操作日志。")
            ]),
            h("div", {class: "stat-grid", id: "admin-stats"}),
            h("div", {class: "admin-shell card"}, [
                h("div", {class: "admin-tabs", id: "admin-tabs", role: "tablist", "aria-label": "管理功能"}, [
                    h("button", {type: "button", class: "admin-tab is-active", "data-admin-tab": "categories", role: "tab"}, "食堂"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "canteens", role: "tab"}, "档口"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "ratings", role: "tab"}, "评价"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "reports", role: "tab"}, "举报"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "feedback", role: "tab"}, "用户反馈"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "actions", role: "tab"}, "操作日志"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "maintenance", role: "tab"}, "数据维护"),
                    h("button", {type: "button", class: "admin-tab", "data-admin-tab": "administrators", role: "tab", hidden: true}, "用户管理")
                ]),
                h("div", {class: "admin-body"}, [
                    h("section", {class: "admin-section is-active", "data-admin-section": "categories"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("div", [
                                h("h2", "食堂管理"),
                                h("p", "食堂是档口的分组，删除前需要先清空其下档口。")
                            ])
                        ]),
                        h("form", {class: "inline-form", id: "add-category-form"}, [
                            h("input", {type: "text", id: "new-category-name", placeholder: "输入食堂名称，例如：海棠一层餐厅", maxlength: "100", required: true}),
                            h("button", {type: "submit", class: "btn btn-primary"}, "添加食堂")
                        ]),
                        h("div", {class: "admin-list", id: "admin-category-list"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "canteens"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("div", [
                                h("h2", "档口管理"),
                                h("p", "新增档口时必须选择所属食堂；删除档口会同时清除其评价、举报和历史快照。")
                            ])
                        ]),
                        h("form", {class: "inline-form", id: "add-canteen-form"}, [
                            h("input", {type: "text", id: "new-canteen-slot", "aria-label": "新档口楼层内编号", placeholder: "楼层内编号（选填）", maxlength: "20"}),
                            h("input", {type: "text", id: "new-canteen-name", placeholder: "档口名称，例如：炸鸡汉堡", maxlength: "100", required: true}),
                            h("select", {id: "new-canteen-category", required: true, "aria-label": "所属食堂"}),
                            h("button", {type: "submit", class: "btn btn-primary"}, "添加档口")
                        ]),
                        h("section", {class: "detail-panel admin-review-labels"}, [
                            h("h3", "餐饮分类管理"),
                            h("form", {class: "inline-form", id: "add-food-type"}, [
                                h("input", {name: "name", "aria-label": "新餐饮分类名称", placeholder: "输入分类名称，例如：烧烤", maxlength: "20", required: true}),
                                h("button", {type: "submit", class: "btn btn-primary"}, "新增分类")
                            ]),
                            h("details", [
                                h("summary", "查看分类和档口"),
                                h("div", {class: "stack", id: "admin-food-types"})
                            ])
                        ]),
                        h("label", {class: "field"}, [
                            h("span", "浏览范围"),
                            " ",
                            h("select", {id: "admin-canteen-filter"}),
                            " "
                        ]),
                        h("div", {class: "admin-list", id: "admin-canteen-list"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "ratings"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("div", [
                                h("h2", "评价管理"),
                                h("p", "管理员可以软删除不当评价，也可以恢复误删的评价。")
                            ])
                        ]),
                        h("div", {class: "filter-row", id: "admin-rating-filters"}, [
                            h("button", {type: "button", class: "chip is-active", "data-rating-filter": "all"}, "全部"),
                            h("button", {type: "button", class: "chip", "data-rating-filter": "active"}, "有效"),
                            h("button", {type: "button", class: "chip", "data-rating-filter": "deleted"}, "已删除")
                        ]),
                        h("div", {class: "filter-row", id: "admin-rating-search-filters"}, [
                            h("input", {id: "admin-rating-search", type: "search", "aria-label": "搜索评价", placeholder: "搜索评价、账号或档口"}),
                            h("select", {id: "admin-rating-stall", "aria-label": "筛选档口"}),
                            h("select", {id: "admin-rating-score", "aria-label": "筛选评分"}, [
                                h("option", {value: ""}, "全部评分"),
                                h("option", {value: "5"}, "5 分"),
                                h("option", {value: "4"}, "4 分"),
                                h("option", {value: "3"}, "3 分"),
                                h("option", {value: "2"}, "2 分"),
                                h("option", {value: "1"}, "1 分")
                            ]),
                            h("select", {id: "admin-rating-label", "aria-label": "筛选标签"})
                        ]),
                        h("section", {class: "detail-panel admin-review-labels"}, [
                            h("h3", "评价标签管理"),
                            h("form", {class: "inline-form", id: "admin-add-review-label"}, [
                                h("input", {name: "label", "aria-label": "新标签名称", placeholder: "输入新标签名称", maxlength: "20", required: true}),
                                h("button", {type: "submit", class: "btn btn-primary"}, "新建标签")
                            ]),
                            h("div", {class: "stack", id: "admin-review-label-list"})
                        ]),
                        h("div", {class: "filter-row", id: "admin-rating-author-scope", hidden: true}, [
                            h("strong", {id: "admin-rating-author-summary", role: "status"}),
                            h("button", {type: "button", class: "btn btn-ghost btn-sm", "data-action": "admin-rating-all-authors"}, "返回评价列表")
                        ]),
                        h("div", {class: "admin-list", id: "admin-rating-list"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "reports"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("div", [
                                h("h2", "举报管理"),
                                h("p", "查看举报理由，删除被举报评价，或将举报标记为已处理。")
                            ])
                        ]),
                        h("div", {class: "admin-list", id: "admin-report-list"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "feedback"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("h2", "用户反馈与档口推荐")
                        ]),
                        h("label", {class: "field"}, [
                            h("span", "审核状态"),
                            " ",
                            h("select", {id: "feedback-status"}, [
                                h("option", {value: "pending"}, "待处理"),
                                h("option", {value: "processed"}, "已处理")
                            ]),
                            " "
                        ]),
                        h("div", {class: "admin-list", id: "admin-feedback-list"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "actions"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("div", [
                                h("h2", "管理员操作日志"),
                                h("p", "最近 200 条管理操作，用于审计和追溯。")
                            ])
                        ]),
                        h("div", {class: "admin-list", id: "admin-action-list"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "administrators"}, [
                        h("h2", "用户管理"),
                        h("p", {class: "muted"}, "封禁会使当前登录失效。禁言后，账号仍可登录和浏览。"),
                        h("form", {class: "inline-form", id: "admin-user-search"}, [
                            h("input", {name: "q", "aria-label": "搜索用户", placeholder: "输入账号或昵称", maxlength: "100"}),
                            h("button", {type: "submit", class: "btn btn-primary"}, "搜索")
                        ]),
                        h("p", {class: "muted"}, "最多显示 50 条，可用完整账号缩小范围。"),
                        h("div", {class: "admin-list", id: "admin-accounts-list", "aria-live": "polite"})
                    ]),
                    h("section", {class: "admin-section", "data-admin-section": "maintenance"}, [
                        h("div", {class: "admin-section-head"}, [
                            h("div", [
                                h("h2", "数据维护"),
                                h("p", "为已有评分的档口补写当前平均分快照，供档口详情页的历史趋势图使用。")
                            ])
                        ]),
                        h("div", {class: "maintenance-box"}, [
                            h("div", [
                                h("strong", "回填历史评分快照"),
                                h("p", {class: "muted"}, "已有快照的档口会追加一条当前数据，不会删除旧记录。")
                            ]),
                            h("button", {type: "button", class: "btn btn-soft", "data-action": "admin-backfill"}, "立即回填")
                        ]),
                        h("p", {class: "form-hint", id: "admin-backfill-hint"})
                    ])
                ])
            ])
        ]);
    }

    function StallDialog() {
        return h("div", {class: "modal modal-detail", id: "detail-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "detail-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "detail-title"}, [
                h("button", {type: "button", class: "icon-btn detail-close", "data-close-modal": "", "aria-label": "关闭详情"}, "×"),
                h("div", {class: "detail-content", id: "detail-content"})
            ])
        ]);
    }

    function ReportDialog() {
        return h("div", {class: "modal", id: "report-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card", id: "report-content", role: "dialog", "aria-modal": "true", "aria-labelledby": "report-title"})
        ]);
    }

    function RatingDialog() {
        return h("div", {class: "modal", id: "rating-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card profile-dialog rating-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "rating-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "rating-title"}, "写一条评价")
                ]),
                h("form", {id: "rating-form"}, [
                    h("div", {class: "profile-dialog-body stack rating-dialog-body"}, [
                        h("p", {class: "muted"}, "无需登录也可以评价。访客可在当前浏览器查看和管理自己的评价。"),
                        h("div", {id: "rating-target-summary", class: "rating-target-summary", hidden: true}),
                        h("div", {class: "field-row", id: "rating-location-fields"}, [
                            h("label", {class: "field"}, [
                                h("span", {id: "rating-category-label"}, "食堂"),
                                " ",
                                h("select", {id: "rating-category"}),
                                " "
                            ]),
                            h("label", {class: "field"}, [
                                h("span", {id: "rating-canteen-label"}, "档口"),
                                " ",
                                h("select", {id: "rating-canteen"}),
                                " "
                            ])
                        ]),
                        h("div", {class: "field"}, [
                            h("span", "档口整体评分"),
                            h("div", {class: "star-input", id: "star-input", role: "radiogroup", "aria-label": "评分"}, [
                                h("button", {type: "button", class: "star-btn", "data-score": "1", "aria-label": "1 分", "aria-checked": "false"}, "★"),
                                h("button", {type: "button", class: "star-btn", "data-score": "2", "aria-label": "2 分", "aria-checked": "false"}, "★"),
                                h("button", {type: "button", class: "star-btn", "data-score": "3", "aria-label": "3 分", "aria-checked": "false"}, "★"),
                                h("button", {type: "button", class: "star-btn", "data-score": "4", "aria-label": "4 分", "aria-checked": "false"}, "★"),
                                h("button", {type: "button", class: "star-btn", "data-score": "5", "aria-label": "5 分", "aria-checked": "false"}, "★"),
                                h("span", {class: "star-value", id: "star-value"}, "5.0")
                            ]),
                            h("input", {type: "hidden", id: "rating-score", value: "5"})
                        ]),
                        h("label", {class: "field"}, [
                            h("span", "评论（可选）"),
                            " ",
                            h("textarea", {id: "rating-comment", rows: "2", maxlength: "500", placeholder: "说说菜品、分量、价格，给同学们一点参考…"}),
                            " "
                        ]),
                        h("details", {class: "rating-extra", id: "rating-dishes-extra"}, [
                            h("summary", [
                                "＋ 给菜品单独评分",
                                h("span", "可选，可添加多道")
                            ]),
                            h("div", {class: "stack rating-extra-body"}, [
                                h("label", {class: "field"}, [
                                    h("span", "添加要评分的菜品（可选，可添加多道）"),
                                    " ",
                                    h("select", {id: "rating-dish", disabled: true}),
                                    " "
                                ]),
                                h("div", {id: "rating-dish-scores", class: "stack"}),
                                h("div", [
                                    h("button", {type: "button", id: "rating-add-new-dish", class: "btn btn-soft btn-sm", disabled: true}, "＋ 添加一道新菜")
                                ])
                            ])
                        ]),
                        h("details", {class: "rating-extra", id: "rating-photos-extra"}, [
                            h("summary", [
                                "＋ 添加照片",
                                h("span", "可选，最多 4 张")
                            ]),
                            h("div", {class: "stack rating-extra-body"}, [
                                h("div", [
                                    h("label", {class: "avatar-picker-control"}, [
                                        h("input", {type: "file", id: "rating-photo", accept: "image/jpeg,image/png,image/webp", multiple: true, "aria-describedby": "rating-photo-hint"}),
                                        " ",
                                        h("span", {class: "avatar-picker-icon", "aria-hidden": "true"}, "📷"),
                                        " ",
                                        h("span", {class: "avatar-picker-copy"}, [
                                            h("strong", {id: "rating-photo-label"}, "添加评价照片"),
                                            h("span", {id: "rating-photo-hint", "aria-live": "polite"}, "可选，最多 4 张，每张不超过 5 MB")
                                        ]),
                                        " ",
                                        h("span", {class: "avatar-picker-icon", "aria-hidden": "true"}, "＋"),
                                        " "
                                    ]),
                                    h("div", {id: "rating-photo-preview", class: "review-photo-gallery"}),
                                    h("button", {type: "button", class: "btn btn-ghost btn-sm", id: "rating-photo-clear", hidden: true}, "清除已选照片")
                                ]),
                                h("label", {id: "rating-remove-photo-field", hidden: true}, [
                                    h("input", {type: "checkbox", id: "rating-remove-photo"}),
                                    " 移除全部原有照片 "
                                ])
                            ])
                        ]),
                        h("label", {id: "rating-anonymous-field", hidden: true}, [
                            h("input", {type: "checkbox", id: "rating-anonymous"}),
                            " 匿名评价（这条评价不会显示在个人主页） "
                        ])
                    ]),
                    h("div", {class: "rating-dialog-footer stack"}, [
                        h("p", {class: "form-error", id: "rating-error", role: "alert", hidden: true}),
                        h("button", {type: "submit", class: "btn btn-primary btn-block", id: "rating-submit"}, "提交评价")
                    ])
                ])
            ])
        ]);
    }

    function AuthDialog() {
        return h("div", {class: "modal", id: "auth-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card auth-card", id: "auth-content", role: "dialog", "aria-modal": "true", "aria-labelledby": "auth-title"})
        ]);
    }

    function ProfileEditorDialog() {
        return h("div", {class: "modal", id: "nickname-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "nickname-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "nickname-title"}, "编辑个人资料"),
                    h("p", "填写的资料和非匿名评价会公开展示。")
                ]),
                h("form", {id: "nickname-form", class: "stack"}, [
                    h("div", {class: "avatar-picker"}, [
                        h("label", {class: "avatar-picker-control"}, [
                            h("input", {type: "file", id: "profile-avatar-input", accept: "image/jpeg,image/png,image/webp", "aria-describedby": "profile-avatar-hint"}),
                            " ",
                            h("span", {class: "comment-avatar", id: "profile-avatar-preview", "aria-hidden": "true"}),
                            " ",
                            h("span", {class: "avatar-picker-copy"}, [
                                h("strong", {id: "profile-avatar-label"}, "选择头像"),
                                h("span", {id: "profile-avatar-hint"}, "点按选择照片，上传前自动压缩")
                            ]),
                            " ",
                            h("span", {class: "avatar-picker-icon", "aria-hidden": "true"}, "＋"),
                            " "
                        ]),
                        h("button", {type: "button", class: "btn btn-ghost btn-sm", id: "profile-avatar-remove", hidden: true}, "移除头像"),
                        h("span", {id: "profile-avatar-status", class: "avatar-picker-status", role: "status"})
                    ]),
                    h("label", {class: "field"}, [
                        h("span", "昵称（可选）"),
                        " ",
                        h("input", {type: "text", id: "nickname-input", maxlength: "24", autocomplete: "nickname"}),
                        " "
                    ]),
                    h("label", {class: "field"}, [
                        h("span", "口味偏好（可选）"),
                        " ",
                        h("input", {type: "text", id: "profile-taste", maxlength: "80", placeholder: "例如：偏辣、少油"}),
                        " "
                    ]),
                    h("label", {class: "field"}, [
                        h("span", "出生地（可选）"),
                        " ",
                        h("input", {type: "text", id: "profile-birthplace", maxlength: "40", placeholder: "例如：陕西西安"}),
                        " "
                    ]),
                    h("p", {class: "form-error", id: "nickname-error", hidden: true}),
                    h("button", {type: "submit", class: "btn btn-primary btn-block"}, "保存")
                ])
            ])
        ]);
    }

    function AccountDialog() {
        return h("div", {class: "modal", id: "my-reviews-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card profile-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "my-reviews-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "my-reviews-title"}, "我的")
                ]),
                h("div", {class: "profile-dialog-body"}, [
                    h("div", {class: "feedback-review-actions", id: "my-social-actions", hidden: true}, [
                        h("button", {type: "button", class: "btn btn-ghost btn-sm", "data-action": "my-recommendations", "aria-pressed": "false"}, "我的清单"),
                        h("button", {type: "button", class: "btn btn-soft btn-sm", "data-action": "my-reviews", "aria-pressed": "true"}, "我的评价"),
                        h("button", {type: "button", class: "btn btn-ghost btn-sm", "data-action": "my-following", "aria-pressed": "false"}, "我的关注"),
                        h("button", {type: "button", class: "btn btn-ghost btn-sm", "data-action": "my-public-profile", "aria-pressed": "false"}, "我的个人主页")
                    ]),
                    h("section", {id: "my-following-panel", class: "stack", hidden: true}, [
                        h("div", {class: "follow-switch", "aria-label": "关注关系", role: "group"}, [
                            h("button", {type: "button", class: "btn btn-soft btn-sm", "data-action": "follow-list", "data-list": "following"}, "我关注的人"),
                            h("button", {type: "button", class: "btn btn-ghost btn-sm", "data-action": "follow-list", "data-list": "followers"}, "关注我的人")
                        ]),
                        h("div", {id: "my-following-list", class: "stack", "aria-live": "polite"})
                    ]),
                    h("div", {id: "my-profile-panel", class: "stack", "aria-live": "polite", hidden: true}),
                    h("div", {id: "my-recommendations-panel", class: "stack", "aria-live": "polite", hidden: true}),
                    h("div", {id: "my-reviews-list", class: "stack", "aria-live": "polite"})
                ])
            ])
        ]);
    }

    function PublicProfileDialog() {
        return h("div", {class: "modal", id: "public-profile-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card profile-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "public-profile-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "public-profile-title"}, "个人资料")
                ]),
                h("div", {class: "profile-dialog-body"}, [
                    h("div", {id: "public-profile-content", class: "stack", "aria-live": "polite"})
                ])
            ])
        ]);
    }

    function FeedbackDialog() {
        return h("div", {class: "modal", id: "feedback-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "feedback-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "feedback-title"}, "问题反馈")
                ]),
                h("form", {id: "feedback-form", class: "stack"}, [
                    h("p", {class: "muted", id: "feedback-stall-context", hidden: true}),
                    h("label", {class: "field", id: "feedback-name-field", hidden: true}, [
                        h("span", {id: "feedback-name-label"}, "档口名称"),
                        h("input", {name: "name", maxlength: "100"})
                    ]),
                    h("label", {class: "field", id: "feedback-building-field", hidden: true}, [
                        h("span", {id: "feedback-location-label"}, "所在位置"),
                        h("select", {name: "building"})
                    ]),
                    h("label", {class: "field", id: "feedback-custom-location-field", hidden: true}, [
                        h("span", "填写所在位置"),
                        h("input", {name: "customLocation", maxlength: "100", placeholder: "例如：某食堂旁、某楼一层"})
                    ]),
                    h("label", {class: "field"}, [
                        h("span", {id: "feedback-content-label"}, "请描述遇到的问题"),
                        h("textarea", {name: "content", rows: "4", maxlength: "1000"})
                    ]),
                    h("label", {class: "avatar-picker-control", id: "feedback-photo-field", hidden: true}, [
                        h("input", {type: "file", name: "photo", accept: "image/jpeg,image/png,image/webp"}),
                        " ",
                        h("span", {class: "avatar-picker-icon", "aria-hidden": "true"}, "📷"),
                        " ",
                        h("span", {class: "avatar-picker-copy"}, [
                            h("strong", "选择档口照片"),
                            h("span", {id: "feedback-photo-label"}, "最多 5 MB")
                        ]),
                        " ",
                        h("span", {class: "avatar-picker-icon", "aria-hidden": "true"}, "＋"),
                        " "
                    ]),
                    h("p", {class: "form-error", id: "feedback-error", hidden: true}),
                    h("button", {type: "submit", class: "btn btn-primary btn-block"}, "提交")
                ])
            ])
        ]);
    }

    function ForumThreadDialog() {
        return h("div", {class: "modal", id: "forum-thread-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "forum-thread-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "forum-thread-title"}, "帖子详情")
                ]),
                h("div", {id: "forum-thread-content", class: "stack"}),
                h("div", {id: "forum-replies", class: "stack", "aria-live": "polite"}),
                h("button", {type: "button", class: "btn btn-soft btn-sm", id: "forum-more-replies", hidden: true}, "加载更多回复"),
                h("form", {id: "forum-reply-form", class: "stack", hidden: true}, [
                    h("label", {class: "field"}, [
                        h("span", "盖一楼"),
                        h("textarea", {name: "content", rows: "3", maxlength: "1000", required: true})
                    ]),
                    h("p", {class: "form-error", id: "forum-reply-error", hidden: true}),
                    h("button", {type: "submit", class: "btn btn-primary"}, "发布回复")
                ])
            ])
        ]);
    }

    function PhotoViewerDialog() {
        return h("div", {class: "modal photo-viewer", id: "photo-viewer-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "photo-viewer-card", id: "photo-viewer-content", role: "dialog", "aria-modal": "true", "aria-labelledby": "photo-viewer-title", tabindex: "-1"})
        ]);
    }

    function RecommendationDialog() {
        return h("div", {class: "modal", id: "recommendation-modal", "aria-hidden": "true"}, [
            h("div", {class: "modal-backdrop", "data-close-modal": ""}),
            h("div", {class: "modal-card profile-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "recommendation-title"}, [
                h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                h("div", {class: "modal-head"}, [
                    h("h2", {id: "recommendation-title"}, "美食清单")
                ]),
                h("div", {class: "profile-dialog-body"}, [
                    h("div", {id: "recommendation-content", class: "stack", "aria-live": "polite"})
                ])
            ])
        ]);
    }

    window.CanteenShell = {
        render() {
            return [
                h("div", {class: "ambient ambient-a", "aria-hidden": "true"}),
                h("div", {class: "ambient ambient-b", "aria-hidden": "true"}),
                h(SiteHeader),
                h("div", {id: "file-tip-container"}),
                h("main", {class: "page"}, [
                    h(DiningPage),
                    h(MapPage),
                    h(CampusFoodPage),
                    h(ForumPage),
                    h(RankingPage),
                    h(AdminPage)
                ]),
                h("div", {class: "toast-stack", id: "toast-stack", "aria-live": "polite", "aria-atomic": "false"}),
                h(StallDialog),
                h(ReportDialog),
                h(RatingDialog),
                h(AuthDialog),
                h(ProfileEditorDialog),
                h(AccountDialog),
                h(PublicProfileDialog),
                h(FeedbackDialog),
                h("div", {class: "modal", id: "forum-compose-modal", "aria-hidden": "true"}, [
                    h("div", {class: "modal-backdrop", "data-close-modal": ""}),
                    h("div", {class: "modal-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "forum-compose-title"}, [
                        h("button", {type: "button", class: "icon-btn modal-close", "data-close-modal": "", "aria-label": "关闭"}, "×"),
                        h("div", {class: "modal-head"}, [
                            h("h2", {id: "forum-compose-title"}, "分享校外美食")
                        ]),
                        h("form", {id: "forum-compose-form", class: "stack"}, [
                            h("label", {class: "field"}, [
                                h("span", "类型"),
                                h("select", {name: "kind", required: true}, [
                                    h("option", {value: "recommend"}, "推荐"),
                                    h("option", {value: "avoid"}, "避雷")
                                ])
                            ]),
                            h("label", {class: "field"}, [
                                h("span", "店名"),
                                h("input", {name: "name", maxlength: "100", required: true})
                            ]),
                            h("label", {class: "field"}, [
                                h("span", "地址"),
                                h("input", {name: "address", maxlength: "200", placeholder: "例如：某条路、某地铁站附近", required: true})
                            ]),
                            h("label", {class: "field"}, [
                                h("span", "菜品或理由"),
                                h("textarea", {name: "content", rows: "5", maxlength: "2000", placeholder: "说说推荐或不推荐哪道菜，以及你的理由", required: true})
                            ]),
                            h("p", {class: "form-error", id: "forum-compose-error", hidden: true}),
                            h("button", {type: "submit", class: "btn btn-primary"}, "发布帖子")
                        ])
                    ])
                ]),
                h(ForumThreadDialog),
                h(PhotoViewerDialog),
                h(RecommendationDialog)
            ];
        }
    };
})();
