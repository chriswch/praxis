> 「決策科學方法目錄」系列 · I. 產品營運分析與指標 · 共 15 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 海盜指標 (AARRR / Pirate Metrics) · fit 5
*aka / 出處:* Pirate Metrics；Dave McClure（500 Startups）2007 提出；Acquisition/Activation/Retention/Revenue/Referral
- **是什麼**:把使用者生命週期拆成五個階段：取得 (Acquisition)、啟用/啊哈時刻 (Activation)、留存 (Retention)、營收 (Revenue)、推薦 (Referral)，每階段各有自己的指標，讓團隊看清漏斗哪一段最痛、最該優先投入。
- **用在決策流程**:做季度規劃時，先用 AARRR 為每階段填上當前數字與轉換率，找出「漏得最兇」的那一段而非憑感覺挑題目；資源依瓶頸階段分配，而不是平均灑在五個階段。McClure 原始主張並建議把約 80% 力氣放在優化既有功能、20% 放新功能。
- **問對問題**:看到註冊數成長時要問：『這是 Acquisition 變好還是只是行銷檔期？後面的 Activation / Retention 有跟上嗎？』避免只盯漏斗頂端的 vanity 成長。
- **軟體工程**:把五階段對應到後端事件埋點 schema：在多租戶電商把 signup、first_product_view、add_to_cart、first_order、repeat_order、referral_invite 定義為標準事件，讓每個 tenant 的漏斗都能用同一套查詢計算，避免各 feature team 各自定義事件造成口徑不一。
- **產品開發**:新功能上線前先標註它服務 AARRR 哪一階段（例如『一鍵再購』屬 Retention/Revenue），驗收時只看該階段指標，避免用註冊數這種不相關指標來宣稱成功。
- **營運分析**:為平台搭一個跨 tenant 的 AARRR 儀表板，找出哪一類商家在哪一階段掉得最多（例如新開店家卡在 Activation＝首次成功上架商品），把 CS／導入流程資源導向該段。
- **策略**:用 AARRR 判斷成長模式：若 Referral 強可投資病毒成長 (如 Dropbox 推薦贈空間)；若 Retention 弱則先別加碼買流量，否則是往漏桶倒水。
- **2026**:2025 年仍被廣泛使用，訂閱制／PLG 產品尤甚；現代用法強調把漏斗看成『迴圈 (loops)』而非線性，且 Revenue 段常直接接 NRR/MRR。批評：對非交易型或長銷售週期 B2B 過於簡化。
- 來源:https://amplitude.com/blog/pirate-metrics-framework, https://www.inc.com/walter-chen/aarrr-dave-mcclure-s-pirate-metrics-and-the-only-five-numbers-that-matter.html, https://fourweekmba.com/pirate-metrics/

### 北極星指標與投入指標 (North Star Metric + Input Metrics) · fit 5
*aka / 出處:* NSM；North Star Framework；John Cutler / Amplitude《The North Star Playbook》
- **是什麼**:選一個最能代表『顧客從產品獲得的價值』的單一指標當北極星，並在其下定義一組能被團隊日常工作直接影響、且能預測北極星移動的投入指標 (input metrics)。北極星必須是營收的領先指標，而不是營收本身。
- **用在決策流程**:用『北極星 = f(input1, input2, …)』的關係來排優先序：每個提案先回答它推動哪個 input、預期推動多少，再回推對北極星的影響；季度目標下到 input 層而非只喊北極星。Amplitude 三準則：表達使用者價值、在產品與行銷可影響範圍內、是營收的領先指標。
- **問對問題**:選指標時問：『這個數字漲了，顧客真的獲得更多價值嗎？還是只是 vanity（如累計註冊數）？』以及『哪 3–5 個 input 合起來會推動它？哪個是我們最弱的槓桿？』
- **軟體工程**:把北極星的 input 拆解直接對映到可監控的事件指標與 SLO，例如電商北極星設為『每週完成訂單的活躍買家數』，input 之一是『結帳成功率』，工程團隊就把結帳 API 的成功率/延遲當作可直接負責、可告警的 input。
- **產品開發**:避免把 MRR/ARPU 當北極星（那是落後指標），改用『產生價值的行為』如『每月有完成≥1筆訂單的店家數』，新功能 roadmap 依其對 input 的貢獻排序。
- **營運分析**:在多租戶平台為不同商家分群各設可比的 input metrics，建立北極星樹狀儀表板，讓營運能看到是哪個 input 段拖累整體北極星。
- **策略**:北極星把客戶價值、產品能力、商業目標三方對齊成一句共同語言，讓全公司資源不被『成功劇場 (success theater)』與 shiny objects 帶偏。
- **2026**:2025/2026 仍是主流對齊工具；Ravi Mehta 等人提出批評，認為單一北極星可能過度簡化、團隊應有多個對等的 input。實務上常與 metric tree 合用，把北極星當樹根。
- 來源:https://amplitude.com/books/north-star/about-north-star-framework, https://amplitude.com/blog/good-bad-north-star-metric, https://blog.ravi-mehta.com/p/your-product-team-doesnt-need-a-north

### 世代分析與留存曲線 (Cohort Analysis & Retention Curve) · fit 5
*aka / 出處:* Cohort retention；留存曲線『微笑/變平 (smile/flatten)』；retention plateau
- **是什麼**:把使用者依加入時間（或其他屬性）分群，追蹤每一群隨時間的留存，畫成留存曲線。健康型態是先下滑後『變平 (flatten)』甚至回升（微笑曲線），代表找到一群真正持續獲得價值的核心使用者。
- **用在決策流程**:判斷 PMF 與改版成效看『曲線形狀』而非單一留存數字：曲線變平＝有 PMF，持續下滑＝核心使用者還沒出現。比較不同月份 cohort，若新 cohort 更早變平，代表近期產品調整奏效，可加碼該方向。
- **問對問題**:看到整體留存上升時要問：『是真的留存變好，還是只是近期 cohort 還沒走完、或混入了不同質的 cohort？』形狀比數字更會說真話。
- **軟體工程**:用 SQL/事件倉儲建可重跑的 cohort 查詢（依 tenant 註冊週為 cohort），把『新版本上線』標在時間軸上，量測該版本後 cohort 的留存是否變平，作為 release 是否成功的客觀證據。
- **產品開發**:上線 onboarding 改版後，比較改版前後 cohort 的次週留存，驗證『啊哈時刻』是否真的提早，而不是只看當週 DAU 跳動。
- **營運分析**:為平台商家做『商家存活 cohort』：依開店月份追蹤 N 個月後仍有營業額的比例，找出哪批商家在第幾個月集中流失，回推導入流程問題。
- **策略**:留存曲線是否變平是『是否該加碼買流量』的紅綠燈：曲線仍下滑時擴張獲客＝往漏桶倒水。
- **2026**:2026 文章特別提醒要把『AI 觀光客 (AI tourists)』與真實留存使用者分開——靠 AI 噱頭吸引的一次性使用者會讓 cohort 早期虛胖、後期崩塌，分析時須以行為深度而非單純活躍與否分群。
- 來源:https://amplitude.com/explore/analytics/cohort-retention-analysis, https://countly.com/blog/the-complete-guide-to-measuring-user-retention-cohorts-curves-benchmarks, https://userpilot.com/blog/cohort-retention-analysis/

### 漏斗分析 (Funnel Analysis) · fit 5
*aka / 出處:* Conversion funnel analysis；drop-off / step conversion analysis
- **是什麼**:把一個多步驟流程（如註冊或結帳）定義成有序步驟，量測每一步到下一步的轉換率，找出掉最兇的步驟。關鍵是別停在『畫出漏斗圖』，而要進一步診斷 why。
- **用在決策流程**:依各步驟掉幅排序優先級，先修轉換損失最大的那一步；把掉點原因歸到四類——認知落差、動機落差、摩擦 (friction)、技術問題——再對症下藥（文案/誘因/UX/修 bug）。
- **問對問題**:看到結帳轉換低時要問：『使用者是不知道下一步（認知）、不想做（動機）、卡關（摩擦）、還是壞了（技術）？』四類原因對應完全不同的解法。
- **軟體工程**:結帳漏斗某步驟轉換異常下降時，先查是不是技術問題：交叉比對該步驟的前端錯誤率、API 5xx、特定瀏覽器/裝置/金流通道的失敗率——很多『轉換掉』其實是 regression bug，不是 UX 問題。
- **產品開發**:在重做加購/組合商品流程時，先量現況漏斗，改版後逐步比較，量化是哪一步被改善，避免改了很多步卻不知哪步有效。
- **營運分析**:把漏斗按 tenant/裝置/流量來源分群，找出『某金流通道結帳成功率特別低』這種被總體數字掩蓋的局部問題。
- **策略**:漏斗讓你判斷成長瓶頸在獲客還是轉換：若流量充足但中段大量流失，投資點應在產品轉換而非再加廣告預算。
- **2026**:2026 最佳實務是量化＋質化同流程：漏斗圖找出 where，session replay/熱圖/訪談找出 why；多層證據彼此印證才下結論。多數團隊的弱點仍是只做到步驟轉換、跳過診斷。
- 來源:https://plane.so/blog/conversion-funnel-analysis-for-product-managers-how-to-spot-drop-offs, https://www.datadoghq.com/blog/product-analytics-funnels/, https://uxcam.com/blog/conversion-funnel-analysis/

### LTV/CAC 與回收期 (LTV:CAC Ratio & CAC Payback) · fit 5
*aka / 出處:* Customer Lifetime Value / Customer Acquisition Cost；單位經濟 (unit economics)；CAC payback period
- **是什麼**:LTV:CAC 比較一位顧客的終身價值與取得成本；CAC payback 衡量要多久毛利才賺回取得該顧客的行銷業務成本。常見健康門檻 LTV:CAC ≥ 3:1（5:1+ 表效率很高），payback SMB <12 個月、Mid-Market <18 個月。
- **用在決策流程**:決定行銷投放與定價時，用 LTV:CAC 判斷『獲客是否划算』、用 payback 判斷『現金多久回得來』；現金吃緊時 payback 比 LTV 絕對值更關鍵。比率過高（如>5:1）有時代表『投資不足』，可加碼獲客。
- **問對問題**:問：『我的 LTV 是用 GRR 還是 NRR、用毛利還是營收算的？折現了嗎？』LTV 算法極易被灌水；也要問『payback 在不同通路/客群差多少？』
- **軟體工程**:為計算口徑一致，工程端要把『歸因到行銷的成本』與『每筆訂單毛利』正確落到資料模型（區分金流手續費、物流成本），否則 LTV/CAC 全是垃圾進垃圾出。
- **產品開發**:評估新功能（如訂閱方案、加購）對 LTV 的影響：若能提高回購頻次/客單價而拉長 LTV，即使短期不變現也值得做。
- **營運分析**:對不同商家分群算 LTV:CAC 與 payback，找出『獲客成本高但留存差』的賠錢客群，調整導入/方案策略。
- **策略**:LTV:CAC 與 payback 是擴張節奏的煞車：payback 拉長代表獲客效率惡化，該先修留存/變現再擴張；多數 B2B SaaS 健康 payback 約 6–12 個月。
- **2026**:2026 投資環境更重資本效率，payback 與 Rule of 40 受重視程度上升；benchmark（中位數約 3.2:1、payback 8–9 個月）來自彙整報告，分群差異大，引用時須註明來源與口徑。
- 來源:https://www.airtree.vc/open-source-vc/startup-metrics-cac-payback-and-ltv-cac-ratio, https://www.wallstreetprep.com/knowledge/ltv-cac-ratio/, https://www.fiscallion.io/blog/saas-unit-economics

### 淨/毛收入留存與流失 (NRR / GRR / Churn) · fit 5
*aka / 出處:* Net Revenue Retention；Gross Revenue Retention；Net Dollar Retention (NDR)；revenue/logo churn
- **是什麼**:GRR 衡量既有客戶留下的收入（不含擴張，永遠 ≤100%），NRR 含擴張（upsell/用量增加），>100% 代表光靠舊客就能成長。NRR 與 GRR 的差距反映擴張力道。
- **用在決策流程**:用 GRR 看『止血能力』（流失與降級嚴重程度）、用 NRR 看『擴張能力』；高 NRR + 高 GRR 是頂標，高 NRR + 低 GRR 是『被積極 upsell 掩蓋的漏桶』，要先修流失。董事會/募資以 NRR 為核心成長品質指標。
- **問對問題**:看到 NRR 漂亮時要問：『GRR 是多少？這 NRR 是少數大客戶擴張撐起來的、還是普遍健康？logo churn 是否其實很高？』NRR 高不等於客戶不流失。
- **軟體工程**:在計費系統中正確區分新客、擴張、收縮 (contraction)、流失 (churn) 四種 MRR 變動事件並落表，是 NRR/GRR 能算對的前提；多租戶下還要能 per-tenant 還原這些變動。
- **產品開發**:把『擴張型功能』（用量加值、加購方案、進階模組）的 roadmap 直接綁 NRR 目標；把降低 contraction/churn 的功能（如挽留流程）綁 GRR。
- **營運分析**:對商家分群算 NRR/GRR，找出哪個方案/規模級距的 GRR 特別低（純流失），導入 Customer Success 介入名單。
- **策略**:NRR 被視為 2026 最關鍵 SaaS 估值指標之一；B2B SaaS 中位數 NRR 約 108%、GRR 約 88%（差距約 12–20 個百分點），可用以對標自家健康度與成長品質。
- **2026**:2026 有報告指出 AI-native SaaS 留存普遍偏低（某報告稱中位 NRR 約 48%、GRR 約 40%），使市場更重視 GRR 而非只看 NRR。此數字來自單一來源，屬待查證宣稱。
- 來源:https://www.m3ter.com/blog/net-revenue-retention, https://www.growthspreeofficial.com/blogs/b2b-saas-nrr-grr-net-gross-revenue-retention-benchmarks-2026-by-acv-stage-vertical, https://blog.customerscore.io/gross-revenue-retention-the-saas-metric-that-reveals-your-true-retention-health/

### 指標樹 / KPI 拆解 (Metric Tree / KPI Tree, 套用 MECE) · fit 5
*aka / 出處:* KPI Tree；metric decomposition；MECE (Mutually Exclusive, Collectively Exhaustive)；Petra Wille / KPI Tree
- **是什麼**:把最上層成果指標（北極星/營收）用數學運算子逐層拆成驅動因子，形成有因果關係的指標樹，每一層盡量符合 MECE（彼此互斥、合計完整）。例：營收 = 顧客數 × 每客平均營收；顧客數 = 新客 + 回頭客 − 流失客。
- **用在決策流程**:做目標設定與題目排序時，沿樹找到『可被某團隊直接影響的葉節點』指派負責；資源投在槓桿最大的分支。MECE 確保沒有重複計算也沒有遺漏的驅動因子。
- **問對問題**:看到頂層指標動時，沿樹往下問：『是哪個分支造成的？是量 (volume) 變了還是率 (rate) 變了？』把『為什麼變』變成沿樹下鑽的結構化提問，而非亂猜。
- **軟體工程**:把指標樹當『可觀測性的指標契約』：每個葉節點對應一個明確 SQL/事件定義並進資料字典，避免不同 team 對『轉換率』各自口徑；樹結構也讓告警能定位到具體分支。
- **產品開發**:為一個 feature team 從北極星樹切出他們負責的子樹，roadmap 全部對映到該子樹的葉指標，確保每個功能都對上層成果有清楚的因果路徑。
- **營運分析**:用 GMV 樹（GMV = 訪客 × 轉換率 × 客單價）做多租戶歸因，立刻看出整體 GMV 下滑是流量、轉換還是客單價問題，再下鑽到 segment。
- **策略**:指標樹把『最高層商業目標』連到『團隊每天能動的營運槓桿』，是讓策略可被全公司理解與執行的橋樑。
- **2026**:2025/2026 出現 KPI Tree、metrics-tree 等工具與 AI agent，能半自動建樹並做異常下鑽歸因，但『樹該怎麼拆才 MECE、哪個分支才是真因果』仍需人判斷，避免把相關當因果。
- 來源:https://kpitree.co/guides/getting-started/how-to-build-a-metric-tree, https://www.petra-wille.com/blog/kpi-trees-how-to-bridge-the-gap-between-customer-behavior-product-metrics-and-company-goals, https://medium.com/@benjamin.dupont_49675/from-data-chaos-to-strategic-clarity-the-role-of-kpi-trees-in-product-management-d6eb0657fcfb

### 領先 vs 落後指標 (Leading vs Lagging Indicators) · fit 5
*aka / 出處:* Leading indicators / Lagging indicators；predictive vs outcome metrics
- **是什麼**:領先指標前瞻、貼近團隊日常工作、可被直接影響（如加入購物車率、啟用率）；落後指標回顧、衡量已發生的最終成果、團隊難以直接撼動（如 MRR、churn、NPS）。兩者搭配：領先指標讓你及早調整，落後指標衡量最終影響。
- **用在決策流程**:設目標時用領先指標當『每日方向盤』、落後指標當『成績單』；不要只用落後指標管理（等它動了已來不及），也不要只追領先指標而與成果脫鉤。每個落後指標都該找到能推動它的領先指標。
- **問對問題**:看到一個指標時問：『這是我能在本週改變的領先指標，還是只能事後檢討的落後指標？』『哪個領先指標若現在惡化，會預告三個月後的 churn？』
- **軟體工程**:把可即時告警的領先工程指標（結帳錯誤率、頁面載入時間、API 延遲）當成商業落後指標（轉換率、流失）的早期預警，問題惡化成營收才發現就太晚了。
- **產品開發**:功能驗收用領先指標（採用率、啟用時間）即時判斷方向，再用落後指標（留存、營收）做季度回顧，避免用落後指標卡住快速迭代。
- **營運分析**:為商家流失建『領先指標看板』：登入頻率下降、訂單量連續下滑等領先訊號，提早於『實際流失』這個落後指標介入。
- **策略**:落後指標（NRR、LTV）定義策略成敗，但策略執行要靠可影響的領先指標來導航；分清兩者避免『盯著後照鏡開車』。
- **2026**:經典且歷久不衰；North Star 框架本質就是『選一個營收的領先指標』。2025 產品分析工具普遍支援把領先/落後指標映射成一張 metric map 來檢視因果時序。
- 來源:https://amplitude.com/blog/leading-lagging-indicators, https://blog.logrocket.com/product-management/leading-lagging-indicators/, https://amplitude.com/blog/map-your-metrics

### 區隔分析與辛普森悖論防範 (Segmentation & Simpson's Paradox) · fit 5
*aka / 出處:* User/behavioral segmentation；Simpson's paradox（總體與分群趨勢反轉）；『平均使用者不存在』
- **是什麼**:把使用者依行為/屬性分群分析，而非只看總體平均。辛普森悖論指：總體看到的趨勢在分群後可能反轉，原因是各子群規模差異扭曲了總體；『平均使用者』往往是會把你帶偏的海妖。
- **用在決策流程**:任何重要指標下決策前先下鑽到關鍵 segment（裝置、地區、客群、tenant 規模），確認總體結論在各群都成立；若分群與總體矛盾，以正確的因果分群為準。實驗決策仍應先看總體結果，再用 segment 找機會而非合理化弱結論。
- **問對問題**:看到一個平均數時問：『這個平均掩蓋了什麼？哪些 segment 其實朝相反方向走？這個總體變化是真實效果還是 segment 組合改變造成的？』
- **軟體工程**:確保事件資料保留足夠維度（device、locale、tenant tier、流量來源）以支援事後分群，避免只存彙總值導致無法下鑽；多租戶下尤其要能 per-segment 切分。
- **產品開發**:A/B 測試結果先看總體，再分群檢查：某功能總體看似無效，可能在每個 segment 都有效卻被 mix 抵銷（辛普森悖論），反之亦然。
- **營運分析**:電商平台『整體轉換率持平』可能是新手商家轉換惡化被成熟商家成長掩蓋——分群才能看清，否則營運會誤判。
- **策略**:用分群識別真正高價值客群與賠錢客群，避免被總體數字誤導而對所有客群一視同仁的錯誤定價/投放策略。
- **2026**:辛普森悖論是資料素養核心；2025 實驗平台（Optimizely、Statsig、Mixpanel）都內建分群並警示『先信總體實驗結果，segment 用於發掘假設而非追認決策』，避免 p-hacking 式的事後挑 segment。
- 來源:https://mixpanel.com/blog/avoiding-data-fallacies-and-biases-simpsons-paradox-and-the-importance-of-segmenting-data/, https://www.statsig.com/perspectives/simpsons-paradox-explained, https://support.optimizely.com/hc/en-us/articles/18208725352589-Simpson-s-Paradox-Discover-possibilities-with-your-segments-not-shipping-decisions

### Google HEART 與 Goals-Signals-Metrics · fit 4
*aka / 出處:* HEART framework；Kerry Rodden (Google)；Happiness/Engagement/Adoption/Retention/Task success；GSM 流程
- **是什麼**:衡量使用者體驗的五維度：愉悅度 (Happiness)、參與度 (Engagement)、採用 (Adoption)、留存 (Retention)、任務成功 (Task success)；搭配 Goals→Signals→Metrics (GSM) 流程，從目標推導出早期訊號、再轉成可量測指標。不必五維全用，依功能挑 3–4 個即可。
- **用在決策流程**:為一個功能先寫『目標（成果而非產出）』，再列 2–3 個會反映成敗的使用者行為訊號，最後把訊號變成有時間範圍的比率指標；驗收與否依這些 metric 而非主觀感受。
- **問對問題**:問：『這個功能的成功，在使用者行為上會長什麼樣？(Signal)』以及『我選的指標是真的反映體驗，還是只是好看的 vanity 數字？』
- **軟體工程**:用 Task success 維度衡量關鍵流程的健康：把『結帳完成率』『搜尋零結果率』『退款流程錯誤率』當 task-success 指標納入監控，等同把 UX 量化成可告警的工程指標。
- **產品開發**:重設計商家後台某頁面時，用 GSM 先定義目標（降低操作時間），Signal（操作步數、求助點擊），再定 Metric（任務完成時間降 X%），避免改版後只憑『感覺比較好』下結論。
- **營運分析**:把 Adoption（新功能首次使用率）與 Retention（回訪使用率）拆 tenant 分群追蹤，找出功能在哪類商家叫好不叫座。
- **策略**:B2C 取向產品偏重 Engagement，B2B/工具型偏重 Task success；HEART 幫助在不同業務模式下挑對體驗指標，避免一體適用。
- **2026**:起源於 Google UX 研究，至今仍是把『體驗』量化的標準工具；2025 常與 session replay、產品分析工具整合，用質化證據補強 HEART 的量化訊號。
- 來源:https://www.thefountaininstitute.com/blog/goals-signals-metrics, https://www.lyssna.com/blog/google-heart-framework/, https://www.productplan.com/glossary/heart-framework

### DAU/WAU/MAU 與黏著度比率 (Stickiness Ratio) · fit 4
*aka / 出處:* Daily/Weekly/Monthly Active Users；DAU/MAU stickiness ratio；WAU/MAU
- **是什麼**:DAU/WAU/MAU 是各自時間窗內的去重活躍使用者數；黏著度比率 DAU/MAU（或 WAU/MAU）衡量『每月活躍者中有多少比例每天/每週也來』，是習慣性使用與 PMF 的強訊號。例如 DAU 5,000、MAU 20,000＝黏著度 25%。
- **用在決策流程**:用 stickiness 判斷產品是否進入使用者日常：比率上升代表養成習慣，可推日活相關功能；比率長期低迷代表產品是『偶爾用』的工具，策略上不該假設高頻互動。要先確認你的產品『理應』是日頻、週頻還是月頻，再選對的分母。
- **問對問題**:問：『對我的產品，使用者本來就該每天來嗎？』電商買家不會天天下單，硬追 DAU/MAU 會誤導——這時 WAU/MAU 或購買頻次更合適。也要問『活躍 (active)』的定義是否真代表價值行為。
- **軟體工程**:明確定義並在埋點層落實『active』的事件門檻（例如必須觸發核心價值事件而非只是開啟 App），避免把心跳/背景請求算進活躍而虛胖 DAU。
- **產品開發**:推送/通知類功能上線後看 stickiness 是否真的提升回訪，還是只是短期拉高 DAU 又回落（要配合 cohort 看持久性）。
- **營運分析**:對商家後台（B2B 端）追蹤『登入後台的黏著度』，找出長期不登入後台的商家＝流失前兆，觸發 CS 介入。
- **策略**:黏著度 benchmark 因產業而異（社交/通訊約 50–80%、生產力 40–60%、金融/電商約 15–30%），用對標 benchmark 判斷自家是否健康，避免拿電商去比社交 App。
- **2026**:經典指標仍廣用，但業界越來越警惕『活躍』定義被灌水；2025 趨勢是用 GPS/價值行為定義 active，並以 stickiness 搭配 retention curve 一起看，單看 DAU/MAU 易誤判。注意上述 benchmark 區間來自單一廠商整理，僅供方向參考。
- 來源:https://www.gainsight.com/essential-guide/product-management-metrics/dau-mau/, https://clevertap.com/blog/dau-vs-mau-app-stickiness-metrics/, https://www.statsig.com/perspectives/understanding-daumau-key-metrics-for-product-success

### KPI 變動拆解：組合效應 vs 內在效應 (Mix vs Inner Effect Decomposition) · fit 4
*aka / 出處:* 「為什麼這個 KPI 變了」decomposition；mix effect / inner effect；ratio decomposition (Max Halford)
- **是什麼**:當一個率/平均型 KPI 變動時，把它寫成 KPI = Σ(各群占比 share × 各群表現 ratio)，再把總變動拆成兩塊：內在效應 (inner effect)＝各群自身表現改變、組合效應 (mix effect)＝各群占比/結構改變。
- **用在決策流程**:在『指標動了但不知為何』時用它定位：若是 inner effect，問題在某些 segment 真的變好/變壞；若是 mix effect，是流量結構移到表現較差的 segment（各 segment 其實沒變）。兩者的行動完全不同。
- **問對問題**:看到整體轉換率下降時問：『是各客群自己變差 (inner)，還是只是低轉換客群占比變大 (mix)？』這正是避免被總體指標誤導、識破 Simpson's paradox 的算術工具。
- **軟體工程**:可寫成一段標準分析查詢/腳本：按維度（裝置、金流、tenant 規模）切分，算出每群的 share 與 ratio 的期間差，輸出 inner/mix 貢獻表，當作指標告警觸發後的自動根因報告。
- **產品開發**:改版後整體指標沒動，用此拆解可能發現『某 segment 大幅變好但被另一 segment 變差抵銷』，避免誤判功能無效。
- **營運分析**:電商 GMV/AOV 月變動歸因：用此拆解出『AOV 下降是商品本身降價 (inner) 還是低客單商家成交占比上升 (mix)』，給營運精準說法。
- **策略**:在向管理層解釋指標波動時，mix vs inner 的拆解避免把暫時性結構變化誤當成趨勢，做出錯誤的策略轉向。
- **2026**:概念源於財務/收益管理的 price-volume-mix 分析，近年被產品分析借用；2025 LLM 能輔助自動跑這類拆解，但比率型指標因平均不可加，需正確處理（Max Halford 一文有完整數學）。
- 來源:https://maxhalford.github.io/blog/kpi-evolution-decomposition/

### 五個為什麼 (Five Whys, 根因問題診斷) · fit 4
*aka / 出處:* 5 Whys；Sakichi Toyoda / Toyota（1930 年代）；root cause analysis；Kaizen
- **是什麼**:對一個問題連續追問『為什麼』約五次（可多可少），層層剝開症狀直到觸及可在系統層面修正的真因——通常是流程缺口、訓練不足或程序弱點，而非表面現象。
- **用在決策流程**:指標惡化或事故發生後，用 Five Whys 把『要修什麼』從症狀推到可落實的對策；強調直接觀察與找最接近問題的人，目的是防止再發而非只滅火。常與指標樹/漏斗診斷接力使用：先用數據定位 where，再用 Five Whys 追 why。
- **問對問題**:這本身就是『問對下一個問題』的協議：每次回答後再問一次為什麼，避免停在第一層解釋（如『使用者沒點按鈕』）而錯過真因（如『按鈕在某裝置被遮住』）。
- **軟體工程**:事故 postmortem 的標準工具：結帳失敗率飆升→為什麼→某次部署→為什麼沒擋下→測試沒覆蓋該金流→…直到推出系統性對策（補測試/加告警），而非只回滾了事。
- **產品開發**:功能採用率低時用 Five Whys 追到真正障礙（不是『使用者不喜歡』而是『新手在前一步就卡住沒走到這功能』），避免亂改 UI。
- **營運分析**:某類商家集中流失，用 Five Whys 從數據訊號往回追到導入流程或某設定步驟的系統性缺陷。
- **策略**:把反覆出現的營運問題用 Five Whys 收斂到少數系統性根因，避免策略層級重複處理同類症狀。
- **2026**:源於 Toyota，1970 年代後擴散到軟體業，至今是事故管理（Atlassian、SRE postmortem）標準工具；常見批評是過度線性、易停在單一因果鏈，複雜事故宜搭配魚骨圖或多因果分析。
- 來源:https://www.atlassian.com/incident-management/postmortem/5-whys, https://www.mindtools.com/a3mi00v/5-whys/, https://flowfuse.com/blog/2025/12/five-whys-root-cause-analysis-definition-examples/

### 虛榮指標 vs 可行動指標 (Vanity vs Actionable Metrics) · fit 4
*aka / 出處:* Eric Ries《The Lean Startup》；Lean Analytics；One Metric That Matters (OMTM)
- **是什麼**:虛榮指標讓人感覺良好卻無法指導決策（累計註冊、總下載、原始瀏覽量——通常只會往上、不告訴你為何變、也指不出該採取什麼行動）。可行動指標定義清楚、與假設相關、能改變你的行為。Ries：『唯一值得投入收集的指標，是能幫你做決策的指標。』
- **用在決策流程**:選指標前先過濾：問『這個數字變了，我會採取不同行動嗎？』不會就是虛榮指標。Lean Analytics 建議在當前階段聚焦一個最重要指標 (OMTM)，避免儀表板過載。改用比率/百分比而非累計總數。
- **問對問題**:面對任何儀表板問：『這個指標能驅動什麼決策？它只會漲（累計值）嗎？它告訴我為什麼動了嗎？』三者皆否＝虛榮指標。
- **軟體工程**:別把『總 API 呼叫數』『累計使用者』放上工程/產品儀表板的顯眼位置；改放可觸發行動的比率指標（錯誤率、p95 延遲、轉換率），讓監控直接對應該採取的行動。
- **產品開發**:功能成功定義避免用『多少人看過』，改用『看過的人有多少比例完成核心行為』這種可行動、與假設相關的指標。
- **營運分析**:審視營運報表時剔除『累計商家數』等只漲不跌的虛榮數字，改追『本月活躍商家數』『新商家 30 天留存率』。
- **策略**:對外（募資/PR）可用累計大數字，但對內策略決策必須用可行動指標，否則會被自己的成功劇場誤導。
- **2026**:Eric Ries 2011《The Lean Startup》與 Croll & Yoskovitz《Lean Analytics》確立此概念，至今是指標素養基礎；亦有反方觀點（如 Jeff Gothelf『為虛榮指標辯護』）認為某些『虛榮』指標在特定情境仍有溝通價值。
- 來源:https://tim.blog/2009/05/19/vanity-metrics-vs-actionable-metrics/, https://blog.leanstack.com/3-rules-to-actionable-metrics-in-a-lean-startup/, https://jeffgothelf.com/blog/in-defense-of-vanity-metrics/

### Sean Ellis 產品市場契合度調查 (PMF Survey / 40% 法則) · fit 4
*aka / 出處:* Sean Ellis Test；Sean Ellis Score；『若不能再用本產品你會有多失望』；40% very disappointed
- **是什麼**:向使用者問一題：『如果你無法再使用本產品，你會有多失望？』選『非常失望 (very disappointed)』的比例若 ≥40%，通常代表已達 PMF。它量的是『依賴/必需性』而非滿意度。Sean Ellis 分析近百家新創歸納出此門檻。
- **用在決策流程**:當作『該不該擴張』的閘門：分數 <25% 通常代表尚未 PMF，應先迭代/轉向而非加碼成長；≥40% 才適合踩油門。也可拆解『非常失望』那群人的特徵，找出最該服務的核心客群與其『必需』理由。
- **問對問題**:問：『真正會非常失望的是哪一群人、為什麼？我們是否該把產品聚焦在這群人身上？』把調查從一個分數變成發現核心價值的入口。
- **軟體工程**:在 App/後台內以輕量問卷（特定使用門檻後觸發）收集回應並落表，按 tenant/方案分群計算分數，當作可長期追蹤的領先指標而非一次性調查。
- **產品開發**:新功能或新客群拓展時，對該族群跑此調查驗證是否真的『必需』，避免靠使用量假象誤判 PMF。
- **營運分析**:在多租戶平台對不同商家分群算 PMF 分數，找出哪類商家把平台視為必需、哪類可有可無，據此分配產品與 CS 資源。
- **策略**:把 40% 法則當擴張前的策略紅綠燈，避免在未達 PMF 時過早規模化而放大漏桶問題。
- **2026**:2025 仍是輕量 PMF 量測標準，常與 NPS、JTBD 問題並用組成多訊號 PMF 問卷；40% 是經驗法則而非鐵律，產業差異與樣本偏誤需留意。
- 來源:https://learningloop.io/glossary/sean-ellis-score, https://medium.com/growthhackers/using-product-market-fit-to-drive-sustainable-growth-58e9124ee8db, https://formbricks.com/blog/product-market-fit-survey-questions
