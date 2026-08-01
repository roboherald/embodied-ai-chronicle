# 无头验证

这个环境没有浏览器，UI 改动过去只能靠读代码判断对错——弹窗关闭按钮失效的 bug
就是这样漏掉的（`display:flex` 盖过了 `[hidden]`，纯看 JS 看不出来）。

`verify.js` 用 jsdom 真正加载 `site/index.html` + `site/app.js`，模拟点击、
断言 DOM 结果，覆盖：渲染、标签页、矩阵、弹窗开关、筛选、点赞失败回滚、表格视图。

## 跑

```bash
node test/verify.js
```

需要 jsdom：`npm install jsdom`（脚本里目前指向 /tmp/domtest/node_modules，
换机器时改成本地安装即可）。

退出码：0 全通过 / 1 有断言失败 / 2 脚本自身出错。
