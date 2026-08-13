// 技能词典唯一真源（契约 §1/§2）：JD 引擎与简历引擎共用本文件，禁止复制第二份。
// 每项：{ name 规范名, domain 领域, aliases 别名（中英文/缩写，匹配不区分大小写） }。
// 英文别名匹配带词边界（防 js 命中 json、Java 命中 JavaScript）；中文别名子串匹配。
//
// V1.8 全行业 16 域（契约 §1 冻结枚举）：
// 技术类 后端/前端/算法/数据/测试/运维 ｜ 业务类 产品/运营/市场/销售/电商 ｜
// 职能类 财务/人力/设计/法务/行政 ｜ 兜底 通用（仅推断结果，无词条）。
// 归属判据（歧义词一律在此声明，不在调用方二次判断）：
// - SEM/SEO/广告投放/私域流量/活动策划 维持 V1 以来的「运营」归属（同一别名不得指向两个
//   技能，且并行施工线的抽样样例依赖此归属）；市场域以品牌/公关/媒介/度量类词条填充。
// - 电商运营/店铺运营/直播带货 归「电商」：平台店铺语境专属，本轮自运营域迁入。
// - 新媒体运营 归「运营」：内容渠道语境，不涉及店铺经营。
// - Figma/Sketch/Axure/原型设计/用户研究 维持「产品」归属（V1 既有）；设计域收录
//   视觉/动效/三维类工具与技艺。

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

  // ---------- 市场 ----------
  { name: '品牌营销', domain: '市场', aliases: ['品牌推广'] },
  { name: '市场调研', domain: '市场', aliases: ['市场洞察'] },
  { name: '整合营销', domain: '市场', aliases: ['imc'] },
  { name: '公关', domain: '市场', aliases: ['公共关系', '公关传播'] },
  { name: '媒介采买', domain: '市场', aliases: ['媒介投放', '媒介策略'] },
  { name: '品牌策划', domain: '市场', aliases: ['品牌定位'] },
  { name: '营销策划', domain: '市场', aliases: ['营销方案'] },
  { name: '内容营销', domain: '市场' },
  { name: '事件营销', domain: '市场', aliases: ['借势营销'] },
  { name: '口碑营销', domain: '市场' },
  { name: '市场分析', domain: '市场', aliases: ['行业分析'] },
  { name: '广告创意', domain: '市场', aliases: ['创意策划'] },
  { name: '品牌传播', domain: '市场' },
  { name: 'DSP', domain: '市场', aliases: ['程序化广告'] },
  { name: 'KOL营销', domain: '市场', aliases: ['kol投放', '红人营销'] },
  { name: '舆情监测', domain: '市场', aliases: ['舆情管理'] },
  { name: 'CPM', domain: '市场', aliases: ['千次曝光成本'] },
  { name: 'CPC', domain: '市场', aliases: ['点击成本'] },
  { name: 'ROI', domain: '市场', aliases: ['投资回报率', '投产比'] },

  // ---------- 销售 ----------
  { name: '大客户销售', domain: '销售', aliases: ['ka销售', '大客户开发'] },
  { name: '渠道管理', domain: '销售', aliases: ['渠道拓展', '渠道建设'] },
  { name: '商务谈判', domain: '销售', aliases: ['合同谈判'] },
  { name: 'CRM', domain: '销售', aliases: ['客户关系管理'] },
  { name: '销售漏斗', domain: '销售', aliases: ['销售管道', 'pipeline管理'] },
  { name: '回款管理', domain: '销售', aliases: ['催收回款', '应收催收'] },
  { name: '招投标', domain: '销售', aliases: ['投标', '标书'] },
  { name: '客情维护', domain: '销售', aliases: ['客户维护'] },
  { name: 'SaaS销售', domain: '销售', aliases: ['软件销售'] },
  { name: '电话销售', domain: '销售', aliases: ['电销'] },
  { name: '陌拜', domain: '销售', aliases: ['陌生拜访'] },
  { name: '售前支持', domain: '销售', aliases: ['售前方案'] },
  { name: '经销商管理', domain: '销售', aliases: ['分销管理'] },
  { name: '商机管理', domain: '销售', aliases: ['线索管理', '线索转化'] },
  { name: '解决方案销售', domain: '销售', aliases: ['顾问式销售'] },
  { name: '销售话术', domain: '销售', aliases: ['销售技巧'] },

  // ---------- 电商 ----------
  { name: '电商运营', domain: '电商', aliases: ['店铺运营'] }, // 自运营域迁入（V1.8，判据见头注释）
  { name: '直播运营', domain: '电商', aliases: ['直播带货'] }, // 自运营域迁入（V1.8）
  { name: '直通车', domain: '电商', aliases: ['万相台'] },
  { name: 'GMV', domain: '电商', aliases: ['成交总额'] },
  { name: '客单价', domain: '电商' },
  { name: '详情页转化', domain: '电商', aliases: ['详情页优化'] },
  { name: '供应链选品', domain: '电商', aliases: ['选品'] },
  { name: '达人分销', domain: '电商', aliases: ['达人合作', '达人带货'] },
  { name: '平台规则', domain: '电商', aliases: ['类目规则'] },
  { name: '天猫', domain: '电商', aliases: ['tmall'] },
  { name: '京东', domain: '电商' },
  { name: '拼多多', domain: '电商' },
  { name: '抖店', domain: '电商', aliases: ['抖音小店', '抖音电商'] },
  { name: '淘宝', domain: '电商', aliases: ['taobao'] },
  { name: '亚马逊', domain: '电商', aliases: ['amazon'] },
  { name: '跨境电商', domain: '电商', aliases: ['出海电商'] },
  { name: '店铺装修', domain: '电商' },
  { name: '复购率', domain: '电商' },

  // ---------- 财务 ----------
  { name: '会计分录', domain: '财务', aliases: ['记账凭证'] },
  { name: '财务报表', domain: '财务', aliases: ['财报三表', '三大报表'] },
  { name: '成本核算', domain: '财务', aliases: ['成本管理'] },
  { name: '预算管理', domain: '财务', aliases: ['全面预算'] },
  { name: '税务申报', domain: '财务', aliases: ['报税', '纳税申报', '税务筹划'] },
  { name: '审计', domain: '财务', aliases: ['审计对接'] },
  { name: '应收应付', domain: '财务', aliases: ['应收账款', '应付账款'] },
  { name: 'ERP', domain: '财务', aliases: ['用友', '金蝶', 'sap'] }, // 财务软件按任务口径归一到 ERP
  { name: 'CPA', domain: '财务', aliases: ['注册会计师'] },
  { name: '资金管理', domain: '财务', aliases: ['现金流管理'] },
  { name: '合并报表', domain: '财务' },
  { name: '内部控制', domain: '财务', aliases: ['内控'] },
  { name: '财务分析', domain: '财务', aliases: ['经营分析'] },
  { name: '发票管理', domain: '财务', aliases: ['开票'] },
  { name: '总账管理', domain: '财务', aliases: ['总账会计'] },
  { name: '固定资产核算', domain: '财务' }, // 「固定资产管理」归行政，此处限核算口径
  { name: 'CMA', domain: '财务', aliases: ['管理会计师'] },

  // ---------- 人力 ----------
  { name: '招聘', domain: '人力', aliases: ['人才招聘', '招聘交付'] },
  { name: '薪酬绩效', domain: '人力', aliases: ['薪酬管理', '薪酬体系'] },
  { name: '员工关系', domain: '人力', aliases: ['er管理'] },
  { name: '培训发展', domain: '人力', aliases: ['培训体系', '学习发展'] },
  { name: 'HRBP', domain: '人力', aliases: ['业务伙伴'] },
  { name: '组织发展', domain: '人力', aliases: ['od'] },
  { name: '社保公积金', domain: '人力', aliases: ['五险一金'] },
  { name: '劳动法', domain: '人力', aliases: ['劳动合同法'] },
  { name: '人才盘点', domain: '人力', aliases: ['人才梯队'] },
  { name: '雇主品牌', domain: '人力' },
  { name: '猎头合作', domain: '人力', aliases: ['猎头渠道'] },
  { name: '入离职管理', domain: '人力', aliases: ['入职办理', '离职办理'] },
  { name: '人力资源规划', domain: '人力', aliases: ['hr规划'] },
  { name: '胜任力模型', domain: '人力', aliases: ['任职资格体系'] },
  { name: '背景调查', domain: '人力', aliases: ['背调'] },
  { name: '校园招聘', domain: '人力', aliases: ['校招'] },

  // ---------- 设计 ----------
  { name: 'UI设计', domain: '设计', aliases: ['界面设计'] },
  { name: '交互设计', domain: '设计', aliases: ['ixd'] },
  { name: '视觉设计', domain: '设计', aliases: ['视觉表现'] },
  { name: '平面设计', domain: '设计', aliases: ['图形设计'] },
  { name: '品牌VI', domain: '设计', aliases: ['vi设计', '视觉识别系统'] },
  { name: '设计规范', domain: '设计', aliases: ['设计系统', 'design system'] },
  { name: 'Photoshop', domain: '设计', aliases: ['ps'] },
  { name: 'Illustrator', domain: '设计' },
  { name: 'After Effects', domain: '设计', aliases: ['ae动效'] },
  { name: 'C4D', domain: '设计', aliases: ['cinema 4d'] },
  { name: 'Blender', domain: '设计' },
  { name: '动效设计', domain: '设计', aliases: ['动画设计'] },
  { name: '插画', domain: '设计', aliases: ['商业插画'] },
  { name: '字体设计', domain: '设计', aliases: ['排版设计'] },
  { name: '三维建模', domain: '设计', aliases: ['3d建模'] },
  { name: '可用性测试', domain: '设计' },
  { name: '手绘', domain: '设计', aliases: ['手绘能力'] },

  // ---------- 法务 ----------
  { name: '合同审查', domain: '法务', aliases: ['合同审核', '合同起草'] },
  { name: '合规', domain: '法务', aliases: ['合规管理'] },
  { name: '知识产权', domain: '法务', aliases: ['ip布局'] },
  { name: '商标', domain: '法务', aliases: ['商标注册'] },
  { name: '专利', domain: '法务', aliases: ['专利申请'] },
  { name: '劳动争议', domain: '法务', aliases: ['劳动仲裁'] },
  { name: '诉讼仲裁', domain: '法务', aliases: ['诉讼', '商事仲裁'] },
  { name: '尽职调查', domain: '法务', aliases: ['尽调'] },
  { name: '公司治理', domain: '法务', aliases: ['股东会', '董事会事务'] },
  { name: '数据合规', domain: '法务', aliases: ['个人信息保护', 'gdpr'] },
  { name: '法律检索', domain: '法务', aliases: ['案例检索'] },
  { name: '股权激励', domain: '法务', aliases: ['期权方案'] },
  { name: '反垄断', domain: '法务', aliases: ['反不正当竞争'] },
  { name: '法律意见书', domain: '法务' },
  { name: '法律风险防控', domain: '法务', aliases: ['法律风险'] },
  { name: '律师函', domain: '法务' },

  // ---------- 行政 ----------
  { name: '行政管理', domain: '行政', aliases: ['行政统筹'] },
  { name: '办公采购', domain: '行政', aliases: ['办公用品采购', '行政采购'] },
  { name: '会务接待', domain: '行政', aliases: ['会议接待', '会务安排'] },
  { name: '固定资产管理', domain: '行政', aliases: ['资产盘点'] },
  { name: '差旅管理', domain: '行政', aliases: ['差旅报销'] },
  { name: '前台接待', domain: '行政', aliases: ['前台'] },
  { name: '文档管理', domain: '行政', aliases: ['档案管理'] },
  { name: '供应商管理', domain: '行政', aliases: ['供应商比价'] },
  { name: '办公室管理', domain: '行政', aliases: ['办公环境管理'] },
  { name: '车辆管理', domain: '行政', aliases: ['公车管理'] },
  { name: '证照办理', domain: '行政', aliases: ['证照年检'] },
  { name: '印章管理', domain: '行政', aliases: ['用印管理'] },
  { name: '团建组织', domain: '行政', aliases: ['团建策划'] },
  { name: '访客管理', domain: '行政' },
  { name: '工位管理', domain: '行政', aliases: ['工位规划'] },
  { name: '快递收发', domain: '行政', aliases: ['邮件收发'] },
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

// 领域信号词：直接出现即计分（权重高于技能域推断）。域名以契约 §1 冻结 16 域枚举为准。
// 歧义岗位名判据：
// - 「电商运营/店铺运营」→ 电商：平台店铺经营语境专属，即便含「运营」字样也归电商
//   （信号双计时电商侧得分更高，parseJD 实测归电商，测试有断言守着）。
// - 「新媒体运营」→ 运营：内容渠道语境，不涉及店铺经营。
// - 移动端岗位（android/ios/客户端）并入「前端」：冻结枚举无移动端域，且 RN/Flutter
//   等移动技能词条本就归前端（V1.8 起原移动端信号迁入前端）。
export const DOMAIN_SIGNALS = {
  后端: ['后端', '服务端', '服务器端', 'backend'],
  前端: ['前端', 'frontend', 'web前端', 'h5', '移动端', '客户端开发', 'android', 'ios', '安卓'],
  算法: ['算法工程师', '算法岗', '人工智能', 'ai工程师'],
  数据: ['数据分析师', '数据开发', '大数据', '商业智能', '数据岗'],
  产品: ['产品经理', '产品岗', '产品策划'],
  运营: ['运营专员', '运营经理', '运营岗', '新媒体运营'],
  测试: ['测试工程师', '测试开发', '质量保障', 'qa'],
  运维: ['运维工程师', 'sre', '基础设施', '系统管理员'],
  市场: ['市场营销', '市场推广', '市场专员', '市场总监', '品牌经理', 'marketing'],
  销售: ['销售代表', '销售经理', '销售专员', '客户经理', 'bd经理', '商务拓展'],
  电商: ['电商运营', '店铺运营', '电商专员', '电商经理', '淘宝运营', '天猫运营', '抖店运营'],
  财务: ['会计', '出纳', '财务bp', '财务经理', '财务分析师', '税务专员', '审计师'],
  人力: ['hrbp', '人事', '人力资源', '招聘专员', 'hr专员', '薪酬专员'],
  设计: ['设计师', 'ui设计师', 'ued', '视觉设计师', '交互设计师', '美工'],
  法务: ['法务', '律师', '法律顾问', '合规专员'],
  行政: ['行政专员', '行政经理', '行政助理', '行政主管', '办公室主任', '总务'],
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
