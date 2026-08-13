// 技能词典唯一真源（契约 §1/§2）：JD 引擎与简历引擎共用本文件，禁止复制第二份。
// 每项：{ name 规范名, domain 领域, aliases 别名（中英文/缩写，匹配不区分大小写） }。
// 英文别名匹配带词边界（防 js 命中 json、Java 命中 JavaScript）；中文别名子串匹配。

export const SKILLS = [
  // ---------- 后端 ----------
  { name: 'Java', domain: '后端' },
  { name: 'Go', domain: '后端', aliases: ['golang', 'go语言'] },
  { name: 'Python', domain: '后端', aliases: ['python3'] },
  { name: 'C++', domain: '后端', aliases: ['cpp', 'c加加'] },
  { name: 'C#', domain: '后端', aliases: ['csharp'] },
  { name: 'C语言', domain: '后端' },
  { name: 'PHP', domain: '后端' },
  { name: 'Ruby', domain: '后端' },
  { name: 'Rust', domain: '后端' },
  { name: 'Kotlin', domain: '后端' },
  { name: 'Scala', domain: '后端' },
  { name: 'Node.js', domain: '后端', aliases: ['nodejs', 'node'] },
  { name: 'Spring', domain: '后端' },
  { name: 'Spring Boot', domain: '后端', aliases: ['springboot'] },
  { name: 'Spring Cloud', domain: '后端', aliases: ['springcloud'] },
  { name: 'MyBatis', domain: '后端' },
  { name: 'Django', domain: '后端' },
  { name: 'Flask', domain: '后端' },
  { name: 'FastAPI', domain: '后端' },
  { name: 'Gin', domain: '后端' },
  { name: 'gRPC', domain: '后端' },
  { name: 'GraphQL', domain: '后端' },
  { name: 'RESTful API', domain: '后端', aliases: ['restful', 'rest api'] },
  { name: '微服务', domain: '后端', aliases: ['microservice', 'microservices'] },
  { name: '分布式系统', domain: '后端', aliases: ['分布式'] },
  { name: '消息队列', domain: '后端', aliases: ['mq'] },
  { name: 'Kafka', domain: '后端' },
  { name: 'RabbitMQ', domain: '后端' },
  { name: 'RocketMQ', domain: '后端' },
  { name: 'Redis', domain: '后端' },
  { name: 'MySQL', domain: '后端' },
  { name: 'PostgreSQL', domain: '后端', aliases: ['postgres', 'pgsql'] },
  { name: 'MongoDB', domain: '后端', aliases: ['mongo'] },
  { name: 'Elasticsearch', domain: '后端', aliases: ['elastic search'] },
  { name: 'Oracle', domain: '后端' },
  { name: 'SQL Server', domain: '后端', aliases: ['sqlserver'] },
  { name: 'SQLite', domain: '后端' },
  { name: 'HBase', domain: '后端' },
  { name: 'Cassandra', domain: '后端' },
  { name: 'ZooKeeper', domain: '后端' },
  { name: 'Dubbo', domain: '后端' },
  { name: 'Netty', domain: '后端' },
  { name: 'JVM', domain: '后端' },
  { name: '高并发', domain: '后端', aliases: ['并发编程'] },
  { name: '分库分表', domain: '后端' },
  { name: '缓存', domain: '后端' },
  { name: '分布式事务', domain: '后端' },
  { name: '系统设计', domain: '后端', aliases: ['架构设计'] },

  // ---------- 前端 ----------
  { name: 'JavaScript', domain: '前端', aliases: ['js', 'es6', 'ecmascript'] },
  { name: 'TypeScript', domain: '前端', aliases: ['ts'] },
  { name: 'HTML', domain: '前端', aliases: ['html5'] },
  { name: 'CSS', domain: '前端', aliases: ['css3'] },
  { name: 'React', domain: '前端', aliases: ['react.js', 'reactjs'] },
  { name: 'Vue', domain: '前端', aliases: ['vue.js', 'vuejs', 'vue3'] },
  { name: 'Angular', domain: '前端' },
  { name: 'Svelte', domain: '前端' },
  { name: 'jQuery', domain: '前端' },
  { name: 'Webpack', domain: '前端' },
  { name: 'Vite', domain: '前端' },
  { name: 'Rollup', domain: '前端' },
  { name: 'Babel', domain: '前端' },
  { name: 'ESLint', domain: '前端' },
  { name: 'Sass', domain: '前端', aliases: ['scss'] },
  { name: 'Less', domain: '前端' },
  { name: 'Tailwind CSS', domain: '前端', aliases: ['tailwind', 'tailwindcss'] },
  { name: 'Next.js', domain: '前端', aliases: ['nextjs'] },
  { name: 'Nuxt', domain: '前端', aliases: ['nuxt.js', 'nuxtjs'] },
  { name: '小程序', domain: '前端', aliases: ['微信小程序'] },
  { name: 'uni-app', domain: '前端', aliases: ['uniapp'] },
  { name: 'Electron', domain: '前端' },
  { name: 'React Native', domain: '前端', aliases: ['rn'] },
  { name: 'Flutter', domain: '前端' },
  { name: '前端工程化', domain: '前端' },
  { name: '性能优化', domain: '前端' },
  { name: '浏览器原理', domain: '前端', aliases: ['浏览器渲染'] },
  { name: 'WebSocket', domain: '前端' },
  { name: 'PWA', domain: '前端' },
  { name: 'Canvas', domain: '前端' },
  { name: 'WebGL', domain: '前端' },
  { name: '响应式设计', domain: '前端', aliases: ['响应式布局'] },
  { name: '组件库', domain: '前端', aliases: ['组件化'] },
  { name: 'Redux', domain: '前端' },
  { name: 'MobX', domain: '前端' },
  { name: 'Pinia', domain: '前端' },

  // ---------- 算法 ----------
  { name: '机器学习', domain: '算法', aliases: ['machine learning'] },
  { name: '深度学习', domain: '算法', aliases: ['deep learning'] },
  { name: 'NLP', domain: '算法', aliases: ['自然语言处理'] },
  { name: '计算机视觉', domain: '算法', aliases: ['computer vision'] },
  { name: '推荐系统', domain: '算法', aliases: ['推荐算法'] },
  { name: '强化学习', domain: '算法', aliases: ['reinforcement learning'] },
  { name: 'TensorFlow', domain: '算法', aliases: ['tf'] },
  { name: 'PyTorch', domain: '算法', aliases: ['torch'] },
  { name: 'Keras', domain: '算法' },
  { name: 'Scikit-learn', domain: '算法', aliases: ['sklearn'] },
  { name: 'XGBoost', domain: '算法', aliases: ['xgb'] },
  { name: 'LightGBM', domain: '算法', aliases: ['lgb'] },
  { name: 'Transformer', domain: '算法' },
  { name: 'BERT', domain: '算法' },
  { name: '大模型', domain: '算法', aliases: ['llm', 'gpt', '大语言模型'] },
  { name: 'Prompt工程', domain: '算法', aliases: ['prompt engineering', '提示词工程'] },
  { name: 'RAG', domain: '算法', aliases: ['检索增强生成'] },
  { name: '知识图谱', domain: '算法', aliases: ['knowledge graph'] },
  { name: '语音识别', domain: '算法', aliases: ['asr'] },
  { name: 'OCR', domain: '算法', aliases: ['文字识别'] },
  { name: '数据挖掘', domain: '算法', aliases: ['data mining'] },
  { name: '特征工程', domain: '算法' },
  { name: '模型部署', domain: '算法', aliases: ['模型上线'] },
  { name: 'CUDA', domain: '算法' },
  { name: 'OpenCV', domain: '算法' },

  // ---------- 数据 ----------
  { name: 'SQL', domain: '数据' },
  { name: 'Hive', domain: '数据' },
  { name: 'Spark', domain: '数据', aliases: ['pyspark'] },
  { name: 'Hadoop', domain: '数据' },
  { name: 'Flink', domain: '数据' },
  { name: '数据仓库', domain: '数据', aliases: ['数仓', 'data warehouse'] },
  { name: 'ETL', domain: '数据' },
  { name: '数据分析', domain: '数据', aliases: ['data analysis'] },
  { name: '数据可视化', domain: '数据', aliases: ['可视化报表'] },
  { name: 'Tableau', domain: '数据' },
  { name: 'Power BI', domain: '数据', aliases: ['powerbi'] },
  { name: 'Pandas', domain: '数据' },
  { name: 'NumPy', domain: '数据' },
  { name: 'A/B测试', domain: '数据', aliases: ['ab测试', 'ab实验', 'a/b实验'] },
  { name: '埋点', domain: '数据', aliases: ['埋点体系'] },
  { name: '指标体系', domain: '数据', aliases: ['指标口径'] },
  { name: 'ClickHouse', domain: '数据' },
  { name: 'Airflow', domain: '数据' },
  { name: 'Excel', domain: '数据' },
  { name: '用户画像', domain: '数据', aliases: ['画像体系'] },

  // ---------- 产品 ----------
  { name: '需求分析', domain: '产品', aliases: ['需求拆解'] },
  { name: '产品设计', domain: '产品' },
  { name: '原型设计', domain: '产品', aliases: ['原型图'] },
  { name: 'Axure', domain: '产品' },
  { name: 'Figma', domain: '产品' },
  { name: 'Sketch', domain: '产品' },
  { name: 'PRD', domain: '产品', aliases: ['需求文档'] },
  { name: '用户研究', domain: '产品', aliases: ['用户调研', '用户访谈'] },
  { name: '竞品分析', domain: '产品', aliases: ['竞品调研'] },
  { name: '产品路线图', domain: '产品', aliases: ['roadmap'] },
  { name: '商业化', domain: '产品', aliases: ['变现策略'] },
  { name: 'MVP', domain: '产品', aliases: ['最小可行产品'] },
  { name: '用户体验', domain: '产品', aliases: ['ux', '体验设计'] },
  { name: '数据驱动', domain: '产品', aliases: ['数据决策'] },
  { name: '项目管理', domain: '产品', aliases: ['敏捷开发', 'scrum'] },
  { name: 'B端产品', domain: '产品', aliases: ['tob产品', 'saas产品'] },

  // ---------- 运营 ----------
  { name: '内容运营', domain: '运营' },
  { name: '用户运营', domain: '运营' },
  { name: '活动运营', domain: '运营', aliases: ['活动策划'] },
  { name: '社群运营', domain: '运营', aliases: ['社区运营'] },
  { name: '新媒体运营', domain: '运营', aliases: ['新媒体'] },
  { name: '电商运营', domain: '运营', aliases: ['店铺运营'] },
  { name: '直播运营', domain: '运营', aliases: ['直播带货'] },
  { name: 'SEO', domain: '运营', aliases: ['搜索引擎优化'] },
  { name: 'SEM', domain: '运营', aliases: ['搜索竞价'] },
  { name: '广告投放', domain: '运营', aliases: ['信息流投放', '投放优化'] },
  { name: '私域流量', domain: '运营', aliases: ['私域运营'] },
  { name: '转化率优化', domain: '运营', aliases: ['cro', '转化优化'] },
  { name: '用户增长', domain: '运营', aliases: ['增长黑客', 'growth hacking'] },
  { name: '拉新', domain: '运营', aliases: ['获客'] },
  { name: '留存', domain: '运营', aliases: ['留存率'] },
  { name: '裂变', domain: '运营', aliases: ['裂变营销'] },
  { name: '文案', domain: '运营', aliases: ['文案策划'] },

  // ---------- 测试 ----------
  { name: '自动化测试', domain: '测试', aliases: ['测试自动化'] },
  { name: '单元测试', domain: '测试', aliases: ['unit test'] },
  { name: '接口测试', domain: '测试', aliases: ['api测试'] },
  { name: '性能测试', domain: '测试' },
  { name: '压力测试', domain: '测试', aliases: ['压测'] },
  { name: 'Selenium', domain: '测试' },
  { name: 'Appium', domain: '测试' },
  { name: 'JMeter', domain: '测试' },
  { name: 'Postman', domain: '测试' },
  { name: 'Pytest', domain: '测试' },
  { name: 'JUnit', domain: '测试' },
  { name: '测试用例', domain: '测试', aliases: ['用例设计'] },
  { name: '白盒测试', domain: '测试' },
  { name: '黑盒测试', domain: '测试' },
  { name: '回归测试', domain: '测试' },
  { name: 'Cypress', domain: '测试' },
  { name: 'Playwright', domain: '测试' },

  // ---------- 运维 ----------
  { name: 'Linux', domain: '运维', aliases: ['centos', 'ubuntu'] },
  { name: 'Docker', domain: '运维', aliases: ['容器化'] },
  { name: 'Kubernetes', domain: '运维', aliases: ['k8s'] },
  { name: 'CI/CD', domain: '运维', aliases: ['持续集成', '持续交付'] },
  { name: 'Jenkins', domain: '运维' },
  { name: 'GitLab CI', domain: '运维', aliases: ['gitlab-ci'] },
  { name: 'GitHub Actions', domain: '运维' },
  { name: 'Ansible', domain: '运维' },
  { name: 'Terraform', domain: '运维' },
  { name: 'Prometheus', domain: '运维' },
  { name: 'Grafana', domain: '运维' },
  { name: 'Nginx', domain: '运维' },
  { name: 'Shell脚本', domain: '运维', aliases: ['shell', 'bash'] },
  { name: '监控告警', domain: '运维', aliases: ['可观测性'] },
  { name: 'DevOps', domain: '运维' },
  { name: 'AWS', domain: '运维' },
  { name: '阿里云', domain: '运维', aliases: ['aliyun'] },
  { name: '腾讯云', domain: '运维' },
  { name: 'Azure', domain: '运维' },
  { name: '负载均衡', domain: '运维' },
  { name: '高可用', domain: '运维', aliases: ['容灾'] },
  { name: '网络安全', domain: '运维', aliases: ['渗透测试', '安全加固'] },
  { name: 'Git', domain: '运维', aliases: ['版本控制'] },
];

// 职级信号词：按优先级排序（先命中先判），管理 > 专家 > 高级 > 中级 > 初级 > 实习。
export const LEVEL_SIGNALS = [
  ['管理', ['技术经理', '研发经理', '开发经理', '部门总监', '技术总监', '总监', '部门主管', '团队管理', '带团队', '技术负责人', 'engineering manager', 'tech lead', 'team lead', 'cto']],
  ['专家', ['专家', '架构师', '首席', 'principal', 'staff engineer']],
  ['高级', ['高级', '资深', 'senior', '5年以上', '五年以上', '8年以上', '八年以上']],
  ['中级', ['中级', '3年以上', '三年以上', '3-5年']],
  ['初级', ['初级', 'junior', '应届', '1-3年', '毕业生']],
  ['实习', ['实习', 'intern', '在校生']],
];

// 领域信号词：直接出现即计分（权重高于技能域推断）。
export const DOMAIN_SIGNALS = {
  后端: ['后端', '服务端', '服务器端', 'backend'],
  前端: ['前端', 'frontend', 'web前端', 'h5'],
  算法: ['算法工程师', '算法岗', '人工智能', 'ai工程师'],
  数据: ['数据分析师', '数据开发', '大数据', '商业智能', '数据岗'],
  产品: ['产品经理', '产品岗', '产品策划'],
  运营: ['运营专员', '运营经理', '运营岗'],
  测试: ['测试工程师', '测试开发', '质量保障', 'qa'],
  运维: ['运维工程师', 'sre', '基础设施', '系统管理员'],
  移动端: ['移动端', '客户端开发', 'android', 'ios', '安卓'],
};

const ASCII_EDGE = 'A-Za-z0-9_+#';
const isAsciiOnly = (s) => /^[\x20-\x7e]+$/.test(s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ASCII 词带词边界（防 js 命中 json、Java 命中 JavaScript）；含中文的词做子串匹配。
export function toWordPattern(word) {
  const esc = escapeRe(word);
  if (isAsciiOnly(word)) {
    return new RegExp(`(?<![${ASCII_EDGE}])${esc}(?![${ASCII_EDGE}])`, 'gi');
  }
  return new RegExp(esc, 'gi');
}

export function countOccurrences(text, word) {
  if (typeof text !== 'string' || !text) return 0;
  const m = text.match(toWordPattern(word));
  return m ? m.length : 0;
}

// 预编译匹配器（模块级一次性构建）。
const MATCHERS = SKILLS.map((s) => ({
  name: s.name,
  domain: s.domain,
  patterns: [s.name, ...(s.aliases ?? [])].map(toWordPattern),
}));

// 从自由文本抽取命中的技能，返回 [{ name, domain, count }]（按词典顺序，已归一去重）。
export function extractSkills(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  for (const m of MATCHERS) {
    let count = 0;
    for (const p of m.patterns) {
      p.lastIndex = 0;
      const hits = text.match(p);
      if (hits) count += hits.length;
    }
    if (count > 0) found.push({ name: m.name, domain: m.domain, count });
  }
  return found;
}

const ALIAS_INDEX = new Map();
for (const s of SKILLS) {
  for (const a of [s.name, ...(s.aliases ?? [])]) ALIAS_INDEX.set(a.toLowerCase(), s.name);
}

// 单词归一：'js' -> 'JavaScript'；查不到返回 null。
export function normalizeSkill(token) {
  if (typeof token !== 'string') return null;
  return ALIAS_INDEX.get(token.trim().toLowerCase()) ?? null;
}

// 供出题引擎查技能所属领域。
const DOMAIN_INDEX = new Map(SKILLS.map((s) => [s.name, s.domain]));
export function skillDomain(name) {
  return DOMAIN_INDEX.get(name) ?? null;
}
