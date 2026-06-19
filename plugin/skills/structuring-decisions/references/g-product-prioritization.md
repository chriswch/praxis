> 「決策科學方法目錄」系列 · G. 產品開發與優先級 · 共 18 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### RICE 計分模型 (RICE Scoring Model) · fit 5
*aka / 出處:* Reach × Impact × Confidence ÷ Effort;由 Intercom 的 Sean McBride 提出
- **是什麼**:Intercom 成長團隊發明的優先級公式:RICE = (Reach × Impact × Confidence) ÷ Effort。Reach 是一段時間內影響的人數/事件數;Impact 用固定刻度(3=巨大、2=高、1=中、0.5=低、0.25=極小);Confidence 用百分比(100%/80%/50%,低於 50% 視為 moonshot);Effort 用 person-month。算出「每單位投入的總影響」來排序。
- **用在決策流程**:把候選 backlog 逐項填四欄算分,由高到低排序當作討論起點(不是鐵律)。決策時重點看 Confidence 欄:低分項目代表「該先做探索/實驗而非直接開發」。Intercom 明說分數可因依賴關係、銷售 table stakes、策略理由而推翻,但要明確標記何時在做這種 trade-off。
- **問對問題**:強迫你問:這功能到底會影響多少『人』(而非『我覺得很重要』)?我對這個估值有多少實證支撐(Confidence 逼出資料缺口)?Effort 估的是全團隊還是只有後端?分母被低估往往是最大盲點。
- **軟體工程**:工程師最該負責 Effort 欄與部分 Confidence:把『多租戶下要不要 migration、要不要改 Elasticsearch index、是否有 N+1 風險』量化成 person-month,避免 PM 用樂觀工時。可在 Jira/票務系統用自訂欄位記錄四個分項,讓技術負債清償項目也能用同一把尺跟新功能競爭。
- **產品開發**:電商 SaaS 季度 roadmap 排序:例如『結帳頁紅利點數自動帶入』Reach=每月結帳商家數、Impact=轉換率提升幅度、Confidence=有無 A/B 數據、Effort=前後端工時,跟『新增購物車替換平台入口』同尺比較。
- **營運分析**:Reach 與 Impact 兩欄直接逼你去查產品分析(MAU、cohort 轉換率、漏斗),把『拍腦袋』換成 dashboard 數字;事後可回填實際 Reach/Impact 做 RICE 預測準度校準。
- **策略**:適合單一可比較的成長目標(同一轉換指標)下排序;若候選項目服務不同策略目標,RICE 會把蘋果和橘子混在一起,此時應先用 North Star/weighted scoring 分群再 RICE。
- **2026**:2025/2026 業界共識是『RICE 用於選定領域內的排序,不適合做跨領域投資組合決策』。AI 時代有人提出在 Effort 大幅下降後,Confidence 與 kill condition 變得比 Effort 更關鍵;也有對 human/agent 雙流分別計分的擴充。
- 來源:https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/, https://www.productplan.com/glossary/rice-scoring-model, https://userpilot.com/blog/feature-prioritization-matrix/

### Jobs To Be Done (JTBD) · fit 5
*aka / 出處:* 待辦任務理論;Clayton Christensen 推廣(奶昔案例);根源可追溯 Drucker(1954)、Levitt『Marketing Myopia』(1960)
- **是什麼**:核心問題:顧客『雇用 (hire)』這個產品來完成什麼任務?Christensen 用奶昔案例說明——快餐店發現顧客早上買奶昔不是因為口味,而是為了通勤路上單手可拿、耐久、解悶,真正的競爭者是香蕉與貝果而非別家奶昔。重點是『情境中的任務』而非產品屬性或客群人口統計。
- **用在決策流程**:決定要不要做某功能前,先問它服務的是哪個 job、在什麼情境、跟什麼在競爭(可能是 Excel、競品、甚至『不做』)。若一個功能不對應任何強烈的 job,就是 build 不該做的訊號。
- **問對問題**:顧客『請我們的產品來完成』什麼任務?他們上次為了這個任務做了什麼(揭露真實競爭者)?同一個人在不同情境(早上 vs 下午)雇用我們的理由一樣嗎?把焦點從『搶客群占比』轉到『搶情境占比』。
- **軟體工程**:用 job 而非功能規格來界定驗收條件,避免做出技術正確但沒人用的功能。設計 API/抽象時,以『呼叫者要完成的 job』為界,比照功能列表更能設計出穩定的介面。
- **產品開發**:電商 SaaS 的『商家』有多個 job:快速上架、旺季不當機、看懂哪個商品好賣、追回未結帳。JTBD 幫你發現商家『雇用後台』的真實任務,而非堆砌功能。例如商家其實是雇用報表來『決定明天進什麼貨』,而非『看數字』。
- **營運分析**:把使用行為數據按 job/情境分群(而非按功能模組),更能看出哪些 job 被滿足、哪些被『將就』。漏斗分析時問『使用者卡關時想完成什麼 job』。
- **策略**:界定真正的競爭格局與市場邊界(競爭者可能來自完全不同品類),是定位與差異化策略的根基;也指引『擴張到鄰近 job』的成長路徑。
- **2026**:JTBD 有兩大流派(Christensen 的『情境/故事』派 vs Ulwick 的 ODI『可量測 outcome』派),常被混用需留意。2025/2026 仍是產品發現的主流思維,AI 工具讓大規模訪談編碼成 job 更可行。
- 來源:https://www.christenseninstitute.org/theory/jobs-to-be-done/, https://therewiredgroup.com/case-studies/milkshakes/, https://online.hbs.edu/blog/post/jobs-to-be-done-examples

### 機會解決方案樹 (Opportunity Solution Tree) · fit 5
*aka / 出處:* OST;Teresa Torres《Continuous Discovery Habits》(概念於 2016 提出)
- **是什麼**:Teresa Torres 提出的視覺化工具,四層由上而下:(1) Outcome 期望成果(團隊可直接影響的顧客行為/情感指標,綁定商業價值);(2) Opportunity Space 機會空間(訪談發現的未滿足需求/痛點);(3) Solution Space 解決方案;(4) Assumption Tests 假設測試(驗證哪個方案能同時創造顧客與商業價值)。
- **用在決策流程**:先鎖定一個 outcome 界定發現範圍,把訪談洞察整理成機會樹,在『機會層』先做取捨(評估 opportunity sizing、市場/公司/顧客因素,此階段刻意不估 effort),選定機會後才發想多個方案,再用假設測試挑出最佳方案——這就是 build/不 build 的決策路徑。Torres 建議每 3–4 次訪談就回來修剪這棵樹。
- **問對問題**:這個方案到底連到哪個顧客機會、哪個 outcome?(防止『沒有問題的解法』)我們是在比較同一個機會下的多個方案,還是在比較不同機會?(逼出結構化取捨)我們對這個機會夠了解、能想出至少 3 個方案了嗎?
- **軟體工程**:工程師作為 product trio 一員參與建樹,在『解決方案層』提早注入技術可行性與多種實作選項(而非被動接需求),並負責設計能驗證假設的最小技術實驗(feature flag、假按鈕、灰度)。
- **產品開發**:電商 SaaS 的 outcome 如『提升商家完成首單出貨比例』,往下展開商家在出貨流程的多個機會(找不到面單、超商規則看不懂…),每個機會下發想多方案再實驗,讓 roadmap 從『功能清單』變成『有結構的探索』。
- **營運分析**:Outcome 必須是可量測的行為/情感指標,逼團隊建立並追蹤該指標;機會則來自質性訪談,形成質量數據互補的發現節奏。
- **策略**:把高層商業目標(viability)一路連到顧客需求(desirability)再到方案,讓策略與日常發現對齊,避免『策略 deck 與實際 backlog 脫節』。
- **2026**:OST 是 2020 年代產品發現的代表性框架,2025/2026 持續主流。Torres 強調它服務於『持續發現(每週與顧客接觸)』而非一次性規劃;常與 assumption mapping、JTBD 串用。
- 來源:https://www.producttalk.org/opportunity-solution-trees/, https://www.productschool.com/blog/product-fundamentals/opportunity-solution-tree, https://andrewclark.co.uk/product-book-summaries/continuous-discovery-habits

### 假設地圖 / 最危險假設測試 (Assumption Mapping / Riskiest Assumption Test) · fit 5
*aka / 出處:* Assumptions Mapping;RAT (Riskiest Assumption Test);David J. Bland《Testing Business Ideas》(Strategyzer)
- **是什麼**:David Bland 的三步法:(1) 萃取假設,把點子背後的 desirability(顧客想要)、viability(賺得到錢)、feasibility(做得出來)假設講清楚;(2) 在『重要性 × 證據多寡』二維圖上排列(右上角=很重要但證據最少=最危險);(3) 對最危險的假設先跑最便宜的實驗。
- **用在決策流程**:在投入開發前,把『這個功能會成功』拆成一串可被證偽的假設,辨識出『若它錯了整個點子就垮、而我們又最沒把握』的那一兩個,先用最小實驗測它。實驗結果直接決定 build/pivot/kill——這就是把模糊點子變成可驗證假設的標準作法。
- **問對問題**:如果這個點子失敗,最可能是哪個假設錯了?我們對哪個關鍵假設『最沒有證據』?能用什麼最便宜、最快的實驗來測這個假設,而不是直接花三個月開發?(把『我相信』變成『我要去測』)
- **軟體工程**:在動工前用最小技術投入測假設:假登入頁、Wizard of Oz(人工後台假裝自動)、feature flag 灰度給 5% 商家、甚至只放一個按鈕測點擊率。避免為一個未驗證假設先做完整多租戶實作。
- **產品開發**:電商新功能(如『AI 自動補貨建議』)上線前,最危險假設可能是『商家會信任並採用 AI 建議』而非技術可行性;先對少數商家做半自動版本測採用率,再決定是否大投入。
- **營運分析**:每個假設都需定義『可被證偽的成功門檻』與量測方式(轉換率、採用率、留存),把實驗設計與分析指標綁定,結果可信。
- **策略**:在重大新業務/新產品線投入前,系統性降低 desirability/viability/feasibility 三類風險,避免把資源壓在未驗證的大賭注上;是 lean startup 在企業內的可操作化。
- **2026**:Bland 的《Testing Business Ideas》(Strategyzer)是這套方法的權威來源,2025/2026 持續主流,常與 OST 的『假設測試層』直接對接。AI 讓造原型/假頁面成本驟降,使『先測再做』更廉價也更該做。
- 來源:https://www.strategyzer.com/library/how-assumptions-mapping-can-focus-your-teams-on-running-experiments-that-matter, https://www.productcompass.pm/p/assumption-prioritization-canvas, https://www.humanizingwork.com/tackle-risk-with-david-bland/

### ICE 計分 (ICE Scoring) · fit 4
*aka / 出處:* Impact × Confidence × Ease;由 Sean Ellis(成長駭客之父)在 LogMeIn/Dropbox 提出
- **是什麼**:Sean Ellis 為成長實驗設計的快速計分法:ICE = Impact × Confidence × Ease,三項各打 1–10 分相乘。比 RICE 更輕,專為『快速、迭代的成長實驗』設計,不需嚴謹工時估算。
- **用在決策流程**:成長實驗 backlog 每人各自打分再取平均/討論差異,選最高分先跑。重點不是絕對分數而是用分數差異引出團隊認知落差(為何你給 8 我給 3)。
- **問對問題**:這實驗若成功影響有多大(Impact)?我憑什麼相信它會成功(Confidence,逼出證據等級)?做起來多容易(Ease)?三者相乘讓『高影響但毫無把握』與『有把握但無聊』都被自然壓低。
- **軟體工程**:適合工程師主導的成長/技術實驗排序:例如『加 lazy loading 提升 LCP』vs『改 checkout API 快取』,Ease 由工程端評估、Confidence 引用過往效能數據。比 RICE 更快,適合 sprint 內微決策。
- **產品開發**:電商 SaaS 的 onboarding/啟用實驗(如新手引導改版、空狀態優化)排序,因為這些通常缺 Reach 的硬數字,ICE 的主觀但快速正合適。
- **營運分析**:Confidence 一欄可掛鉤 Itamar Gilad 的 Confidence Meter(以證據等級而非感覺打分),把分析數據、使用者訪談、市場資料轉成 confidence 級距,降低 ICE 最大弱點——主觀。
- **2026**:ICE 仍是成長團隊最普及框架,但批評者(如 Ward van Gasteren)指出『相乘三個 1–10 主觀分』數學上脆弱、易被操弄。2025/2026 趨勢是搭配明確的 confidence 證據量表使用。
- 來源:https://www.lennysnewsletter.com/p/the-original-growth-hacker-sean-ellis, https://itamargilad.com/the-tool-that-will-help-you-choose-better-product-ideas/, https://growwithward.com/ice-prioritization-framework/

### WSJF 加權最短工作優先 (Weighted Shortest Job First) · fit 4
*aka / 出處:* WSJF;在 SAFe 中定義;Black Swan Farming 改名為 CD3 (Cost of Delay Divided by Duration);源自 Don Reinertsen 排隊理論
- **是什麼**:WSJF = 延遲成本 (Cost of Delay) ÷ 工作規模 (Job Duration/Size)。SAFe 將 CoD 拆成三項相加:使用者與商業價值、時間急迫性 (Time Criticality)、降風險/啟用機會 (RR|OE),通常用相對刻度估算。核心主張是『排序』而非逐項算 ROI 能在流量系統中產生最佳經濟結果——同樣價值的事,先做工期短的。
- **用在決策流程**:對每個 feature/epic 用相對分(常用修正 Fibonacci)估三項 CoD 相加,除以工期估值,由高到低排程。決策洞見:高價值但巨大工程的項目,WSJF 會自動往後排,逼你『切薄』以提高分子分母比。
- **問對問題**:延遲一個月的代價是什麼(把『重要』翻譯成『時間×金錢』)?這件事有時間窗(法規/旺季)嗎(Time Criticality)?做它能解鎖未來哪些事(Opportunity Enablement)?能不能把大工作切小讓它先上?
- **軟體工程**:對技術項目特別有用:平台升級、降技術債、安全修補常缺 Reach 卻有高 RR|OE(降風險),WSJF 讓它們能跟新功能公平競爭。工程師主導『工期』分母與『降風險』分項的估值。電商旺季前的效能加固就是高 Time Criticality 案例。
- **產品開發**:多團隊大型功能(epic)的跨團隊排程,如『金流串接新 gateway』vs『POS 離線模式』——用 CoD 三項突顯前者的營收急迫性與後者的風險降低,避免只憑聲量決定。
- **營運分析**:需要把 CoD 量化,逼團隊去估『若這功能晚一季,流失/未轉換營收多少』,可用既有營收與 churn 數據反推,把優先級辯論錨定在經濟數字上。
- **策略**:是投資組合層級的經濟排序工具,把『價值』與『急迫性』與『工期』整合,適合 SaaS 在資源有限下做季度/半年的 epic 排程策略。
- **2026**:SAFe 2025/2026 仍以 WSJF 為旗艦排序法。輕量團隊常嫌 SAFe 的三分項估算過重,改用 Black Swan Farming 的 CD3 精神(只要保留 CoD÷工期 的直覺)。Reinertsen 的『延遲成本是解鎖許多門的金鑰』仍是底層理論。
- 來源:https://framework.scaledagile.com/wsjf, https://blackswanfarming.com/safe-and-weighted-shortest-job-first-wsjf/, https://www.productplan.com/glossary/weighted-shortest-job-first

### 延遲成本 (Cost of Delay) · fit 4
*aka / 出處:* CoD;CD3 (Cost of Delay Divided by Duration);Don Reinertsen《The Principles of Product Development Flow》
- **是什麼**:Don Reinertsen 提出的概念:時間對結果的經濟影響——延遲交付一段時間損失多少價值。它是 WSJF 的分子,也可獨立使用。CD3 = CoD ÷ 工期,衡量的是『投資的單位時間經濟回報率』而非總價值。
- **用在決策流程**:把每個決策從『要不要做』重構成『現在做 vs 晚三個月做差多少錢』。當多件事都『該做』時,用 CoD 決定順序;CoD 隨時間變化(如旺季前後)時要重排。
- **問對問題**:我們其實在為『慢』付多少錢?這個延遲是線性損失、還是過了某時點就斷崖式(錯過旺季/法規截止)?把『緊急 vs 重要』的直覺翻成可比較的金額。
- **軟體工程**:對抗『先把這個技術債放著』的直覺:量化『不修這個 N+1 查詢,每月多少基礎設施成本+轉換流失』。CI/CD、部署速度的投資也能用『縮短 lead time 的 CoD 節省』論證。
- **產品開發**:新功能上市時機決策:電商旺季(雙11/年中慶)前的功能有極高且具時效性的 CoD,延後一週可能損失整季營收,CoD 讓這變成數字而非感覺。
- **營運分析**:需要分析既有營收曲線、季節性、流失成本來估 CoD;反過來這也是很好的分析練習——逼團隊建立『每延遲一天 = X 元』的模型。
- **策略**:是所有經濟型排序(WSJF/CD3)的理論基礎,幫策略討論從『哪個重要』升級到『哪個的延遲最貴』,在資源稀缺時尤其關鍵。
- **2026**:CoD 是經得起時間考驗的第一性原理,2025/2026 仍是流量/精實思維核心。常被低估的點是『CoD 會隨時間改變』,需動態重估而非一次定生死。
- 來源:https://www.prodpad.com/glossary/cost-of-delay/, https://blackswanfarming.com/safe-and-weighted-shortest-job-first-wsjf/, https://wind4change.com/cost-delay-divided-duration-cd3-wsjf-reinertsen-safe/

### Kano 模型 (Kano Model) · fit 4
*aka / 出處:* Kano model;客戶滿意度模型;狩野紀昭 (Noriaki Kano),1980 年代
- **是什麼**:狩野紀昭於 1980 年代提出,主張『功能多寡』與『顧客滿意度』非線性。功能分為:必備 (Must-be/Basic,缺了極不滿、有了也不加分)、一維 (Performance,越多越滿意)、魅力 (Attractive/Delighter,缺了不扣分、有了驚喜),另有 Indifferent(無所謂)與 Reverse(反向)。
- **用在決策流程**:用 Kano 問卷(每功能問『有』與『沒有』兩題)把候選功能分類,決策原則:必備功能必須有(門檻)、一維功能投資要看競品水位、魅力功能用來差異化但別過度投資(會隨時間退化成必備)。
- **問對問題**:這功能是『不做會被罵』還是『做了會驚喜』?我們是不是把資源砸在『顧客其實無感』(Indifferent)的功能上?哪些昔日的魅力功能已經變成今天的必備門檻?
- **軟體工程**:區分『可靠性/效能/安全』這類必備品質(達標即可,過度優化邊際效益低)與真正能差異化的功能,指導工程資源分配。例如多租戶資料隔離是必備(出事就完蛋但做好也不加分),反之 AI 自動補貨建議可能是魅力功能。
- **產品開發**:電商 SaaS 功能規劃:超商取貨/金流串接是必備(缺了商家直接流失);結帳速度是一維;『AI 智能選品』『一鍵生成行銷文案』可能是魅力功能。避免把所有資源投在必備功能的過度打磨。
- **營運分析**:用 Kano 問卷+NPS/CSAT 交叉分析,辨識哪些功能真正驅動滿意度;追蹤魅力功能『去魅化』的速度(多久變必備),指導再創新節奏。
- **策略**:差異化策略核心:競爭對手都有的是必備,要靠魅力功能拉開距離;但要警覺魅力功能會被市場追平變必備,需持續補充新的 delighter。
- **2026**:Kano 是 40 年的經典且依然有效。2025/2026 在 AI 功能氾濫下尤其有用——很多 AI 功能其實是 Indifferent 或正在從魅力快速退化為必備,Kano 幫你別盲目跟風。問卷成本較高是其主要門檻。
- 來源:https://en.wikipedia.org/wiki/Kano_model, https://www.productplan.com/glossary/kano-model, https://asq.org/quality-resources/kano-model

### Opportunity 計分 / 成果導向創新 (Opportunity Scoring / ODI) · fit 4
*aka / 出處:* Outcome-Driven Innovation (ODI);importance vs satisfaction;Tony Ulwick / Strategyn(1990 年代)
- **是什麼**:Tony Ulwick 把 JTBD 操作化:訪談得出『期望成果 (desired outcomes)』後,讓顧客用 1–10 評每項的『重要性』與『現有滿意度』,以公式 機會分 = 重要性 + max(重要性 − 滿意度, 0)(重要性權重加倍)找出『重要但未被滿足』的高機會點。
- **用在決策流程**:決定投資哪個改善方向:高重要+低滿意 = 過度服務不足、值得投入;高重要+高滿意 = 維持即可;低重要 = 不論滿意度都別投。它讓『機會大小』有了可比較的量化依據。
- **問對問題**:顧客最在乎、卻最不滿意的成果是什麼(那才是真正的機會缺口)?我們是不是在已經很滿意的地方繼續加碼(過度服務)?哪些是顧客根本不在乎的成果?
- **軟體工程**:用成果語句(『縮短 X 的時間』『降低 Y 出錯機率』)而非功能來定義需求,讓工程實作有可衡量的目標與驗收標準。
- **產品開發**:電商商家的期望成果(如『縮短上架一個商品的時間』『減少漏發貨的次數』)做問卷打分,找出商家最痛卻最不滿的環節當作下一個功能方向,避免做『我們覺得酷但商家無感』的東西。
- **營運分析**:重要性×滿意度的散佈圖是強力的分析資產,可定期回測哪些機會被新功能填補(滿意度上升),量化產品改善的成效。
- **策略**:ODI 主張用『未滿足成果』而非人口統計來做市場區隔,能找到被忽略的高機會 segment,是成長與差異化策略的量化基礎。
- **2026**:ODI 提供 JTBD 缺乏的『可量測性』,但問卷設計與成果語句萃取門檻高、成本不低,小團隊常只取『重要 vs 滿意』散佈圖的精神輕量使用。批評者指其過度依賴受訪者自評。
- 來源:https://en.wikipedia.org/wiki/Outcome-Driven_Innovation, https://airfocus.com/glossary/what-is-opportunity-scoring/, https://innovationroundtable.com/summit/wp-content/uploads/2014/05/Strategyn_what_is_Outcome_Driven_Innovation.pdf

### 持續發現 (Continuous Discovery) · fit 4
*aka / 出處:* Continuous Discovery Habits;每週顧客接觸;Teresa Torres
- **是什麼**:Teresa Torres 定義的實踐:由負責產出的 product trio,以至少每週一次的頻率持續與顧客接觸,並把學習回饋進產品決策——而非把『研究』當成偶發的、一次性的專案。目標是讓發現成為團隊的肌肉記憶。
- **用在決策流程**:把『每週訪談』制度化:每次接觸都更新 OST、檢驗最新假設,讓 build/不 build 的決策建立在『持續累積、最近的』顧客證據上,而非半年前的一份報告。決策節奏與學習節奏同步。
- **問對問題**:我們上一次跟真實顧客談是什麼時候?(揭露決策的證據新鮮度)這個決定背後最新的顧客證據是什麼?我們是在『持續學』還是『一次研究然後猜一整年』?
- **軟體工程**:工程師參與訪談(哪怕旁聽),建立對使用者的第一手同理,減少『規格往返』;並把 instrumentation/feature flag/灰度當作持續學習的基礎設施一起規劃。
- **產品開發**:電商 SaaS 團隊每週固定訪談 1–2 家商家,持續校正功能方向,讓如『結帳改版』這類大投入決策在開發過程中持續被真實回饋修正,而非上線才發現方向錯。
- **營運分析**:質性(訪談)與量化(產品分析)雙軌並行:用數據發現異常,用訪談理解原因,形成持續的『發現飛輪』。
- **策略**:讓策略保持與市場同步、可調整(adaptive),對抗『年度規劃一次定生死』的僵化;是 product operating model 的核心能力之一。
- **2026**:2025/2026 與 Marty Cagan 的 product operating model 高度呼應。AI 開始被用於訪談轉錄、編碼與洞察萃取,降低『每週接觸』的營運成本,讓持續發現更可行。
- 來源:https://www.producttalk.org/opportunity-solution-trees/, https://gpavancitizen.medium.com/continous-discovery-habits-by-teresa-torres-63da0dea950, https://andrewclark.co.uk/product-book-summaries/continuous-discovery-habits

### 使用者故事地圖 (User Story Mapping) · fit 4
*aka / 出處:* Story Mapping;Jeff Patton《User Story Mapping》;backbone & walking skeleton
- **是什麼**:Jeff Patton 推廣的二維 backlog:橫軸是使用者旅程的活動/任務序列(稱 backbone,骨幹,不排序),縱軸往下是各任務的 user stories(可排序)。藉此看到『全貌』而非一條扁平待辦清單,並能切出『walking skeleton(走動骨架)』——一條最薄但端到端可運作的縱切。
- **用在決策流程**:工作坊裡先排出旅程骨幹,再把 stories 掛在下方,然後畫『釋出切片(release slices)』橫線:第一條線就是 walking skeleton/MVP——確保每個 release 都涵蓋完整旅程的最小版本,而非做完某模組再做下一個。決定哪些 story 進這次 release 就是 build/不 build。
- **問對問題**:使用者完整走完這件事需要哪些步驟?(防止漏掉旅程中某環節)哪一條最薄的端到端切片能讓使用者真的走完一次?(逼出真 MVP 而非半成品)這個 release 砍掉這些 story,旅程還走得通嗎?
- **軟體工程**:直接指導垂直切片開發與 release 規劃,避免『先做完整個後端再做前端』的橫切陷阱;walking skeleton 對應『端到端先打通最小 happy path』的工程實踐,降低整合風險。
- **產品開發**:電商結帳/上架等多步驟流程的功能規劃特別契合:把『加入購物車→填運送→選金流→付款→完成』排成骨幹,第一個 release 切出每步最小版本先打通,後續 release 再加深各步驟(多金流、多物流)。
- **策略**:讓利害關係人對『產品要解決的完整使用者旅程』有共同畫面,對齊願景與範圍,是溝通『為何這樣切 release』的有力工具。
- **2026**:Story Mapping 是 2010 年代至今的協作經典,實體便利貼已大量轉到 Miro/FigJam 等線上白板。其『骨幹+縱切+release 切片』思維與 MVP、MoSCoW、dual-track 的 delivery 軌天然契合。
- 來源:https://jpattonassociates.com/the-new-backlog/, https://www.avion.io/what-is-user-story-mapping/, https://www.samswerczek.com/blog/thinking-beyond-the-story-how-user-story-mapping-elevates-your-team-s-product-vision

### 精實創業 build-measure-learn (Lean Startup / Build-Measure-Learn) · fit 4
*aka / 出處:* BML 迴圈;validated learning;Eric Ries《The Lean Startup》
- **是什麼**:Eric Ries 的方法論,核心是 Build-Measure-Learn 迴圈與『驗證式學習 (validated learning)』:用最小投入做出 MVP→量測真實顧客行為→學習並決定 persevere(堅持)或 pivot(轉向),目標是用科學化實驗降低不確定性、避免做出沒人要的東西。
- **用在決策流程**:把每個產品決策當成假設,設計能產生『驗證式學習』的最小迴圈:先想『要學什麼』再反推『最小要 build 什麼』。決策不靠虛榮指標(總註冊數)而靠可行動指標(cohort 留存、轉換)。學習結果決定下一步 build/pivot/kill。
- **問對問題**:我們現在最需要『學會』什麼,才能降低最大的不確定性?(從 Learn 倒推,而非從 Build 開始)能不能用更小的東西學到同樣的事?這個指標是虛榮的還是可行動的?該堅持還是轉向?
- **軟體工程**:指導『先做最小可學版本』而非完整工程:用 feature flag、灰度釋出、可拋棄式原型來縮短迴圈;強調可被量測(instrumentation 要先就位)優先於程式完美與過早優化。
- **產品開發**:電商 SaaS 新模組從『最小可學版本』起步(如新行銷工具先給 20 家試用、人工補足自動化),據真實使用數據迭代,避免一次做完大功能才發現商家不用。
- **營運分析**:BML 的 Measure 階段直接是分析職責:建立 cohort、可行動指標、A/B 測試框架;Ries 特別批判虛榮指標,推動以同類群組與轉換為準的分析文化。
- **策略**:在高度不確定的新市場/新產品,提供『以最小代價換最大學習』的策略節奏,pivot 概念讓策略轉向成為有依據的決定而非失敗。
- **2026**:2026 的關鍵轉變:AI 讓『Build』變得極便宜(人人都能快速 ship),瓶頸從『能不能做』移到『該不該做與如何學』,因此 Measure/Learn 與『先別急著 build』的紀律反而更重要(Strategyzer 甚至主張『build-measure-learn 時別急著 build』)。MVP 也常被誤用為『粗糙的完整產品』而非『學習工具』。
- 來源:https://leanstartup.co/resources/articles/what-is-an-mvp/, https://userpilot.com/blog/build-measure-learn/, https://www.strategyzer.com/library/dont-build-when-you-build-measure-learn

### 最小可行產品 (Minimum Viable Product, MVP) · fit 4
*aka / 出處:* MVP;Frank Robinson 提出、Eric Ries/Steve Blank 推廣
- **是什麼**:Eric Ries 的定義:能以最少投入、蒐集到關於顧客的『最大量驗證式學習』的那個產品版本。重點在『學習』不在『最小』——它是實驗工具,不是品質打折的完整產品。
- **用在決策流程**:先明確『這個 MVP 要驗證哪個假設』,再決定最小範圍。決策原則:任何超出『驗證該假設所需』的功能都先不做。MVP 結果(達標/未達標)決定是否擴大投入。
- **問對問題**:這個 MVP 要回答的問題是什麼?(沒有明確學習目標的 MVP 只是半成品)為了學到這件事,最少需要做什麼?哪些我們以為要做、其實對『學習』沒貢獻的功能可以砍?
- **軟體工程**:對應 walking skeleton——端到端打通最小 happy path,而非把某層做完整。常用 concierge/Wizard of Oz(後台人工)避免一開始就做自動化系統,把工程投入留到驗證成立後。
- **產品開發**:電商 SaaS 新功能首發給小範圍商家、刻意保留人工環節以測需求;待驗證採用率後才投入完整自動化與多租戶 scale,降低做白工風險。
- **營運分析**:MVP 必須先定義成功門檻與量測方式,否則無法判斷該 persevere 還是 pivot;這逼團隊在開發前就想清楚『成功長什麼樣』。
- **策略**:降低新方向的初始投入與風險,讓策略可以『下小注、看反應、再加碼』,是進入新市場/新客群的低風險探路工具。
- **2026**:MVP 是被誤用最嚴重的詞之一——常被當成『陽春的完整產品』。2025/2026 有人改用 MLP(Minimum Lovable Product)或 RAT(只測最危險假設,連產品都不做)來矯正;AI 讓做原型成本驟降,更該用 MVP 學習而非急著規模化。
- 來源:https://leanstartup.co/resources/articles/what-is-an-mvp/, https://www.strategyzer.com/library/dont-build-when-you-build-measure-learn, https://userpilot.com/blog/build-measure-learn/

### 雙軌敏捷 (Dual-Track Agile) · fit 4
*aka / 出處:* Dual-Track Scrum;Discovery + Delivery 雙軌;Marty Cagan & Jeff Patton(2012);Cagan 現改稱 Continuous Discovery/Delivery
- **是什麼**:同一團隊並行跑兩條軌:Discovery 軌(用研究、原型、訪談找出『該做什麼』並驗證機會大小)與 Delivery 軌(把已驗證的東西『做對、做好、上線』)。Discovery 的產出是 Delivery 的輸入。2012 年由 Marty Cagan 與 Jeff Patton 以『dual-track scrum』提出。
- **用在決策流程**:讓『要不要做』(discovery)與『怎麼做好』(delivery)在組織上分流但同隊協作:只有通過 discovery 驗證的項目才進入 delivery backlog,從機制上擋掉『未驗證就開發』。決策因此分兩道閘:機會驗證閘 + 交付範圍閘。
- **問對問題**:這個進到開發軌的項目,在發現軌被驗證過了嗎?(防止把未驗證假設直接排進 sprint)我們的 discovery 是否餵得上 delivery 的速度?(兩軌節奏要匹配,否則一邊餓死或塞車)
- **軟體工程**:工程師同時參與兩軌:在 delivery 軌專注品質與穩定,在 discovery 軌貢獻技術可行性評估與快速原型。釐清『拋棄式原型(discovery)』與『正式程式(delivery)』的品質標準不同,避免把原型直接上線。
- **產品開發**:電商 SaaS 團隊每個 sprint 同時:delivery 開發已驗證功能、discovery 訪談商家+做原型驗證下一批機會,讓 roadmap 永遠有『已驗證、可開工』的存貨,而非開發完才開始想下一個。
- **營運分析**:Discovery 軌大量依賴質性訪談與快速數據實驗;delivery 軌依賴上線後的成效指標,兩者形成完整的學習閉環。
- **策略**:確保組織同時『建對的東西』與『把東西建對』,避免兩個常見失敗:有效率地做出沒人要的東西,或慢吞吞地做出對的東西。
- **2026**:重要演進:自《INSPIRED》第二版起,Marty Cagan 已停用『dual-track agile』一詞,因為它讓人過度關注『流程』而非『原則』,改用 Continuous Discovery 與 Continuous Delivery。2025/2026 多併入其 product operating model 論述。
- 來源:https://www.svpg.com/dual-track-agile/, https://blog.logrocket.com/product-management/dual-track-agile-continuous-discovery/, https://www.productboard.com/glossary/dual-track-agile/

### 產品三人組 (Product Trio) · fit 4
*aka / 出處:* Product Trio;PM + Designer + Engineer 三人組;Teresa Torres / Marty Cagan(empowered product team)
- **是什麼**:持續發現的最小單位:由產品經理、設計師、工程師(技術主管)三個角色共同負責一個 outcome 與機會空間,一起做發現決策。三種視角(desirability/feasibility/viability)從一開始就同桌,而非依序交接。
- **用在決策流程**:讓 build/不 build 的發現決策由三人組共同做,而非 PM 獨斷後交辦:工程師早期就進來評估可行性、設計師帶來使用者視角,三方在 OST 與假設測試上一起取捨,決策品質與認同度都更高。
- **問對問題**:這個決策三種視角(想不想要/做不做得出來/賺不賺得到)都到場了嗎?工程師是在最後才被告知,還是從發現階段就參與塑造方案?我們是在『交接』還是在『共創』?
- **軟體工程**:工程師從『需求接收者』升級為『發現共同決策者』,能在最早期注入技術可行性、提出更省成本的替代方案、及早發現多租戶/效能風險,大幅減少後期返工與『規格往返』。
- **產品開發**:電商 SaaS 每個產品團隊配置 trio,共同負責如『提升商家自助上架成功率』的 outcome,讓功能設計從第一天就兼顧好用、可行、可獲利。
- **策略**:是 Cagan『賦能團隊 (empowered teams)』與 product operating model 的組織基石——把團隊從『做功能的代工』轉為『被授權達成 outcome 的團隊』。
- **2026**:2025/2026 隨 product operating model 普及而成主流組織單位。AI 出現後有討論認為 trio 的工作會被 AI 輔助(如自動訪談分析、原型生成),但『三視角共同決策』的核心結構依然成立。
- 來源:https://www.producttalk.org/opportunity-solution-trees/, https://blog.logrocket.com/product-management/dual-track-agile-continuous-discovery/, https://userpilot.medium.com/moving-to-the-product-operating-model-by-marty-cagan-1e45b8e4f414

### 北極星框架 (North Star Framework) · fit 4
*aka / 出處:* North Star Metric (NSM) + Input Metrics;Amplitude / John Cutler《The North Star Playbook》
- **是什麼**:Amplitude 推廣(John Cutler 共同撰寫 Playbook)的模型:選一個代表『產品交付給顧客的價值』的單一北極星指標 (NSM),其下掛幾個團隊能直接影響的 input metrics(輸入指標),團隊透過影響 inputs 來牽動 NSM。Amplitude 自家 NSM 是 WLU(Weekly Learning Users)。
- **用在決策流程**:用 NSM 與其 inputs 當作優先級的『指北針』:任何候選功能先問『它影響哪個 input、進而推動 NSM 嗎?』無法連到任何 input 的就是優先級低的訊號。它把分散的功能決策對齊到同一個價值目標。
- **問對問題**:這個功能能牽動哪個 input metric?(連不上就要警覺)我們的 NSM 真的代表顧客拿到的價值,還是只是營收的代理?(Cutler:『若你能直接推動 NSM,它八成不是好 NSM』——它該『搆得到但要一層之外』)
- **軟體工程**:讓工程投資對齊可量測影響:技術項目也能論證『縮短頁面載入→提升 input(完成結帳率)→推動 NSM』。也指導 instrumentation 設計——先確保 NSM 與 inputs 能被正確埋點量測。
- **產品開發**:電商 SaaS 可選如『商家每週成功出貨訂單數』為 NSM,inputs 為(活躍商家數 × 每商家上架商品數 × 轉換率 × 履約成功率),各產品團隊認領一個 input 當作 roadmap 主軸。
- **營運分析**:NSM + inputs 構成 dashboard 與 OKR 的骨架,把『虛榮指標』換成『價值代理 + 可影響槓桿』;input 之間的關係常呈飛輪 (flywheel),分析時要看相互強化效應。
- **策略**:讓整個組織對『什麼叫贏』有單一共識,連結日常功能決策與長期策略價值;Cutler 強調 NSM 是『各部門協同的綜合結果』,刻意設計成單一團隊無法獨力直接灌水。
- **2026**:2025/2026 仍是 SaaS 對齊指標的主流。常見陷阱:把營收當 NSM(那是結果非價值代理)、或 NSM 訂得能被單一團隊直接灌水。AI 產品時代有討論加入『價值真正被使用/被消費』類的 NSM(如 Amplitude 的 WLU 強調學習被『其他人消費』)。
- 來源:https://amplitude.com/books/north-star/about-north-star-framework, https://info.amplitude.com/rs/138-CDN-550/images/Amplitude-The-North-Star-Playbook.pdf, https://imanageproducts.com/producthead-john-cutlers-north-star-metric/

### MoSCoW 優先級法 (MoSCoW Method) · fit 3
*aka / 出處:* Must/Should/Could/Won't have;Dai Clegg 於 Oracle 提出 (1994),DSDM 採用
- **是什麼**:Dai Clegg 1994 年在 Oracle 提出、後被 DSDM 廣泛採用的分類法,把需求分四類:Must have(沒它就不算交付)、Should have(重要但非致命)、Could have(有最好)、Won't have(這次明確不做)。小寫 o 只為好唸。
- **用在決策流程**:用於固定期限/固定資源下的交付範圍協商:先鎖定 Must(通常建議不超過總工作量的 60%),其餘當作 buffer——當進度落後時砍 Could、再砍 Should,Must 不動。Won't 明確寫下避免範圍蔓延。
- **問對問題**:如果只能在 deadline 前交一件事,哪件是『不交就失敗』?我們有沒有把太多東西塞進 Must(>60% 就是沒在做取捨)?這次明確『不做』什麼(Won't 防止偷渡)?
- **軟體工程**:Sprint/release 範圍切割與 MVP 定義:把 release 的 Must 對應到 walking skeleton 的必要 path,Could 當作時間有餘才做的 polish。對固定上線日(如配合行銷檔期)的功能特別實用。
- **產品開發**:電商功能 release scoping:例如新結帳流程上線,『金流可成功扣款』是 Must、『紅利自動帶入』是 Should、『結帳頁動畫』是 Could、『多幣別』這次 Won't,讓 deadline 壓力下有明確的可砍順序。
- **2026**:MoSCoW 簡單但無法表達『同為 Must 的相對順序』,常被誤用成把什麼都標 Must。2025/2026 常見組合用法:用 RICE/WSJF 做跨領域排序,MoSCoW 只在交付期限內做範圍取捨的『最後一道閘』。
- 來源:https://en.wikipedia.org/wiki/MoSCoW_method, https://www.productplan.com/glossary/moscow-prioritization, https://userpilot.com/blog/feature-prioritization-matrix/

### 價值 vs 投入 2x2 矩陣 (Value vs Effort Matrix) · fit 3
*aka / 出處:* Impact-Effort Matrix;Quick Wins / Big Bets / Fill-ins / Time Sinks 四象限
- **是什麼**:把候選項目依『價值(縱)』與『投入(橫)』畫在 2x2 上,形成四象限:Quick Wins(高價值低投入,優先)、Big Bets(高價值高投入,策略賭注)、Fill-ins(低價值低投入,有空再做)、Time Sinks(低價值高投入,別碰)。
- **用在決策流程**:工作坊裡把便利貼貼到象限上,快速形成共識。決策原則:先收割 Quick Wins、慎選少數 Big Bets、Time Sinks 直接 say no。健康 backlog 大約 30–40% Quick Wins、20–30% Big Bets。
- **問對問題**:這真的是 Quick Win 還是我們低估了多租戶下的複雜度(投入軸常被樂觀低估)?我們是不是 Big Bets 太多卻不敢砍?哪些是披著價值外衣的 Time Sink?
- **軟體工程**:工程師最該守『投入軸』的誠實度——一個前端看似簡單的功能在多租戶+權限+資料遷移下可能是 Big Bet。技術債清償項目也可上圖,常落在 Quick Win(低投入高長期價值)被看見。
- **產品開發**:新點子初篩的第一道粗篩,在還沒值得做 RICE 的早期把明顯的 Time Sink 過濾掉,聚焦少數值得深入評估的項目。
- **策略**:幫團隊在『穩定收割 Quick Win 維持動能』與『下少數 Big Bet 追求差異化』之間平衡,是溝通策略節奏的好工具。
- **2026**:優點是快、視覺、好溝通;缺點是只有兩軸、極度主觀,批評者指它易把『感覺』包裝成『分析』(有文章直言其『已過時』)。2025/2026 普遍當作早期粗篩,正式排序仍交給 RICE/WSJF。
- 來源:https://www.savio.io/product-roadmap/value-vs-effort-matrix/, https://miro.com/templates/2x2-prioritization-matrix/, https://www.claytonkjos.com/blog/6-major-flaws-that-make-the-impact-vs-effort-matrix-obsolete
