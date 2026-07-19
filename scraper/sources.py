# 数据源配置：往这里加/删条目即可调整抓取范围，不用碰 fetch.py 的逻辑。

ARXIV_QUERY = (
    "cat:cs.RO AND (abs:embodied OR abs:manipulation OR abs:humanoid "
    'OR abs:"vision-language-action" OR abs:"robot learning" OR abs:dexterous '
    'OR abs:locomotion OR abs:"sim-to-real")'
)
ARXIV_MAX_RESULTS = 30

# RSS/Atom 均为 RSS 2.0 结构，无需额外鉴权
RSS_FEEDS = [
    {"name": "Boston Dynamics", "url": "https://bostondynamics.com/feed/", "filter": False},
    {"name": "The Robot Report", "url": "https://www.therobotreport.com/feed/", "filter": False},
    {"name": "IEEE Spectrum Robotics", "url": "https://spectrum.ieee.org/feeds/topic/robotics.rss", "filter": False},
    {"name": "Google DeepMind", "url": "https://deepmind.google/blog/rss.xml", "filter": True},
    {"name": "NVIDIA Blog", "url": "https://blogs.nvidia.com/feed/", "filter": True},
    {"name": "Hugging Face Blog", "url": "https://huggingface.co/blog/feed.xml", "filter": True},
]

# filter=True 的源内容比较杂（不止讲机器人），标题+摘要要命中下面关键词才收录
KEYWORDS = [
    "embodied", "humanoid", "robot", "robotics", "manipulation", "locomotion",
    "vision-language-action", "vla", "dexterous", "quadruped", "bipedal",
    "teleoperation", "sim-to-real", "world model",
]

HN_QUERIES = ["humanoid robot", "embodied AI", "robot learning", "vision language action"]
HN_MAX_PER_QUERY = 15

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
