# 数据源配置：往这里加/删条目即可调整抓取范围，不用碰 fetch.py 的逻辑。

ARXIV_QUERY = (
    "cat:cs.RO AND (abs:embodied OR abs:manipulation OR abs:humanoid "
    'OR abs:"vision-language-action" OR abs:"robot learning" OR abs:dexterous '
    'OR abs:locomotion OR abs:"sim-to-real")'
)
ARXIV_MAX_RESULTS = 30

# RSS/Atom 均为 RSS 2.0 结构，无需额外鉴权
# filter_zh=True 的源用中文关键词过滤，且只匹配标题——这些站的 description 是
# 全文正文，拿正文匹配会把「Claude 聊天记录泄露」这类误判成机器人新闻。
RSS_FEEDS = [
    # Boston Dynamics 的 feed 现在是空壳（HTTP 200 但 0 个 item），/blog/feed、
    # /news/feed、/rss.xml 全部 404，官方已没有可用 RSS。留着只会让健康告警
    # 长期误报，反而让人忽略真正的失效，先下线；他家动态由 IEEE Spectrum
    # 和 TechCrunch 间接覆盖。
    # {"name": "Boston Dynamics", "url": "https://bostondynamics.com/feed/", "filter": False},
    # The Robot Report 自 2026-08 起对所有 UA 返回 403（换浏览器 UA 也不行），
    # 暂时下线。它原本是最大的非 arXiv 来源，用 TechCrunch Robotics 顶替产业新闻缺口。
    # {"name": "The Robot Report", "url": "https://www.therobotreport.com/feed/", "filter": False},
    {"name": "TechCrunch Robotics", "url": "https://techcrunch.com/category/robotics/feed/", "filter": False},
    {"name": "IEEE Spectrum Robotics", "url": "https://spectrum.ieee.org/feeds/topic/robotics.rss", "filter": False},
    {"name": "Google DeepMind", "url": "https://deepmind.google/blog/rss.xml", "filter": True},
    {"name": "NVIDIA Blog", "url": "https://blogs.nvidia.com/feed/", "filter": True},
    {"name": "Hugging Face Blog", "url": "https://huggingface.co/blog/feed.xml", "filter": True},
    # 量子位「具身智能」tag：实测 100% 对口、当天更新，不需要过滤。
    # 带 cache-busting 参数是保险措施（该站曾被观察到返回陈旧缓存副本）。
    {
        "name": "量子位",
        "url": "https://www.qbitai.com/tag/具身智能/feed",
        "filter": False,
        "cache_bust": True,
    },
    # 雷峰网全站噪声极大（实测 12 条标题 0 条机器人内容），必须开中文标题过滤
    {
        "name": "雷峰网",
        "url": "https://www.leiphone.com/feed",
        "filter": False,
        "filter_zh": True,
    },
]

# filter=True 的源内容比较杂（不止讲机器人），标题+摘要要命中下面关键词才收录
KEYWORDS = [
    "embodied", "humanoid", "robot", "robotics", "manipulation", "locomotion",
    "vision-language-action", "vla", "dexterous", "quadruped", "bipedal",
    "teleoperation", "sim-to-real", "world model",
]

# filter_zh=True 的中文源用这套关键词，只匹配标题。
# 除了通用术语，还要放国内机器人公司名——实测「宇树科技员工认购IPO」这类
# 明显相关的新闻，只靠通用词会被漏掉。
KEYWORDS_ZH = [
    "机器人", "具身", "人形", "四足", "机械臂", "灵巧手", "遥操作",
    "世界模型", "仿真", "自动驾驶", "无人机", "机器狗",
    "vla", "embodied",
    # 术语
    "物理智能", "实体智能", "操作数据", "数据引擎", "动捕", "仿生",
    # 国内厂商
    "宇树", "智元", "银河通用", "傅利叶", "优必选", "云深处", "众擎", "星动纪元",
]

HN_QUERIES = ["humanoid robot", "embodied AI", "robot learning", "vision language action"]
HN_MAX_PER_QUERY = 15
# 低于这个分数的 HN 帖子基本没人看过（实测 47 条里 26 条 ≤2 分），纯噪声，不收录
HN_MIN_POINTS = 3

# 超过这么多天的旧条目不再保留在 events.json 里，避免文件无限膨胀
MAX_AGE_DAYS = 120

# 公司/机构标签：命中别名（大小写不敏感的子串匹配）就打上对应标签
# 别名要选足够specific的写法，避免"Figure"这种词跟论文里的"figure 1"之类误命中
ENTITIES = {
    "Tesla Optimus": ["tesla optimus", "optimus robot"],
    "Figure AI": ["figure ai", "figure 02", "figure03", "figure 03"],
    "1X Technologies": ["1x technologies", "1x neo robot", "1x's neo"],
    "Unitree": ["unitree"],
    "Boston Dynamics": ["boston dynamics"],
    "Physical Intelligence": ["physical intelligence"],
    "Agility Robotics": ["agility robotics", "digit robot"],
    "Sanctuary AI": ["sanctuary ai"],
    "Apptronik": ["apptronik"],
    "Google DeepMind": ["deepmind"],
    "NVIDIA": ["nvidia"],
    "Skild AI": ["skild ai"],
    "Covariant": ["covariant"],
    "OpenAI": ["openai"],
    "Meta AI": ["meta ai", "meta fair"],
    "UBTech": ["ubtech"],
    "AgiBot 智元": ["agibot"],
    "Fourier Intelligence": ["fourier intelligence"],
    "Galbot": ["galbot"],
}

# 研究方向标签：命中别名（大小写不敏感的子串匹配）就打上对应方向标签
# 顺序即前端调色板分配顺序，改了这里要同步改 site/app.js 里的 TOPIC_COLORS
# 上限 8 个——调色板只有 8 个通过色盲校验的槽位，不能再加第 9 个方向（会生成
# 无法区分的颜色）。想再细分请用下面的 KINDS（不占颜色）。
TOPICS = {
    "人形机器人": ["humanoid robot", "humanoid", "bipedal humanoid", "human-like robot"],
    "灵巧手与操作": [
        "dexterous", "in-hand manipulation", "multi-fingered hand",
        "robotic grasping", "grasp planning", "manipulation policy",
        "manipulation", "grasp", "gripper", "pick-and-place", "pick and place",
        "contact-rich", "assembly",
    ],
    "移动与四足": [
        "quadruped", "legged locomotion", "bipedal locomotion",
        "gait control", "legged robot", "locomotion", "navigation",
        "mobile robot", "mobile manipulation", "whole-body",
    ],
    "VLA与基础模型": [
        "vision-language-action", "vla model", "robot foundation model",
        "generalist robot policy", "robotics foundation model",
        "vision-language", "vla", "foundation model", "generalist policy",
        "diffusion policy", "policy learning", "imitation learning",
        "behavior cloning", "language-conditioned", "language model",
    ],
    "仿真与Sim2Real": [
        "sim-to-real", "sim2real", "domain randomization",
        "isaac gym", "isaac sim", "mujoco simulation",
        "simulation", "simulator", "mujoco", "isaac", "benchmark",
    ],
    "遥操作与数据采集": [
        "teleoperation", "teleop", "human demonstration data",
        "robot data collection", "motion capture for robot",
        "demonstration", "data collection", "dataset", "data engine",
    ],
    "世界模型": [
        "world model", "video prediction model", "learned dynamics model",
        "predictive world model", "world action model", "video prediction",
        "dynamics model", "model-based",
    ],
    "感知与传感": [
        "tactile", "perception", "slam", "sensor", "sensing", "lidar",
        "depth camera", "visual representation", "point cloud", "3d reconstruction",
    ],
}

# 内容类型：和研究方向正交的第二维（一条新闻可以既是「人形机器人」又是「产业动态」）。
# 不占调色板槽位，前端用纯文字标签渲染，所以可以自由增加。
KINDS = {
    "产业动态": [
        "raises", "funding", "series a", "series b", "series c", "acquires",
        "acquisition", "valuation", "revenue", "ipo", "merger", "investment",
        "shutting down", "dissolve", "startup", "market",
    ],
    "医疗应用": [
        "surgical", "surgery", "surgeon", "medical", "catheter",
        "hospital", "clinical", "patient", "rehabilitation",
    ],
    "无人机": ["drone", "uav", "aerial", "quadrotor", "unmanned aerial"],
    "安全与可信": [
        "safety", "trustworthy", "risk", "verification",
        "robustness", "collision avoidance", "reliability",
    ],
}
