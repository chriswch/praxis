> 「決策科學方法目錄」系列 · C. 決策流程與治理 · 共 14 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### WRAP 決策流程 (WRAP Process) · fit 5
*aka / 出處:* Chip & Dan Heath, 出自《Decisive》(2013)；Widen options / Reality-test assumptions / Attain distance / Prepare to be wrong
- **是什麼**:Heath 兄弟在《Decisive》提出的四步驟流程，針對四大決策陷阱（窄框架、確認偏誤、短期情緒、過度自信）各設一個對策。核心主張是『流程勝過分析 (process trumps analysis)』——對重要決策而言，有好的流程比在沒有流程下做大量分析更可靠。
- **用在決策流程**:(W) 拓寬選項：強迫自己跳出『要不要做 A』的二選一，問『有沒有 A 與 B 同時做？還有哪些選項？』；用 vanishing options test（假設這選項消失你會怎麼辦）。(R) 用現實檢驗假設：找反面證據、做小型實驗、問做過的人。(A) 抽離取得距離：問『若是建議朋友我會怎麼說？』、用 10/10/10（10 分鐘/10 個月/10 年後我會怎麼看）。(P) 為犯錯做準備：設定 tripwire（觸發重新評估的指標）、做 pre-mortem。
- **問對問題**:『我是不是只在 yes/no 一個選項裡打轉？』『我有沒有刻意去找推翻自己的證據？』『如果我把這個選項從桌上拿掉，我會做什麼？』『什麼樣的訊號出現時，我應該承認決策錯了並回頭？』
- **軟體工程**:選資料庫/搜尋引擎技術選型時不要只比『MySQL vs PostgreSQL』，而是同時擺出『加 Elasticsearch、加讀寫分離、加快取層』等多選項（W）；Reality-test 用 spike/POC 跑真實 query 量測而非看 benchmark 文章（R）；用 tripwire：『若 p99 latency 連續 3 天 > 500ms 就重新評估方案』（P）。
- **產品開發**:規劃結帳流程改版時，避免只在『要不要加一頁優惠碼輸入』打轉，拓寬成多個流程設計（W）；用 A/B test 或 fake door 檢驗轉換率假設（R）；上線前設定 tripwire『棄單率回升 2% 即 rollback』（P）。
- **營運分析**:分析某 SaaS 方案商家流失時，先拓寬假設池（價格？功能？客服？競品？），不要鎖死在第一個想到的原因（W）；用 cohort/留存資料反向驗證（R）；事先記下『如果這個原因成立，資料上應該看到什麼』以防確認偏誤（A）。
- **策略**:決定是否進入新市場（如跨境電商模組）時，用 10/10/10 抽離短期業績壓力（A）；多方案並列而非單一豪賭（W）；為失敗準備退場條件（P）。
- **2026**:2025/2026 仍是被引用最廣的個人/團隊決策流程之一；AI 可協助『拓寬選項』(W) 與快速找反面證據 (R)，但『取得距離』(A) 與設 tripwire 仍需人判斷。
- 來源:https://heathbrothers.com/member-content/1-page-summary-of-the-wrap-model/, https://www.gsb.stanford.edu/faculty-research/books/decisive-how-make-better-choices-life-work, https://modelthinkers.com/mental-model/wrap-decision-process

### Cynefin 框架 (Cynefin Framework) · fit 5
*aka / 出處:* Dave Snowden, 1999；五域：clear/obvious、complicated、complex、chaotic、disorder（早期稱 known/knowable）
- **是什麼**:Snowden 於 1999 年提出的『感知—決策 (sense-making)』框架，先辨識問題屬於哪個域，再決定該用哪種決策方式。關鍵在於：不同域的因果關係性質不同，套錯方法（例如把複雜問題當複雜化問題去『分析到底』）會失敗。
- **用在決策流程**:判斷問題落在哪個域並套用對應行動序列：Clear（已知最佳實踐）→ Sense-Categorize-Respond；Complicated（需專家分析、有多個正解）→ Sense-Analyze-Respond；Complex（因果只能事後看清、無正解）→ Probe-Sense-Respond（做安全可失敗的小實驗）；Chaotic（危機）→ Act-Sense-Respond（先止血建立秩序）；Disorder（不知屬哪域）→ 拆解分配到其他域。
- **問對問題**:『這個問題的因果關係是已知的、需要專家分析的、還是只能透過實驗才看得出來的？』『我現在是在止血（chaotic）還是在優化（complicated）？』『我是不是在對一個複雜 (complex) 問題尋求一個唯一正解？』
- **軟體工程**:Production 全站當機 = chaotic，先 Act（rollback/降級止血）再分析根因，而不是開會分析；一個偶發的 N+1 query 效能問題 = complicated，交給資深工程師分析 explain plan；導入全新的多租戶資料隔離架構 = complex，用 feature flag 對小流量做可失敗實驗 (probe)。
- **產品開發**:既有結帳欄位調整 = clear，照既定規範做；新付款閘道串接 = complicated，需 payment 專家分析；全新訂閱制商業模式驗證 = complex，先做小規模 beta probe 而非一次全量上線。
- **營運分析**:判斷一個指標異動屬於『已知的季節性』(clear)、『需深入歸因分析』(complicated) 還是『市場新行為、得做實驗才知道』(complex)，避免用錯誤的分析深度。
- **策略**:面對成熟功能市場用最佳實踐 (clear/complicated)，面對 AI 帶來的新商業模式不確定性時採 complex 域的『多個小賭注 (safe-to-fail probes)』而非 all-in 豪賭。
- **2026**:命名歷經演變：Kurtz & Snowden(2003) 用 known/knowable；2007 改 simple/complicated；2014 起用 obvious；2015 起用 clear。2025/2026 在 AI 不確定性決策中常被引用來提醒『別把 complex 問題當 complicated 解』。
- 來源:https://en.wikipedia.org/wiki/Cynefin_framework, https://untools.co/cynefin-framework/, https://whatfix.com/blog/cynefin-framework/

### DACI 決策框架 (DACI Framework) · fit 5
*aka / 出處:* 源於 Intuit 1980s，由 Atlassian 推廣；Driver / Approver / Contributors / Informed
- **是什麼**:為產品團隊設計、比 RACI 更快的決策角色框架。最關鍵的洞見是把 Driver（推動流程）與 Approver（唯一拍板者）分開——Driver 負責跑流程，Approver 做最終決定，這個分離正是 DACI 速度的來源。
- **用在決策流程**:在 decision doc 標頭明列：Driver（一人，負責召集、整理資訊、在期限前催出決策）、Approver（一人，唯一決策者，是『主動決策者』而非橡皮圖章）、Contributors（有專業可建議——有聲音沒投票權）、Informed（工作受影響、決定後被告知——沒聲音沒投票權）。搭配 due date 與 outcome 欄位。
- **問對問題**:『誰是 Driver（推動）vs 誰是 Approver（拍板）——這兩個是不是被混在一個人身上拖慢決策？』『Contributors 是有投票權還是只有建議權？』『誰只需被告知，不需參與討論？』
- **軟體工程**:技術選型/RFC 流程：發起 RFC 的工程師 = Driver、Tech Lead 或 Staff Eng = Approver、其他資深工程師 = Contributors、QA/SRE = Informed；非常適合放進 Confluence/Notion 的 decision doc 模板。
- **產品開發**:Sprint 範圍取捨、功能上下架決策：PM = Driver、Product Lead = Approver、設計+工程 = Contributors、行銷+客服 = Informed，避免會議上人人都覺得自己能否決。
- **營運分析**:決定要不要採用某新分析工具或埋點規範：資料分析師 = Driver、Data Lead = Approver、各 PM = Contributors、工程 = Informed。
- **策略**:中型產品組織日常策略決策的輕量治理；比 RAPID 快但缺少明確的合規否決 (Agree) 角色，高度監管決策仍宜用 RAPID。
- **2026**:Atlassian Team Playbook 有公開模板，最貼近 SaaS 產品團隊日常；2026 仍是 Notion/Confluence decision doc 最常用的角色模型，與 async 文件化決策文化高度契合。
- 來源:https://www.atlassian.com/team-playbook/plays/daci, https://www.atlassian.com/blog/project-management/daci-method-for-better-project-decisions, https://www.centercode.com/blog/raci-vs-daci-vs-rapid

### 單向門 vs 雙向門 (One-Way vs Two-Way Door Decisions) · fit 5
*aka / 出處:* Jeff Bezos / Amazon 股東信；Type 1（單向門，不可逆）vs Type 2（雙向門，可逆）
- **是什麼**:Bezos 在 Amazon 股東信提出的決策分類：Type 1（單向門）是後果重大、幾乎不可逆的決策，必須緩慢、審慎、廣納諮詢；Type 2（雙向門）是低風險、可逆的決策，可由個人或小團隊快速做，做錯了再修正即可。核心警告是『別用 Type 1 的重量級流程去做 Type 2 的決策』，那會拖垮組織速度。
- **用在決策流程**:決策前先問：『這扇門推開後能不能輕鬆走回來？』可逆 → 授權快速決定、容許犯錯；不可逆/難逆 → 啟動重量級流程（DACI/RAPID + pre-mortem + decision doc）。把多數決策刻意設計成可逆，以提速。
- **問對問題**:『這個決策可逆嗎？回退的成本是多少？』『我是不是在用對付不可逆決策的審慎度，去拖延一個可逆的小決策？』『我能不能把這個決策改造成可逆的（feature flag、灰度、可 rollback）？』
- **軟體工程**:可 rollback 的部署、feature flag 後的功能 = 雙向門，鼓勵小團隊快速試；資料庫 schema 破壞性遷移、刪除舊欄位、對外 API 合約變更 = 單向門，要走嚴謹 review。工程上常可用 flag/灰度/雙寫把單向門『改造成』雙向門。
- **產品開發**:改個按鈕顏色/文案 = 雙向門快速試；廢棄一個老商家依賴的功能、改訂價模型 = 單向門，需慎重與充分溝通。
- **營運分析**:調整 dashboard 預設篩選 = 雙向門；刪除或重定義歷史指標口徑（影響歷史可比性）= 單向門，需保留舊定義並充分公告。
- **策略**:進入新市場若可低成本撤出 = 雙向門可試；簽長約、併購、大幅品牌重塑 = 單向門，需最高審慎度。
- **2026**:2025/2026 仍是 SaaS/新創最常被引用的『該花多少審慎度』判準；與 feature flag、progressive delivery、可逆架構設計高度契合，工程文化常把『盡量把決策做成雙向門』當原則。
- 來源:https://www.producttalk.org/glossary-discovery-one-way-door-decision/, https://fs.blog/reversible-irreversible-decisions/, https://www.theuncertaintyproject.org/tools/decision-types

### Pre-mortem 事前驗屍 (Pre-mortem) · fit 5
*aka / 出處:* Gary Klein，HBR 2007 年 9 月；基於 prospective hindsight（前瞻性後見之明）
- **是什麼**:Klein 於 2007 年 HBR 提出的技術：在專案啟動時，假設『專案已經徹底失敗了』，請團隊逆向想像『到底是什麼搞砸的』。背後依據是 Mitchell、Russo、Pennington（1989）的研究——前瞻性後見之明（想像事件已發生）能把正確指出未來結果原因的能力提升約 30%。它與一般風險分析不同之處在於『假設已死』降低了講出負面意見的心理門檻。
- **用在決策流程**:重要決策/專案啟動前花 20-30 分鐘：(1) 設定情境『現在是 X 個月後，這個專案慘敗了』；(2) 每人獨立寫下所有失敗原因；(3) 輪流分享（round-robin）；(4) 依此調整計畫並設防範措施。注意：避免讓高階主管在場，否則會壓抑坦誠。
- **問對問題**:『假設這件事已經失敗了，最可能的死因是什麼？』『有哪些我們平常因為怕掃興/不禮貌而不會講出來的風險？』『針對最可能的死因，我們現在能加什麼防護？』
- **軟體工程**:大型遷移/重構/重要上線（如多租戶資料庫切換、黑五大促前的容量規劃）前做 pre-mortem：團隊往往會提出『某租戶資料量爆量』『第三方金流逾時』『快取雪崩』等平常不會在 review 講的死因，進而提前加 circuit breaker、壓測、rollback plan。
- **產品開發**:新功能 GA 前 pre-mortem：想像六個月後該功能無人使用或造成客訴，逆推是定價、onboarding 還是效能問題，提前補強。
- **營運分析**:重大資料遷移或報表系統換代前，預想『上線後數字全錯/對不上舊報表』的死因，提前建對帳機制。
- **策略**:進入新市場或推新商業模式前的 pre-mortem，逼出樂觀計畫中的盲點。
- **2026**:2025/2026 仍是工程與產品團隊最實用、成本最低的對抗過度自信工具之一；常與 WRAP 的『Prepare to be wrong』與 launch readiness review 結合。注意 30% 數字源自 1989 研究，常被引用但屬單一研究結果。
- 來源:https://en.wikipedia.org/wiki/Pre-mortem, https://nesslabs.com/pre-mortem-anticipate-failure-with-prospective-hindsight, https://hbr.org/2007/09/performing-a-project-premortem

### 延遲成本 (Cost of Delay) 與 CD3/WSJF · fit 5
*aka / 出處:* Don Reinertsen《Principles of Product Development Flow》；CD3 = Cost of Delay ÷ Duration；SAFe 稱 WSJF (Weighted Shortest Job First)；Black Swan Farming (Joshua Arnold) 推廣
- **是什麼**:Cost of Delay 衡量『晚一個單位時間交付會損失多少經濟價值』，把『價值』與『急迫性』兩個人類常混淆的維度結合。Reinertsen 名言：『若你只能量化一件事，就量化延遲成本。』CD3/WSJF 把延遲成本除以工期，用『單位時間的經濟回報率』排序，分數高者先做——因為除以工期，也鼓勵把工作切小批量。
- **用在決策流程**:為 backlog 中每個項目估算 Cost of Delay（可用 Black Swan Farming 的四種急迫性曲線：Expedite 持續高損失、Fixed-Date 過期才有損失、Standard 線性後遞減、Intangible 無形/延後）與工期，計算 CD3 = CoD ÷ Duration，由高到低排序開發順序。
- **問對問題**:『這件事『晚做一週』到底會損失多少錢/機會？』『我是不是只看價值大小，卻忽略了急迫性曲線的形狀？』『把這個大項目切小，是不是能更快開始回收價值？』
- **軟體工程**:決定先修哪個技術債/先做哪個平台優化：把『不做會持續流失的』（如效能導致流失=Expedite）排在『有合規期限的』（Fixed-Date）與『錦上添花』（Intangible）之前；CD3 的除以工期也呼應『小批量、快交付』的工程實踐。
- **產品開發**:Roadmap 排序的經濟性依據，比『誰聲音大』或純直覺更可辯護；特別適合多租戶 SaaS 面對眾多商家需求時的取捨。
- **營運分析**:用實際營收/留存資料估算各功能或修復的延遲成本，讓排序有資料支撐而非拍腦袋。
- **策略**:投資組合層級排序：Reinertsen/Arnold 指出延遲成本在組合中呈冪律分布，少數項目的 CoD 規模遠大於其他，量化後才看得出該集中資源在哪。
- **2026**:2025/2026 仍是 SAFe (WSJF) 與精實產品開發的核心排序法；對多租戶電商 SaaS 尤其有用，因為需求遠多於產能、必須有經濟性依據做取捨。難點在估算 CoD，常用相對估算（如 Fibonacci）而非精確金額。
- 來源:https://blackswanfarming.com/cost-of-delay/, https://blackswanfarming.com/urgency-profiles/, https://wind4change.com/cost-delay-divided-duration-cd3-wsjf-reinertsen-safe/, https://framework.scaledagile.com/wsjf

### OODA 迴路 (OODA Loop) · fit 4
*aka / 出處:* John Boyd（美國空軍上校），1970 年代初；Observe-Orient-Decide-Act
- **是什麼**:Boyd 提出的決策迴路，強調在競爭、快速變化環境中持續循環 Observe→Orient→Decide→Act，並以比對手更快、更出其不意地完成循環來取得優勢（『operate inside the opponent's OODA loop』）。Boyd 視 Orient（用文化、經驗、脈絡去詮釋觀察）為最關鍵的一步。
- **用在決策流程**:把決策視為持續迴路而非一次性事件：Observe（蒐集即時數據/訊號）→ Orient（結合脈絡與心智模型詮釋，這步最易出錯）→ Decide（選一個行動）→ Act（執行並把結果回饋進下一圈）。重點是縮短迴路週期、加快回饋。
- **問對問題**:『我的觀測訊號夠即時嗎，還是在用過時資料決策？』『我在 Orient 這步的心智模型/假設是不是錯的？』『我能不能比競品/攻擊者更快完成一圈？』
- **軟體工程**:事故應變 (incident response) 與資安藍隊：監控告警 (Observe) → 結合脈絡判斷影響面 (Orient) → 決定降級/封鎖 (Decide) → 執行並觀察 (Act)；縮短 MTTR 本質上就是縮短 OODA 迴路。CI/CD 快速部署+觀測也是加速迴路。
- **產品開發**:快速迭代的 build-measure-learn：上線小功能 → 觀測埋點數據 → 重新詮釋使用者行為 → 調整，盡量縮短一圈時間以比競品更快學習。
- **營運分析**:建立即時 dashboard 與告警，讓營運團隊能比手動月報更快 Observe→Orient，對促銷/庫存/詐騙訊號快速反應。
- **策略**:在競爭激烈的電商 SaaS 市場，把『比對手更快感知並回應市場變化』本身當成策略優勢；用 OODA 解釋為何小團隊能靠速度打贏大公司。
- **2026**:2025/2026 在 AI 加持下，Observe/Orient 可由 AI agent 自動彙整與初步詮釋，大幅壓縮迴路週期；常見於 SecOps、SRE、即時交易與成長團隊論述。
- 來源:https://en.wikipedia.org/wiki/OODA_loop, https://oodaloop.com/the-ooda-loop-explained-the-real-story-about-the-ultimate-model-for-decision-making-in-competitive-environments/, https://thedecisionlab.com/reference-guide/computer-science/the-ooda-loop

### PDCA 循環 (PDCA Cycle) · fit 4
*aka / 出處:* Walter Shewhart / W. Edwards Deming；Plan-Do-Check-Act，亦稱 Deming Cycle / PDSA
- **是什麼**:源自製造業品質管理的持續改善循環：Plan（規劃改變與假設）→ Do（小規模試行）→ Check（量測結果對照預期）→ Act（採納或調整後再循環）。與 OODA 相比，PDCA 更偏『測試一項改變、小規模驗證後再全面推行』，OODA 偏『高速回應觀察做決策』。
- **用在決策流程**:把任何流程/系統改善當成一個受控實驗：先寫下假設與成功指標 (Plan)，小範圍試行 (Do)，用資料對照預期 (Check)，再決定標準化或回頭調整 (Act)。適合可控、可量測、追求穩定優化的情境。
- **問對問題**:『我這次改變的假設與成功指標是什麼？』『我有沒有先小規模驗證再全面推？』『Check 階段的資料是否真的對照了當初的 Plan？』
- **軟體工程**:效能優化與 SLO 改善：Plan 設定 p99 目標 → Do 在單一服務試新快取策略 → Check 比對 metrics → Act 推廣或回退；也適用 release 流程、on-call runbook 的持續精修。
- **產品開發**:功能漸進式優化（非顛覆式創新）：小批量發布、量測、標準化；與 Cynefin 的 complicated/clear 域契合。
- **營運分析**:客服/退貨/物流流程的持續改善，用 PDCA 跑流程實驗並把有效做法寫入 SOP。
- **策略**:營運卓越 (operational excellence) 導向的策略執行，把策略拆成可量測的 PDCA 改善循環。
- **2026**:PDCA 與 OODA 常被並用：用 OODA 做快速戰術回應，用 PDCA 定期回顧績效與設新目標；2025/2026 在 SRE/品質工程與 AI 模型迭代評估中仍廣泛使用。
- 來源:https://www.isixsigma.com/plan-do-check-act/pdca-vs-ooda-whats-the-difference/, https://www.theknowledgeacademy.com/blog/ooda-vs-pdca/, https://www.learnleansigma.com/problem-solving/pdca-and-ooda-for-problem-solving/

### RAPID 決策權責 (RAPID Framework) · fit 4
*aka / 出處:* Bain & Company；Recommend / Agree / Perform / Input / Decide（字母非執行順序）
- **是什麼**:Bain 提出的決策角色分配框架，為高風險、高金額或政治敏感的決策釐清五種角色。注意 R-A-P-I-D 不是流程順序而是角色集合。每個決策理想上只有一位 Recommend 與一位 Decide。
- **用在決策流程**:對重要決策明確指派：Recommend（驅動流程、整合輸入、提出建議）、Agree（具否決權，通常用於法務/法規合規，謹慎指派）、Perform（負責執行落地，要早點指定）、Input（提供專業/受影響者意見，但無否決權）、Decide（最終拍板並讓組織承諾行動）。
- **問對問題**:『這個決策誰真的有權拍板 (D)？』『有沒有人因合規/法規而握有實質否決權 (A)？』『誰要負責執行，他被納入了嗎 (P)？』『我們是不是把太多人當成決策者，導致卡住？』
- **軟體工程**:重大架構決策（如改造多租戶資料隔離、換訊息佇列）：Tech Lead = Recommend、資安/DBA = Agree、實作團隊 = Perform、相關工程師 = Input、Engineering Manager/架構師 = Decide；可寫進 ADR (Architecture Decision Record) 標頭。
- **產品開發**:決定砍掉或重做一個主要功能模組這類 one-way door：PM = Recommend、法務/財務 = Agree、工程+設計 = Perform、客服+業務 = Input、產品總監 = Decide。
- **營運分析**:定義關鍵指標口徑或資料治理政策時，用 RAPID 區分誰提案、誰合規把關、誰落地建表。
- **策略**:併購、進入新市場、訂價策略等高風險決策的標準權責框架；Bain 建議只對高價值或高頻決策正式套用，不必每件事都跑 RAPID。
- **2026**:相較 DACI，RAPID 多了明確的 Agree（合規否決）與 Perform（執行銜接）角色，適合監管/高風險情境；2025/2026 在規模化組織治理與 AI 治理 (AI governance) 角色界定中被重新引用。
- 來源:https://www.bain.com/insights/rapid-decision-making/, https://www.centercode.com/blog/raci-vs-daci-vs-rapid, https://www.theuncertaintyproject.org/tools/rapid-framework

### 決策日誌 (Decision Journal) · fit 4
*aka / 出處:* Shane Parrish / Farnam Street 推廣；根植於對抗 hindsight bias 與 outcome bias
- **是什麼**:在做重要決策『當下』把當時的思考、假設、預期結果與機率寫下來，日後再回頭對照實際發生，藉此對抗『後見之明偏誤』（大腦會竄改記憶讓你以為自己當時就知道）與『結果偏誤』（只用結果好壞評判決策品質）。核心：用簡單到 8 歲小孩都懂的語言寫下『你在決定什麼、為什麼』。
- **用在決策流程**:做決策時記錄：(1) 情境/脈絡；(2) 問題框架；(3) 關鍵變數；(4) 複雜度/顧慮；(5) 認真考慮但被否決的替代方案與原因；(6) 可能結果範圍；(7) 你預期的結果與你給的機率；(8) 當下的身心狀態（時間、情緒）。定期回顧，對照預期 vs 實際，找出自己決策模式的系統性偏差。
- **問對問題**:『我現在預期會發生什麼，機率多少？』『我認真考慮過哪些替代方案，為什麼否決？』『半年後回看，我能不能誠實判斷這是好決策還是只是好運？』
- **軟體工程**:用 ADR (Architecture Decision Record) 當決策日誌：記錄選某技術時的 context、考慮過的替代方案、預期 trade-off 與假設（如『預期這個快取能把 DB 負載降 50%』），日後回看驗證假設是否成立、校準自己的技術判斷。
- **產品開發**:為每個重大功能押注寫下『預期會提升 X 轉換率，機率 60%』，發布後對照真實數據，逐步校準產品直覺。
- **營運分析**:做容量/成本/促銷預測時寫下假設與信心水準，事後與實際對照，量化自己的預測校準度 (calibration)。
- **策略**:重大策略下注（進新市場、組織調整）記錄當時邏輯，避免事後用結果重寫歷史，建立組織的決策學習資產。
- **2026**:2025/2026 與 ADR、產品 decision doc、async 文件文化天然契合；AI 可協助結構化記錄與事後對照分析，但『誠實記下當時的真實想法』才是價值所在。
- 來源:https://fs.blog/decision-journal/, https://fs.blog/shane-parrish-mental-models/, https://www.successpodcast.com/blog/2017/5/3/building-a-mental-model-toolbox-with-shane-parrish

### 加權決策矩陣 (Weighted Decision Matrix) · fit 4
*aka / 出處:* 亦稱 Pugh Matrix / weighted scoring model / 加權評分；Stuart Pugh 提出 Pugh 篩選法
- **是什麼**:把多個選項（欄）對多項評選準則（列）做評分，每個準則依重要性給權重，每格分數乘以權重後加總，得出每個選項的加權總分以利客觀比較。Pugh matrix 適合早期多選項粗篩；加權矩陣適合短名單做有依據的最終裁決。
- **用在決策流程**:(1) 列出選項與評選準則；(2) 給每個準則權重（如相對排序 5/4/3/2/1，或百分比加總 100%）；(3) 用 1-5 或 1-10 為每個選項在每個準則上評分；(4) 分數×權重後加總；(5) 做敏感度分析（調權重看排名是否翻盤），避免被單一假設綁架。
- **問對問題**:『我有沒有把真正重要的準則設對權重，還是只是合理化已經想選的那個？』『如果調整權重，排名會不會翻盤（敏感度）？』『有沒有漏掉某個關鍵準則（如維運成本、安全性）？』
- **軟體工程**:技術選型（如選 message queue、選前端框架、選第三方金流/物流商）：準則設為效能、社群活躍度、學習曲線、維運成本、與既有 stack 相容性、安全合規，加權評分後當作 ADR 的決策依據，讓選擇可被質疑與複查。
- **產品開發**:功能/供應商評估比較；也常見於 RICE/ICE 等產品排序的底層思路（把多維度量化成單一可比分數）。
- **營運分析**:選分析工具、BI 平台、A/B test 平台時的客觀比較；也用於供應商評選。
- **策略**:進入哪個市場、主推哪條產品線的高層比較；務必搭配敏感度分析，避免『精準的錯誤』給人虛假的客觀感。
- **2026**:2025/2026 AI 可協助蒐集各選項在各準則上的事實資料來輔助評分，但權重設定（價值判斷）仍須人決定；最大風險是用看似客觀的數字包裝主觀偏好，故敏感度分析是必要步驟。
- 來源:https://lucid.co/blog/weighted-decision-matrix, https://airfocus.com/blog/weighted-decision-matrix-prioritization/, https://sixsigmadsi.com/pugh-matrix/

### Vroom-Yetton 領導參與模型 (Vroom-Yetton(-Jago) Model) · fit 3
*aka / 出處:* Victor Vroom & Phillip Yetton (1973)，Arthur Jago (1988) 擴充；又稱 Normative Decision Model / 領導參與模型
- **是什麼**:幫領導者根據情境（用一系列 yes/no 問題）決定該讓部屬參與到什麼程度的規範性模型，提供五種決策風格，從完全獨裁到完全群體共識，目標是在決策品質、速度與團隊承諾感之間取得平衡。
- **用在決策流程**:依情境（決策品質要求、資訊充足度、團隊承諾重要性、團隊是否認同目標）選擇五種風格之一：AI（自己用現有資訊決定）、AII（向部屬要資訊但自己決定）、CI（個別諮詢後自己決定）、CII（群體諮詢後自己決定）、GII（與團隊共識決定）。
- **問對問題**:『這個決策需要團隊的認同/承諾才能成功嗎？若是，就別純獨裁。』『我手上的資訊夠不夠自己決定？』『拉大家進來的時間成本，值不值得換來更好的品質或 buy-in？』
- **軟體工程**:選資料庫遷移方案：若需全隊配合執行（高承諾需求）→ 用 CII/GII 讓團隊參與；若是緊急 hotfix（高速度需求、資訊明確）→ 用 AI 自己快速決定。幫 Tech Lead 判斷何時開會討論、何時直接拍板。
- **產品開發**:決定 sprint 目標時用 GII 拉團隊共識以提高承諾感；決定一個低風險的 UI 文案時用 AI 直接定，不必開會。
- **營運分析**:決定指標定義（影響全公司報表）時用 CII/GII 諮詢各團隊以取得共識，避免日後口徑爭議。
- **策略**:幫主管判斷哪些策略決策需要廣納參與（影響大、需 buy-in），哪些可由小核心圈快速定案。
- **2026**:經典 1970s-80s 模型，原版需走流程圖判斷；2025/2026 較少被當作完整工具使用，但其核心洞見『參與程度應視情境而定，不是越多越好』在遠距/async 決策文化中仍很有用。
- 來源:https://en.wikipedia.org/wiki/Vroom%E2%80%93Yetton_decision_model, https://www.mindtools.com/adamhmy/the-vroom-yetton-decision-model/, https://umbrex.com/resources/frameworks/organization-frameworks/vroom-yetton-jago-decision-model/

### 艾森豪矩陣 (Eisenhower Matrix) · fit 3
*aka / 出處:* Urgent-Important Matrix；命名自 Dwight D. Eisenhower；由 Stephen Covey 推廣於《7 Habits》
- **是什麼**:用『重要性』與『緊急性』兩軸切成 2x2 四象限的優先排序工具，對應四種行動：重要且緊急 = Do（馬上做）；重要不緊急 = Schedule/Defer（排程做，深度工作所在）；緊急不重要 = Delegate（授權他人）；不重要不緊急 = Delete（刪除）。關鍵洞見：重要不緊急的事應排在緊急不重要之前。
- **用在決策流程**:把待辦/請求分類到四象限，依象限決定行動。核心是抵抗『緊急性陷阱』——避免整天被緊急但不重要的事推著走，刻意保護『重要不緊急』（長期價值）的時間。
- **問對問題**:『這件事是真的重要，還是只是別人覺得緊急？』『我是不是把所有時間都花在救火（緊急不重要），而沒空做重要不緊急的長期投資？』『這件事能不能授權出去？』
- **軟體工程**:管理工程待辦：production 事故 = Do；償還技術債/補測試/重構 = Schedule（重要不緊急，最常被犧牲卻最該保護）；某些臨時報表請求 = Delegate；過度工程的『nice to have』= Delete。
- **產品開發**:個人/小團隊層級的工作排序（非整個 backlog 經濟性排序——那用 cost of delay）；快速分流湧入的 feature request 與 bug。
- **營運分析**:分流臨時 ad-hoc 數據需求：影響決策的 = Do/Schedule、可由自助 dashboard 解決的 = Delegate（導向自助）、純好奇的 = Delete。
- **策略**:個人/主管時間管理層級有用；團隊與產品層級的策略排序建議改用加權評分或 cost of delay 等更量化的方法。
- **2026**:2026 各大任務工具（Asana、Todoist）內建此模型；屬個人生產力層級，對工程師管理自己的時間與技術債投資特別實用，但別拿它取代團隊級的經濟性排序。
- 來源:https://asana.com/resources/eisenhower-matrix, https://untools.co/eisenhower-matrix/, https://www.todoist.com/productivity-methods/eisenhower-matrix

### 七步驟決策流程 + 五種決策模式 (7-Step Process & Decision-Making Models, Asana) · fit 3
*aka / 出處:* Asana 整理的通用決策流程；7 steps + 決策模式（理性 Rational / 直覺 Intuitive / 創意 Creative / 協作 Collaborative，常另列 Vroom-Yetton 五風格）
- **是什麼**:Asana 等彙整的通用七步驟流程：(1) 界定決策 (2) 蒐集相關資訊 (3) 找出替代方案 (4) 權衡證據 (5) 在選項中抉擇 (6) 採取行動 (7) 檢討決策與後果。並列出幾種決策模式：理性（邏輯、循序、資料驅動，適合高影響決策）、直覺（靠經驗的模式辨識）、創意（蒐集資訊後讓潛意識處理）、協作（群體共識、共同當責）。
- **用在決策流程**:把它當成串起其他工具的骨架：第 (1) 步用 Cynefin 判斷問題類型；第 (3)(4) 步嵌入 WRAP 拓寬選項與加權矩陣；第 (4) 步嵌 pre-mortem；決策前用 one-way/two-way door 決定審慎度與用 DACI 釘角色；第 (7) 步用 decision journal 回顧。再依情境選理性/直覺/協作模式。
- **問對問題**:『我有沒有先把『要決定的到底是什麼』講清楚（第 1 步常被跳過）？』『這個決策該用資料驅動的理性模式，還是該信任有經驗者的直覺？』『我有沒有第 7 步——真的回頭檢討這個決策？』
- **軟體工程**:作為團隊 RFC/技術決策的標準骨架，把零散的工程決策變成可重現、可文件化的流程，並明確選擇『資料驅動 (理性)』還是『信任資深者直覺』模式。
- **產品開發**:新人 PM/工程師最易上手的入門流程框架，提醒不要跳過『界定問題』與『事後檢討』兩個最常被省略的步驟。
- **營運分析**:資料分析支援決策時的流程檢核表——確保分析（權衡證據）真的被串進行動與事後檢討，而不是做完報告就結束。
- **策略**:策略決策的通用流程外殼，再依決策性質掛載更專門的框架（WRAP、cost of delay、RAPID 等）。
- **2026**:2026 版 Asana 文章強調 AI 與 agentic work management（含其收購 StackAI）輔助跨職能決策；此框架本身較通用，價值在當『骨架』串起本清單其他更專門的工具。注意：來源實際列出 4 種模式（理性/直覺/創意/協作），『5 種風格』多指向 Vroom-Yetton 的 AI/AII/CI/CII/GII。
- 來源:https://asana.com/resources/decision-making-process, https://www.cloverpop.com/blog/7-step-decision-making-process
