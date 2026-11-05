"""兼容入口：从问卷星同步最新档口数据。

旧版这里保存了一份静态档口列表，已经和问卷星上的数据不一致。
现在统一从问卷星抓取，请直接运行：

    python import_canteens.py

或使用功能更完整（支持 --dry-run）的：

    python sync_canteens.py
"""

from sync_canteens import main

if __name__ == "__main__":
    main()
