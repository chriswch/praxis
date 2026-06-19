> 「決策科學方法目錄」系列 · D. 問對問題 / 問題框架 · 共 14 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 第一性原理思考 (First Principles Thinking) · fit 5
*aka / 出處:* First principles reasoning;回到不可再分的基本真理;亞里斯多德、Elon Musk、Farnam Street 推廣
- **是什麼**:把複雜問題拆解到「不能再被推導、只能假設成立」的基本元素（first principle），再從這些元素由下往上重新組裝，而不是用類比或既有慣例(by analogy)做漸進改良。
- **用在決策流程**:做重大技術或架構決策時，先寫下所有被當成『理所當然』的前提，逐一問『這是物理/業務上的硬限制，還是只是慣例？』。只保留真正不可動搖的限制，在其上重新推導方案，避免被現狀錨定。
- **問對問題**:我憑什麼相信這是真的？這個限制是定律還是習慣？如果從零開始、不繼承任何既有設計，最低限度需要哪些元素？我們其實在優化的是什麼根本量？
- **軟體工程**:例：團隊一直在『優化現有 N+1 查詢的快取』，用第一性原理會問『這個頁面真正需要的最小資料是什麼』，結論可能是改成單一聚合查詢或預先物化視圖，而非繼續疊快取層。
- **產品開發**:例：被要求『把結帳頁做得更快』時，拆到底層發現真正成本是『多店家共用結帳但每次都重新計算運費規則』，重構成快取運費矩陣，而非單純前端優化。
- **營運分析**:例：分析『轉換率低』時，不接受『因為頁面醜』這種既定說法，拆到漏斗每一步的物理事件（曝光→點擊→填表→付款），用事件層級數據重建因果。
- **策略**:例：評估是否自建金流 vs 串接第三方，回到基本成本結構（每筆交易的真實邊際成本、合規負擔、撥款週期），而非沿用『同業都用某金流』的類比決策。
- **2026**:2025–2026 常見做法是把 LLM 當『假設拆解器』，要它列出某設計背後所有隱含前提再逐一挑戰；但需自己驗證 LLM 列的前提是否真實，避免它把幻覺當成『基本真理』。
- 來源:https://fs.blog/first-principles/, https://sahilbloom.substack.com/p/first-principles-thinking

### MECE 與 議題樹 / 邏輯樹 (Issue Tree / Logic Tree) · fit 5
*aka / 出處:* MECE(Mutually Exclusive, Collectively Exhaustive);Issue tree;Logic tree;Hypothesis tree;麥肯錫 (McKinsey) 核心工具;Barbara Minto 金字塔原理相關
- **是什麼**:MECE 是『彼此互斥、合起來窮盡』的分類原則；issue tree 用 MECE 把一個大問題逐層拆成不重疊也不遺漏的子問題，把難題切成可解的小塊。當每個分枝是可被否證的問句時，它就同時成為假設檢驗結構。
- **用在決策流程**:面對龐雜問題先畫 issue tree，把它拆成 MECE 的子問題，再對每個子問題排優先序與分工，確保沒有重疊浪費、也沒有漏掉關鍵分枝，讓決策有可追蹤的結構。
- **問對問題**:這些分類是否互斥、是否窮盡？有沒有重疊（重複算）或缺口（漏掉）？哪個分枝對結果影響最大、最值得先查？每個分枝能不能寫成一個可被否證的問句？
- **軟體工程**:例：『API p99 延遲過高』拆成 MECE 分枝：網路/閘道、應用層運算、DB 查詢、外部依賴；每枝再下分，逐枝量測排除，避免亂槍打鳥地『先加個快取看看』。
- **產品開發**:例：『新註冊商家七日留存低』拆成 onboarding 完成度 × 首次成功出單 × 金物流設定完成 × 客服接觸；各枝獨立提假設與驗證。
- **營運分析**:例：『本月 GMV 下滑』用 MECE 拆成 流量 × 轉換率 × 客單價 × 退款；再把轉換率往下拆成各漏斗步驟，定位是哪一枝在掉。
- **策略**:例：評估『要不要進軍 POS 市場』，用 issue tree 拆成市場規模、我們的差異化能力、進入成本、與既有 SaaS 的綜效，逐枝量化後做 go/no-go。
- **2026**:2025–2026 issue tree 常與 LLM 搭配：先讓人定主幹確保 MECE，再用 LLM 補可能漏掉的子分枝（檢核 collectively exhaustive），但分類互斥性仍需人把關以免重複計數。
- 來源:https://www.craftingcases.com/issue-tree-guide/, https://www.mbacrystalball.com/blog/strategy/mece-framework/, https://www.hackingthecaseinterview.com/pages/issue-trees

### 假設驅動問題解決 (Hypothesis-Driven Problem Solving) · fit 5
*aka / 出處:* 麥肯錫式 (McKinsey);hypothesis-driven approach;day-one answer;先射箭再驗證
- **是什麼**:在資料尚未齊全時，先對答案提出一個明確、可被否證的假設，再針對性地蒐集最能驗證或推翻它的資料，避免『先把所有資料分析完再說』的低效；issue tree 提供假設的結構，分析則用來證偽。
- **用在決策流程**:面對待決問題時，先寫下『我猜根因/最佳解是 X，因為 A、B、C』，然後問『哪一份最小證據最可能推翻 X？』優先去拿那份證據，快速收斂或轉向。
- **問對問題**:我目前最相信的答案是什麼？它若是錯的，會在哪裡破？哪個分析最快能證偽它？我是在找支持假設的證據，還是在認真嘗試推翻它（避免確認偏誤）？
- **軟體工程**:例：debug 偶發失敗時不盲讀全部 log，先假設『是某次 deploy 後連線池耗盡』，直接去看該時間點的連線池指標來證偽，命中就深挖、不中就換假設。
- **產品開發**:例：規劃功能前先寫假設『若提供一鍵匯入既有商品，新商家上架率會 +20%』，用最小可行的灰度或 fake door 測試先驗證，再決定是否全量開發。
- **營運分析**:例：面對指標異常，先提 2–3 個競爭假設並各自預測『若為真會在哪個切片看到什麼模式』，再去查那個切片，而非把全部維度都 group by 一遍。
- **策略**:例：策略選題時對『某客群是成長引擎』提假設，設定可證偽的領先指標（如該客群的擴張收入率），用一季數據驗證後再 all-in。
- **2026**:現代資料/AB 測試文化與此一脈相承（pre-registered hypothesis 防 p-hacking）；2025–2026 LLM 可快速生成多個競爭假設，但人需確保假設可證偽並主動找反證，否則 LLM 易傾向迎合（sycophancy）。
- 來源:https://medium.com/@IliyanaStareva/8-step-framework-to-problem-solving-from-mckinsey-506823257b48, https://www.craftingcases.com/issue-tree-guide/

### 重構問題 (Reframing) — Frame / Reframe / Move Forward · fit 5
*aka / 出處:* Thomas Wedell-Wedellsborg《What's Your Problem?》(HBR Press, 2020);〈Are You Solving the Right Problems?〉(HBR, 2017);慢電梯問題;七大重構策略
- **是什麼**:一套快速的問題診斷迴圈：Frame（用『問題在於…』寫下初始框架）→ Reframe（花 5–10 分鐘、最好和他人一起挑戰假設、找更好的問題）→ Move Forward（向利害關係人測試問題後再動手）。重點不是找『真正的問題』，而是看『有沒有更值得解的問題』。經典例子是『電梯太慢』改框成『等待很無聊』後，裝鏡子即解。
- **用在決策流程**:任何重要決策前先強制跑一輪 reframe：把問題寫成完整句子，刻意找局外人與反例，問『我們是不是把症狀當問題了』，確認框架後再分配資源。
- **問對問題**:問題真的是我們寫的這個嗎？有沒有更好的問題可解？局外人會怎麼看？有沒有人沒遇到這問題（亮點/正向例外）？我自己是不是問題的一部分？對方真正的目的是什麼（而非他要的方案）？
- **軟體工程**:例：團隊一直想『加快 CI』，reframe 後發現真正問題是『開發者等回饋時失焦』，解法改成把最快的測試前置 + 失敗即時通知，而非硬投錢買更快的 runner。
- **產品開發**:例：商家要求『要能匯出更多報表欄位』，用 reframe 與『問對方真正目的』發現他們其實要對帳對得上，重構為提供對帳專用視圖。
- **營運分析**:例：把『如何降低跳出率』重構為『哪些跳出其實是任務已完成的好跳出』，避免優化錯指標。
- **策略**:例：把『如何打敗某對手』重構為『我們的客戶真正雇用我們完成什麼工作』，避免陷入功能軍備競賽。
- **2026**:Wedell-Wedellsborg 2024 在 HBR 再發〈To Solve a Tough Problem, Reframe It〉延續此法；2025 一篇 CHI 研究〈No Evidence for LLMs Being Useful in Problem Reframing〉指出直接用 LLM 重構未必提升 frame 品質，故 reframe 仍應由人主導、LLM 僅輔助發散。
- 來源:https://hbr.org/2017/01/are-you-solving-the-right-problems, https://www.dukece.com/insights/how-to-solve-the-right-problems/, https://hbr.org/2024/01/to-solve-a-tough-problem-reframe-it, https://dl.acm.org/doi/full/10.1145/3706598.3713273

### 區分症狀與根因 (Symptom vs Root Cause) · fit 5
*aka / 出處:* treating symptoms vs root causes;root cause analysis;貫穿 5 Whys / A3 / Fishbone 的判準
- **是什麼**:一個貫穿所有問題框架方法的核心判準：症狀是問題的外顯表現，根因是若不處理就會反覆製造症狀的系統性來源。只解症狀會讓問題不斷復發；正確診斷要求把分析推到可改變的根因，且每層因果需有證據。
- **用在決策流程**:在批准對策前，先問『這是在止痛還是在根治』；要求對每個提案標明它打的是症狀還是根因，並設計可驗證『問題不再復發』的後續指標。
- **問對問題**:這是症狀還是根因？如果只做這個，問題會不會三個月後又回來？我手上的因果是驗證過的事實還是推測？根因是系統性的，還是被歸到了某個人身上（多半代表還沒到底）？
- **軟體工程**:例：服務常掛就一直重啟（治症狀）vs 找出記憶體洩漏或缺背壓機制的根因（治本）；postmortem 要求列出根因與防復發措施而非只記錄『已重啟恢復』。
- **產品開發**:例：客訴某步驟卡關就加提示文字（症狀）vs 重新設計該流程或預設值（根因）；避免靠 UI 補丁掩蓋設計缺陷。
- **營運分析**:例：退款率升高就加強審核（症狀）vs 定位到特定商品/物流/設定問題的根因；用切片分析確認根因而非整體加摩擦。
- **策略**:例：營收下滑就猛打折促銷（症狀）vs 診斷出價值主張或客群錯配的根因，避免用短期手段掩蓋結構性問題。
- **2026**:這是評估前述所有方法輸出的試金石；2025–2026 結合可觀測性數據與 LLM 輔助歸因時，更要警惕把『相關性/表面解釋』誤當根因，務必回到證據鏈驗證。
- 來源:https://en.wikipedia.org/wiki/Five_whys, https://flowfuse.com/blog/2025/12/five-whys-root-cause-analysis-definition-examples/, https://artoflean.com/reference/five-why

### 5 Whys 五問法 · fit 4
*aka / 出處:* Five Whys;豐田生產系統 (TPS);Sakichi Toyoda 發明、Taiichi Ohno 大野耐一 推廣;root cause analysis
- **是什麼**:從一個具體現象出發，連續追問『為什麼』（典型約五層），穿透表面症狀直到觸及可改變的系統性根因。豐田強調要『現地現物 (gemba)』親眼觀察，且每一層因果要有證據而非只是聽起來合理的推測。
- **用在決策流程**:在決定『要修什麼』之前先跑一輪 5 Whys，確保投入的對策打在系統性根因而非症狀。若鏈條停在『某人疏忽/手誤』，視為尚未到底——大野耐一的哲學是系統應防止錯誤，而非歸咎個人。
- **問對問題**:為什麼會發生？這一層是我驗證過的事實還是推測？如果修掉這一層，上一層會不會再次發生？鏈條是否停在『人為疏失』這種症狀層？
- **軟體工程**:例：線上 500 錯誤 →為什麼？某 worker OOM →為什麼？單筆訂單載入全部歷史出貨 →為什麼？沒分頁 →為什麼？當初資料量小 →根因：缺少資料量成長時的分頁/上限設計，對策是加分頁與守門，而非只調大記憶體。
- **產品開發**:例：商家抱怨『結帳頁缺超商選項』，逐層追問會落到 shippings.shipping_type / shipping_rules 設定缺失（而非單純 payment_enabled），根因是物流與金流設定分離未串好。
- **營運分析**:例：本月退款率上升 →為什麼？某 plan 商家集中 →為什麼？該 plan 剛下放某功能 →為什麼觸發退款？功能 callback 兩處來源不一致 →根因鎖定到具體程式路徑，而非泛泛歸因『客服變差』。
- **策略**:適合戰術/營運層根因；策略層多重交織因果時，5 Whys 易過度線性，需搭配 issue tree。
- **2026**:2025–2026 業界普遍提醒 5 Whys 的最大坑是『單一線性鏈』與『停在症狀』；衍生出 Many Whys / 結合 Fishbone 的做法，並強調『業餘版是合理推測串成的鏈，專業版是證據串成的鏈』。
- 來源:https://en.wikipedia.org/wiki/Five_whys, https://artoflean.com/reference/five-why, https://flowfuse.com/blog/2025/12/five-whys-root-cause-analysis-definition-examples/

### 豐田 A3 問題解決法 · fit 4
*aka / 出處:* A3 Problem Solving;A3 Thinking;Toyota Business Practices (TBP);PDCA on one page;Sobek & Smalley 著作系統化
- **是什麼**:用一張 A3 紙完整走完 PDCA 思考：背景(Background)→現況(Current Condition)→問題陳述→根因分析(常內含 5 Whys/魚骨圖)→目標狀態(Target)→對策(Countermeasures)→追蹤(Follow-up)，強迫從問題到行動的邏輯一氣呵成。
- **用在決策流程**:把任何重大改善/事故當成一張 A3 來寫：先量化現況與目標的落差，再做根因分析，最後才列對策。決策審查時看的是『問題定義與根因是否站得住』，而非只看解法漂不漂亮。
- **問對問題**:現況與目標之間量化的落差是多少？根因分析的證據在哪？這個對策對應到哪一條根因？怎麼驗證對策有效（Check 階段的指標）？
- **軟體工程**:例：把一次嚴重 incident 的 postmortem 用 A3 格式寫：背景（影響多少商家/訂單）、現況數據、5 Whys 根因、修復對策、回歸測試與監控告警作為 follow-up。
- **產品開發**:例：某功能採用率低，用 A3 把『目前採用率 vs 目標』、使用者卡關點、根因（onboarding 缺引導）、改版對策、上線後追蹤指標一頁講清楚，作為 PRD 的決策附件。
- **營運分析**:例：客服工單暴增專案，用 A3 統一呈現工單量趨勢圖、分類 Pareto、根因、SOP/產品對策與後續工單下降追蹤，方便跨部門對齊。
- **策略**:可作為策略提案的單頁論證骨架；但策略不確定性高、選項分歧時，A3 的線性結構需搭配假設驗證法補強。
- **2026**:A3 的精神（單頁、PDCA、強迫寫清楚現況與根因）仍是現代 incident postmortem / RFC 文化的祖先；2025–2026 常被改寫成 Notion/Confluence 範本並嵌入 dashboard 連結。
- 來源:https://www.symestic.com/en-us/what-is/a3-problem-solving, https://www.ease.io/blog/a3-reports-and-problem-solving-101/, https://books.google.com/books/about/Understanding_A3_Thinking.html?id=v6G1V9GdJucC

### 蘇格拉底提問 (Socratic Questioning) · fit 4
*aka / 出處:* Socratic method;Richard Paul & Linda Elder 六類提問;critical thinking;The Thinker's Guide to Socratic Questioning
- **是什麼**:透過有系統的追問來釐清思考、暴露隱含假設與證據缺口。Paul & Elder 整理出六類提問：澄清、探究假設、探究理由與證據、探究觀點與立場、探究意涵與後果、對問題本身發問。
- **用在決策流程**:在會議或評審中，對任何主張用六類提問逐一檢視（你這話什麼意思？背後假設是什麼？證據呢？換個立場會怎樣？會帶來什麼後果？這問題本身問對了嗎？），逼出被跳過的推理。
- **問對問題**:你說 X 是什麼意思？我們假設了什麼？有什麼證據支持？還有別的看法嗎？這會導致什麼後果？我們一開始問的問題對嗎（對問題發問）？
- **軟體工程**:例：code review 或設計評審時用蘇式提問挑戰『這裡為何用悲觀鎖』『假設併發量是多少』『有資料支持嗎』，避免『因為大家都這樣寫』式決定。
- **產品開發**:例：需求澄清時對『使用者想要 X 功能』連續追問『真正的工作是什麼』『憑什麼相信』『有沒有反例』，避免把利害關係人的方案誤當需求。
- **營運分析**:例：看到一張漂亮的圖表時，追問『這定義怎麼算的』『樣本是誰』『有沒有倖存者偏差』『若反過來解讀呢』，防止被誤導性指標牽著走。
- **策略**:例：策略討論中對『市場一定會成長』探究假設與證據、再探究『如果不成長的後果』，避免把樂觀預期當前提。
- **2026**:Socratic 提問是『用 LLM 問對問題』的人類版範本；2025–2026 有人反過來請 LLM 對自己的方案做蘇式拷問，但 AISI 2026 研究指出 LLM 有迎合傾向，需明確要求它扮演質疑者並提供反證。
- 來源:https://www.criticalthinking.org/files/SocraticQuestioning2006.pdf, https://websites.umich.edu/~elements/5e/probsolv/strategy/cthinking.htm

### 抽象階梯 (Abstraction Laddering) · fit 4
*aka / 出處:* Why-How laddering;abstraction ladder;LUMA Institute 收錄;problem framing exercise
- **是什麼**:把問題陳述放在『梯子』中間，往上問『為什麼』得到更抽象、更廣的問題框架，往下問『如何』得到更具體、更接近解法的問題。藉由上下移動找到最適合切入的問題層級。
- **用在決策流程**:當問題太窄（已經內含解法）或太大（無從下手）時，用 why/how 上下移動，找到『既有意義又可動手』的那一階，再從該階展開選項。
- **問對問題**:為什麼要解這個問題（往上一階，這真的是目的嗎）？要達成這個更高目的還有別的路嗎？具體要怎麼做（往下一階）？我現在卡在太抽象還是太具體？
- **軟體工程**:例：工單寫『加一個匯出 CSV 按鈕』，往上問為什麼→『商家要對帳』，發現提供對帳報表或直接串接會計軟體可能更對，重新框定要做的東西。
- **產品開發**:例：把『做一個 App 推播功能』往上抽象成『如何讓商家及時知道有新訂單』，打開 email/LINE/桌面通知等更多解法空間。
- **營運分析**:例：把『降低某按鈕跳出率』往上抽象成『如何讓使用者順利完成結帳』，避免局部優化單一指標卻傷害整體漏斗。
- **策略**:例：把『要不要做訂閱制』往上抽象成『如何提高客戶終身價值與留存』，再往下展開訂閱、年約、加值服務等不同路徑比較。
- **2026**:是 design thinking 與 product discovery 常備工具；2025–2026 常被嵌入 Miro/FigJam 範本，並用來引導 LLM『先往上抽象列出 5 個不同 framing』再收斂。
- 來源:https://untools.co/abstraction-laddering/, https://www.luma-institute.com/abstraction-laddering/, https://ixdf.org/literature/topics/why-how-laddering

### How Might We（我們可以如何…） · fit 4
*aka / 出處:* HMW;design thinking 問題定義法;Min Basadur 在 P&G 1970s 引入、IDEO/Google/Facebook 推廣;源於 Parnes/Osborn 創造力研究
- **是什麼**:把研究中發現的痛點，改寫成『我們可以如何…』開頭的開放式問句，刻意保留適度模糊，既不內建解法、也不過於發散，作為 ideation 的起跑線。
- **用在決策流程**:從真實使用者洞察出發，先把痛點轉成數個 HMW，再用『不太窄（沒內建解法）／不太寬（仍聚焦核心問題）／針對根因而非症狀／用正向動詞』四項檢核挑出值得發想的問題框架。
- **問對問題**:這個 HMW 是基於真實研究還是憑空想像？它有沒有偷藏解法？是否太窄或太寬？它打的是根因還是症狀？換個動詞會打開不同空間嗎？
- **軟體工程**:例：把『開發者抱怨 webhook 常漏收』改寫成『HMW 讓第三方 App 對重要事件有信心一定收得到』，打開重試、補發、對帳 API 等多種技術方案。
- **產品開發**:例：研究發現新商家對設定金物流沒信心，寫成『HMW 讓商家在開店第一天就確信結帳設定是對的』，引導出引導式檢查清單、預檢與測試下單等點子。
- **營運分析**:例：把『客服回應太慢』的根因洞察寫成『HMW 讓商家在等待時仍覺得問題正在被處理』，引出自助知識庫、狀態可視化等方向（呼應慢電梯裝鏡子的思路）。
- **策略**:例：把市場洞察寫成『HMW 讓中小商家不需懂技術也能用上進階行銷』，作為產品線策略發想的共同問題框架。
- **2026**:NN/g 與 IxDF 在 2026 仍將 HMW 列為問題定義主力工具；2025–2026 常用 LLM 一次生成大量 HMW 變體再人工篩選，但需用上述檢核避免偷藏解法或偏離研究根因。
- 來源:https://www.nngroup.com/articles/how-might-we-questions/, https://ixdf.org/literature/topics/how-might-we

### Framestorming（框架風暴） · fit 4
*aka / 出處:* Tina Seelig 提出;先框架後發想;framestorming before brainstorming
- **是什麼**:在 brainstorming（找解法）之前，先 framestorming（找問題框架）——針對同一情境刻意生成多種不同的問題框架與提問角度，挑戰初始假設，確保接下來是在解對的問題。核心口訣：framestorming 先於 brainstorming。
- **用在決策流程**:啟動任何方案前，先開一場只產出『問題的不同問法』的會議，列出 5–10 種 framing，比較每種框架會打開或遮蔽什麼，選定框架後才進入解法發想。
- **問對問題**:這個情境還能怎麼問？換成另一個框架會看到什麼新解法、又會忽略什麼？我們是不是太快進入解法模式了？哪個 framing 最值得投資？
- **軟體工程**:例：面對『系統不穩』，framestorm 出多種問法：『是可用性問題？可觀測性問題？還是變更管理問題？』不同框架導向 SLO、監控、或部署流程等不同投資。
- **產品開發**:例：對『新商家流失』先 framestorm 出『獲客錯客群？onboarding 太難？價值兌現太慢？』多框架，再針對最有證據的框架做 discovery。
- **營運分析**:例：分析季度數據前，先列出多種可能的問題框架（成長放緩 vs 結構轉變 vs 季節性），避免一頭栽進單一假設的分析。
- **策略**:例：策略工作坊先 framestorm『我們在打的到底是哪一場仗』，再進入選項評估，避免全公司高效執行錯的策略框架。
- **2026**:與 Wedell-Wedellsborg 的 reframe、HMW 高度互補，常一起用；2025–2026『用 AI 一次生成多個 framing、各列出 enables/hides』正是 framestorming 的 LLM 化實作。
- 來源:https://modelthinkers.com/mental-model/framestorming, https://www.fastcompany.com/3060573/how-brainstorming-questions-not-ideas-sparks-creativity, https://onlydeadfish.co.uk/2026/01/16/using-ai-to-ask-better-questions/

### 問題陳述寫法 5W1H (Problem Statement) · fit 4
*aka / 出處:* 5W+1H;Who/What/Where/When/Why/How;Lean Six Sigma 問題陳述;Atlassian problem framing play
- **是什麼**:用記者的 5W（Who/What/Where/When/Why，常加 How）把問題寫成一句簡潔、具體、可量化、但不規定解法（descriptive not prescriptive）的陳述：點出現況、理想狀態與兩者落差，以及為何值得解。
- **用在決策流程**:任何專案啟動前，要求先交出一句符合 5W1H 的問題陳述並量化影響；無法寫清楚『誰、在什麼情境、落差多大、為何值得解』就不放行進入解法討論，避免假需求。
- **問對問題**:誰受影響？問題具體是什麼（現況 vs 理想的落差）？在哪裡、何時發生？為何值得解、影響多大（量化）？我是不是不小心把解法寫進問題裡了？
- **軟體工程**:例：bug ticket 強制用 5W1H：哪些商家(Who)、在結帳第三步(Where)、何種付款組合(When/What)、影響多少訂單(量化 Why)，讓工程師一眼看出複現條件與優先序。
- **產品開發**:例：PRD 開頭用一句問題陳述取代功能清單，逼團隊先對齊問題與成功度量，再談解法。
- **營運分析**:例：分析需求單要求附 5W1H 問題陳述與量化影響，避免『幫我拉個數據』式的無頭緒分析。
- **策略**:例：策略議題用問題陳述把模糊的『成長放緩』收斂成『哪個客群、哪段期間、相對什麼基準、掉了多少』，才能談對策。
- **2026**:Atlassian、Mural、Figma 等 2026 仍把 problem statement 當 problem framing 第一步；常與 HMW 接力（problem statement 收斂現況、HMW 打開解法空間）。
- 來源:https://isssp.org/5w1h-writing-an-effective-problem-statement/, https://www.atlassian.com/team-playbook/plays/problem-framing, https://www.isixsigma.com/getting-started/how-to-write-an-effective-problem-statement/

### Job Story / Jobs to be Done 工作故事 · fit 4
*aka / 出處:* When [situation] I want to [motivation] so I can [outcome];Intercom 發明、Alan Klement 命名;JTBD;對比 user story
- **是什麼**:用『當[情境]，我想要[動機]，以便[結果]』的格式描述使用者要完成的工作，聚焦情境、動機與期望結果，刻意不綁定特定人物角色或解法，避免把方案誤當需求。由 Intercom 產品團隊提出、Alan Klement 命名。
- **用在決策流程**:決定要不要做某功能前，先把它對應到一條 job story；若寫不出清楚的情境與結果，代表問題沒想清楚。用 job story 比較不同方案是否都服務同一個 job。
- **問對問題**:使用者在什麼情境下會冒出這個需求？他真正想完成的工作與結果是什麼？我們是不是把某個解法當成了需求？有沒有別的方案能更好地完成同一個 job？
- **軟體工程**:例：設計通知系統時寫『當我離開電腦但店裡有新訂單時，我想立刻知道，以便不漏單』，這比『做一個推播 API』更能引導正確的技術取捨（送達保證 > 花俏 UI）。
- **產品開發**:例：用 job story 取代帶角色假設的 user story，避免『身為商家我想要 X』把方案寫死，改聚焦情境與結果，打開設計空間。
- **營運分析**:例：把功能採用數據對應到背後的 job，分析『哪些 job 已被滿足、哪些情境下使用者仍流失』，而非只看孤立的點擊數。
- **策略**:例：以『顧客雇用我們的產品來完成什麼 job』作為市場與競品分析的單位，發現真正的競爭者可能是 Excel 或人工，而非同類 SaaS。
- **2026**:Job story 與 Christensen 的 JTBD 同源但格式由 Intercom 獨立發展；2026 仍是 product discovery 主流寫法，常與 HMW、reframe 串用把『工作』轉成可發想的問題。
- 來源:https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/, https://jtbd.info/designing-features-using-job-stories-41d20fc7ade6, https://www.mountaingoatsoftware.com/blog/job-stories-offer-a-viable-alternative-to-user-stories

### Hamming 的「重要問題」(Working on Important Problems) · fit 4
*aka / 出處:* Richard Hamming〈You and Your Research〉(1986, Bell Labs talk);open door vs closed door;'what are the important problems of your field?'
- **是什麼**:Hamming 主張做研究（與工作）真正的槓桿在於『選對重要的問題』，而非只把手上的問題做快。他觀察『開著門工作』的人雖被打擾、產出較少，卻更能感知什麼問題重要；並提倡定期自問『我所在領域最重要的問題是什麼？我為什麼不在做它？』
- **用在決策流程**:在 roadmap/季度規劃時，把『這是不是值得做的重要問題』放在『這個方案好不好』之前；定期盤點『領域裡最重要但沒人做的問題』，避免把精力耗在重要性邊緣的事。
- **問對問題**:我所在領域/產品最重要的問題是什麼？我為什麼不在做它（是真的難，還是只是慣性）？這件事就算做得完美，重要嗎？我有沒有因為『門關著』而錯失了什麼重要訊號？
- **軟體工程**:例：與其持續微調已經夠用的服務，問『對可靠性/成長真正關鍵但沒人碰的問題是什麼』（如多租戶隔離、資料一致性），把工程精力導向高槓桿處。
- **產品開發**:例：季度選題時刪掉一堆『有人要但不重要』的小功能，集中在少數真正影響留存或營收的重要問題。
- **營運分析**:例：先界定『哪一個指標的改善最能改變公司命運』，分析資源優先投入該重要問題，而非把報表越做越多卻越來越邊緣。
- **策略**:例：把『開著門』制度化（與客服、業務、商家定期交流）以持續感知市場上正在浮現的重要問題，作為策略選題的雷達。
- **2026**:在 AI 自動化大量執行工作的 2025–2026，『選對重要問題』的相對價值更高——執行被機器加速後，差異化更取決於人選的是不是對的、重要的問題。
- 來源:https://www.cs.virginia.edu/~robins/YouAndYourResearch.html, https://gwern.net/doc/science/1986-hamming
