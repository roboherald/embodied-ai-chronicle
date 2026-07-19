# 具身智能大事纪

自动抓取 arXiv 论文、机器人公司博客、行业媒体和 Hacker News 讨论，汇总成一个可以搜索/筛选的静态时间线网站。

## 现状与定位

「具身智能之心」「自动驾驶之心」这类公众号+知识星球式的社区已经存在，做的是深度解读、课程、招聘信息，更新靠人工整理，不是实时的。这个项目做的是另一件事：**无人值守、自动更新的原始信息流**——不追求深度解读，追求"当天发生的事当天就能在时间线上看到"，作为你自己刷资讯的第一层过滤器，跟已有社区不冲突、也可以互补（比如从这里发现线索，再去社区找解读）。

## 目录结构

```
scraper/
  sources.py   # 数据源配置：RSS 列表、arXiv 查询、关键词、HN 搜索词
  fetch.py     # 抓取 + 去重 + 写入 site/data/events.json
site/
  index.html / style.css / app.js   # 静态时间线页面，纯前端读取 data/events.json
  data/events.json                  # 抓取结果，由 fetch.py 生成/更新
.github/workflows/update.yml        # 定时抓取 + 自动部署到 GitHub Pages（需要你先建仓库并启用）
```

## 本地运行

```bash
pip install -r requirements.txt
python scraper/fetch.py          # 抓取一次，更新 site/data/events.json
cd site && python3 -m http.server 8000   # 然后浏览器打开 http://localhost:8000
```

首次运行已经抓到 116 条真实数据（arXiv 论文 + Boston Dynamics / The Robot Report / IEEE Spectrum / Google DeepMind / NVIDIA Blog / Hugging Face Blog 的博客文章 + Hacker News 相关讨论），可以直接看效果。

## 功能

- 时间线：按天分组，支持关键词搜索、时间范围/来源/公司标签筛选。
- 趋势图表：近 8 周条目数、各来源条目分布，可切换成表格视图（无障碍/复制数据用）。
- 收藏与已读：点击"收藏"或点开标题都会记到浏览器 `localStorage`，仅本机/本浏览器生效，换设备不同步。
- "有用"点赞：访客共享的计数，接的是免费的 [CounterAPI](https://counterapi.dev/)，同一条目所有人看到的数字是一样的（`localStorage` 只是软限制，防止自己重复点，不是强校验）。
- 评论区：底部有一个全站反馈区，每条新闻卡片下也有独立的"💬 评论"按钮，都接的是 [giscus](https://giscus.app/)（基于 GitHub Discussions），需要你手动开通，见下文。giscus 一个页面只能同时存在一个评论框，所以这些入口共用同一个评论区组件——点开一处会把它"借走"并加载对应的帖子，之前那处会自动收起，需要时再点一次对应按钮重新加载即可。每条新闻的评论会在仓库 Discussions 里自动开一个对应的帖子，条目越多帖子也会越多。
- 飞书推送：每次抓到新内容会给配置好的飞书机器人发一条摘要，需要你手动配置 webhook，见下文。
- 本周热点榜：按点赞数取本周 Top 10，全是 0 赞的时候会显示提示文案而不是空白。
- 公司主页：点新闻卡片上的公司/机构标签会跳到 `#company=公司名`，显示该公司的相关条目数、最早出现日期、最活跃来源，并自动套用标签筛选；地址栏这个 hash 可以直接分享。

## 现在的取舍（后面可以改）

- **摘要用原文，不接 AI**：直接展示 RSS/arXiv 的原始标题和摘要（英文），零成本、零 API key、不会因为额度或调用失败而抓取中断。如果想要中文摘要/一句话总结，可以在 `fetch.py` 里加一步调 Claude API，但要注意这是定时无人值守任务，出错处理和成本要考虑好。
- **暂不接 X/Twitter**：官方 API 收费且限制多，公司账号的动态目前只能通过官网博客/RSS 间接覆盖。如果有稳定可用的替代方案（比如某些账号同步发博客），可以加进 `sources.py`。
- **数据源都是英文源**：因为公开、稳定、有 RSS/API，抓取成本低。国内的机器人公司（如 Figure 对标的宇树、智元等）官网大多没有 RSS，要覆盖的话得单独写页面解析器，容易碎，先没做。

## 部署到 GitHub Pages

这一步需要你自己的 GitHub 账号，我没有帮你自动创建仓库或推送：

1. 在 GitHub 建一个新仓库（可以是 public 或 private，Pages 免费版对 public 仓库支持更好）。
2. 本地已经 `git init` 过了，执行：
   ```bash
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
3. 仓库 Settings → Pages → Source 选择 "GitHub Actions"。
4. 仓库 Settings → Actions → General → Workflow permissions 勾选 "Read and write permissions"（`update.yml` 里需要 push 权限来提交更新后的 `events.json`）。
5. 之后每天北京时间 9:17 会自动抓取一次并重新部署；也可以在 Actions 页面手动触发 "Update embodied AI chronicle"。

## 配置飞书推送（可选）

1. 在飞书群里添加一个"自定义机器人"（群设置 → 群机器人 → 添加机器人 → 自定义机器人），拿到一个 webhook 地址（形如 `https://open.feishu.cn/open-apis/bot/v2/hook/xxxx`）。
2. 仓库 Settings → Secrets and variables → Actions → New repository secret，名称填 `FEISHU_WEBHOOK_URL`，值填上面的 webhook 地址。
3. 不用改代码，`update.yml` 已经把这个 secret 传给 `fetch.py` 了；配置好之后下一次自动/手动运行就会推送新增条目摘要（没配置的话这一步会静默跳过，不影响抓取）。

## 配置 giscus 评论区（可选）

1. 仓库 Settings → General → Features，勾选启用 "Discussions"。
2. 访问 [giscus.app](https://giscus.app/zh-CN)，把仓库地址填进去，安装 giscus 这个 GitHub App 并授权访问该仓库。
3. 按页面提示选好"页面 ↔️ discussion 映射关系"（随便选一种，比如 URL）、分类（建议新建一个专门的分类，比如 "Announcements" 或新建 "网站反馈"）、主题选深色（跟网站配色一致，比如 `dark` 或 `dark_dimmed`）。
4. 页面底部会生成一段 `<script>` 代码，把里面的 `data-repo` / `data-repo-id` / `data-category` / `data-category-id` 这几个值发给我（或者直接改 `site/app.js` 开头的 `GISCUS_CONFIG` 对象），就能用了——不用直接贴 `<script>` 标签，代码里是动态生成的（同一时间只加载一处评论框）。

## 可以加的下一步

- 调整 `scraper/sources.py` 里的关键词/源列表，收窄或扩大覆盖范围。
- 给 `fetch.py` 加一步 AI 摘要/翻译（需要 API key，注意成本）。
- 收藏/已读目前只存在本机 `localStorage`，如果想跨设备同步需要接一个真正的账号系统。
