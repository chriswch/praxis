> 「決策科學方法目錄」系列 · F. 軟體工程決策方法 · 共 14 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 架構決策記錄 (Architecture Decision Records, ADR) · fit 5
*aka / 出處:* Decision log / Nygard ADR;由 Michael Nygard 於 2011 年文章〈Documenting Architecture Decisions〉提出
- **是什麼**:用一份輕量、版本控管的小文件記錄「一個有架構重要性的決策」及其理由。原始 Nygard 格式只有四個段落:Status (狀態)、Context (情境)、Decision (決策)、Consequences (後果)。整個專案累積的 ADR 形成一份 decision log (決策日誌)。
- **用在決策流程**:在做出任何難以逆轉或會限制未來選項的技術選擇時,先寫一頁 ADR:寫清楚當時的限制與替代方案,標 Proposed → 評審後改 Accepted;之後若被推翻,不刪舊檔,而是新開一篇標 Superseded 並連結。決策流程因此變成『沒有 ADR 就不算決定』,理由與情境被永久保存,新人或半年後的自己能還原『為什麼當初這樣選』。
- **問對問題**:我們現在受哪些限制 (團隊、時程、既有系統)?有哪些被否決的替代方案、為什麼否決?這個決策的後果 (正面與負面) 各是什麼?哪些事一旦發生,我們就該重開這個決策?
- **軟體工程**:為多租戶電商選『租戶隔離策略』(共用 schema + tenant_id 欄位 vs schema-per-tenant vs DB-per-tenant) 寫一篇 ADR,記錄選共用 schema 的理由 (成本、上架速度) 與後果 (查詢都要帶 tenant_id、需在 ORM 層強制 scope)。CYBERBIZ 在 .claude/rules 與 doc/ 內已有類似決策說明文化,ADR 可正式化它。
- **產品開發**:新功能 (例如『加價購 vs 組合商品』的資料模型 mapping) 在實作前用 ADR 釘住模型邊界,避免日後團隊把兩者混淆 (這正是團隊記憶裡標記過的踩雷點)。
- **營運分析**:把『改用 Elasticsearch 7.x + Chewy 做商品搜尋而非 DB LIKE』的取捨寫成 ADR,後續觀察搜尋延遲/索引成本指標時,可回溯當初接受的後果與門檻。
- **策略**:把『自建 vs 採購某能力』的最終結論存為 ADR,讓 CTO/PM 後續做平台投資取捨時有一致脈絡,不必重複爭論已定案的方向。
- **2026**:2025–2026 趨勢:ADR 與 RFC/design doc 分工被更清楚討論 (ADR 記『已定案的單一決策』,RFC 記『提案+討論』);多家公司用 AI agent 草擬 ADR 初稿、自動從 PR/commit 萃取決策。ADR 也被用來治理 AI/LLM 相關架構選擇。
- 來源:https://adr.github.io/, https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md, https://www.redhat.com/en/blog/architecture-decision-records

### RFC / 設計文件流程 (RFC / Design Doc process) · fit 5
*aka / 出處:* Request for Comments;design doc;Squarespace『Yes, if』RFC 流程;Google design doc
- **是什麼**:在『建立新系統或做重大變更』前,作者寫一份提案文件 (背景、問題、目標/非目標、設計、替代方案、跨切面考量),公開徵求同儕非同步審查與評論,凝聚共識後才動工。Google/Amazon/Uber/Stripe/Shopify/Square 等公司廣泛採用。
- **用在決策流程**:重大變更採『先寫文件、後寫程式』:作者用 RFC 把假設與替代方案攤開,relevant 同儕在文件上留言討論,作者用 Squarespace 的『Yes, if (可以,只要...)』而非『No, because』回應評論,把討論導向建設性。決策在實作前就被審查過,大幅降低返工。
- **問對問題**:這份 RFC 要解決的問題到底是什麼 (寫不出問題就代表還沒想清楚)?目標與非目標分別是?有哪些替代設計、為何選這個?跨切面 (安全、效能、SLA、多租戶、回滾) 怎麼處理?誰必須 review 才算數?
- **軟體工程**:為『結帳流程拆成獨立 checkout 前端 + API』寫 RFC,涵蓋 API 契約、跨子網域路由 (api-internal / api-shop-internal)、回滾策略;讓後端與五個前端 app 團隊在動工前對齊介面。
- **產品開發**:新增『購物車替換平台入口 (mall.cyberbiz.io/cart/replace)』這類跨團隊功能時,用 RFC 對齊 PM、後端、shop 前端對 URL、權限與資料流的理解,避免實作到一半才發現假設不一致。
- **營運分析**:RFC 內強制要求『成功如何量測 (success metrics)』段落,讓功能上線後 product ops 有預先定義好的指標 (轉換率、錯誤率) 可追蹤,而非事後才想要量什麼。
- **策略**:把跨季度的平台級提案 (例如導入新支付閘道架構) 用 RFC 形式讓工程與業務跨部門非同步評審,降低高層決策的資訊不對稱。
- **2026**:Pragmatic Engineer 整理出大量真實模板;2025–2026 普遍用 AI 草擬 RFC 初稿與摘要長討論串,但人仍需把關問題定義與取捨。RFC (提案討論) 與 ADR (定案記錄) 常並用:RFC 處理方向,ADR 記錄具體技術選擇。
- 來源:https://blog.pragmaticengineer.com/rfcs-and-design-docs/, https://engineering.squarespace.com/blog/2019/the-power-of-yes-if, https://newsletter.pragmaticengineer.com/p/rfcs-and-design-docs

### 可逆 vs 不可逆決策 (Reversible vs Irreversible / Two-way vs One-way Door) · fit 5
*aka / 出處:* Type 2 vs Type 1 decisions;雙向門 vs 單向門;由 Jeff Bezos 1997 致股東信提出
- **是什麼**:Bezos 把決策分兩類:Type 1 / 單向門是難以或無法逆轉的決策,須謹慎、緩慢、充分諮詢;Type 2 / 雙向門是可逆的,做錯了可以走回頭路,應快速、授權、用實驗代替分析。大公司常犯的錯是把所有大決策都當成不可逆而過度分析。
- **用在決策流程**:決策前先問『這扇門是單向還是雙向?』。雙向門:授權給個人或小團隊快速決定、用 feature flag/實驗驗證、錯了就回滾。單向門:升級審查層級、寫 RFC、跑取捨分析,寧可慢。重點是不要用單向門的流程拖慢雙向門決策。
- **問對問題**:如果這個決定是錯的,回頭要付多少代價?是改個 flag 就能還原,還是要做資料遷移/客戶已被綁定?能不能用一個小的、可逆的實驗先試?我們是不是把一個雙向門當成單向門在過度開會?
- **軟體工程**:改 UI 文案、調 cache TTL、換前端元件 = 雙向門 → 直接上、出問題回滾。選資料庫引擎、設計對外公開 API 契約、租戶資料分區策略 = 單向門 → 走完整 RFC + ADR。
- **產品開發**:新功能用 feature flag 對 5% 商家開 (雙向門) 快速試;但『改變既有訂單/金流資料結構』因牽涉歷史資料與商家依賴,屬單向門,需 backfill 與相容策略。
- **營運分析**:把 A/B 測試明確歸類為雙向門:鼓勵團隊多跑、快速讀數據、輸了就關,降低『怕做錯而不敢試』的文化成本。
- **策略**:決定『某 plugin 功能下放給哪些 plan』時區分:TypePlugin 全 plan 即時下放 (含舊客) 較難回收 → 偏單向門需謹慎;對新客的 VirtualPlanCreator 較可控。rollback 具破壞性的決策一律當單向門對待。
- **2026**:仍是 2020s 產品與工程文化的主流心智模型 (FS.blog、LogRocket、各大 PM 部落格持續引用)。與 feature flag、漸進釋出天然互補:現代工具讓更多原本看似單向的決策變成『技術上可逆』,因此值得重新分類。
- 來源:https://fs.blog/reversible-irreversible-decisions/, https://blog.logrocket.com/product-management/type-1-vs-type-2-decisions-overview-examples/, https://www.entrepreneur.com/business-news/a-jeff-bezos-letter-from-1997-about-reversible-decisions/328284

### 自建 vs 採購 (Build vs Buy) · fit 5
*aka / 出處:* Make-or-buy decision;TCO + opportunity cost analysis
- **是什麼**:決定一項能力要自己開發還是採購/用既有 SaaS 的框架,沿三支柱評估:商業策略 (是不是核心差異化)、風險 (品質、團隊、時程可預測性)、經濟成本 (ROI、機會成本、總體擁有成本 TCO,而非只看初期開發費)。
- **用在決策流程**:對每個候選能力先問『這是不是我們的核心競爭力?』核心 → 傾向自建;非核心 → 傾向採購。再用 3–5 年 TCO (含維運、整合、訓練、隱性成本) 與『這些工程師不做這件事還能創造什麼』的機會成本一起比較,而非只比 license 費 vs 開發費。
- **問對問題**:這個能力是我們對商家的差異化來源,還是隨處可買的通用功能?5 年 TCO (含維運與整合) 是多少?把工程師投進這個自建,我們因此沒做的營收型功能是什麼 (機會成本)?買進來的東西若供應商漲價/倒閉,鎖定風險多大?
- **軟體工程**:金流串接:自建對接每家銀行/閘道 vs 採購 payment aggregator。差異化低、合規複雜 → 多半採購;但若多租戶分潤/對帳是平台賣點,該部分自建。
- **產品開發**:商品搜尋:自建倒排索引 vs 用 Elasticsearch (CYBERBIZ 已選 ES 7.x + Chewy) —— 採用成熟引擎把工程力留給電商專屬的排序/促銷邏輯,正是 build-vs-buy 的合理結論。
- **營運分析**:自建 BI 報表 vs 採購 (團隊已接 Metabase):計算維護自建 dashboard 的長期人力 TCO,通常採購工具讓 product ops 更快拿到數據。
- **策略**:平台級取捨 (例如客服/通知/CDP) 用此框架向管理層說明:把資源集中在電商核心 (商品、訂單、結帳),周邊能力傾向買,符合差異化策略。
- **2026**:2026 年討論普遍加入第三選項『buy + 用 AI/低程式碼客製』與『先買後逐步替換』;TCO 分析的隱性整合成本 (常為 license 的 1.5–2 倍) 與供應商鎖定 (vendor lock-in) 在 SaaS 疊加情境下更被強調。
- 來源:https://www.netsolutions.com/insights/build-vs-buy/, https://neontri.com/blog/build-vs-buy-software/, https://www.softwareseni.com/build-vs-buy-software-decisions-and-total-cost-of-ownership-analysis/

### Feature Flag 與漸進釋出 (Feature Flags / Progressive Delivery) · fit 5
*aka / 出處:* Feature toggles;canary release;dark launch;ring deployment;LaunchDarkly/Unleash/Flagsmith
- **是什麼**:用開關控制功能對哪些使用者開啟,不需重新部署即可開/關;搭配漸進釋出 (先對內部、再 1%→5%→100%) 與金絲雀發布 (canary,先小群驗證),把『發布』從一次性全有全無的賭注,變成可控、可觀察、可即時回滾的過程,限縮出問題時的爆炸半徑 (blast radius)。
- **用在決策流程**:把『發布決策』本身變成可逆:不確定的功能藏在 flag 後,先對小群開、盯指標、有問題秒關。等於把很多看似單向門的決策技術性地轉成雙向門——決策成本下降,團隊敢更快試錯。
- **問對問題**:這個改動能不能藏在 flag 後分批放?先放給誰、看哪個指標決定要不要擴大?出問題時關掉 flag 是否真能完全還原 (有沒有不可逆的副作用如已寫入的資料)?flag 用完了誰負責清掉 (避免技術債)?
- **軟體工程**:新結帳邏輯用 flag 包起來,先對員工測試商店開,再對 5% 商家 canary,監控結帳成功率與延遲;異常即關,不需 rollback 部署。
- **產品開發**:對照團隊記憶中的『EC 功能下放流程』:用 flag/plan gating 對指定 plan 的商家漸進開啟新功能,先少量驗證再含舊客全開,降低一次全面下放的破壞性 rollback 風險。
- **營運分析**:flag 的分群天然就是 A/B 實驗框架:對開/未開兩組比較轉換率、客單價,用數據而非意見決定要不要全量。
- **策略**:漸進釋出能力本身是平台級風險管理投資:讓公司能高頻發布又控制商家面的風險,支撐『快速迭代』策略而不犧牲穩定度 (直接連動 DORA)。
- **2026**:約三分之二受訪團隊在採用/試行漸進釋出、約 45% 用 feature flag 實現 (LaunchDarkly 等調查)。2025–2026 與實驗平台、自動化金絲雀分析 (依指標自動回滾) 整合更深;需注意 flag 過多會變成設定複雜度與技術債,需有生命週期治理。
- 來源:https://launchdarkly.com/blog/de-risking-software-releases-with-progressive-deli/, https://launchdarkly.com/blog/what-is-progressive-delivery-all-about/, https://www.getunleash.io/blog/progressive-delivery-with-feature-flags

### 技術雷達 (Technology Radar — Adopt / Trial / Assess / Hold) · fit 4
*aka / 出處:* ThoughtWorks Technology Radar;Build-Your-Own Radar (BYOR)
- **是什麼**:ThoughtWorks 每半年發布的技術觀點地圖,用四象限 (techniques/tools/platforms/languages) 與四環表達採用建議:Adopt (應認真採用)、Trial (可在專案中試用)、Assess (值得研究但未必現在試)、Hold (應謹慎或避免採用,舊稱 Caution)。只收錄『正在移動』的 blip。
- **用在決策流程**:團隊可建自己的內部雷達 (BYOR):把候選技術放進四環,作為『引入新技術』的決策閘門——只有進 Adopt 的才能無條件用於正式產品,Trial 限定在受控專案,Assess 只做 spike,Hold 明令停止擴大使用。讓技術選型成為團隊共識而非個人偏好。
- **問對問題**:這個技術在我們的脈絡是 Adopt、Trial、Assess 還是 Hold?我們有沒有在無意識中持續擴大某個該進 Hold 的技術?有什麼新東西值得放進 Assess 做小型驗證?某技術從 Trial 升 Adopt 需要哪些證據?
- **軟體工程**:對既有 stack (Ruby 3.0.7/Rails 7、Resque legacy、Sidekiq preferred) 建內部雷達:把 Sidekiq 標 Adopt、Resque 標 Hold (legacy、僅維持不擴大),明確指引新背景工作一律用 Sidekiq。
- **產品開發**:新功能要不要用某新前端函式庫,先看它在內部雷達落在哪環;Assess 的東西只在 spike/PoC 用,不進影響商家的生產功能。
- **營運分析**:追蹤 blip 隨時間移環 (Trial→Adopt 或 →Hold),作為團隊技術健康度的營運指標;Hold 區技術的程式碼占比可當技術債信號。
- **策略**:雷達是對齊『平台技術投資方向』的溝通工具:讓 CTO 與團隊用同一張圖討論該押注、觀望或淘汰哪些技術。
- **2026**:2025 年 11 月發布 Volume 33;近期版本大量聚焦 AI/LLM 工具、coding agents 與其治理。BYOR 工具讓任何組織能產自家雷達,是落地的關鍵。
- 來源:https://www.thoughtworks.com/radar/faq, https://www.thoughtworks.com/insights/blog/build-your-own-technology-radar, https://www.thoughtworks.com/content/dam/thoughtworks/documents/radar/2025/11/tr_technology_radar_vol_33_en.pdf

### YAGNI / KISS / 80-20 (簡單性原則) · fit 4
*aka / 出處:* You Aren't Gonna Need It (Kent Beck, Extreme Programming);Keep It Simple, Stupid;Pareto 80/20
- **是什麼**:一組對抗過度設計的啟發法。YAGNI:不要為『推測未來需要』的能力現在就建。KISS:追求簡單、避免不必要複雜。80-20:約 20% 的功能/努力產生 80% 的價值。Fowler 指出推測性功能有四種成本:build (白做)、delay (排擠該做的、延後營收)、carry (增加複雜度拖慢後續開發)、repair (做錯後的修補/技術債)。
- **用在決策流程**:面對『要不要先把這做得很通用/可擴充』時,套 YAGNI:除非現在就需要,否則不做,但前提是保持程式可被輕鬆修改 (Fowler 強調:YAGNI 只反對為推測功能寫程式,不反對讓程式更易修改的重構/測試)。用 80-20 排優先序:先交付產生 80% 價值的那 20%。
- **問對問題**:這個彈性/抽象是現在就需要,還是只是『以後可能用到』?如果不做,日後要加回來有多難 (可逆嗎)?哪 20% 的功能能滿足 80% 的商家?我是不是在用『未來可能』合理化現在的過度設計?
- **軟體工程**:新 API 不預先設計支援『十種未來可能的促銷型態』的萬用參數;先支援當前商家實際在用的兩三種,保持程式易改,需要時再擴 (避免 carry 成本)。
- **產品開發**:新功能 MVP 只做最常見的商家路徑 (80-20),把 edge case 後置;對照 .claude/rules/frontend/admin.md 的『新功能用新架構、舊檔不順手重寫』正是 YAGNI/KISS 的工程文化體現。
- **營運分析**:用使用數據驗證 YAGNI:上線後看那些『以為會用到』的選項實際使用率,常證明當初不做是對的;反過來指引下一輪該砍掉的低用量功能。
- **策略**:資源排序時用 80-20 鎖定『服務最大宗商家的核心流程』,避免為長尾需求過度投資而稀釋核心競爭力。
- **2026**:Fowler 的關鍵 nuance 在 AI 輔助開發時代更重要:LLM 讓『生成程式很便宜』,反而更容易堆 carry/repair 成本,YAGNI 的紀律 (只在真正需要時才加) 比過去更值得堅持。
- 來源:https://martinfowler.com/bliki/Yagni.html, https://en.wikipedia.org/wiki/You_aren%27t_gonna_need_it, https://ronjeffries.com/articles/019-01ff/iter-yagni-skimp/

### 風險矩陣 (Risk Matrix — 機率 × 影響) · fit 4
*aka / 出處:* Probability-Impact matrix;Composite Risk Index (CRI);likelihood × severity
- **是什麼**:把已識別風險依『發生機率』與『衝擊嚴重度』兩軸排在矩陣上,兩者相乘得複合風險指數 (CRI),數值越高優先處理。是把模糊的『我擔心...』轉成可比較、可排序清單的最簡工具。
- **用在決策流程**:技術決策或上線前開一張風險矩陣:列出可能出錯的事,各打機率與影響分,排序後決定哪些必須先緩解 (加測試/加監控/加回滾)、哪些可接受。讓『要不要上、先補哪個洞』有依據,而非靠最大聲的人決定。
- **問對問題**:這個改動最可能出什麼錯、各自多嚴重?哪些是高機率高影響 (必須在上線前處理)?哪些是低機率高影響 (需要的是回滾/熔斷而非防止)?我們願意接受哪些殘餘風險?
- **軟體工程**:資料遷移 (migration) 上線前評估:『遷移腳本鎖表拖垮商家結帳』= 高影響,評其機率後決定是否分批/離峰執行並備妥回滾。
- **產品開發**:金流/物流設定變更前,把『商家結帳頁缺超商選項』這類已知踩雷點 (團隊記憶中 shipping_rules 設定不完整導致) 列入矩陣,確保上線檢查清單涵蓋。
- **營運分析**:把生產事故按機率×影響分類統計,找出反覆出現的高 CRI 類別,作為下一季工程投資 (例如測試覆蓋、監控) 的優先依據。
- **策略**:向管理層溝通技術債/平台風險時,風險矩陣是把工程風險翻譯成商業語言 (影響營收/商家流失) 的橋樑。
- **2026**:常見批評是分數主觀、易產生偽精確,2020s 實務建議搭配具體情境敘述 (而非只給數字),並與『可逆性』結合——高影響但可逆的風險,投資在回滾能力比投資在預防更划算。
- 來源:https://en.wikipedia.org/wiki/Risk_matrix, https://www.getmaintainx.com/learning-center/fault-tree-analysis, https://reliability.com/resources/articles/fault-tree-analysis-fta-guide/

### WSJF 與延遲成本 (Weighted Shortest Job First / Cost of Delay) · fit 4
*aka / 出處:* WSJF (SAFe);Cost of Delay (CoD);Don Reinertsen《Principles of Product Development Flow》
- **是什麼**:把工作排序變成經濟決策。WSJF = 延遲成本 (Cost of Delay) ÷ 工作規模 (Job Size);在 SAFe 裡 CoD = 使用者/商業價值 + 時間急迫性 + 風險降低/機會啟用,各項用修正 Fibonacci (1,2,3,5,8,13,20) 相對評分,分數最高者先做。Reinertsen 的核心主張:『如果你只能量化一件事,就量化延遲成本』——把時間的經濟影響攤開,排序爭論才從哲學變成經濟。
- **用在決策流程**:排 backlog 時不再憑直覺,而是對每個工作估 CoD 三要素與規模,算 WSJF 排序——『高價值/急迫且能快做完的』先做。它特別擅長揭露『大家都覺得重要、但其實又貴又不急』的項目應該後置。
- **問對問題**:如果這件事晚三個月做,會損失多少 (延遲成本)?它的價值/急迫性/解鎖的其他機會各多大?它有多大 (能多快做完)?我們是不是先做了規模大但延遲成本低的東西、把又小又急的卡在後面?
- **軟體工程**:排技術債/平台工作時用 WSJF:『修會反覆引發結帳失敗的 bug』(高風險降低、小) WSJF 高 → 先做;『把某 legacy 模組全面重寫』(價值中、巨大) WSJF 低 → 後置。
- **產品開發**:多商家功能請求排序:用 CoD 估『缺這功能每月流失多少商家/GMV』,避免被最近喊最大聲的單一大客戶綁架排程。
- **營運分析**:把 CoD 的估計值與上線後實際營收/留存對照,回頭校準團隊的估分準度,讓下一輪 WSJF 估得更準。
- **策略**:季度路線圖取捨用 CoD 的語言向管理層溝通:『延後 X 一季的成本是 Y』,把工程排程決策接到財務語言上。
- **2026**:Reinertsen 的 CoD 思想是 WSJF 的理論根基,至今仍是 SaaS 排序的黃金標準語彙。常見誤用是把 Fibonacci 相對分當成絕對金額而產生偽精確;務必把它當『相對排序對話工具』而非精算。
- 來源:https://www.productplan.com/glossary/weighted-shortest-job-first, https://en.wikipedia.org/wiki/Cost_of_delay, http://leanmagazine.net/lean/cost-of-delay-don-reinertsen/

### 架構適應度函數 (Architecture Fitness Functions) · fit 4
*aka / 出處:* Neal Ford、Rebecca Parsons、Pat Kua《Building Evolutionary Architectures》(2017,2nd ed.);ArchUnit / NetArchTest
- **是什麼**:對某個架構特性提供客觀完整性評估的任何機制——可想成『架構版的單元測試』。借自演化計算,fitness function 衡量設計離目標有多近;它把原本零散的非功能需求 (效能、耦合、安全、分層) 統一成可自動執行的檢查,讓架構能在持續演化中被守住方向。
- **用在決策流程**:做完一個架構決策 (例如『admin 不可直接呼叫某 service』『p95 延遲 < 300ms』『前端不可繞過 API 層直連 DB』) 後,把它寫成自動化 fitness function 放進 CI/CD。決策不再只是文件上的承諾,而是每次提交都被驗證、會 fail build 的守門——對抗架構漂移 (architecture drift)。
- **問對問題**:我們在意的這個架構特性,要怎麼用自動化測試客觀驗證?哪些架構規則目前只靠 code review 人工把關、其實可以自動化?如果這條規則被違反,build 該不該紅?這個 fitness function 對應的是哪個品質情境 (接 ATAM 效用樹)?
- **軟體工程**:用 ArchUnit/依賴檢查強制多租戶安全規則:『所有對 orders 的查詢必須帶 tenant scope』『features/xxx 不可 import 其他 feature 內部模組』——把 .claude/rules 裡的分層慣例變成會 fail CI 的測試。
- **產品開發**:在 CI 加效能 fitness function:結帳關鍵 API 的 p95 延遲超標就擋住 merge,讓效能成為功能開發的硬約束而非事後救火。
- **營運分析**:fitness function 的通過率/趨勢本身就是架構健康度指標,可做成 dashboard 觀察架構債隨時間是惡化還是改善。
- **策略**:對外承諾的品質屬性 (安全合規、可用性) 用 fitness functions 制度化,降低『擴張團隊後架構失控』的規模化風險,是平台長期可演化性的投資。
- **2026**:第 2 版 (2022) 專章談『自動化架構治理』;2025–2026 的前沿是 AI/agentic AI 協助分析與生成 fitness functions、治理 LLM 相關架構 (O'Reilly 2025 有專文)。對 CI/CD 成熟的團隊落地價值高。
- 來源:https://www.thoughtworks.com/radar/techniques/architectural-fitness-function, https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/ch04.html, https://www.oreilly.com/radar/how-agentic-ai-empowers-architecture-governance/

### DORA 四 (五) 大指標 (DORA Metrics / Four Keys) · fit 4
*aka / 出處:* DevOps Research and Assessment;Accelerate (Forsgren、Humble、Kim);Four Keys
- **是什麼**:衡量軟體交付效能的指標組,原為四項:部署頻率 (Deployment Frequency)、變更前置時間 (Lead Time for Changes)、變更失敗率 (Change Failure Rate)、服務恢復時間 (原 MTTR,2024 DORA 報告正式更名為 Failed Deployment Recovery Time)。2024 起常被稱『五項』(加入可靠度/operational performance 維度)。前兩項衡量速度,後兩項衡量穩定度,刻意呈現速度與穩定的張力。
- **用在決策流程**:用 DORA 指標當決策的客觀基線:要不要投資 CI/CD、要不要拆 monolith、流程改動有沒有效,都看四指標前後變化。它把『我覺得我們交付變快了』變成可驗證——例如變更失敗率升高就是『該放慢加測試』的信號。
- **問對問題**:我們現在的交付是快又穩,還是用穩定度換速度 (或反之)?上次流程/架構改動,四指標往哪走?恢復時間長是因為偵測慢還是回滾慢?我們要不要為了部署頻率投資自動化?
- **軟體工程**:拆分 checkout/POS 等獨立部署單元前後,比較各服務的部署頻率與前置時間,驗證『拆開讓團隊獨立交付更快』的假設是否成立。
- **產品開發**:用變更失敗率與恢復時間決定功能釋出節奏:失敗率高時,決策偏向更小批量 + 更多 feature flag 漸進釋出。
- **營運分析**:把四指標做成團隊 dashboard 持續追蹤,作為工程營運健康度的核心數據,辨識瓶頸 (例如 lead time 卡在 code review 還是部署)。
- **策略**:DORA 指標是向管理層說明『工程投資 ROI』的共通語言:平台穩定度與交付速度直接連到商家信任與營收。
- **2026**:2024 DORA 報告更名 MTTR → Failed Deployment Recovery Time,並擴展到第五指標與 DevEx/AI 對生產力的影響。常見誤用是把指標當 KPI 逼團隊衝量 (Goodhart's law),DORA 官方強調它衡量的是團隊系統而非個人。
- 來源:https://www.swarmia.com/blog/dora-metrics/, https://getdx.com/blog/dora-metrics/, https://linearb.io/blog/space-framework

### 架構取捨分析法 (ATAM, Architecture Tradeoff Analysis Method) · fit 3
*aka / 出處:* 由 Carnegie Mellon SEI 的 Kazman、Klein、Clements 提出
- **是什麼**:一套在開發早期評估架構的風險緩解流程。核心是建『效用樹 (utility tree)』把品質屬性 (效能、可用性、安全、可修改性) 拆解成具優先序的情境,再分析架構決策,產出四類結果:風險 (risks)、非風險 (non-risks)、敏感點 (sensitivity points,小改動造成大品質影響的地方)、取捨點 (tradeoff points,同時影響多個彼此衝突品質屬性的決策)。
- **用在決策流程**:面對重大架構選擇時,先列關鍵品質屬性並用效用樹排序 (哪個最重要、哪個有風險);把候選架構對照每個情境分析,標出敏感點與取捨點。決策不再憑感覺,而是『在已知的品質衝突中,明確選擇要犧牲誰、保護誰』。
- **問對問題**:對這個系統,最關鍵的品質屬性排序是什麼?哪些設計決策同時牽動兩個互相衝突的品質 (取捨點)?哪些是改一點就大幅影響品質的敏感點?在最重要的情境下,這個架構會在哪裡先出問題?
- **軟體工程**:替多租戶搜尋設計時用效用樹釐清:『單一大商家的尖峰查詢不能拖垮其他租戶 (可用性)』vs『即時索引更新 (一致性)』是取捨點;Elasticsearch shard 配置是敏感點。據此決定隔離與限流策略。
- **產品開發**:POS (Node 20 SPA) 對『離線可用性』與『資料一致性』的衝突用 ATAM 攤開,讓 PM 明確選擇:門市斷網時優先讓結帳能進行 (可用性) 還是優先防止超賣 (一致性)。
- **營運分析**:效用樹中量化的品質情境 (如『p95 結帳 API < 300ms』) 可直接變成生產環境要監測的 SLO 指標,把架構評審與營運量測接起來。
- **策略**:重大平台重構前用 ATAM 產出風險清單,作為向管理層說明『投資哪裡、不投資會踩什麼風險』的依據;適合單向門級別的決策。
- **2026**:完整 ATAM (多日 workshop) 對小團隊偏重,2020s 多數團隊取其精神 (效用樹 + 取捨點/敏感點語彙) 做輕量化版,並把量化品質情境轉成自動化 fitness functions 持續驗證,而非一次性評審。
- 來源:https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method, https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf, https://www.sciencedirect.com/topics/computer-science/architecture-tradeoff-analysis-method

### 故障樹分析 (Fault Tree Analysis, FTA) · fit 3
*aka / 出處:* FTA;top-down failure analysis;minimal cut sets
- **是什麼**:一種『由上而下』的失效分析:從一個不希望發生的頂層事件 (如『商家無法結帳』) 出發,用 AND/OR 邏輯閘往下拆解出導致它的各種底層原因組合。可做定性 (找出最小割集 minimal cut sets,即最少幾件事同時壞就會釀災) 與定量 (估算發生機率) 分析,源自安全與可靠度工程,也用於軟體。
- **用在決策流程**:對關鍵流程的災難性失效做 FTA:畫出失效樹找出『單點故障』與『最小割集』,據此決定要投資哪些冗餘/降級/監控。決策從『憑經驗加保險』變成『針對真正會釀災的路徑加保險』。
- **問對問題**:什麼情況會導致這個最壞結果?有哪些單點故障 (一個東西壞全垮)?最小割集是什麼 (最少幾件事一起壞就出事)?我們的防護是擋在正確的節點上嗎?
- **軟體工程**:對『結帳 API 完全不可用』建故障樹:支付閘道逾時 OR Redis 當掉 OR DB 連線耗盡...;發現 Redis 是多條路徑共用的單點 → 決定加 fallback 與熔斷。
- **產品開發**:設計新訂單流程時用 FTA 預想『訂單成立但金流/庫存沒扣』的失效組合,驅動補上冪等性 (idempotency) 與對帳機制的需求。
- **營運分析**:事故 post-mortem 時用 FTA 結構化根因分析,把『出進口廠商驗證大規模失敗』這類事件拆到底層 (例如某資料表被清空),避免只停在表面症狀。
- **策略**:對 SLA 承諾 (平台可用性) 做 FTA,量化關鍵失效路徑機率,作為要不要投資多機房/多區的依據。
- **2026**:完整定量 FTA 在純軟體 SaaS 偏重 (多用於安全攸關系統);但其『最小割集 / 單點故障』思維被現代 SRE 廣泛吸收進可靠度評審與混沌工程 (chaos engineering),做法更輕量、更實驗導向。
- 來源:https://en.wikipedia.org/wiki/Fault_tree_analysis, https://www.getmaintainx.com/learning-center/fault-tree-analysis, https://www.dau.edu/acquipedia-article/fault-tree-analysis-fta

### SPACE 框架 (SPACE Framework) · fit 3
*aka / 出處:* Nicole Forsgren、Margaret-Anne Storey 等 (2021, ACM Queue/微軟研究);Satisfaction, Performance, Activity, Communication, Efficiency
- **是什麼**:開發者生產力的多維度量測框架,刻意反對用單一指標 (如行數、commit 數) 衡量生產力。五個維度:Satisfaction & well-being (滿意度與身心)、Performance (成果)、Activity (活動量)、Communication & collaboration (溝通協作)、Efficiency & flow (效率與心流)。主張任何生產力評估至少跨三個維度。
- **用在決策流程**:做『改善團隊效能』類決策時,別只看一個數字。用 SPACE 跨維度選 2–3 個互補指標 (例如 DORA 的交付速度 + 開發者滿意度調查 + PR review 等待時間),避免優化一個指標卻犧牲另一個 (衝部署量但燒壞團隊)。
- **問對問題**:我們想改善的『生產力』到底指哪個維度?這個指標會不會被鑽 (gaming)?速度提升是否以開發者滿意度或協作為代價?我們有沒有把活動量 (Activity) 誤當成成果 (Performance)?
- **軟體工程**:評估『導入新測試流程』成效時,同時看 CI 時間 (Efficiency)、變更失敗率 (Performance/DORA)、開發者對流程的滿意度 (Satisfaction),確認不是『更穩但大家更痛苦』。
- **產品開發**:決定團隊容量與排程時,用 SPACE 的 flow/中斷維度判斷是否會議/context-switch 過多在拖慢功能交付,而非單純加人。
- **營運分析**:用滿意度與協作維度的調查數據,補足純系統指標 (DORA) 看不到的『為什麼數字變差』的人因脈絡。
- **策略**:向管理層反對『用單一產出指標考核工程師』時,SPACE 提供有研究背書的論述,保護長期團隊健康與留任。
- **2026**:2025–2026 常與 DORA + DevEx + Flow 指標組合成『工程指標 playbook』;原作者明確警告 SPACE 不該被簡化成單一儀表板分數。對個人工程師,主要價值是『提出對的量測問題』而非自己建系統。
- 來源:https://linearb.io/blog/space-framework, https://www.travis-ci.com/blog/understanding-devops-metrics-dora-metrics-space-framework-and-devex/, https://waydev.co/dora-metrics-vs-space-framework-productivity/
