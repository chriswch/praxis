> 「決策科學方法目錄」系列 · Ⓜ Minerva HCs(76 種思考方式) · 共 41 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### #rightproblem(界定正確問題 / Characterize the problem) · fit 5
*aka / 出處:* #rightProblem;對應 Polya「理解問題」、Charles Kettering「問題說清楚就解了一半」
- **是什麼**:在動手解之前,先刻畫問題的本質:真正的目標是什麼、已知與未知、屬於哪一類問題,避免解錯題。
- **用在決策流程**:決策第一步:把「症狀」翻譯成「問題陳述」。在開任何解決方案會議前,先用一句話寫下『我們真正要解的問題是 X,成功長這樣 Y』,讓全員對齊問題再談方案。
- **問對問題**:問:『這是真正的問題,還是某個更深問題的症狀?』『如果解掉這個,根本痛點會消失嗎?』『誰說這是問題、對誰是問題?』
- **軟體工程**:線上結帳逾時的工單,先別急著加 timeout;界定問題是『DB 慢查詢』『金流 gateway 重試』還是『前端輪詢過密』。寫 RFC 時開頭固定一段 Problem Statement。
- **產品開發**:商家抱怨『要匯出報表功能』時,先界定真正問題可能是『對帳困難』,正確問題可能用 webhook 或現有 API 解決,而非再做一個匯出。
- **營運分析**:看到『退款率上升』先界定:是某個 plan、某個金流、某次改版、還是季節性?問題界定錯,後續分析全錯。
- **策略**:多租戶平台『成長放緩』時,界定是獲客、啟用、留存還是變現問題,決定整季 roadmap 投資方向。
- **2026**:2025–2026 LLM 時代,『問對問題』比『產生答案』更稀缺;先用 #rightproblem 把問題寫清楚,再讓 AI 生成方案,品質天差地遠。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html, https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf

### #breakitdown(拆解問題 / Break it down) · fit 5
*aka / 出處:* #breakItDown;分而治之 (decomposition)、MECE
- **是什麼**:把大問題拆成可處理、彼此盡量獨立的子部分,逐一攻克。
- **用在決策流程**:面對複雜決策時建立問題樹/issue tree,把『要不要做 X』拆成可獨立判斷的子問題,各自找證據,再彙整。
- **問對問題**:問:『這個問題能拆成哪幾個互不重疊的子問題?』『哪個子部分最不確定、最值得先驗證?』
- **軟體工程**:把『重構結帳服務』拆成金流抽象層、稅務計算、庫存鎖定、訂單狀態機等模組,各自可獨立測試與上線。
- **產品開發**:一個大 epic(如多幣別支援)拆成匯率來源、顯示格式、結算幣別、退款幣別等 vertical slice,先出最小可用切片。
- **營運分析**:分析 GMV 變化用乘法拆解:GMV = 流量 × 轉換率 × 客單價,定位是哪一項驅動,再往下拆。
- **策略**:進入新市場決策拆成法規、金流在地化、物流、客服語系、定價,逐項評估可行性與成本。
- **2026**:與 LLM 的 chain-of-thought / task decomposition 高度同構;設計 agent workflow 時就是在做 #breakitdown。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #utility(效用與成本效益 / Costs & benefits for stakeholders) · fit 5
*aka / 出處:* #utility;cost-benefit analysis、效用理論
- **是什麼**:做決策時,從所有利害關係人的角度,衡量不同類型的未來成本與效益(而非只看自己、只看當下)。
- **用在決策流程**:建立利害關係人 × 成本/效益表,逐格填寫各方未來得失;留意『對整體最佳但對某子群極不利』的情形並預先緩解。
- **問對問題**:問:『這個決策對每一個利害關係人(商家、買家、客服、工程、財務)各是賺是賠?』『未來的、間接的成本算進去了嗎?』
- **軟體工程**:技術選型(自建 vs 買 SaaS)用成本效益表:開發成本、維運負擔、鎖定風險、團隊學習曲線,而非只比授權費。
- **產品開發**:砍掉一個低使用率功能前,評估對少數重度商家的衝擊與遷移成本,避免『對整體最佳卻趕走關鍵客戶』。
- **營運分析**:客服自動化 ROI:省下人力 vs 誤判導致的客訴成本與商家流失,把間接成本量化。
- **策略**:平台抽成調整,逐一評估對大商家、小商家、平台、生態 app 開發者的成本效益,預判反彈。
- **2026**:官方 Minerva Intro PDF 以此為『Weighing Decisions』的代表 HC,是決策流程的核心工具。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #estimation(估算 / Estimation) · fit 5
*aka / 出處:* #estimation;Fermi estimation、合理性檢查
- **是什麼**:用近似、整數與上下界,快速檢查量化主張是否合理。Minerva 官方範例:用年齡分布快速檢驗政客的犯罪率主張不合理。
- **用在決策流程**:決策前對關鍵數字做 back-of-envelope 估算,建立合理區間;任何超出區間的數據先存疑再採用。
- **問對問題**:問:『這個數字的量級對嗎?』『最大/最小合理值是多少?』『誰提供的、有沒有誇大誘因?』
- **軟體工程**:容量規劃:估 QPS、儲存成長、頻寬,在做架構前先算出量級(『每天 1M 訂單 ≈ 多少 IOPS?』),避免過度/不足設計。
- **產品開發**:評估功能潛在影響:『這功能影響的商家 × 使用頻率 × 客單價』先估市場規模再決定投入。
- **營運分析**:看 dashboard 數字時做合理性檢查,異常值往往是埋點/口徑問題而非真相。
- **策略**:市場規模 (TAM/SAM/SOM) 用費米估算交叉驗證第三方報告,避免被誇大數字誤導。
- **2026**:LLM 容易給出看似精確卻量級錯誤的數字;用 #estimation 對 AI 輸出做合理性把關尤其重要。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #confirmationbias(確認偏誤 / Confirmation bias) · fit 5
*aka / 出處:* #confirmationBias;#biashunt(獵捕偏誤)相關
- **是什麼**:辨識並降低『只搜尋或解讀支持既有預設的資訊』的偏誤。Minerva 官方以此為偏誤獵捕的代表 HC。
- **用在決策流程**:決策前刻意尋找『反面證據』與『會推翻我假設的數據』;指派 devil's advocate;預先寫下『什麼證據會讓我改變主意』。
- **問對問題**:問:『我是不是只看了支持自己的資料?』『什麼證據會證明我錯?我找過嗎?』『反方最強的論點是什麼?』
- **軟體工程**:debug 時別只找支持自己假設的 log;A/B 測試前預先註記預期,避免事後挑數據自圓其說 (p-hacking)。
- **產品開發**:用戶訪談避免誘導式提問(只收集支持自己想做功能的回饋);主動找不用該功能的人訪談。
- **營運分析**:分析時避免先有結論再找數據;預先設定指標與成功門檻,結果不如預期也誠實面對。
- **策略**:策略覆盤避免只記得驗證自己判斷的案例;系統性回顧失敗預測。
- **2026**:與資料分析的 pre-registration、HARKing 防範一脈相承;LLM 易迎合使用者既有立場,更需主動找反證。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html, https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32

### #correlation(相關非因果 / Correlation vs causation) · fit 5
*aka / 出處:* #correlation;distinguish correlation and causation
- **是什麼**:區分相關與因果,辨識潛在的混淆變數與反向因果。是《Building the Intentional University》明列的 foundational concept 範例。
- **用在決策流程**:看到兩變數一起變動時,先列出可能的第三方混淆因子與反向因果,確認因果前不據此做重大投入。
- **問對問題**:問:『是 X 導致 Y,還是有共同原因 Z?』『會不會是 Y 導致 X?』『有沒有實驗能證因果?』
- **軟體工程**:觀測到『部署後錯誤率上升』別馬上歸因該部署;檢查是否同時有流量尖峰或第三方故障等混淆因素。
- **產品開發**:『用了功能 A 的用戶留存高』可能是本來活躍的人才會用 A(選擇偏誤),需用實驗或傾向分數驗證。
- **營運分析**:行銷歸因核心議題:渠道相關不等於帶來增量;用 incrementality test / holdout 驗證真因果。
- **策略**:『成功平台都有 X』是相關;貿然複製可能踩倖存者偏誤,需追問因果機制。
- **2026**:電商數據分析最常見的陷阱;近年強調 causal inference(DiD、合成控制、geo holdout)區分真增量。
- 來源:https://academic.oup.com/mit-press-scholarship-online/book/17355/chapter-abstract/174828729, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #tradeoffs(取捨 / Trade-offs) · fit 5
*aka / 出處:* #tradeoffs(常與 #utility、#optimization 並用)
- **是什麼**:辨識並明確化選項間的取捨——任何決策都在放棄某些東西換取另一些。
- **用在決策流程**:決策時明寫『選 A 我們放棄了什麼』,把隱性取捨顯性化;沒有取捨的『選項』通常是分析不足。
- **問對問題**:問:『選這個的代價是什麼?』『我們願意為了 X 犧牲多少 Y?』『有沒有假裝沒有取捨?』
- **軟體工程**:CAP、一致性 vs 可用性、效能 vs 可維護性的取捨明確化於設計文件;技術債是速度與品質的取捨。
- **產品開發**:功能範圍 vs 上市時間 vs 品質的鐵三角取捨,讓 stakeholder 明確選擇。
- **營運分析**:指標間取捨(成長 vs 毛利、轉換 vs 客單)顯性化,避免片面最佳化。
- **策略**:策略本質是取捨(Porter:策略就是選擇不做什麼);明確化才能聚焦。
- **2026**:Esther Wenger 文中將 #tradeoffs 列為學生時期反覆應用的核心 HC。
- 來源:https://medium.com/@wenger.esther/habits-of-mind-and-foundational-concepts-hcs-complexity-and-selflearning-ce762a70be38, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #gapanalysis(差距分析 / Gap analysis) · fit 4
*aka / 出處:* #gapAnalysis;現況-目標落差分析
- **是什麼**:找出『現況』與『理想目標』之間的差距,差距本身揭示了需要創新解法的地方。
- **用在決策流程**:在規劃前先量化 current state 與 desired state,把落差列成清單並排序,差距大且高價值者優先投資。
- **問對問題**:問:『現在在哪、想到哪?』『最大的落差在哪一段?』『縮小這個差距需要什麼能力/資源?』
- **軟體工程**:系統可用性現況 99.5%、目標 99.95%,差距分析定位出是部署期 downtime、DB failover 還是第三方依賴,針對最大缺口投入。
- **產品開發**:競品功能矩陣對照自家產品,找出 must-have 缺口(如缺 LINE 通知)排進 roadmap。
- **營運分析**:客服 SLA 目標首回 30 分鐘 vs 實際 50 分鐘,差距分析拆到尖峰時段/特定問題類型,定向補人或自動化。
- **策略**:與目標市占率的差距分析,判斷該補產品力、通路還是品牌投資。
- **2026**:2024 Minerva Insights 明確以 #gapanalysis 作為 foundational concept 範例,顯示其在問題定義階段的核心地位。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html, https://learn.minervaproject.com/hubfs/MinervaProject_A-New-Look-at-General-Education_Insights2024.pdf

### #constraints(限制條件滿足 / Constraint satisfaction) · fit 4
*aka / 出處:* #constraints;constraint satisfaction problem (CSP)
- **是什麼**:先辨識問題的限制(可行解的邊界),很多問題在同時滿足所有限制後解幾乎被決定。Minerva 官方範例:擺家具時依牆面、靠背等限制,位置幾乎被唯一決定。
- **用在決策流程**:決策前先列硬限制(法規、預算、SLA、相依)與軟限制,把方案空間縮到可行域,常常選擇就清楚了。
- **問對問題**:問:『哪些是不可違反的硬限制?』『哪些其實是假限制、可以挑戰?』『同時滿足所有限制後還剩幾個選項?』
- **軟體工程**:資料庫 schema 設計受外鍵、唯一鍵、多租戶隔離、效能限制約束,先把限制寫清楚,可行設計往往收斂。排程/庫存分配本身就是 CSP。
- **產品開發**:功能設計受『不能破壞既有 API 相容性』『行動裝置 380px 寬』等限制,先列限制再設計,避免做出無法上線的方案。
- **營運分析**:促銷活動設計受庫存上限、毛利下限、出貨產能限制,把這些當約束求最佳折扣組合。
- **策略**:定價策略受成本底線、競品天花板、商家可接受度三重限制,可行價格帶其實很窄。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #optimization(最佳化 / Optimization) · fit 4
*aka / 出處:* #optimization;trade-off optimization
- **是什麼**:在限制下評估與套用最佳化技術,找到目標函數的最佳(或夠好)解,並認知到多目標間的取捨。
- **用在決策流程**:先明確定義要最佳化的目標(單一指標)與限制,避免同時最佳化多個互斥目標;必要時用加權或 Pareto front 思考。
- **問對問題**:問:『我們到底在最佳化什麼?』『局部最佳是否犧牲全局?』『過度最佳化某指標會不會傷害另一個?』
- **軟體工程**:查詢效能調校:在索引大小、寫入成本、讀取延遲間最佳化,而非盲目加索引;CDN/快取命中率與一致性的取捨。
- **產品開發**:轉換漏斗最佳化要留意:過度簡化結帳步驟可能犧牲詐欺防護或必要稅務資訊收集。
- **營運分析**:行銷預算分配在各渠道間最佳化 ROAS,認知到邊際報酬遞減,不是全砸到單一最佳渠道。
- **策略**:平台要在『商家數量』與『商家品質/GMV』間最佳化,純衝註冊數可能拉低整體健康度。
- **2026**:與 SaaS『北極星指標』設計直接相關;近年強調避免 Goodhart 效應(指標一旦成為目標就失效)。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #variables(辨識變數 / Identify variables) · fit 4
*aka / 出處:* #variables;variables & parameters
- **是什麼**:辨識並分析問題中的變數與參數:哪些可變、哪些固定、彼此如何相依。
- **用在決策流程**:決策前畫出『輸入變數→結果』的關係,分清可控變數(我們能調)與外生變數(只能應對),把心力放在可控者。
- **問對問題**:問:『哪些變數真的會影響結果?』『哪些是我們能控制的、哪些不能?』『有沒有被忽略的隱藏變數?』
- **軟體工程**:效能問題建模:把延遲拆成 QPS、payload 大小、連線數、GC 頻率等變數,實驗時一次只動一個。
- **產品開發**:A/B 測試前明確自變數(按鈕文案)與應變數(轉換率),控制其他變數避免污染結論。
- **營運分析**:建立留存模型時辨識關鍵變數:首單時間、SKU 數、客服互動次數,找出可介入者。
- **策略**:市場模型中區分可控(定價、行銷)與不可控(總經、匯率)變數,策略只押在可控變數。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #payoffs(報酬與誘因 / Incentives & payoffs) · fit 4
*aka / 出處:* #payoffs;payoff matrix、incentive design
- **是什麼**:辨識誘因如何影響各方決策——人會朝著被獎勵的方向行動。
- **用在決策流程**:設計任何機制前,先畫 payoff matrix 推演各方在誘因下的理性反應,避免製造出反效果的誘因。
- **問對問題**:問:『這個制度其實在獎勵什麼行為?』『各方的最佳反應是什麼?』『會不會誘發鑽漏洞?』
- **軟體工程**:on-call 與 SLA 制度若只罰故障次數,可能誘使工程師隱匿小故障;設計 metric 要對齊真正想要的行為。
- **產品開發**:推薦獎勵、分潤機制設計,先推演商家/買家會如何最大化自身報酬(刷單、自我推薦)。
- **營運分析**:促銷活動分析要看誘因扭曲:滿額折扣是否只是把訂單合併,而非帶來增量 GMV。
- **策略**:生態系 app 開發者分潤比例如何影響其投入;通路獎金如何影響銷售行為。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #sunkcost(沉沒成本 / Sunk cost) · fit 4
*aka / 出處:* #sunkcost;沉沒成本謬誤
- **是什麼**:分析沉沒成本對決策的(不當)影響:已花費且無法回收的成本不應影響未來決策,但人常因此死撐。
- **用在決策流程**:評估『要不要繼續』時,只看『從現在往後』的邊際成本與效益,刻意把已投入的時間/金錢標記為不可回收、排除在外。
- **問對問題**:問:『如果今天從零開始,我還會選這條路嗎?』『我是基於未來價值還是不甘心已投入?』
- **軟體工程**:已寫半年的內部框架不好用,是否該換開源方案?用 #sunkcost 排除『都寫這麼多了』的情緒,只比未來維運成本。
- **產品開發**:投入大量工時的功能上線後使用率極低,是否下架?不被既有投入綁架。
- **營運分析**:持續虧損的行銷渠道,評估是否停投時排除歷史投放金額。
- **策略**:策略轉向(pivot)時最大的阻力常是沉沒成本;明確命名它有助理性止損。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #risk(風險與不確定性 / Risk vs uncertainty) · fit 4
*aka / 出處:* #risk;Knightian uncertainty
- **是什麼**:分析『風險』(機率可估)與『不確定性』(機率未知)對決策的不同影響,並據此選擇對策。
- **用在決策流程**:先判斷面對的是可量化風險(可用期望值/保險思維)還是真不確定性(該用選擇權思維、小注下注、保留彈性)。
- **問對問題**:問:『這是可估機率的風險,還是根本算不出機率的不確定性?』『最壞情況我能承受嗎?』『有沒有低成本探路的方式?』
- **軟體工程**:上線高風險變更採漸進式(feature flag、灰度、canary)——把不確定性轉成可觀測、可回滾的小風險。
- **產品開發**:進入全新功能領域(不確定性)用小規模 beta 與少數商家先試,而非一次全量。
- **營運分析**:庫存與備貨在需求不確定下用安全庫存與情境分析,而非單點預測。
- **策略**:押注新興市場(高不確定性)用選擇權式投資:小投入換取未來加碼的權利。
- **2026**:與現代『可逆 vs 不可逆決策(Type 1/Type 2 door)』框架相通:不可逆且高不確定者要更謹慎。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #broadframing(廣框決策 / Broad framing) · fit 4
*aka / 出處:* #broadFraming;avoid narrow framing(對應 Kahneman/Heath《Decisive》WRAP)
- **是什麼**:用多個選項取代『要/不要』的二元決策——拓寬選項空間,避免狹隘框架。
- **用在決策流程**:每當決策被框成『做 X 還是不做 X』,強迫自己再生出至少 2 個第三選項,並考慮機會成本(『同樣資源還能做什麼』)。
- **問對問題**:問:『除了 yes/no,還有哪些選項?』『如果這兩個都不能選,我會怎麼做?』『有沒有「兩者兼得」的設計?』
- **軟體工程**:『自建還是用 A 廠商』→ 加上『用 B、混合、先用後換』等選項,避免被供應商二選一綁架。
- **產品開發**:『做功能 A 還是 B』→ 拓成『先做 A 的最小版 + 收集 B 的需求證據』等組合方案。
- **營運分析**:促銷『打 8 折還是 9 折』→ 拓成滿額、買贈、會員專屬等多種結構再用數據比較。
- **策略**:『進軍日本還是東南亞』→ 拓成『先小規模試水兩地』『與在地夥伴合作』等選項。
- **2026**:直接對應 Chip & Dan Heath《Decisive》的 WRAP 第一步『Widen your options』,是現代決策流程標配。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #fallacies(邏輯謬誤 / Logical fallacies) · fit 4
*aka / 出處:* #fallacies
- **是什麼**:辨識並糾正論證中的邏輯謬誤(如稻草人、訴諸權威、滑坡、假兩難)。
- **用在決策流程**:審視決策論證鏈時,逐一檢查推論是否含謬誤;在會議中能即時點出『這是假兩難/以偏概全』提升決策品質。
- **問對問題**:問:『這個結論真的從前提推得出來嗎?』『是不是訴諸權威/人身/從眾而非證據?』『有沒有偷換概念?』
- **軟體工程**:技術辯論中辨識『大廠都這樣用所以對』(訴諸權威)、『不重寫就會崩』(滑坡)等謬誤,要求拿出證據。
- **產品開發**:需求討論中『使用者都想要』(以偏概全)、『不做就會輸競品』(假兩難)需要被數據檢驗。
- **營運分析**:報告解讀避免『相關即因果』、倖存者偏誤等謬誤導致錯誤結論。
- **策略**:策略提案常見『成功公司都做 X 所以我們要做 X』(忽略基底率/倖存者偏誤),需點破。
- **2026**:AI 生成內容常以流暢語氣包裝謬誤;批判性檢查推論有效性的能力價值上升。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #significance(統計顯著性 / Statistical significance) · fit 4
*aka / 出處:* #significance;p-value 與顯著性詮釋
- **是什麼**:正確詮釋統計顯著性:顯著不等於重要,不顯著不等於沒效果;留意樣本數與多重比較。
- **用在決策流程**:決策別只看『有沒有顯著』,要同時看效果量(#effectsize)與信賴區間;小樣本的『顯著』要存疑。
- **問對問題**:問:『樣本夠大嗎?』『效果量有實務意義嗎?』『做了幾次比較、有沒有多重比較問題?』『不顯著是真沒效還是 power 不足?』
- **軟體工程**:效能 benchmark 比較加上統計檢定與信賴區間,避免被單次抖動誤導;A/B 測試平台正確處理多重指標。
- **產品開發**:A/B 測試達『顯著』前先算所需樣本與 MDE(最小可偵測效果),避免偷看 (peeking) 提早下結論。
- **營運分析**:報表中『本週上升 3%』要判斷是否在正常波動範圍,別把雜訊當趨勢。
- **策略**:小規模試點的『正面訊號』在放大投資前需確認非偶然。
- **2026**:近年產業普遍轉向用信賴區間/貝氏 A/B 取代裸 p 值;與 #effectsize、#confidenceintervals 搭配使用。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #bayes / #conditionalprob(貝氏推論 / Bayesian & conditional probability) · fit 4
*aka / 出處:* #bayes;#conditionalProb;基率忽略 (base rate neglect)
- **是什麼**:用貝氏方法依新證據更新信念,正確處理條件機率與基率。
- **用在決策流程**:決策時明確寫下先驗機率(基率),收到新證據後理性更新,而非被鮮明個案蓋過基率。
- **問對問題**:問:『先驗(基率)是多少?』『這個證據把機率往哪邊更新多少?』『我是不是忽略了基率?』
- **軟體工程**:告警系統的真陽性率受基率影響:罕見事件即使測試準,告警仍可能多為誤報(貝氏)——據此設計告警閾值。詐欺偵測模型同理。
- **產品開發**:用早期少量回饋更新對功能成敗的信念,而非一兩個聲音就大轉向。
- **營運分析**:轉換率/詐欺率診斷需考量基率;『命中率高的規則』在低基率下精確率可能很低。
- **策略**:用市場新訊號持續更新對賭注的信心,而非死守初始判斷或過度反應單一新聞。
- **2026**:貝氏更新是現代『強觀點、弱持有 (strong opinions, loosely held)』決策文化的數學基礎。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #purpose(目標與價值 / Identify goals and values) · fit 4
*aka / 出處:* #purpose;identify and evaluate underlying goals and values
- **是什麼**:辨識並評估行動、論證或系統背後的潛在目標與價值觀。
- **用在決策流程**:每個決策前先問清『我們追求的真正目標與價值排序是什麼』,讓選項對齊目標,避免做了一堆與目標無關的事。
- **問對問題**:問:『我們到底想達成什麼?』『這背後隱含哪些價值取捨?』『各方的目標是否一致或衝突?』
- **軟體工程**:架構決策對齊真正目標:是為了開發速度、可靠性還是成本?目標不清會做出方向錯誤的『漂亮設計』。
- **產品開發**:寫 PRD 時先講清『這功能服務什麼商家目標與平台目標』,避免功能堆疊卻不知為何。
- **營運分析**:定義指標前先確認指標服務的目標,避免量了一堆 vanity metrics。
- **策略**:策略制定回到使命與價值排序(成長 vs 獲利 vs 生態健康),指引取捨。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #firstprinciples(第一性原理 / First principles) · fit 4
*aka / 出處:* #firstPrinciples;從基本承諾推理
- **是什麼**:辨識並回到問題最根本、不可再簡化的前提,從基礎重新推理,而非類比既有做法。
- **用在決策流程**:卡住或質疑慣例時,把問題拆到物理/經濟/邏輯上的基本事實,重新由底層推導方案,挑戰『大家都這樣做』。
- **問對問題**:問:『我們確定知道哪些是真的?』『這個慣例的底層理由還成立嗎?』『若從零設計會怎麼做?』
- **軟體工程**:質疑『一定要用 X 框架』,回到基本需求(延遲、一致性、團隊能力)重新推導技術選型;成本優化從『這筆運算為何必要』問起。
- **產品開發**:重新設計結帳流程時,回到『成交需要的最小資訊與信任』本質,而非照抄競品步驟。
- **營運分析**:質疑既有指標口徑,回到『這個數字到底在衡量什麼業務真相』重新定義。
- **策略**:從成本結構的第一性原理(單位經濟)推導定價,而非跟隨市場行情。
- **2026**:Musk 推廣後成為產業熱詞;在 AI/自動化重塑成本結構的 2026,第一性原理重估更顯重要。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #testability(可檢驗性 / Testability) · fit 4
*aka / 出處:* #testability;evaluate whether hypotheses yield testable predictions
- **是什麼**:評估假設是否能導出可檢驗的預測——不可證偽的主張在科學/決策上價值有限。
- **用在決策流程**:任何假設/賭注都先轉成『可被特定數據證明對或錯』的形式,並事先定義成功/失敗判準。
- **問對問題**:問:『什麼結果會證明這個假設是錯的?』『我們能在多久內、用什麼指標驗證?』
- **軟體工程**:產品假設轉成可埋點驗證的指標;『改善體驗』要落地成『結帳完成率 +X%』才可檢驗。TDD 也是把規格變可驗證測試。
- **產品開發**:每個功能 bet 都附『成功假設 + 驗證指標 + 時間窗』,上線後對照,建立 learning loop。
- **營運分析**:分析提出的洞察要可被後續數據檢驗,而非無法驗證的故事。
- **策略**:策略假設(『下沉市場願付費』)設計成可用小試點檢驗的命題。
- **2026**:與精實創業『假設驗證』、PM 的『假設驅動開發』完全同源。
- 來源:https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #experimentaldesign(實驗設計 / Experimental design) · fit 4
*aka / 出處:* #experimentalDesign;apply and evaluate principles of experimental design
- **是什麼**:套用與評估實驗設計原則:控制組、隨機化、變數隔離,以得出可信因果結論。
- **用在決策流程**:重大改動前設計受控實驗(A/B、holdout),確保能歸因;沒辦法實驗時退而求其次用準實驗。
- **問對問題**:問:『有對照組嗎?』『隨機分派了嗎?』『有沒有混淆變數沒控制?』『樣本與時間夠嗎?』
- **軟體工程**:feature flag 驅動的 A/B 基礎建設;確保分流隨機、指標乾淨、避免 SRM(樣本比例失衡)。
- **產品開發**:功能改版用 A/B 而非全量上線後猜效果;設計實驗時定義主指標與護欄指標。
- **營運分析**:行銷活動用 geo holdout / 隨機 holdout 量增量;設計實驗避免污染與外溢。
- **策略**:新商業模式用受控試點(部分市場/部分商家)驗證再放大。
- **2026**:#control;與現代 experimentation platform、causal inference 實務直接對應。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #levelsofanalysis(多層次分析 / Levels of analysis) · fit 4
*aka / 出處:* #levelsOfAnalysis
- **是什麼**:描述系統在不同分析層次(個體、群體、組織、生態)的交互作用,避免層次混淆。
- **用在決策流程**:分析問題時明確標出在哪個層次,並檢查跨層次的外溢效應;對個體最佳的決策對系統可能有害(反之亦然)。
- **問對問題**:問:『這在個人、團隊、組織、市場哪個層次?』『對某一層好對另一層呢?』『有沒有跨層次的非預期後果?』
- **軟體工程**:效能優化分清單機、服務、叢集、系統層;單服務最佳化可能拖累整體(局部最佳)。微服務邊界即層次劃分。
- **產品開發**:功能對單一商家好(個體層)是否對整個平台/買家生態(系統層)有負面外溢。
- **營運分析**:指標分清用戶層、商家層、平台層;聚合層的好可能掩蓋某子群的壞(Simpson 悖論)。
- **策略**:平台策略需同時看商家、買家、生態夥伴多層次的均衡,而非單邊最佳化。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #multiplecauses(多重原因 / Multiple causes) · fit 4
*aka / 出處:* #multipleCauses;multi-causality
- **是什麼**:辨識多個原因如何交互作用產生結果,避免單因歸因。
- **用在決策流程**:根因分析時抗拒『找一個兇手』的衝動,系統性列出多個共同/交互原因並評估各自貢獻度。
- **問對問題**:問:『真的只有一個原因嗎?』『哪些因素疊加才造成?』『修掉一個就夠了嗎?』
- **軟體工程**:事故根因分析(RCA)用『多重原因』視角,通常是多個小問題疊加(瑞士起司模型),而非單點;事後檢討避免單一代罪羔羊。
- **產品開發**:功能失敗常是需求、設計、時機、推廣多因疊加,覆盤要全面而非只怪一處。
- **營運分析**:轉換率下滑通常多因(改版+季節+競品+流量結構),歸因要拆解貢獻度。
- **策略**:市場成敗多因;歸因單一決策易得錯誤教訓。
- **2026**:與現代 SRE『blameless postmortem』、systems thinking 高度一致。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #audience(對齊受眾 / Tailor to audience) · fit 4
*aka / 出處:* #audience;tailor oral and written work for context and audience
- **是什麼**:依情境與受眾調整口頭與書面溝通。是 Minerva 官方多處引用的代表 HC。
- **用在決策流程**:提決策建議前先分析決策者是誰、在意什麼、用什麼語言;同一決策對工程、財務、商家要用不同框架表達以推動共識。
- **問對問題**:問:『我的受眾是誰、他們最關心什麼?』『他們的背景知識到哪?』『用什麼語言/指標他們才聽得進去?』
- **軟體工程**:技術提案對工程主管講可靠性與成本,對 PM 講上市時間;RFC/PR 描述依讀者調整深度。
- **產品開發**:同一功能對商家講『多賺錢』,對內部講『指標提升』,對客服講『減少工單』。
- **營運分析**:同一份分析給高管(結論+建議)與給分析師(方法+數據)用不同詳略。
- **策略**:策略敘事對董事會、員工、投資人各用不同框架但核心一致。
- **2026**:在 AI 輔助寫作普及後,『判斷受眾並校準訊息』成為人類把關的關鍵價值。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #selflearning(自我學習 / Self-learning) · fit 4
*aka / 出處:* #selfLearning;#selfteaching;apply effective strategies to teach yourself
- **是什麼**:套用有效策略自學新領域材料,是 Minerva 校友認為『最強大』的 HC。
- **用在決策流程**:面對陌生領域決策時,先用結構化自學法(找權威源、主動回憶、間隔練習)快速建立足夠心智模型再決策。
- **問對問題**:問:『我要做這決策需要先理解什麼?』『最快建立可靠理解的學習路徑?』『我哪裡還有知識盲點(#metaknowledge)?』
- **軟體工程**:快速上手新技術棧/框架;這正是工程師職涯複利的核心元能力。
- **產品開發**:進入新垂直市場(如跨境、B2B)前快速自學該領域知識與法規。
- **營運分析**:自學新分析方法(因果推論、貝氏)以提升決策品質。
- **策略**:領導者快速掌握新趨勢(AI、法規變化)以做前瞻策略判斷。
- **2026**:AI 工具讓自學速度大增,但『判斷學什麼、驗證 AI 教得對不對』更依賴此元技能。
- 來源:https://medium.com/@wenger.esther/habits-of-mind-and-foundational-concepts-hcs-complexity-and-selflearning-ce762a70be38, https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #sourcequality / #infoneeded(來源品質與資訊缺口 / Source quality & info needed) · fit 4
*aka / 出處:* #sourceQuality;#infoNeeded;information literacy
- **是什麼**:辨識支持論證所需的資訊缺口(#infoneeded),並依來源類型判斷其可信度(#sourcequality)。
- **用在決策流程**:做決策前先問『要負責任地決定,我還缺哪些關鍵資訊?來源夠可靠嗎?』,列出 info gap 並優先補齊高價值缺口。
- **問對問題**:問:『支持這個結論還缺什麼資料?』『這個來源的可信度與利益關係?』『一手還是二手?可重現嗎?』
- **軟體工程**:技術選型前辨識決策所需 benchmark/相容性資訊缺口;評估文件/答案來源權威性(官方 docs > 隨機部落格 > LLM 幻覺)。
- **產品開發**:做需求決策前辨識缺哪些用戶證據,先補關鍵研究再拍板。
- **營運分析**:分析前列出資料缺口與口徑不明處;辨識數據來源可靠性(埋點 vs 估算)。
- **策略**:進入決策前的盡職調查:辨識資訊缺口,評估市場報告/情報來源的可信度與偏誤。
- **2026**:LLM 時代來源品質判斷(辨識幻覺、查證引用)成為基本功;與本研究查證『76』數字的過程同構。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html, https://academic.oup.com/mit-press-scholarship-online/book/17355/chapter-abstract/174828729

### #decisiontrees(決策樹 / Decision trees) · fit 3
*aka / 出處:* #decisionTrees;expected value tree
- **是什麼**:用決策樹展開各選項的後果與機率,計算期望值以比較。
- **用在決策流程**:高風險、多階段決策時畫出決策節點、機率節點與結果,標上機率與價值,逐步回推期望值選擇分支。
- **問對問題**:問:『每個選項後面會發生什麼、機率多少、價值多少?』『哪條分支期望值最高、變異最小?』
- **軟體工程**:故障處理 runbook 本質是決策樹;架構選型可用決策樹評估不同負載成長情境下的成本。
- **產品開發**:功能投資決策樹:做/不做 × 市場接受/不接受,標機率估期望投報。
- **營運分析**:退貨處理流程用決策樹定義各條件分支,並評估自動化各節點的期望效益。
- **策略**:併購/自建/合作三選項的多階段決策樹,含失敗機率與退場價值。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html, https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf

### #efficientheuristics(高效捷思 / Efficient heuristics) · fit 3
*aka / 出處:* #efficientHeuristics;fast-and-frugal heuristics (Gigerenzer)
- **是什麼**:在資訊或時間有限時,套用經驗法則做出夠好的決策,認知到何時捷思有效、何時危險。
- **用在決策流程**:區分『高頻、低風險、可逆』決策(用捷思快速做、別過度分析)與『低頻、高風險、不可逆』決策(值得深度分析)。
- **問對問題**:問:『這個決策值得花多少分析成本?』『有沒有夠好的經驗法則?』『這個捷思在什麼情況會失效?』
- **軟體工程**:code review、技術小決策用團隊既定 heuristics(如『新依賴需 2 人核可』)避免每次重啟辯論。
- **產品開發**:需求優先級用 RICE/ICE 等捷思快速排序,而非每個都做完整商業分析。
- **營運分析**:異常告警先用簡單閾值規則(便宜的 heuristic)過濾,再對通過者做深入分析。
- **策略**:資源有限時用 80/20 法則快速聚焦,而非追求完美的全面分析。
- **2026**:呼應 Bezos『Type 2 可逆決策應快速由小團隊做』——把高效捷思制度化以提升決策速度。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #emotionalbias(情緒偏誤 / Emotional bias in decisions) · fit 3
*aka / 出處:* #emotionalBias
- **是什麼**:辨識當下情緒狀態如何扭曲決策,並設法降低其影響。
- **用在決策流程**:重大決策避免在強烈情緒(憤怒、興奮、恐慌)下拍板;設『冷卻期』與『十分鐘/十個月/十年後我會怎麼看』的距離化提問。
- **問對問題**:問:『我現在的情緒是否影響了判斷?』『換個心情我還會這樣決定嗎?』『是恐懼還是證據在驅動?』
- **軟體工程**:重大事故當下的『情緒性決策』(慌亂中亂改 prod)風險高;事故流程強制 incident commander 與冷靜 checklist。
- **產品開發**:看到單一大客戶激烈抱怨就急轉 roadmap,可能是情緒被個案綁架;回到整體數據再決定。
- **營運分析**:競品發新功能引發的恐慌性跟進,先冷卻、看數據,避免 FOMO 驅動的資源錯置。
- **策略**:市場恐慌或媒體熱潮中做的策略決策最易出錯;制度化『睡一覺再簽』。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #contrarian(逆向思考 / Contrarian thinking) · fit 3
*aka / 出處:* #contrarian
- **是什麼**:刻意採取與主流相反的立場以發掘新策略,挑戰共識假設。
- **用在決策流程**:在共識快速形成時,指定有人提出『如果大家都錯了會怎樣』的逆向假設,測試共識的脆弱性。
- **問對問題**:問:『主流共識可能哪裡錯?』『如果反過來做會發生什麼?』『大家都不做的事裡有沒有機會?』
- **軟體工程**:當全團隊都想加東西時,提出『反過來——能不能刪掉/不做』常找到更簡單方案。
- **產品開發**:競品都往功能堆疊時,逆向思考『極簡』是否反而是差異化機會。
- **營運分析**:挑戰『大家都看的指標』,逆向找被忽略但更能預測的領先指標。
- **策略**:在紅海中用逆向定位(別人重折扣,我重服務/在地化)找藍海。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #algorithms(演算法策略 / Algorithmic strategies) · fit 3
*aka / 出處:* #algorithms;apply algorithmic strategies to real-world problems
- **是什麼**:把演算法思維(明確步驟、輸入輸出、複雜度)套用到真實世界問題。是書中明列的 foundational concept 範例。
- **用在決策流程**:把重複性決策標準化為可執行的步驟流程(decision algorithm/checklist),減少臨場主觀與遺漏。
- **問對問題**:問:『這個決策能不能寫成明確步驟讓別人也能執行?』『最壞情況的成本(複雜度)是多少?』
- **軟體工程**:本職技能;延伸到把營運流程(退款審核、風控)演算法化、可自動化。
- **產品開發**:把人工判斷的流程(如商品審核)抽象成規則引擎/決策表,提升一致性與可擴展性。
- **營運分析**:設計可重複執行的分析 pipeline 與告警規則,而非每次手動。
- **策略**:把擴張流程標準化(新市場進入 playbook),像演算法一樣可複製。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html, https://academic.oup.com/mit-press-scholarship-online/book/17355/chapter-abstract/174828729

### #simulation(模擬 / Simulation modeling) · fit 3
*aka / 出處:* #simulation
- **是什麼**:建立並詮釋模擬模型,在無法直接實驗時觀察系統在不同輸入/限制下的行為。
- **用在決策流程**:高風險決策前用模擬/情境推演(蒙地卡羅、what-if)探索結果分布,而非只看單點預測。
- **問對問題**:問:『不同假設下結果分布長怎樣?』『哪個輸入對結果最敏感?』『最壞情境發生機率多高?』
- **軟體工程**:做負載測試/混沌工程模擬故障;容量規劃用流量模擬而非線性外推。
- **產品開發**:上線前模擬尖峰(雙11)流量與行為路徑,驗證系統與漏斗。
- **營運分析**:用蒙地卡羅模擬庫存、現金流、LTV 在不確定參數下的分布。
- **策略**:用情境模擬(樂觀/基準/悲觀)評估策略在不同市場條件下的韌性。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #modeltypes(模型類型 / Types of models) · fit 3
*aka / 出處:* #modelTypes;recognize how models explain & predict
- **是什麼**:認識各類模型(概念、物理、數學、模擬)如何解釋資料並產生新預測,以及模型的適用界線。
- **用在決策流程**:用模型輔助決策時,明確模型的假設與適用範圍,別把簡化模型當真相;『所有模型都是錯的,但有些有用』。
- **問對問題**:問:『這個模型假設了什麼?』『超出哪個範圍就失效?』『模型的預測能被驗證嗎?』
- **軟體工程**:用簡化模型估系統行為(排隊論估延遲)時清楚其假設;ML 模型注意分布漂移後失效。
- **產品開發**:成長/留存模型作為決策輔助,定期用實際數據校準,避免過度信任。
- **營運分析**:預測模型上線後監控與真實的偏差,辨識模型何時不再適用。
- **策略**:商業模型(單位經濟、漏斗模型)是簡化地圖,用以溝通與決策但不取代現實檢驗。
- **2026**:LLM 本身就是一種模型,理解其假設與失效邊界對負責任地用 AI 做決策至關重要。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #dataviz(資料視覺化 / Data visualization) · fit 3
*aka / 出處:* #dataViz;interpret, analyze, and create data visualizations
- **是什麼**:詮釋、分析並製作資料視覺化,讓資料支持(而非誤導)決策。
- **用在決策流程**:決策會議用對的圖表呈現關鍵取捨;同時具備識破誤導性圖表(截斷軸、雙軸、櫻桃挑選)的能力。
- **問對問題**:問:『這張圖想讓我相信什麼?座標軸誠實嗎?』『有沒有更能揭露真相的呈現方式?』『被省略了什麼?』
- **軟體工程**:監控 dashboard 設計遵循感知原則(#communicationdesign),讓異常一眼可見;避免誤導性的 y 軸。
- **產品開發**:功能成效以清楚視覺化呈現給 stakeholder,加速對齊與決策。
- **營運分析**:營運報表設計避免誤導,主動標示口徑與基期;用適當圖型揭露分布而非只給平均。
- **策略**:董事會/投資人簡報的數據呈現誠實且聚焦關鍵敘事。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #emergentproperties(湧現性質 / Emergent properties) · fit 3
*aka / 出處:* #emergentProperties
- **是什麼**:辨識複雜系統的湧現性質——整體展現出個別部分所沒有的行為。
- **用在決策流程**:預判系統級的非線性、非預期後果;別假設『部分行為加總=整體行為』,對複雜系統的介入要小步觀察。
- **問對問題**:問:『各部分加起來會湧現什麼新行為?』『有沒有正回饋會放大?』『局部規則會導致什麼全局型態?』
- **軟體工程**:分散式系統的湧現行為(retry storm、cascading failure、惊群效應)無法從單一服務推得,需在系統層設計防護(熔斷、退避)。
- **產品開發**:社群/市集功能的網路效應與群體行為(刷評、套利)是湧現的,設計時要預想。
- **營運分析**:用戶集體行為(搶購、羊毛黨)湧現出個體看不到的模式,需在系統層監測。
- **策略**:平台生態的湧現動態(雙邊網路效應、贏者通吃)主導長期格局。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #networks(網路效應與級聯 / Networks) · fit 3
*aka / 出處:* #networks;primary/secondary effects in networks
- **是什麼**:辨識網路中的初級與次級效應,理解節點與連結如何傳播影響。
- **用在決策流程**:評估任何介入時,除了直接(初級)效果,追蹤透過網路傳播的次級、三級效果與回饋環。
- **問對問題**:問:『直接影響誰?再來會波及誰?』『有沒有放大或抵銷的回饋?』『關鍵節點/瓶頸在哪?』
- **軟體工程**:服務依賴圖中一個服務變更的級聯影響;找出關鍵節點(單點故障)加強;依賴升級的次級影響。
- **產品開發**:改一個共用元件/API 的下游次級影響;多租戶下對某設定的改動如何在租戶網路擴散。
- **營運分析**:推薦/分享行為的網路傳播分析;找出高影響力商家/用戶節點。
- **策略**:雙邊市場的網路效應:增加供給如何透過網路吸引需求(及反之)。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #thesis / #organization(立論與組織 / Thesis & organization) · fit 3
*aka / 出處:* #thesis;#organization
- **是什麼**:提出明確、可辯護的論點(thesis),並有效組織溝通結構支撐它。
- **用在決策流程**:任何決策文件先寫出一句話的明確主張(『我建議 X,因為 Y』),再用結構化論證(BLUF、金字塔原理)支撐,讓決策者快速抓重點。
- **問對問題**:問:『我的核心主張一句話是什麼?』『支撐它的最強三個理由?』『讀者三十秒能抓到結論嗎?』
- **軟體工程**:RFC/設計文件開頭用 BLUF 給結論與建議,再展開論證;PR 說明先講『為什麼』。
- **產品開發**:PRD/提案用明確 thesis 與金字塔結構,避免決策者讀完還不知道你要他批准什麼。
- **營運分析**:分析報告結論先行(answer-first),先給洞察與建議,細節附後。
- **策略**:策略備忘錄用單一清晰主張統領(Amazon 6-pager 風格)。
- **2026**:呼應 Amazon『narrative memo』文化與 BLUF 寫作;這類結構化寫作能力與 clear-writing 原則一致。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html

### #negotiate / #batna(結構化談判與 BATNA / Negotiation & BATNA) · fit 3
*aka / 出處:* #negotiate;#batna;Best Alternative To a Negotiated Agreement
- **是什麼**:用結構化方法談判:釐清利益、議程,並備妥多維度的 BATNA(談判破局時的最佳替代方案)。官方以 #negotiate 為代表 HC。
- **用在決策流程**:任何談判/採購/合作前先算清自己的 BATNA 與對方的 BATNA,據此設定底線與目標,並按優先級準備可交換的讓步。
- **問對問題**:問:『談不成我最好的替代方案是什麼?對方的呢?』『哪些目標可讓、哪些不可?』『雙方共同利益在哪?』
- **軟體工程**:與第三方廠商/API 供應商議約時,先建立替代方案(備援供應商)作為 BATNA,避免被鎖定。
- **產品開發**:跨團隊資源協調本質是談判;備妥替代方案與分階段讓步策略推進 roadmap。
- **營運分析**:用數據量化各方 BATNA 與讓步成本,支持採購/合約談判決策。
- **策略**:通路、金流、物流夥伴談判都需先建立 BATNA;平台抽成談判同理。
- **2026**:BATNA 出自 Fisher & Ury《Getting to Yes》,是經典談判決策框架。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #ethicalframing(倫理框架 / Ethical framing) · fit 3
*aka / 出處:* #ethicalFraming;identify ethical problems and frame for resolution
- **是什麼**:辨識倫理問題並用相關倫理原則框定,以利系統性解決。官方以員工推薦獎金的偏誤為範例。
- **用在決策流程**:重大決策納入倫理檢查:辨識潛在倫理衝突,用多種倫理框架(後果論、義務論)比較,設計能對齊倫理的機制。
- **問對問題**:問:『這個決策對誰可能不公平/有害?』『有沒有誘發不當行為的設計?』『若公開會站得住腳嗎?』
- **軟體工程**:資料隱私、暗黑模式 (dark patterns)、演算法公平性的倫理把關;多租戶資料隔離的倫理與法遵責任。
- **產品開發**:設計促銷/通知/訂閱取消流程避免暗黑模式;A/B 測試的倫理界線(別拿安全功能做實驗)。
- **營運分析**:資料使用的知情同意與去識別化;避免用分析操弄而非服務用戶。
- **策略**:平台政策的公平性(對大小商家)、抽成透明度的倫理考量影響長期信任。
- **2026**:2025–2026 AI 倫理、演算法公平、資料治理成為產品決策必修;此 HC 提供結構化檢查框架。
- 來源:https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #metaknowledge / #selfawareness(後設認知與自我覺察 / Metacognition & self-awareness) · fit 3
*aka / 出處:* #metaKnowledge;#selfAwareness;know what you don't know
- **是什麼**:監控自身以辨識知識缺口(#metaknowledge),並辨識自身強弱、保持謙遜(#selfawareness)。
- **用在決策流程**:決策前明確標出自己的信心程度與知識盲點,對低信心領域主動求援/找專家,避免鄧寧-克魯格效應。
- **問對問題**:問:『我對這個判斷有多少把握、憑什麼?』『我的盲點/不擅長的地方在哪?』『誰比我更懂該問?』
- **軟體工程**:誠實標注『我不熟這塊』並找 reviewer;估時加入不確定性緩衝;承認不懂比硬撐更省成本。
- **產品開發**:PM 辨識自己對技術/市場的盲點,主動拉對的人進決策。
- **營運分析**:分析師標注分析的信心區間與假設限制,避免過度宣稱。
- **策略**:領導者的自我覺察(知道團隊比自己更懂某事)是好決策文化的基礎。
- **2026**:AI 容易過度自信地給答案;人類的後設認知(知道何時不該信 AI)是關鍵安全閥。
- 來源:https://eshmanager.blogspot.com/2024/12/blog-post.html
