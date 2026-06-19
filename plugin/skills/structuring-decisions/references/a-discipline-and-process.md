> 「決策科學方法目錄」系列 · A. 決策科學學科與流程紀律 · 共 12 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 決策智能 (Decision Intelligence, DI) · fit 5
*aka / 出處:* Decision Intelligence Engineering;由 Cassie Kozyrkov 於 Google 提出並命名
- **是什麼**:Kozyrkov 定義 DI 為「將資訊轉化為更好行動的學問,適用於任何規模」(the discipline of turning information into better actions at any scale),是一門融合應用資料科學、社會/行為科學與管理科學的新學科,關注『在多個選項間做選擇』的所有面向。核心反轉是從『要做的決策』反推所需資料、工具與流程,而非把分析或 ML 當目的。
- **用在決策流程**:把每個重大抉擇先寫成一句『決策陳述』:誰要做什麼選擇、目標是什麼、有哪些選項。先設計決策(目標、選項、預設行動、判準)再去找資料,避免讓資料反過來操弄結論。對小決策不過度動用流程(她強調午餐三明治不該和 GTM 策略用同等審慎度)。
- **問對問題**:在動手分析或建模前先問:『這是什麼決策?如果完全沒有資料我預設會選哪個?要看到什麼樣的資訊我才會改變這個預設?這個決策值得多少分析成本?』把問題從『資料說了什麼』轉成『我需要什麼資訊才能做出更好的這個選擇』。
- **軟體工程**:技術選型(如要不要從 Resque 遷到 Sidekiq、要不要換 ORM)先寫決策陳述與成功判準,再蒐集 benchmark;避免工程師憑直覺先選好再用數據包裝。把『要看到 p99 延遲降多少才值得遷移』這類門檻先寫死。
- **產品開發**:新功能(如結帳頁紅利點數自動帶入)開發前,先定義決策是『要不要做/做哪個版本』、目標指標(結帳轉換率)、可接受的下限,再排 spike 與使用者研究,確保 data-driven 而非 data-inspired。
- **營運分析**:建 dashboard / metric 前先問『這個指標是用來支援哪個決策的?沒有它我會怎麼決定?』避免做出大量無人據以行動的 vanity metrics;把 metric 設計回溯到具體的營運決策。
- **策略**:把『要不要進軍新市場 / 推出新訂閱方案』包裝成完整決策設計:目標、選項、預設行動、判準與資訊價值評估,讓策略討論聚焦在選擇而非報告。
- **2026**:2025–2026 DI 從利基走向主流:Gartner 推出首屆『Decision Intelligence Platforms』Magic Quadrant(2026/02),並預測到 2027 年 50% 商業決策將由使用 DI 的 AI agent 增強或自動化;Kozyrkov 2024–2025 在 Maven 開設『Decision-Making with ChatGPT (DecisionGPT)』,把 DI 流程套用到 LLM 輔助決策,強調 LLM 是放大器、決策設計仍由人主導。
- 來源:https://medium.com/data-science/introduction-to-decision-intelligence-5d147ddab767, https://www.linkedin.com/pulse/introduction-decision-intelligence-cassie-kozyrkov, https://en.wikipedia.org/wiki/Cassie_Kozyrkov, https://maven.com/cassie-kozyrkov/decisiongpt

### 決策的解剖 (Anatomy of a Decision) · fit 5
*aka / 出處:* Components of a decision;objectives / options / information / preferences (payoffs) / uncertainty / outcomes
- **是什麼**:把一個決策拆成可分析的零件:目標與判準 (objectives/criteria)、可選項 (options)、可得資訊與先驗 (information/priors)、偏好與報酬 (preferences/payoffs)、不確定性 (uncertainty),以及最終結果 (outcome)。Kozyrkov 並強調『決策只有在發生不可撤回的資源配置時才算真正做出』(a decision is only made once an irrevocable allocation of resources takes place)。
- **用在決策流程**:用六個零件填一張決策表:列出目標與成功判準、窮舉選項(含『什麼都不做』)、盤點現有資訊與先驗、定義各結果的報酬與你能容忍的不確定性、最後追蹤結果。任何一格空白都是決策風險所在。
- **問對問題**:問:『我的目標到底是什麼、用什麼判準衡量?所有選項都列了嗎(包括維持現狀)?我已知什麼、假設了什麼?每個結果對我值多少?哪些不確定性最致命?』
- **軟體工程**:架構決策紀錄 (ADR) 就是決策解剖的落地:Context(資訊/先驗)、Options(候選方案)、Decision(選項+判準)、Consequences(報酬/結果)。把多租戶資料隔離方案的取捨用此六件套寫清楚。
- **產品開發**:寫 PRD 的『決策段』:目標(提升 30 天留存)、選項(三種 onboarding 流)、資訊(現有漏斗數據)、報酬(各版預期留存)、不確定性(樣本量)、結果追蹤計畫。
- **營運分析**:把營運分析報告改成決策導向結構:報告開頭先列出待支援的決策與其判準,再呈現資訊與不確定性,而非一堆圖表後才接『建議』。
- **策略**:重大投資(自建 vs 採購 DI 平台)用解剖法:明確目標、列全選項、盤點已知/未知、量化各情境報酬與下行風險,作為董事會討論底稿。
- **2026**:Gartner 的 DI 平台把『decision modeling』(明確建模目標、選項、約束、結果)作為核心能力,等同把決策解剖工具化;2025–2026 強調對 AI agent 決策也要顯式建模這些零件以利監控與稽核。
- 來源:https://www.linkedin.com/pulse/introduction-decision-intelligence-cassie-kozyrkov, https://medium.com/data-science/introduction-to-decision-intelligence-5d147ddab767, https://www.gartner.com/en/documents/5599159

### 決策黃金法則:分離決策品質與結果 (Decision vs Outcome / Resulting) · fit 5
*aka / 出處:* The golden rule of decision analysis (Kozyrkov);Resulting / 結果偏誤 (outcome bias) — Annie Duke《Thinking in Bets》
- **是什麼**:Kozyrkov 的黃金法則:『決策品質應只用決策當下可得的資訊來評估』(evaluate the quality of a decision using only the information available to the decision-maker at the time the decision was made)。Annie Duke 稱把結果好壞等同於決策好壞為『resulting』(結果論),是一種結果偏誤——好結果可能只是運氣,壞結果也可能來自好決策(人生像撲克而非西洋棋)。
- **用在決策流程**:覆盤時把『決策過程品質』與『結果』分兩欄評分:好過程+壞結果不該被懲罰、壞過程+好結果不該被獎勵。用 decision journal 記下當時資訊與推理,事後只據此評價,避免後見之明。
- **問對問題**:問:『如果重來、只憑當時資訊,這仍是好決策嗎?這次成功/失敗有多少是運氣、多少是判斷?我從這次學到的是流程教訓還是雜訊?』
- **軟體工程**:事故覆盤採 blameless + resulting 防護:一個沒造成事故的危險變更(壞過程好結果)仍要檢討;一個照流程做卻仍失敗的部署(好過程壞結果)不應追責個人,聚焦流程改進。
- **產品開發**:功能成敗評估分離過程與結果:某 A/B 勝出可能只是季節性運氣;某縝密實驗結果不顯著不代表假設方法錯。建立『決策日誌』記錄上線當時的假設與預期。
- **營運分析**:建立『實驗品質』評分(樣本量、預登記、隨機化)獨立於『實驗有沒有贏』,避免團隊只慶祝贏的實驗、忽略其過程缺陷,導致學到雜訊。
- **策略**:策略覆盤(如某次定價調整)區分『下注是否合理』與『開牌結果』,防止組織因一次幸運成功而把脆弱策略制度化。
- **2026**:2020 年代『decision journaling / pre-registration』在產品與工程團隊普及;Duke 後續著作《Quit》(2022) 延伸到『何時該止損』的決策衛生。AI 時代尤其關鍵:LLM 給出的建議若只看單次好結果就採信,等同對 agent 做 resulting,需以過程品質與校準度評估。
- 來源:https://kozyrkov.medium.com/are-you-a-bad-decision-maker-34690deae223, https://www.sachinrekhi.com/p/thinking-in-bets-annie-duke, https://calvinrosser.com/notes/thinking-in-bets-annie-duke/

### 先決定怎麼決定:預設行動與判準前置 (Decide How to Decide Before You See the Data) · fit 5
*aka / 出處:* Default action + pre-set criteria;data-driven vs data-inspired (Kozyrkov)
- **是什麼**:Kozyrkov 主張在看資料前先做兩件事:(1) 承諾一個『預設行動』——在無知狀態下哪個選擇是較小的惡;(2) 設定改變預設所需的判準/門檻。她區分 data-driven(資料真的驅動決策)與 data-inspired(只是翻資料直到某個訊號吸引你);她舉例:被先告知旅館評分 4.2 再問你要不要住,你做 data-driven 的能力就被摧毀了,因為你會用自己原本的傾向去解讀 4.2。
- **用在決策流程**:流程固定為:先寫下『若沒有任何新資料,我會選 X(預設)』→ 再寫『要看到 Y(明確門檻/統計判準)我才改選 Z』→ 才去取得資料 → 對照門檻執行。先看數字再定門檻=允許自己事後合理化。
- **問對問題**:問:『在看任何資料之前,我的預設選擇是什麼?需要什麼樣明確的證據(方向、幅度、信賴水準)才足以推翻它?這個門檻是我現在就敢寫下、不會事後調整的嗎?』
- **軟體工程**:效能優化/遷移前先定 SLA 門檻:『p99 必須降低 ≥20% 且不增加錯誤率,才合併此 PR』,寫進 PR 描述後再跑壓測,避免看到模稜兩可的 benchmark 才挑對自己有利的解讀。容量規劃同理先設擴容觸發條件。
- **產品開發**:A/B 測試上線前『預先登記』:預設保留現狀、主要指標、最小可偵測效果與顯著水準一律先寫死;結果出來只比對門檻,杜絕 p-hacking 與『再切一個 segment 看看』。
- **營運分析**:為每個營運 KPI 設『行動門檻』而非只看趨勢:例如『退貨率連續兩週 >X% 即觸發供應商複查』,讓資料真正驅動行動,而非事後找故事。
- **策略**:進入新市場前先定『止損與加碼判準』:預設不投入,需在 6 個月內達到某 leading indicator 才追加預算,避免沉沒成本驅動的擴張。
- **2026**:這正是實驗平台『pre-registration / guardrail metrics』與 feature flag 漸進釋出的理論基礎,2025–2026 在成熟 SaaS 已是標配。用 LLM 輔助分析時尤須前置判準,否則容易被模型生成的『看似洞見』牽著走(data-inspired 風險被 AI 放大)。
- 來源:https://hbr.org/2019/06/the-first-thing-great-decision-makers-do, https://kozyrkov.medium.com/data-inspired-5c78db3999b2, https://www.success.com/cassie-kozyrkov-decision-intelligence

### Type-1 / Type-2 與可逆 / 不可逆決策 (One-Way / Two-Way Doors) · fit 5
*aka / 出處:* Jeff Bezos Type 1 / Type 2 decisions;one-way door / two-way door;Amazon 1997 & 2015–2016 股東信
- **是什麼**:Bezos 在 2015 年 Amazon 股東信提出:有些決策後果重大且(近乎)不可逆——『單向門』(one-way doors),走過去若不喜歡就回不去,稱 Type 1,必須謹慎、緩慢、充分諮詢;但多數決策是可改變、可逆的『雙向門』(two-way doors),稱 Type 2,『應由高判斷力的個人或小團隊快速做出』。2016 年股東信補充:可逆決策應用輕量流程,並用『disagree and commit』(不同意但承諾) 加速。最早的反思見於 1997 年股東信。
- **用在決策流程**:做決策前先分類:這扇門是單向還是雙向?雙向門→授權、限時、輕量流程、快速試錯;單向門→升級層級、放慢、跑期望值/決策樹、要求多方諮詢。避免兩種錯配:把雙向門當單向門(過度分析、組織僵化=Day 2)、把單向門當雙向門(輕率造成不可逆損害)。
- **問對問題**:問:『如果這個選擇是錯的,我能多快、多便宜地回退?回退成本是分鐘級、季級還是不可逆?這個決策該升到哪一層、用多重的流程才匹配它的可逆性?』
- **軟體工程**:用可逆性決定部署策略:加 feature flag、可即時關閉的實驗=雙向門,個人即可合併並快速灰度;一次性資料庫 schema 破壞性遷移、刪除欄位、公開 API 合約變更=單向門,需 review、備份與分階段。可逆性直接對應 rollback 成本。
- **產品開發**:功能決策分流:可逆的 UI/文案/排序=快速上線小步快跑;不可逆的(資料模型、計費邏輯、對外承諾的 SLA)=慎重設計。把『先發佈可關閉版本』作為把單向門改造成雙向門的手段。
- **營運分析**:為決策建立『可逆性標籤』,在決策追蹤系統中區分,讓團隊把分析資源集中在少數單向門決策,而非每件小事都做厚重分析。
- **策略**:平台級抉擇(自建付款 vs 整合第三方、選定多租戶隔離模型)多為單向門,需期望值/情境分析與高層共識;行銷活動、訂閱方案微調多為雙向門,授權快速試。
- **2026**:可逆性思維在 2020 年代與 trunk-based development、feature flag、progressive delivery 深度結合——工程實務上『把單向門工程改造成雙向門』(藉灰度、影子流量、可回滾遷移)已成核心能力。AI 時代,給 AI agent 自動執行的決策應限制在可逆的 Type-2 範圍,單向門保留 human-in-the-loop。
- 來源:https://www.founderstribune.org/p/10-passages-from-jeff-bezos-s-shareholder-letters, https://www.entrepreneur.com/business-news/a-jeff-bezos-letter-from-1997-about-reversible-decisions/328284, https://duane.substack.com/p/the-difference-between-type-1-and

### 決策科學三支柱 (資料科學 + 行為科學 + 管理科學) · fit 4
*aka / 出處:* The interdisciplinary pillars of Decision Intelligence;applied data science / behavioral (social) science / managerial science
- **是什麼**:Kozyrkov 把 DI 描述為三門既有學科的融合:應用資料科學(從資料萃取資訊與不確定性的量化方法)、行為/社會科學(人如何感知、有哪些偏誤、如何設定判準與權衡)、管理科學(把決策落地到組織、流程、激勵與責任歸屬)。她稱 DI engineering 就是『用行為與管理科學去擴充資料科學』。
- **用在決策流程**:檢查任一決策是否三支柱都顧到:量化面(資料/模型/統計)有沒有處理好?人性面(偏誤、誘因、判準)有沒有被設計進去?組織面(誰決定、誰執行、如何監控)是否明確?缺哪一柱,決策就會在那裡失敗。
- **問對問題**:問:『這個問題的瓶頸是資料不夠、還是人會有偏誤、還是組織沒人負責?』很多看似資料問題其實是管理或行為問題,選錯支柱會浪費資源在錯的地方。
- **軟體工程**:事故覆盤(post-incident)時用三支柱拆解:是監控資料不足(資料科學)、值班工程師判斷偏誤(行為)、還是 on-call 責任未定義(管理)?避免每次都只補 dashboard 卻不改流程。
- **產品開發**:功能未被採用時,用三支柱判斷:是缺使用行為資料、是 onboarding 引發認知負荷(行為)、還是 PM/工程責任分工不清導致沒人推進(管理)。
- **營運分析**:建立分析團隊能力地圖:純 SQL/BI(資料科學)之外,是否有人懂實驗設計偏誤(行為)、是否有決策落地與追蹤機制(管理),補齊最弱的一柱。
- **策略**:評估『資料驅動轉型』提案時,提醒高層光買 BI 工具(資料科學)不夠,還要投資決策素養(行為)與決策權治理(管理),三柱齊備才有 ROI。
- **2026**:Gartner 2025–2026 對 DI 平台的定義呼應此三柱:平台需結合 decision modeling(管理科學)、analytics/AI(資料科學)與治理/監控,並把治理焦點從『資料治理』移向『決策治理』(決策如何被設計、執行、監控、稽核)。
- 來源:https://medium.com/data-science/introduction-to-decision-intelligence-5d147ddab767, https://www.linkedin.com/pulse/introduction-decision-intelligence-cassie-kozyrkov, https://grounded-architecture.io/decision-intelligence, https://www.gartner.com/en/documents/5599159

### 決策理論三分法:規範性 / 描述性 / 指示性 · fit 4
*aka / 出處:* Normative / Descriptive / Prescriptive decision theory
- **是什麼**:決策理論的經典三分:規範性研究『理性的人在完美資訊與效用最大化下應該怎麼決定』(如期望效用理論);描述性研究『人實際上怎麼決定』含有限理性與不理性(如展望理論 prospect theory);指示性是把前兩者應用到真實情境,『幫助追求理性卻不完美的人實務上做得更好』(如層級分析法 AHP)。三者對應:理性上該怎麼做、人實際怎麼做、人如何能做得更好。
- **用在決策流程**:面對一個決策時,先標定你在哪一層:你在算理想最優解(規範性)、在解釋/預測人的行為(描述性)、還是在設計一個讓真實的人更不易出錯的流程(指示性)?組織決策幾乎都該落在指示性——用規範性當北極星、用描述性預測偏差、再設計可落地的流程。
- **問對問題**:問:『理論上的最優解是什麼(規範性)?真實使用者/團隊會偏離到哪(描述性)?我該設計什麼護欄與預設值把兩者差距縮小(指示性)?』
- **軟體工程**:設計告警閾值或自動擴容策略:規範性給出理論上的最優門檻;描述性提醒值班工程師會有警報疲勞/錨定偏誤;指示性讓你設計分級告警與 runbook,讓真實的人在凌晨三點也能做對。
- **產品開發**:定價或方案設計:規範性算出最大化營收的價格;描述性引入 prospect theory(損失趨避、錨定)預測使用者反應;指示性據此設計『誘餌方案』與預設選項。
- **營運分析**:解讀 A/B 結果:規範性是統計最優判讀;描述性提醒分析師有確認偏誤;指示性要求事先登記假設與判準(pre-registration)以約束人為偏差。
- **策略**:競爭賽局分析:規範性用賽局論算均衡;描述性承認對手與自己都非完全理性;指示性據此選擇穩健而非脆弱最優的策略。
- **2026**:2020 年代行為決策研究持續整合三觀點(如 MDPI 2021 的批判性回顧);在 AI 時代,規範性框架被用來界定 AI agent 的『理性基準』,描述性研究則用來校正 LLM 與人類使用者的系統性偏誤,指示性設計成為 human-in-the-loop 與決策護欄的理論依據。
- 來源:https://www.mdpi.com/1911-8074/14/10/490, https://link.springer.com/chapter/10.1007/978-3-319-63026-7_2, https://thedecisionlab.com/reference-guide/psychology/decision-theory, https://www.sas.upenn.edu/~baron/papers/normative.pdf

### 期望值與決策樹 (Expected Value & Decision Trees) · fit 4
*aka / 出處:* Expected Monetary Value (EMV);decision tree analysis;期望效用 (expected utility)
- **是什麼**:在不確定下做選擇的量化方法:期望值/期望貨幣值 EMV = Σ(各結果機率 × 結果價值) − 成本;決策樹則用『決策節點(方框,可選項)』與『機率節點(圓圈,不確定結果)』把多階段選擇展開,在每個分支計算 EMV,選擇 EMV 最高(或對風險趨避者用期望效用)的路徑。
- **用在決策流程**:把選項與其不確定結果畫成樹:標上每條分支的機率與報酬,從末端往回折算 (roll back) 算出各選項的 EMV/期望效用,再選最高者。對下行風險敏感時,改用效用函數或同時看最壞情境,而非只看期望值。
- **問對問題**:問:『每個選項有哪些可能結果、各自機率多少、各值多少錢/效用?把機率乘上報酬後,哪個選項的期望值最高?最壞情境我承受得起嗎?哪個機率/報酬估計最敏感(值得再蒐集資訊)?』
- **軟體工程**:評估是否投入時間修一個間歇性 bug:P(再次發生)× 影響成本 vs 修復工時成本;或評估自動化測試投資:導入成本 vs (P(回歸缺陷)× 事故成本) 的期望節省,用 EMV 決定優先序。
- **產品開發**:新功能 go/no-go:畫決策樹——投入 $X 開發,成功機率 p 帶來營收 V,失敗機率 (1−p) 損失;若 EMV > 不做的基準就做(如搜尋結果中 $2M 投資、EMV $2.175M 的例子)。也用於 build vs buy。
- **營運分析**:把實驗結果轉成決策樹輸入:用實驗估出的轉換率提升機率分布,計算全量上線的期望增量營收 vs 維運成本,支援 roll-out 決策。
- **策略**:多階段策略投資(先 pilot 再全面)用決策樹建模:pilot 成功才解鎖下一階段投資,計算含『選擇權價值』的 EMV,避免一次 all-in。
- **2026**:2025 年的工具(Asana 等)把決策樹+期望值做成模板化流程;在 DI 平台中,EMV/決策樹是 prescriptive analytics 與 AI agent 自動決策的底層邏輯。需注意:機率估計的校準度比公式本身更關鍵,LLM 給出的機率常未校準,須以歷史資料驗證。
- 來源:https://asana.com/resources/decision-tree-analysis, https://www.brainbok.com/guide/pm-study-notes/risk/expected-monetary-value-emv, https://www.open.edu/openlearn/money-business/decision-trees-and-dealing-uncertainty/content-section-4.1, https://www.pmi.org/learning/library/decision-tree-analysis-expected-utility-8214

### 描述性決策:認知偏誤與展望理論 (Behavioral / Descriptive Decision Making) · fit 4
*aka / 出處:* Prospect theory (Kahneman & Tversky);cognitive biases;bounded rationality (Herbert Simon)
- **是什麼**:描述性理論解釋人『實際上』如何決定——往往偏離理性。展望理論指出人對損失的痛感大於同等收益的快感(損失趨避)、會相對於參考點而非絕對值評估、對小機率反應失真。Simon 的有限理性指人受認知與資訊限制只能『滿意即可』(satisficing) 而非最優化。常見偏誤包括錨定、確認偏誤、後見之明、可得性偏誤。
- **用在決策流程**:在設計決策流程時,預期並對沖偏誤:錨定→獨立估計後再討論;確認偏誤→指派魔鬼代言人/做事前驗屍 (premortem);損失趨避→把選項用一致的參考點重述。把『人會犯的系統性錯誤』當作可設計的變數。
- **問對問題**:問:『我們現在被什麼數字錨定了?我是在找證據支持已有結論還是真的在檢驗?如果換個參考框架重述這些選項,我的偏好會變嗎?哪個偏誤最可能在這個決策中坑我們?』
- **軟體工程**:估時與容量規劃對沖樂觀偏誤/規劃謬誤:用參考類別預測(看歷史相似任務實際耗時)而非從零估;code review 設計成獨立先讀再討論,避免第一位 reviewer 的意見錨定其他人。
- **產品開發**:定價與方案利用展望理論:用『原價劃線+折扣』呈現(參考點)、年繳『省下 X』而非月繳『多付 Y』訴諸損失趨避;但需與倫理/合規平衡,避免暗黑模式 (dark patterns)。
- **營運分析**:分析師偏誤防護:報告先呈現原始基準再給結論以防錨定;對『顯著』結果要求復現,對抗確認偏誤;留意倖存者偏誤(只看留存使用者資料)。
- **策略**:競品與市場判斷對沖過度自信與可得性偏誤:強制列出『我們可能錯在哪』與基準率,做事前驗屍想像策略失敗的原因。
- **2026**:Kahneman 等 2021《Noise》把焦點從偏誤(系統性偏差)延伸到『雜訊』(同類判斷的隨機分歧),提出『決策衛生』(decision hygiene) 與『中介評估法』;2025–2026 研究關注 LLM 同樣展現錨定、框架等類人偏誤,且會放大訓練資料偏見,使偏誤緩解成為 AI 輔助決策的設計重點。
- 來源:https://www.mdpi.com/1911-8074/14/10/490, https://thedecisionlab.com/reference-guide/psychology/decision-theory, https://www.academia.edu/12576145/Decision_Making_Descriptive_Normative_and_Prescriptive_Interactions

### 決策權框架 RAPID (Decision Rights) · fit 4
*aka / 出處:* Bain & Company RAPID;Recommend / Agree / Perform / Input / Decide;HBR 2006《Who Has the D?》
- **是什麼**:Bain 提出、2006 年 HBR《Who Has the D?》(Rogers & Blenko) 推廣的決策角色框架。五個角色:Recommend(蒐集 input、產生選項、依判準提出建議與理由)、Agree(明確的否決/核可權,與一般建議分開)、Perform(決策後執行)、Input(提供事實與洞見但無核可權)、Decide(唯一最終決策者,承諾組織行動)。目的:讓『誰負責什麼』透明,消除委員會式空轉。
- **用在決策流程**:對任何卡住或反覆的決策,先把五個角色一一指派(尤其確保只有一個 D);把『有否決權的人 (A)』與『只是提供意見的人 (I)』明確分開,避免人人都覺得自己能擋。寫進決策文件抬頭。
- **問對問題**:問:『這個決策誰是唯一的 Decide?誰有真正的否決權 (A)、誰只是 Input?Recommend 的人是否拿到了所有該有的 Input?目前是哪個角色缺位或重疊導致卡關?』
- **軟體工程**:跨團隊技術決策(共用平台 API 變更)用 RAPID:平台 staff 工程師 Recommend、安全/SRE 為 Agree、各使用團隊 Input、技術總監 Decide、實作團隊 Perform——避免 RFC 在 Slack 無限討論卻無人拍板。
- **產品開發**:功能優先序與 roadmap 取捨:PM 是 Decide、設計與工程 Input、法務/合規可能是 Agree、相關團隊 Perform,讓利害關係人多時仍能收斂。
- **營運分析**:建立『指標定義變更』的決策權:資料團隊 Recommend、財務/營運 Agree(因影響報表)、單一資料負責人 Decide,避免同一指標多版定義各自為政。
- **策略**:多租戶 SaaS 的客製化請求治理:銷售 Input、產品 Recommend、CTO/CEO Decide 是否進主線、工程 Perform,防止大客戶需求繞過流程直接綁架 roadmap。
- **2026**:在 2020 年代遠距/矩陣式組織,RAPID 與 DACI、RACI 等並用以對抗決策延宕;Gartner 2025–2026 的『決策治理』論述把決策權的明確化視為 DI 平台落地前提,並延伸到『哪些決策可授權給 AI agent、哪些保留人類 Decide』的新型決策權設計。
- 來源:https://www.bain.com/insights/rapid-decision-making/, https://www.toolshero.com/decision-making/rapid-decision-making-model/, https://www.theuncertaintyproject.org/tools/rapid-framework

### 決策優先級與資訊價值 (Prioritizing Decisions & Value of Information) · fit 4
*aka / 出處:* Does this decision deserve effort?;value of information (VoI);analysis proportional to stakes (Kozyrkov)
- **是什麼**:DI 的一條元原則:不是每個決策都值得同等分析。Kozyrkov 強調必須先做優先級判斷——『午餐三明治放什麼,不該和新產品的 GTM 策略用同等審慎度』。配套概念是『資訊價值』(VoI):只在『取得這份資訊可能改變決策、且改變所帶來的價值高於取得成本』時才去蒐集;有時分析會發現『沒有任何事實會改變你的選擇』,此時該停止分析直接行動。
- **用在決策流程**:對每個決策先做三問分流:賭注大小?可逆性(Type-1/2)?資訊是否可能改變選擇?據此分配分析預算。若發現預設行動不會因任何可得資訊而改變,立刻停止分析、執行,把精力轉到別處。
- **問對問題**:問:『這個決策值得我花多少時間?這份資料如果拿到了,真的會改變我的選擇嗎?改變的價值大過蒐集它的成本嗎?是不是我其實已經決定了、只是在拖延?』
- **軟體工程**:對抗『分析癱瘓』與過度工程:小型可逆的內部工具選型不必開三天 spike;反之對不可逆的資料模型決策才投入完整 POC。用 VoI 決定要不要再多寫一個 benchmark。
- **產品開發**:研究預算分配:對低風險可逆的 UI 改動直接上線觀察,把昂貴的使用者研究與大樣本實驗留給高賭注、不可逆的功能,避免每個小決策都排研究。
- **營運分析**:ad-hoc 分析需求排序:先問『這份分析會改變哪個決策、那個決策值多少』,對不會改變任何行動的請求婉拒,把分析資源投在高 VoI 問題上。
- **策略**:投資調研深度與決策賭注匹配:小型試點快速啟動取代漫長市場調研;只有平台級不可逆投資才動用顧問級盡職調查。
- **2026**:VoI 是貝氏決策理論的經典概念,DI 把它平民化為日常工作習慣;2025–2026 在 LLM 輔助下,蒐集與綜整資訊的邊際成本驟降,反而使『這個決策值不值得做、何時該停止蒐集』的元決策判斷,以及抵抗『因為很容易所以一直分析下去』的傾向,變得更重要。
- 來源:https://medium.com/data-science/introduction-to-decision-intelligence-5d147ddab767, https://hbr.org/2019/06/the-first-thing-great-decision-makers-do, https://www.linkedin.com/pulse/introduction-decision-intelligence-cassie-kozyrkov

### OODA 迴圈 (Observe–Orient–Decide–Act) · fit 3
*aka / 出處:* Boyd's decision cycle;觀察–定向–決策–行動
- **是什麼**:美國空軍上校 John Boyd 於 1970 年代提出的決策循環:Observe(即時蒐集多源資料)→ Orient(結合心智模型、經驗、脈絡形成理解)→ Decide(據定向選擇行動)→ Act(執行,回饋進入下一圈)。核心洞見:勝負不在絕對速度,而在『比環境變化更快地完成迴圈』,且 Orient(定向)是最關鍵的一步——定向錯誤的快迴圈會輸給定向正確的慢迴圈。
- **用在決策流程**:在快速變化/對抗情境中刻意縮短迴圈:建立即時觀測(monitoring)、投資 Orient(更新心智模型與假設,而非沿用過時框架)、讓 Decide 與 Act 之間的摩擦最小化,並用每一輪結果回饋校正下一輪。
- **問對問題**:問:『我的觀測夠即時嗎?我的心智模型(定向)還對嗎、還是用著過時的世界觀?我從觀測到行動的迴圈要多久,環境變化又有多快?上一圈的結果如何修正我這一圈的定向?』
- **軟體工程**:事故應變 (incident response) 與 on-call 即 OODA:Observe(監控告警/儀表)→ Orient(判斷故障域)→ Decide(回滾或修補)→ Act,並以 MTTR 衡量迴圈速度;混沌工程則是平時訓練更好的 Orient。
- **產品開發**:敏捷開發的 build-measure-learn 本質是 OODA:重點不只是發佈快,而是『定向』——能否從使用者行為正確更新對需求的理解,避免快速做出方向錯的功能。
- **營運分析**:即時營運監控(如大促期間轉換率、庫存、金流成功率)建立快迴圈:儀表板(Observe)→ 分析師判讀(Orient)→ 觸發營運決策(Decide/Act),並縮短資料延遲以加速迴圈。
- **策略**:面對競爭對手快速出招(如對手降價/推新功能)時,用 OODA 比對手更快定向與回應;強調策略敏捷性不是亂衝,而是更好的定向。
- **2026**:OODA 在 2020 年代被廣泛借用於網路安全、SRE 與競爭策略;在 AI 時代,自動化系統(autoscaling、anomaly detection、AI agent)正把 Observe→Act 的迴圈壓縮到次秒級,使人類角色上移到 Orient(設計心智模型/目標)與監督單向門決策。
- 來源:https://en.wikipedia.org/wiki/OODA_loop, https://oodaloop.com/the-ooda-loop-explained-the-real-story-about-the-ultimate-model-for-decision-making-in-competitive-environments/, https://asdlc.io/concepts/ooda-loop/
