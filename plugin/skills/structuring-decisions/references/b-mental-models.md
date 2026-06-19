> 「決策科學方法目錄」系列 · B. 心智模型柵格(通用思維) · 共 20 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 心智模型柵格與多元思維 (Latticework of Mental Models) · fit 5
*aka / 出處:* Munger's Latticework / Worldly Wisdom / 反面案例:man-with-a-hammer syndrome
- **是什麼**:Munger 主張不要只靠單一學科,而是建立一組來自多個學科(心理學、數學、工程、物理、生物、經濟)的可重用模型,像柵格一樣交織在腦中;遇到問題時用多個模型交叉檢驗,避免單一視角的盲點。
- **用在決策流程**:把它當成 meta 流程:任何重大決策前,刻意跑過至少 3–4 個不同學科的模型(例如 incentive、second-order、inversion、probabilistic)再下結論,而不是只用最熟悉的那一個。建立自己的模型清單當 checklist。
- **問對問題**:「我現在是不是只用了一個模型(拿鐵鎚看釘子)?」「換成工程師/心理學/經濟學的角度,這件事會怎麼看?」「哪幾個模型在這個情境會互相矛盾?」
- **軟體工程**:排查線上事故時不要只用「程式碼 bug」這個鐵鎚:同時跑 incentive(誰的 KPI 讓這段被趕工)、second-order(這個 hotfix 之後會引發什麼)、margin of safety(容量還剩多少 buffer),交叉看才不會誤判根因。
- **產品開發**:評估一個新功能時,同時用 opportunity cost(不做別的東西的代價)、network effects(會不會自我增強)、circle of competence(團隊真的懂這個領域嗎)三個模型,而非只看「客戶有要求」。
- **營運分析**:看 metric 異常時,並用 probabilistic thinking(是雜訊還是訊號)、base rate(歷史上這種波動多常見)、Hanlon's razor(是埋點壞掉而非真的轉換崩盤),避免單因歸因。
- **策略**:做多租戶 SaaS 的 plan/定價策略時,把心理學(commitment、social proof)、經濟學(opportunity cost、leverage)、賽局(競爭者反應)等模型一起攤開,降低單一框架的策略誤判。
- **2026**:2025–2026 在 AI 時代特別有價值:AI 能快速生成單一視角的答案,但容易陷入「一個鐵鎚」;人的差異化價值在於主動切換多個模型去 stress-test AI 的輸出。
- 來源:https://fs.blog/mental-models/, https://www.modelthinkers.com/mental-model/mungers-latticework, https://fs.blog/great-talks/psychology-human-misjudgment/

### 人類誤判心理學 (The Psychology of Human Misjudgment) · fit 5
*aka / 出處:* Munger's 25 Standard Causes of Human Misjudgment / lollapalooza effect(多偏誤疊加)
- **是什麼**:Munger 在 1995 年哈佛演講中整理出約 25 種人類可預測的心理傾向(誘因偏誤、承諾一致性、社會認同、可得性偏誤、嫉妒、過度自信等);多個傾向同向疊加會產生「lollapalooga」放大效應,結果是乘法而非加法。
- **用在決策流程**:把這 25 種傾向當成 debug 自己與團隊判斷的 checklist:做決定前自問「我現在被哪幾個偏誤推著走?」尤其注意誘因偏誤與承諾一致性這兩個最常見的。
- **問對問題**:「我的判斷是不是被獎金/KPI 的誘因扭曲了(incentive-caused bias)?」「我堅持這個架構是因為它真的好,還是因為我已經公開承諾過(commitment & consistency)?」「大家都這樣做,是真的對還是只是 social proof?」
- **軟體工程**:Sunk cost + commitment bias 會讓人死守一個寫了三個月卻走偏的重構;用這個模型可以更早承認「該砍掉重練」。Code review 時 social proof(資深的人 approve 了我就 LGTM)會放過真正的問題。
- **產品開發**:誘因偏誤:如果業務獎金只看簽約數,他們會推一堆客製承諾把產品搞爛;設計激勵與 roadmap 流程時要先想到這點。可得性偏誤:最近一個大客戶吵的 feature 不一定是最該做的。
- **營運分析**:確認偏誤讓你只去找支持既有假設的數據;做 A/B test 分析時要先寫下「什麼結果會推翻我」。over-optimism 會讓人高估新功能的留存提升。
- **策略**:嫉妒/比較傾向會驅使你盲目跟進競爭者的功能(競品有我也要有);用這個模型擋住「feature 軍備競賽」,回到自己的 north star。
- **2026**:Munger 於 2023 年底過世(享年 99),這篇演講被視為其最原創的智識貢獻,2024–2026 在科技與投資圈持續被引用;對 PM/工程主管尤其實用,因為大多數壞決策來自人而非技術。
- 來源:https://fs.blog/great-talks/psychology-human-misjudgment/, https://www.sloww.co/psychology-human-misjudgment-charlie-munger/, https://jamesclear.com/great-speeches/psychology-of-human-misjudgment-by-charlie-munger

### 能力圈 (Circle of Competence) · fit 5
*aka / 出處:* Circle of Competence / Munger & Buffett 常用;The Great Mental Models Vol 1
- **是什麼**:每個人都有真正可靠掌握的知識範圍。圈的大小不是重點,知道圈的「邊界」才是;當驅動行動的是自尊而非能力,就會出現盲點。在圈內你有優勢,圈外則脆弱。
- **用在決策流程**:決策前誠實標出「這在我的圈內還是圈外」;圈外的決策要刻意找專家、降低賭注、或明確標示為高不確定性,而不是假裝自己懂。
- **問對問題**:「這個領域我是真的懂,還是只是看起來懂?」「我的圈邊界在哪?跨出去了嗎?」「誰的圈涵蓋這塊,我該不該找他?」
- **軟體工程**:別在不熟的領域(例如金流結算、加密、稅務計算)硬幹;這些圈外領域要找專家 review 或用成熟函式庫,而不是自己造輪子。明確知道自己對哪塊 codebase 真的熟。
- **產品開發**:團隊能力圈決定該自建還是買/接 API。電商的物流、發票、金流若不在團隊能力圈內,優先整合既有服務(對應前述 payment/shipping 設定的複雜度)。
- **營運分析**:承認自己對統計顯著性、因果推論的能力邊界;複雜的歸因分析該拉資料科學同事,而非用直覺解讀。
- **策略**:公司的能力圈決定可信的策略賭注;不要因為市場熱就跨進完全不懂的領域(例如貿然做自己不懂的跨境/海外市場),先擴圈再下注。
- **2026**:2025–2026 延伸應用:建立「對 AI 的能力圈認知」——清楚知道 LLM 在哪些任務可靠、哪些會 hallucinate,等同於把 circle of competence 套用在工具上。
- 來源:https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/

### 第一性原理 (First Principles Thinking) · fit 5
*aka / 出處:* First Principles / 源自亞里斯多德,Elon Musk 推廣;The Great Mental Models Vol 1
- **是什麼**:把複雜問題拆解到最基本、無法再質疑的真理(基本事實),剝除類比與既有假設,再從地基重新組裝理解。這是創新者的方法,因為大多數人只做漸進式改良。
- **用在決策流程**:當「大家都這樣做」或「我們一直都這樣」成為唯一理由時,停下來問:剝掉慣例後,真正的物理/經濟/技術限制是什麼?從那裡重建方案。
- **問對問題**:「這個約束是真的物理/法律限制,還是只是歷史包袱/別人這樣做?」「如果今天從零開始,我會怎麼設計?」「哪些假設其實沒被驗證過?」
- **軟體工程**:效能優化別只照搬「加 cache」這種類比;先拆到第一性原理——這個 query 慢的根本原因是 N+1、缺 index、還是資料模型錯?(對應專案規則:N+1 是 critical issue)。重新設計而非貼補丁。
- **產品開發**:別只抄競品的結帳流程;回到第一性原理——使用者完成購買真正必要的最小步驟是什麼?據此重設計 checkout,而非疊加更多欄位。
- **營運分析**:別直接套用業界 benchmark(類比);先問自己這個產品的留存/轉換的基本驅動因子是什麼,建構自己的指標模型。
- **策略**:定價別只跟著競品打折(類比);拆到第一性原理——每個 plan 的邊際成本、客戶實際獲得的價值,從這裡重建定價結構。
- **2026**:AI 輔助開發時更關鍵:LLM 擅長產生「基於既有模式的類比解法」,工程師的差異化價值在於用第一性原理判斷該不該採用,並重構問題本身。
- 來源:https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/, https://readingraphics.com/book-summary-the-great-mental-models-general-thinking-concepts/

### 二階思考 (Second-Order Thinking) · fit 5
*aka / 出處:* Second-Order Thinking / 'And then what?' / Howard Marks 也常用;The Great Mental Models Vol 1
- **是什麼**:不只看決策的直接(一階)結果,而是持續追問「然後呢?」去推演後續的連鎖與長期效應,像棋手往後多想幾步。
- **用在決策流程**:對每個方案至少推演到二、三階後果,特別注意「短期看似好、長期有害」的選項;把連鎖效應寫下來再決定。
- **問對問題**:「這個決定的下一步、再下一步會發生什麼?」「短期的好處會不會製造長期的債?」「誰會因此改變行為,進而影響什麼?」
- **軟體工程**:加一個方便的全域開關或 feature flag(一階:快速上線);二階:flag 永久殘留變成技術債、組合爆炸難測;三階:沒人敢清。降耦合決策都該做二階推演。對應 EC 功能下放的 rollback 具破壞性——上線前先想清楚反向後果。
- **產品開發**:為留住一個大商家做高度客製(一階:留住客戶);二階:其他商家也要、變成維護地獄、拖慢通用功能。多租戶 SaaS 的客製化決策必做二階思考。
- **營運分析**:為衝某個指標而改 UI(一階:該指標上升);二階:擠壓了另一個關鍵指標(例如衝點擊卻傷了留存)。看指標一定要看 guardrail metrics。
- **策略**:降價搶市占(一階:用戶增加);二階:競爭者跟進、毛利崩、品牌錨定低價、難再漲。策略決策的長期連鎖最該用此模型。
- **2026**:與系統思考、feedback loop 高度相關;2025–2026 在快速 ship 的 AI 開發節奏下更需要二階思考來抵銷「快速堆功能」的長期代價。
- 來源:https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/

### 機率思考 (Probabilistic Thinking) · fit 5
*aka / 出處:* Probabilistic Thinking(含 Bayesian thinking、fat-tailed curves、asymmetries);The Great Mental Models Vol 1
- **是什麼**:用數學與邏輯估計各種結果的可能性,在資訊不完整時給出實際的機率估計。Farnam Street 拆成三塊:Bayesian thinking(用新資訊更新)、fat-tailed curves(肥尾分布,極端事件無上限)、asymmetries(估計本身有系統性偏誤,多半偏樂觀)。
- **用在決策流程**:把判斷講成機率而非二分法(「我認為有 70% 機率…」),並標示不確定性;對肥尾風險(罕見但毀滅性)特別保留 margin。
- **問對問題**:「這件事的機率大概多少,憑什麼?」「這是常態分布還是肥尾(罕見但致命)?」「我的估計是不是又偏樂觀了(asymmetry)?」
- **軟體工程**:估工時與容量規劃用機率區間而非單點;系統故障屬肥尾——99% 時間沒事,但那 1% 的雪崩會打垮全租戶,要為肥尾事件設計降級與隔離(bulkhead)。
- **產品開發**:功能成效用機率思考:不是「會不會成功」,而是「成功機率 × 影響」的期望值排序 roadmap;承認多數新功能的提升估計偏樂觀。
- **營運分析**:A/B test 本質是機率推論;小樣本的勝出可能只是雜訊。報告轉換率時給信賴區間,別給單一數字假裝確定。
- **策略**:市場進入/大賭注用期望值與機率分布評估,而非「一定會贏」;肥尾思維提醒:黑天鵝(資安事故、平台政策變更)雖罕見但可能定生死。
- **2026**:與 Annie Duke《Thinking in Bets》、Taleb 的肥尾觀念互補;2025–2026 在 AI 預測與風險評估中,理解 LLM 輸出本質是機率分布(而非確定答案)是關鍵的心智模型。
- 來源:https://fs.blog/probabilistic-thinking/, https://www.sloww.co/great-mental-models-volume-1/

### 反向思考 (Inversion) · fit 5
*aka / 出處:* Inversion / 'Invert, always invert'(Carl Jacobi: man muss immer umkehren);The Great Mental Models Vol 1;Super Thinking #1 Inverse Thinking
- **是什麼**:與其問「如何成功」,不如反過來問「什麼會保證失敗」並避開它。源自數學家 Jacobi,Munger 名言:靠『持續地不犯蠢』獲得長期優勢,比追求聰明更有效。避免壞結果往往比創造好結果容易。
- **用在決策流程**:對任何目標做一次「pre-mortem」:假設專案已徹底失敗,反推有哪些原因,然後逐一消除這些失敗因子,而不只是正向列出成功步驟。
- **問對問題**:「什麼事情會讓這個專案/系統徹底失敗?」「我要怎麼做才會搞砸?然後避開它。」「最該避免的愚蠢錯誤是什麼?」
- **軟體工程**:設計新服務時先做失效模式分析(反問「怎樣會掛」):DB 掛、第三方 API 超時、租戶資料外洩——先把這些 failure mode 列出再設計防護。寫測試時優先補「會讓系統崩潰的輸入」。
- **產品開發**:設計 onboarding 時反問「怎樣會讓新商家放棄」(太多必填、要等審核、找不到下一步),消除這些 friction,比直接想「怎樣讓他們愛上」更有效。
- **營運分析**:做留存分析時反向找「流失前的共同行為」(churn 前 7 天做了什麼),消除這些觸發點,而非只盯著高留存用戶。
- **策略**:策略規劃用 inversion:「什麼會讓我們三年後倒閉/被取代?」(資安信任崩盤、平台依賴、單一大客戶集中),據此排優先級,而非只列成長計畫。
- **2026**:Pre-mortem 是 inversion 的工程化實踐,2025–2026 在 SRE/可靠性工程(chaos engineering、失效注入)中是主流方法論。
- 來源:https://fs.blog/inversion/, https://www.sloww.co/great-mental-models-volume-1/, https://www.sloww.co/super-thinking-book/

### 安全邊際 (Margin of Safety) · fit 5
*aka / 出處:* Margin of Safety;源自工程與品管,Benjamin Graham 用於投資;The Great Mental Models Vol 2;相關 Redundancy 模型
- **是什麼**:系統中刻意保留的緩衝、餘裕與冗餘,用來吸收錯誤或壞運氣。工程例:噴射引擎零件設計可飛 10,000 小時但 7,500 小時就換,差額即安全邊際;Graham:該為價值與價格留出差距。Dodd 的比喻:把橋設計成承重 3 萬磅卡車,卻只讓 1 萬磅卡車過。
- **用在決策流程**:決策時問「如果我錯了會怎樣?」並預留 buffer;在不確定性高、後果嚴重時加大安全邊際,寧可多付一點上前成本換取存活能力。
- **問對問題**:「如果我的假設錯了,系統還撐得住嗎?」「最壞情況下的 buffer 夠不夠?」「我是不是把系統推到極限沒留餘裕?」
- **軟體工程**:容量規劃不要設計到剛好打平尖峰,要留 headroom(例:CPU/連線池/rate limit 留 30–50% buffer);設 timeout、retry、circuit breaker、多租戶資源隔離都是安全邊際。對應前述事故排查的 buffer 概念。
- **產品開發**:排程預留 buffer(別把 sprint 塞到 100%);發布重大功能用 gradual rollout / feature flag 當安全邊際,出問題能快速回退。
- **營運分析**:設告警閾值時留安全邊際(在真正崩潰前就觸發),而非等指標歸零才知道;預測容量時用保守(留餘裕)而非樂觀估計。
- **策略**:財務與資源規劃保留現金/人力 buffer 以承受需求波動;對單一大客戶/單一金流商的依賴要有備援,避免無安全邊際的集中風險。
- **2026**:與可靠性工程(SLO error budget 本質就是安全邊際的量化)、antifragile 觀念互通;高度推薦工程師內化。
- 來源:https://fs.blog/mental-model-redundancy/, https://bestmentalmodels.com/2018/09/24/margin-of-safety/, https://www.redeyecapital.se/margin-of-safety

### 槓桿 (Leverage) · fit 5
*aka / 出處:* Leverage / High-Leverage Activities;Archimedes 槓桿原理;Super Thinking;Naval Ravikant 四種槓桿(資本、人力、程式碼、媒體)
- **是什麼**:用同樣的投入放大產出。Naval 把商業槓桿分為資本、人力(皆為 permissioned)、以及程式碼與媒體(permissionless,複製邊際成本為零)。程式碼是最強的無需許可槓桿——只要一台電腦,它能在你睡覺時為你工作。
- **用在決策流程**:決定把時間花在哪時,優先選擇高槓桿活動(一次投入、長期/大規模回報),而非線性勞力;持續尋找在每個環節增加槓桿的機會。
- **問對問題**:「這件事是一次性產出,還是能複製/自動化放大?」「我能不能用程式碼/工具把這個手動工作槓桿化?」「最高槓桿的那 20% 投入在哪(對應 Pareto)?」
- **軟體工程**:寫一個被多團隊重用的共用元件/SDK、把重複手動運維寫成自動化腳本/平台、投資 CI 與好的測試,都是高槓桿;程式碼本身就是最高槓桿——同一份程式服務全部租戶。優先做能放大整個團隊產能的 platform 工作。
- **產品開發**:做能被所有商家共用的通用功能 > 一次性客製(對應二階思考);self-serve onboarding 是高槓桿(一次做好服務無數商家),比人工 onboarding 槓桿高得多。
- **營運分析**:建可重用的 dashboard/指標平台讓全公司自助查詢,比每次手動拉報表槓桿高;一個好的分析框架可被反覆套用。
- **策略**:選擇有槓桿的成長引擎:產品本身(零邊際成本)、生態系/App store、內容/SEO,而非純靠燒錢買量;多租戶 SaaS 的核心優勢就是程式碼槓桿。
- **2026**:2025–2026 AI 是新型槓桿:它放大個人產出但也是 permissionless;懂得用 AI 把低槓桿工作自動化的工程師產能差距會拉大。
- 來源:https://www.navalmanack.com/almanack-of-naval-ravikant/find-a-position-of-leverage, https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/, https://aydoo.services/en/articles/naval-ravikant-leverage/

### 機會成本 (Opportunity Cost) · fit 5
*aka / 出處:* Opportunity Cost;Super Thinking;經濟學基礎模型
- **是什麼**:每個選擇都有隱藏成本——你放棄的最佳替代方案的價值。做了 A 就等於放棄了 B,真正的成本不是花的錢,而是沒能做的最好的另一件事。
- **用在決策流程**:評估方案時不只看其本身成本效益,而是明確問「做這個,我放棄了什麼最好的替代方案?」用此排序而非孤立評估。
- **問對問題**:「做這件事,我放棄做的最有價值的另一件事是什麼?」「這是不是目前能投入時間/資源的最佳用途?」
- **軟體工程**:決定要不要花兩週重構某模組時,真正成本是「這兩週本來能交付的功能」;技術債的取捨本質是機會成本判斷,而非絕對好壞。
- **產品開發**:Roadmap 排序的核心就是機會成本:做 feature A 的代價是延後 B、C;每個 sprint 的容量是固定的,加一個就擠掉另一個。
- **營運分析**:分析資源也有機會成本:深挖一個小指標的時間,本可用來建立影響更大的核心指標監控;要看 ROI 排序分析工作。
- **策略**:進入新市場/做新產品線的真實成本是「同樣資源投在核心產品的回報」;多租戶 SaaS 要謹慎,別讓邊緣賭注稀釋核心。
- **2026**:與 leverage、north star 連用:高機會成本意識讓團隊聚焦在最高槓桿、最貼近 north star 的工作。
- 來源:https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/, https://www.lucapallotta.com/super-thinking-the-big/

### 北極星 (North Star) · fit 5
*aka / 出處:* North Star / North Star Metric(Sean Ellis 推廣);Super Thinking
- **是什麼**:公司或個人的指引願景;在 Super Thinking 中是讓所有後續決策對齊的最高目標。產品實務上演化為 North Star Metric:單一最能捕捉產品交付給客戶核心價值的指標,引導團隊聚焦。
- **用在決策流程**:用 north star 當決策過濾器:每個提案問「這是否推進我們的北極星?」不對齊的就降優先或砍掉,避免被零散需求拉散。
- **問對問題**:「這件事是否讓我們更接近北極星?」「我們的北極星指標真的代表客戶獲得的價值嗎?」「團隊各自的工作是否都對齊同一個北極星?」
- **軟體工程**:技術決策對齊產品北極星:若北極星是「商家成功完成出貨」,工程就該優先投資出貨流程的可靠性與效能,而非自嗨的技術重構。用它排技術投資優先序。
- **產品開發**:為產品定義一個 North Star Metric(例:電商 SaaS 可能是「商家月成交金額 GMV」或「成功出貨訂單數」),所有功能假設都連回它,避免做了一堆不影響核心價值的功能。
- **營運分析**:建立北極星指標 + 一組 input metrics(可被功能直接影響的前導指標)+ guardrail metrics 的框架;分析都圍繞北極星的拆解。
- **策略**:北極星確保全公司(工程、產品、業務)朝同方向;多租戶平台尤其需要,避免各 plan/各功能團隊各做各的。
- **2026**:2024–2026 仍是產品圈核心議題;Sean Ellis 強調北極星須以營收相關性為 guardrail。Lenny Rachitsky 等也持續討論「單一北極星 vs 多指標」的取捨,提醒別盲目只追一個數字。
- 來源:https://www.lennysnewsletter.com/p/choosing-your-north-star-metric, https://www.productcompass.pm/p/the-north-star-framework-101, https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/

### 網路效應 (Network Effects) · fit 5
*aka / 出處:* Network Effects / Metcalfe's Law(網路價值正比於節點數平方 n²);Super Thinking #107
- **是什麼**:網路的價值隨每新增一個成員而增長;Metcalfe's Law 指網路價值隨連接節點數呈非線性(約 n²)成長。經典例:傳真機——單一台沒用,每多一台讓所有現有的更有價值。可形成「最大者愈大」的正向回饋與護城河。
- **用在決策流程**:評估產品/功能時問是否有網路效應潛力(用得人越多越有價值);有的話應優先投資、加速擴張以建立難以複製的護城河。
- **問對問題**:「這個產品會因更多人使用而對每個人更有價值嗎?」「網路效應是同邊還是跨邊?」「我們是否已過臨界質量,進入正向回饋?」
- **軟體工程**:設計 API/SDK/整合生態時思考開發者網路效應:越多 app 接入,平台對商家越有價值;架構上要為高連接度與資料一致性做準備。
- **產品開發**:電商 SaaS 的 App store、商家社群、共用評價/物流網路都可能有網路效應;設計功能時思考能否讓「越多商家用,對每個商家越有利」(例如共用金流議價、跨店會員)。
- **營運分析**:衡量網路效應健康度:每新增用戶帶來的邊際價值是否在上升;分析跨邊轉換(供給側增長如何驅動需求側)。
- **策略**:網路效應是 SaaS 最強護城河之一;策略上優先打造有網路效應的功能,因為它讓後進者難以追趕(達臨界質量後最大者愈大)。
- **2026**:a16z 等指出 Metcalfe's Law(n²)常高估,真實網路效應更需考慮連接品質與飽和;2025–2026 評估時別只看用戶數,要看互動密度與留存。
- 來源:https://www.sloww.co/super-thinking-book/, https://a16z.com/beyond-metcalfes-law-for-network-effects/, https://productfolio.com/network-effects/

### 飛輪 (Flywheel) · fit 5
*aka / 出處:* Flywheel / Virtuous Cycle / Bezos 的 Amazon 飛輪;Jim Collins《Good to Great》;Super Thinking #26
- **是什麼**:飛輪是儲存動能的轉盤;比喻一旦轉動起來,維持轉動只需很少的力。Bezos 的 Amazon 飛輪(2001 餐巾紙草圖):更好的客戶體驗 → 更多流量 → 更多第三方賣家 → 更多選擇 → 規模經濟降低成本 → 更低價格 → 又回到更好體驗,自我增強。
- **用在決策流程**:辨識並投資能形成自我增強循環的環節,而非孤立的一次性推力;尊重慣性——順著健康飛輪轉,而非每次都從零硬推。
- **問對問題**:「我們的成長飛輪是什麼?哪幾個環節互相驅動?」「這個投入會餵養飛輪,還是只是一次性的力?」「有沒有反向(惡性)飛輪正在轉?」
- **軟體工程**:建立工程飛輪:好的測試 → 敢頻繁部署 → 更快回饋 → 更高品質 → 更敢重構;投資在會自我強化開發速度的基礎建設(CI、可觀測性)。也要警惕惡性飛輪(技術債 → 變慢 → 更趕 → 更多債)。
- **產品開發**:為產品設計飛輪:更多商家 → 更多交易資料 → 更好的推薦/選品 → 商家更成功 → 吸引更多商家;每個新功能評估它在飛輪哪個環節加速。
- **營運分析**:把成長拆成飛輪各環節的指標,監測哪一環是當前瓶頸(轉最慢的那環),集中資源潤滑它。
- **策略**:策略核心是找到並轉動自己的飛輪而非追逐零散戰術;對電商 SaaS,客戶成功(商家賺更多)往往是飛輪起點。網路效應與臨界質量常是飛輪的引擎。
- **2026**:飛輪在 2025–2026 仍是主流成長敘事(取代線性漏斗思維);與 PLG(產品導向成長)結合,強調產品本身驅動的自我增強循環。
- 來源:https://sketchplanations.com/virtuous-cycle, https://fourweekmba.com/amazon-flywheel/, https://www.sloww.co/super-thinking-book/

### 地圖不等於疆域 (The Map Is Not the Territory) · fit 4
*aka / 出處:* Map ≠ Territory / 源自 Alfred Korzybski;The Great Mental Models Vol 1
- **是什麼**:我們對世界的模型只是簡化的表徵,不是世界本身。地圖若要完美對應疆域就會變得跟疆域一樣大而失去用處;且地圖是某個時點的快照,真實可能早已改變。
- **用在決策流程**:做決策時記得手上的 dashboard、文件、ERD 都是簡化模型,定期回到「真實的疆域」(實際使用者、線上資料、生產環境)驗證模型是否還準。
- **問對問題**:「我看的這個指標/文件是哪個時點的快照?還準嗎?」「這個模型把什麼細節抽掉了,而那些細節現在重不重要?」
- **軟體工程**:架構圖、ER diagram、文件常與真實系統脫節;debug 多租戶問題時不要只信 schema 文件,要實際下 query 看生產資料分佈。漂亮的 staging 環境不等於 production 的疆域。
- **產品開發**:User persona 與 user story 是地圖;別把它當成真實使用者。電商商家的實際操作流程常與 PM 想像的不同,要做 user research / session replay 回到疆域。
- **營運分析**:漏斗圖是模型,真實使用者路徑往往更亂;埋點定義(地圖)與使用者真的做了什麼(疆域)之間有落差,分析前先驗證埋點。
- **策略**:市場報告、TAM 估算都是地圖;制定多租戶定價策略時別只信 spreadsheet,要看實際各 plan 商家的使用行為與付費意願。
- **2026**:在 AI 時代尤其重要:LLM 生成的摘要/架構說明是「地圖的地圖」,更容易與真實脫節,須回到原始程式碼與資料驗證。
- 來源:https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/

### 貝氏更新 (Bayesian Updating) · fit 4
*aka / 出處:* Bayes' Theorem / base rate(基準率)/ prior & posterior;The Great Mental Models Vol 1
- **是什麼**:在已有有限但有用的先驗知識下,遇到新資訊時應結合既有知識(基準率)來更新信念。先驗本身是機率估計;新證據若挑戰先驗,只是降低其為真的機率,逐步更新成後驗機率,而非全有全無。
- **用在決策流程**:下判斷時先問基準率(歷史上這類情況通常如何),再用當前證據按比例更新;避免被單一聳動資訊帶著走而忽略 base rate。
- **問對問題**:「這類事情的基準率是多少?」「這個新證據該讓我把信念調多少,而不是直接推翻或無視?」「我是不是忽略了 base rate 只看眼前個案?」
- **軟體工程**:排障時用 base rate:某症狀 80% 是 DB 連線池耗盡、15% 是網路、5% 是程式 bug——先查高機率的;收到一個 alert 就用貝氏更新調整「真的是事故 vs 誤報」的機率。
- **產品開發**:一個商家抱怨某功能難用,別立刻大改;結合基準率(多少比例商家有同樣問題)更新嚴重度判斷,避免被單一大聲客戶主導 roadmap。
- **營運分析**:看到「轉換率暴跌」先用 base rate(歷史波動範圍)判斷是否異常,再逐步用更多維度資料更新「真跌 vs 埋點壞」的後驗機率。
- **策略**:競爭者動作、市場訊號進來時,不是推翻整個策略,而是按證據強度漸進更新對市場的信念;避免過度反應單一事件。
- **2026**:是機率思考的引擎;2025–2026 也是理解 ML/推薦系統與 A/B 平台統計引擎的底層概念,工程師懂貝氏能更好地讀懂實驗結果。
- 來源:https://fs.blog/bayes-theorem/, https://www.sloww.co/great-mental-models-volume-1/

### 奧坎剃刀 (Occam's Razor) · fit 4
*aka / 出處:* Occam's Razor / Law of Parsimony;The Great Mental Models Vol 2;Super Thinking #117
- **是什麼**:面對多個同樣能解釋證據的競爭解釋時,假設最少、最簡單的那個通常最可能正確;在被證明需要更複雜解釋前,優先採用簡單解釋(但真相有時確實複雜,不可教條化)。
- **用在決策流程**:面對問題時先列出最簡單的可能原因並優先驗證,而非一開始就跳到複雜陰謀論式的解釋。
- **問對問題**:「最簡單、假設最少的解釋是什麼?」「我是不是把問題想得太複雜了?」「有沒有更平凡的原因被我跳過?」
- **軟體工程**:Debug 時先查最簡單的原因:是不是忘了部署、環境變數錯、cache 沒清,而不是一開始就懷疑深層 race condition。最簡單能通過所有測試的設計通常最好維護。
- **產品開發**:使用者「不用某功能」最簡單的解釋常是「找不到/不知道有」,而非「需求不存在」;先驗證可發現性,再下複雜結論。
- **營運分析**:指標異常先查最平凡解釋:埋點改了、有大客戶導資料、節假日效應,而非立刻建複雜歸因模型。
- **策略**:面對營收下滑,先驗證簡單因素(季節性、單一大客戶流失),再談宏觀市場結構轉變等複雜敘事。
- **2026**:工程上對應 KISS 原則與「最小可行設計」;面對 AI 生成的複雜方案時,Occam 提醒優先選可理解、可維護的簡單解。
- 來源:https://fs.blog/mental-models/, https://www.sloww.co/super-thinking-book/

### 臨界質量 (Critical Mass) · fit 4
*aka / 出處:* Critical Mass;源自核物理(引發連鎖反應所需的核材料質量);Super Thinking #29
- **是什麼**:借自核物理:引發自我維持連鎖反應所需的最小質量。比喻一個系統(產品、社群、變革)需要達到某個門檻後才能自我維持、自發成長;未達門檻則需持續外力推動。
- **用在決策流程**:推動任何需要自我增強的事物(平台、社群、組織變革)前,先估算臨界質量在哪,並設計如何集中資源「點火」越過門檻,而非平均撒資源。
- **問對問題**:「這個東西要多少用戶/活躍度才能自我維持?」「我們離臨界質量還差多遠?」「該如何集中火力先在一個區隔點燃,而非全面鋪開?」
- **軟體工程**:內部平台/工具的採用也需臨界質量:一個新框架或共用服務要有足夠團隊採用才會自我擴散;推內部工具時先找 early adopter 團隊點火。
- **產品開發**:雙邊市場(電商平台連接商家與買家、或 app store 連接開發者)要先達到供需兩側的臨界質量才會起飛;設計冷啟動策略(先補貼一側)。
- **營運分析**:分析成長曲線時辨識「拐點」——達到臨界質量後成長從線性轉指數;監測是否接近門檻以決定何時加大投資。
- **策略**:新功能/新市場推廣集中在單一垂直或地區先達臨界質量,證明飛輪能轉,再複製擴張;符合 EC 功能下放給指定 plan 的漸進策略。
- **2026**:與 network effects、flywheel 緊密相連,三者常一起構成成長策略的核心論述。
- 來源:https://www.sloww.co/super-thinking-book/, https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/

### 林迪效應 (Lindy Effect) · fit 4
*aka / 出處:* Lindy Effect;Mandelbrot 提出、Taleb《Antifragile》推廣;Super Thinking #78
- **是什麼**:對於非易腐的事物(技術、想法、書、組織),其預期剩餘壽命與已存在的時間成正比——存在越久,預期還能存在越久。Taleb 例:一本印行 40 年的書,可預期再印 40 年;若再撐 10 年,則預期還能再印 50 年。
- **用在決策流程**:選擇要依賴的技術/方法/標準時,偏好已經存活很久的(它們通過了時間考驗),對很新、很炫的東西保持懷疑(尚未被驗證)。
- **問對問題**:「這個技術/框架存在多久了?是禁得起時間的,還是今年的流行?」「我要 bet 的是 Lindy(長壽)的東西,還是會快速過時的?」
- **軟體工程**:選技術棧時 Lindy 偏好成熟可靠者:SQL、HTTP、Unix 哲學、關聯式資料庫已存活數十年,大概率還會在;對最新潮的框架/JS 工具鏈保留懷疑,核心系統用 Lindy 技術、邊緣才實驗新東西。
- **產品開發**:解決使用者根本需求(支付、信任、便利)是 Lindy 的;炫酷的 UI 潮流會過時。產品核心押注在長壽的需求上。
- **營運分析**:已被長期驗證的核心指標(營收、留存、GMV)比每季新潮的 vanity metric 更可靠;分析框架選經得起時間的。
- **策略**:押注於長壽的商業模式與標準;對「新典範會顛覆一切」的敘事用 Lindy 校準——很多舊東西比想像更耐久(例如 email、Excel 仍主宰商業)。
- **2026**:2025–2026 在 AI 熱潮中尤其實用:用 Lindy 區分哪些是會留下的根本變革、哪些是過熱炒作;成熟、無聊但耐久的技術往往是更安全的工程賭注。
- 來源:https://en.wikipedia.org/wiki/Lindy_effect, https://www.sloww.co/super-thinking-book/, https://modelthinkers.com/mental-model/the-lindy-effect

### 減法之道 (Via Negativa) · fit 4
*aka / 出處:* Via Negativa / Subtractive Knowledge / Addition by Subtraction;Taleb《Antifragile》;Naval 也常提
- **是什麼**:改善常來自移除有害、不必要的東西,而非增加。Taleb:負面知識(知道什麼是錯的、什麼行不通)比正面知識更穩健、更不易出錯;知識靠減法成長多於加法。問「該移除什麼」而非「該加什麼」。
- **用在決策流程**:改善系統/流程/生活時,先找可以移除或停止的東西(降低下檔風險、去除脆弱因子),而非一味添加新功能或流程。
- **問對問題**:「與其加東西,我該移除/停掉什麼?」「哪些東西讓系統變脆弱,該先去掉?」「我更確定什麼是錯的,而不是什麼是對的?」
- **軟體工程**:提升可靠性常靠減法:刪掉沒用的功能旗標、移除死碼、砍掉很少用卻高風險的整合、減少依賴,比一直加防護更有效。降複雜度本身就是最大的改善(對應 Occam)。
- **產品開發**:產品變好常靠移除:砍掉商家用不到、卻增加認知負擔的設定;簡化 onboarding 步驟。via negativa 對抗功能膨脹(feature bloat)。
- **營運分析**:Dashboard 與告警靠減法:移除沒人看的指標與會疲勞的雜訊告警,讓真正重要的訊號浮現。
- **策略**:策略上「不做什麼」與「做什麼」同樣重要:明確拒絕不對齊北極星的市場/客製/功能,聚焦核心;先降下檔風險(資安、合規、單點依賴)再談擴張。
- **2026**:與 antifragile、margin of safety 互補(都先處理下檔);2025–2026 在對抗 AI 加速產生的程式/功能膨脹時,「減法」是反向的紀律。
- 來源:https://www.wealest.com/articles/via-negativa, https://rationalwalk.com/via-negativa-wisdom-through-subtraction/, https://medium.com/the-quiet-footnote/antifragile-by-nassim-nicholas-taleb-how-to-thrive-in-chaos-b3b5e98177f0

### 漢隆剃刀 (Hanlon's Razor) · fit 3
*aka / 出處:* Hanlon's Razor;The Great Mental Models Vol 2;Super Thinking #118
- **是什麼**:「永遠不要把可以用愚蠢/疏忽充分解釋的事情歸因於惡意。」大多數看似惡意的行為其實是無能、失誤或偏誤造成的,而非蓄意傷害。
- **用在決策流程**:遇到別人的負面行為,先假設是失誤或溝通落差而非故意,降低情緒化反應,把精力放在解決問題而非歸罪。
- **問對問題**:「這真的是對方故意的,還是只是疏忽/沒溝通到/誤解?」「我假設惡意是否讓我反應過度?」
- **軟體工程**:同事 merge 進來一段破壞性改動,先假設是沒注意到副作用而非故意搞破壞;在 incident review 採責備無關(blameless postmortem)文化,符合 Hanlon's razor。
- **產品開發**:商家給負評/客訴用詞激烈,先假設是遇到 bug 受挫而非惡意找碴;據此設計同理的客服與錯誤訊息。
- **營運分析**:資料異常先假設是上游系統故障或埋點疏失,而非「有人在刷數據作弊」,避免帶著陰謀論解讀。
- **策略**:競爭者或合作平台的某個動作,先假設是其內部混亂/各自為政而非針對你的精密算計,避免過度防禦性決策。
- **2026**:在遠端/跨時區團隊與 AI 協作時更實用:很多衝突來自非同步溝通的疏漏而非惡意,先用 Hanlon's razor 降溫。
- 來源:https://fs.blog/mental-models/, https://www.sloww.co/super-thinking-book/
