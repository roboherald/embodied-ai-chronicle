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

## 可以加的下一步

- 调整 `scraper/sources.py` 里的关键词/源列表，收窄或扩大覆盖范围。
- 给 `fetch.py` 加一步 AI 摘要/翻译（需要 API key，注意成本）。
- 按公司/关键词打标签，前端加分类筛选（现在只能按来源筛选）。
- 把 events.json 转成 RSS，接到 Telegram/飞书机器人做推送提醒。
