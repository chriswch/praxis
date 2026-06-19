> 「決策科學方法目錄」系列 · J. 產品 / 商業策略 · 共 14 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### Wardley Mapping(演化價值鏈地圖) · fit 5
*aka / 出處:* Wardley Maps;Value Chain Mapping;by Simon Wardley
- **是什麼**:由 Simon Wardley 提出的視覺化策略工具。縱軸是價值鏈(從使用者需求 anchor 往下到底層元件,代表可見度 visibility),橫軸是演化階段:Genesis(創世/新穎)→ Custom Built(自建)→ Product/Rental(產品/租用)→ Commodity/Utility(商品/公用事業)。把每個元件依演化位置擺上地圖,就能看見「整個地形」並推演移動。
- **用在決策流程**:決策時先畫圖建立共識:把功能/技術元件依演化位置標出,再問每個元件「該自建、買產品、還是用雲端商品?」。靠近 commodity 的就外包/用雲服務,靠近 genesis 的才投入差異化研發。地圖也讓 build-vs-buy 與技術選型從直覺爭論變成可討論的共同地形。
- **問對問題**:這個元件演化到哪一階段了?客戶真正的 anchor 需求是什麼,我們把資源放在價值鏈正確位置嗎?哪些我們現在自建的東西其實已經 commoditize,該停止投入?競爭對手會不會利用某元件的演化(例如 AI)來 commoditize 我們的價值主張?
- **軟體工程**:技術選型與 build-vs-buy 的最佳框架:把『搜尋(Elasticsearch/Chewy)、佇列(Sidekiq/Resque)、支付閘道、寄件、CDN』畫上地圖,commodity 區的(如基礎運算、寄信)用託管服務,genesis/custom 區的(如多租戶結帳優化邏輯)才自建。也能診斷技術債:還在自建一個早已 commoditize 的元件就是浪費。
- **產品開發**:規劃 roadmap 時辨識哪些功能正從 product 走向 commodity(例如基礎金流串接),把工程資源從這些『大家都有』的功能撤出,投到仍在 genesis/custom 的差異化點(例如 AI 選品、智慧物流配對)。
- **營運分析**:用地圖標註各元件的成熟度,對照其維運成本與故障率,辨識『高維運成本卻已商品化』的元件作為優先汰換/外包對象。
- **策略**:平台策略的核心工具:可規劃『主動 commoditize 競爭對手價值主張』的 gameplay(例如把某付費外掛變成內建免費功能),或預判 AI 對電商技術棧的演化衝擊,提前卡位 genesis 元件。
- **2026**:2025–2026 AI 是 commoditization 的最大加速器:許多原本 custom/product 的能力(搜尋、推薦、客服、文案)被 LLM 快速推向 commodity,Wardley 視角能幫你判斷『哪些自建能力即將失去差異化』,是目前最被工程主管推崇的策略地圖法之一。
- 來源:https://www.wardleymaps.com/guides/wardley-mapping-101, https://www.wardleymaps.com/glossary/evolution-stages, https://www.bmc.com/blogs/wardley-value-chain-mapping/, https://beyondthebacklog.com/2025/01/14/wardley-maps/

### Playing to Win 策略選擇瀑布 (Strategy Choice Cascade) · fit 5
*aka / 出處:* Playing to Win;Strategic Choice Cascade;by A.G. Lafley & Roger Martin (2013)
- **是什麼**:由 Roger Martin 與寶僑前 CEO A.G. Lafley 提出的五個互相強化的策略選擇:(1) 致勝企圖 (winning aspiration) (2) 在哪裡競爭 (where to play) (3) 如何致勝 (how to win) (4) 需要哪些核心能力 (what capabilities) (5) 需要哪些管理系統 (what management systems)。核心是 where-to-play + how-to-win,且五者必須彼此一致、來回反覆 (toggle) 調整。
- **用在決策流程**:做重大方向決策時,逐格填寫五個問題,並驗證一致性:選定的 where-to-play(目標市場/客群/通路)與 how-to-win(差異化方式)是否真的咬合?『策略即選擇』——明確寫下你要對哪些誘人機會說『不』。任一格改動就回頭檢查其他四格。
- **問對問題**:我們的 where-to-play 與 how-to-win 真的相互支撐,還是各說各話?我們為了贏在這個戰場,放棄了什麼?我們具備致勝所需能力嗎,還是在沒有優勢的地方硬拚?
- **軟體工程**:把『how to win = 技術差異化』落到能力建設:若 how-to-win 是『最快最穩的結帳體驗』,工程能力就該投在結帳延遲、支付容錯重試(對應 commit convention 範例中的支付重試);避免在無關戰場過度工程化。
- **產品開發**:新功能/新模組決策的把關器:這個功能服務的是我們選定的 where-to-play 客群嗎?它強化 how-to-win 還是只是『競爭對手有所以我們也做』?幫產品團隊對誘人但離題的需求說不。
- **營運分析**:第五格『管理系統』直接對應你追蹤的指標:確認儀表板衡量的是 how-to-win 的領先指標,而非虛榮指標。用數據驗證 where-to-play 客群的真實獲利與留存。
- **策略**:多租戶 SaaS 的市場分層決策利器:where-to-play 可細到『鎖定中型零售品牌 vs 小微商家 vs 跨境賣家』,how-to-win 則決定是用生態系廣度、價格、還是垂直深度致勝,逼團隊做出取捨而非通吃。
- **2026**:Roger Martin 在 2023–2025 持續於 Medium 撰文強調 where-to-play 與 how-to-win『不可分割 (inseparable)』,並批評 AI 時代許多公司把『用 AI』當策略,而忽略它必須服務於一個明確的致勝邏輯。
- 來源:https://fs.blog/playing-to-win-how-strategy-really-works/, https://rogermartin.medium.com/decoding-the-strategy-choice-cascade-475d40555eb1, https://rogermartin.medium.com/on-the-inseparability-of-where-to-play-and-how-to-win-181c2ea5c463, https://mooncamp.com/blog/playing-to-win-book-summary

### Good Strategy / Bad Strategy 的 Kernel(策略核心) · fit 5
*aka / 出處:* 策略核心;The Kernel;by Richard Rumelt (2011)
- **是什麼**:Richard Rumelt 主張好策略有一個邏輯結構叫 kernel,含三部分:診斷 (diagnosis,釐清眼前最關鍵的挑戰與最大障礙)、指導方針 (guiding policy,應對挑戰的整體取向,像高速公路護欄一樣『約束但不窮舉』行動) 與一致的行動 (coherent actions,協調一致的具體步驟與資源投入)。壞策略最常見的根因是『診斷薄弱』,其次是『把目標當策略』。
- **用在決策流程**:任何策略文件動筆前,強迫先寫『診斷』:這次真正要解的問題是什麼?再寫一條指導方針,最後列出彼此互相強化、不互相打架的行動。若文件只有一堆目標與口號(成長 30%、成為第一)而沒有診斷,就是 Rumelt 說的壞策略。
- **問對問題**:我們真正的『挑戰』是什麼,而不只是想要的結果?最大的障礙在哪?這份計畫是不是把『願景/目標』偽裝成『策略』?這些行動彼此一致、集中火力,還是分散的願望清單?
- **軟體工程**:用於技術重構/架構決策提案:先診斷(例如『結帳服務 P99 延遲過高導致轉換流失』),再給指導方針(『把同步呼叫改為非同步、把熱路徑去依賴』),再列一致行動。避免提案只寫『要更快更穩』這種沒診斷的目標。
- **產品開發**:幫產品季度規劃去除『偽策略』:把『提升 NPS』『增加 MAU』這類目標逼回到診斷層——為什麼留存差?根因是 onboarding 還是核心價值未達?指導方針才據此而生。
- **營運分析**:診斷階段就是數據分析的主場:用漏斗、cohort、根因分析找出『最大障礙』,讓 guiding policy 建立在證據而非直覺上。Rumelt 強調弱診斷是壞策略首因,而弱診斷往往來自沒看數據。
- **策略**:適合給領導層做策略 review 的檢核表:把公司策略拆成 kernel 三件套,任何一塊缺失或只是口號,就退回重做。對 SaaS 尤其能戳破『我們的策略是用 AI / 上市 / 國際化』這類把目標當策略的常見毛病。
- **2026**:Rumelt 2024 在 Lenny's Podcast 受訪時,甚至建議乾脆用『行動議程 (action agenda)』取代被濫用的『策略』一詞,強調可執行性。Wardley Mapping 社群常把 Wardley 地圖當作產生『診斷』的工具,再接 Rumelt 的 guiding policy。
- 來源:https://www.lennysnewsletter.com/p/good-strategy-bad-strategy-richard, https://www.alexmurrell.co.uk/summaries/richard-rumelt-good-strategy-bad-strategy, https://learnwardleymapping.com/2022/03/27/rumelts-good-strategy-bad-strategy-and-wardley-mapping/

### 7 Powers(七種力量) · fit 5
*aka / 出處:* Seven Powers;by Hamilton Helmer (2016)
- **是什麼**:Hamilton Helmer 提出七種能帶來『持久差異化回報』的力量:規模經濟 (Scale Economies)、網路經濟 (Network Economies)、反向定位 (Counter-Positioning)、轉換成本 (Switching Costs)、品牌 (Branding)、獨佔資源 (Cornered Resource)、流程力量 (Process Power)。每種力量都必須同時具備『效益 (Benefit,更高價或更低成本)』與『障礙 (Barrier,讓對手無法複製)』兩個要件。Power 講的是持久的差異化回報,不是成長、不是『做得好』、也不是一時領先。
- **用在決策流程**:做長期投資/併購/平台策略時,問『這會建立或強化哪一種 Power?它的 Barrier 是什麼?』。沒有 Barrier 的優勢遲早被抄走,不值得當策略支點。Helmer 強調:策略就是建立並守住至少一種 Power,其餘都是支援。
- **問對問題**:我們有哪一種真正的 Power,還是只是暫時領先?競爭對手若要複製,他面對的 Barrier 是什麼(若沒有,優勢就不持久)?有沒有 counter-positioning 機會——做一件在位者因為會傷自己既有業務而不敢跟進的事?
- **軟體工程**:工程選擇可以是『建立 Barrier 的工具』:深度整合與資料模型造成的高轉換成本、開放 API/生態系造成的網路經濟,都是工程可主動建造的護城河。評估架構時問:這個設計加深還是削弱了某個 Power?
- **產品開發**:新功能評估的高階濾鏡:這功能是否提升轉換成本(資料/工作流綁定)、強化網路經濟(多商家/多買家互利)、或累積獨佔資料資源?只是『好用但易複製』的功能不構成策略護城河。
- **營運分析**:量化護城河強度:用 cohort 留存與『資料/整合深度 vs churn』關聯衡量轉換成本;用『網路規模 vs 單用戶價值』驗證網路經濟;用單位成本隨規模下降的曲線驗證規模經濟。
- **策略**:SaaS 平台最契合的護城河語言:多租戶電商可同時追求規模經濟(共用基礎設施攤平成本)、網路經濟(商家×買家×App 生態)、轉換成本(資料與營運綁定)。Counter-positioning 尤其適合對抗在位大廠(做他們因自我蠶食而不敢做的低價/開放模式)。
- **2026**:Helmer 2025 在 Lenny's Newsletter/Podcast 受訪,討論 AI 對 Power 的雙面影響:AI 可能削弱某些護城河(降低複製門檻),但也放大規模經濟、網路經濟與資料型獨佔資源——平台的資料與生態系優勢反而更值錢。
- 來源:https://www.lennysnewsletter.com/p/business-strategy-with-hamilton-helmer, https://www.sachinrekhi.com/p/7-powers-hamilton-helmer, https://blas.com/7-powers/

### OKR(目標與關鍵結果) · fit 5
*aka / 出處:* Objectives and Key Results;源於 Intel(Andy Grove),由 John Doerr 推廣《Measure What Matters》
- **是什麼**:目標 (Objective) 是定性、鼓舞人心的『想達成什麼』;關鍵結果 (Key Results) 是量化、可衡量的進度指標。OKR 的價值在於把高層策略往下對齊到團隊執行,提供從任務到組織策略的清晰視線。常見原則:每層 3–5 個目標、來回 top-down + bottom-up 共創。
- **用在決策流程**:把策略(來自 Rumelt kernel / Martin cascade)轉成可執行對齊:公司層 O 反映 how-to-win,團隊層 KR 是其領先指標。用 OKR 做季度優先序裁決——資源該投給能推動 KR 的事,其餘延後。OKR 負責『做對的事』,專案管理負責『把事做對』。
- **問對問題**:這個工作項真的對應到某條策略 KR 嗎,還是只是忙?我們的 KR 是領先指標(能早期反映影響)還是落後指標(只反映過去)?我們的 OKR 是不是太多而失焦(超過 3–5 個)?
- **軟體工程**:把工程工作對齊到產品成果而非產出:KR 寫成『結帳 P99 < Xms』『紅利點數自動帶入錯誤率歸零』這類使用者可感知的結果,而不是『完成 N 個 ticket』。讓 sprint 與策略 KR 連線,避免工程與策略脫節。
- **產品開發**:把 roadmap 主題轉成 Objective、把成功定義轉成 KR,作為功能取捨與排序依據;限制目標數量,逼產品團隊聚焦少數真正重要的成果。
- **營運分析**:OKR 直接驅動指標體系:KR 必須可量測,因此資料/分析團隊負責定義量測方式、建立追蹤儀表板,並用 cohort/漏斗驗證 KR 是否為真正的領先指標。
- **策略**:OKR 是『策略不落地』問題的解方——把抽象策略(願景/where-to-play/how-to-win)逐層翻譯成可追蹤、可問責的季度成果,連接公司優先序到團隊執行。但須注意 OKR 是『對齊與執行』工具,不能取代前面的策略選擇與診斷。
- **2026**:2025 最佳實務強調 OKR 須服務於明確的長期願景(否則淪為待辦清單)、限量 3–5 個以保持聚焦,並與專案管理整合形成從策略到任務的完整視線;單獨用 OKR 而沒有上游策略,是常見失敗模式。
- 來源:https://quantive.com/resources/articles/okr-guide, https://www.whatmatters.com/okrs-explained/okrs-strategy-and-execution, https://www.celoxis.com/article/okrs-project-management

### 待完成的工作 (Jobs to Be Done, JTBD) · fit 5
*aka / 出處:* JTBD;Jobs Theory;由 Clayton Christensen 推廣,Tony Ulwick (ODI) 與 Bob Moesta 各有流派
- **是什麼**:JTBD 主張人們不是買產品,而是『雇用 (hire)』產品來完成某個在特定情境下想取得的進展 (progress)。焦點從『產品是什麼』轉到『客戶為何用它』。Tony Ulwick 1990 年用 Six Sigma 思維提出原型並引介給 Christensen;Christensen 將其用於破壞式創新理論。
- **用在決策流程**:做產品方向與功能決策前,先界定客戶真正要完成的 job 與其衡量成功的標準。決策依據變成『這是否幫客戶把 job 做得更好』,而非『競品有沒有』。也用來重新定義市場(以 job 而非產品類別劃分)。
- **問對問題**:客戶真正想取得的進展是什麼(不是他要哪個功能)?他現在『雇用』什麼來完成這個 job——可能是競品、Excel、或人工?在什麼情境下他會『開除』我們、改雇別人?我們是在解決 job,還是只在堆功能?
- **軟體工程**:幫工程理解需求的『why』而非僅『what』,做出更貼合 job 的技術設計與取捨;避免照單實作功能規格卻錯過客戶真正要完成的進展。可把『job 完成的成功度量』轉成可量測的系統指標。
- **產品開發**:JTBD 是需求發掘與功能定義的核心:透過深度訪談/情境觀察找出商家(租戶)要完成的 job(如『快速無痛地開一家能收款出貨的店』),據此設計 onboarding 與功能,而非堆砌孤立特性。
- **營運分析**:把 job 的『進展』操作化為可追蹤指標(如商家從註冊到首筆成交的時間),用行為數據驗證產品是否真的把 job 做得更好,並找出 job 受阻的環節。
- **策略**:重新界定 SaaS 的競爭範圍:以『商家要完成的 job』而非『電商軟體類別』來看市場,能發現真正的替代品(自架、人工、其他工具)與藍海機會,呼應 Blue Ocean 的價值重組。
- **2026**:JTBD 至今有三大流派(Christensen 的進展理論、Ulwick 的 Outcome-Driven Innovation/ODI、Moesta 的 Switch 訪談法);2025 仍是產品團隊發掘需求的主流方法,並常與 AI 訪談分析結合加速質性洞察。
- 來源:https://www.christenseninstitute.org/theory/jobs-to-be-done/, https://strategyn.com/jobs-to-be-done/, https://gopractice.io/product/jobs-to-be-done-the-theory-and-the-frameworks/

### 北極星指標框架 (North Star Metric Framework) · fit 5
*aka / 出處:* North Star Metric (NSM);NSM + Input Metrics;由 Amplitude(John Cutler)與 Reforge 推廣
- **是什麼**:由 Amplitude(John Cutler 的《North Star Playbook》)與 Reforge 推廣的框架:選一個最能代表『客戶從產品獲得的價值』的領先指標當北極星 (North Star Metric),其下接幾個可被團隊直接影響的『輸入指標 (input metrics)』,輸入指標共同驅動北極星。好的 NSM 須表達客戶價值、是領先指標(非營收這類落後指標)、且與策略一致。
- **用在決策流程**:用 NSM 把整個產品組織對齊到單一價值定義:評估任何 initiative 時問『它推動哪個 input metric,進而推動北極星嗎?』。輸入指標可拆給不同團隊負責,形成從工作到價值的可追蹤鏈。
- **問對問題**:我們的北極星表達的是『客戶價值』還是只是『我們的產出/營收』?它是領先還是落後指標?哪幾個 input metrics 是我們能直接撥動、且加總後能推動北極星的槓桿?
- **軟體工程**:幫工程把效能/可靠性工作連到價值:若北極星是某種『成功完成的交易/體驗』,工程的延遲、錯誤率、可用性就是其 input metrics,讓基礎建設投資能用價值語言被排序。
- **產品開發**:做功能優先序與實驗設計的對齊器:每個實驗都明確指向某個 input metric;避免做無法連到北極星的『有趣但無價值』功能。
- **營運分析**:NSM 框架本質是分析框架:資料團隊負責定義北極星與 input metrics、建模其因果/相關性、用 cohort 與 A/B 驗證輸入指標是否真的領先北極星。多數產品其實有獲取/留存/變現三條北極星維度。
- **策略**:把抽象策略(how-to-win、JTBD 的客戶價值)濃縮成一個全公司對齊的價值指標,常與 OKR 搭配:北極星定義『價值』,OKR 定義『本季要把哪個 input 推到哪』。
- **2026**:Reforge 提醒『別讓北極星指標騙了你』——單一指標若選錯或被局部最佳化,會誤導全公司;2025 趨勢是用『北極星 + 一組護欄/反向指標』避免只追一個數字而傷害留存或品質。
- 來源:https://amplitude.com/books/north-star/about-north-star-framework, https://www.reforge.com/blog/north-star-metrics, https://www.reforge.com/blog/north-star-metric-growth, https://medium.com/@amplitudeHQ/every-product-needs-a-north-star-8abd3202da6f

### Porter 五力分析 (Porter's Five Forces) · fit 4
*aka / 出處:* Five Forces;產業結構分析;by Michael Porter (1979)
- **是什麼**:Michael Porter 提出的產業吸引力(獲利潛力)分析工具,評估五股力量:新進入者威脅、供應商議價力、買方議價力、替代品威脅、現有競爭強度。力量越強,產業平均獲利越被擠壓。
- **用在決策流程**:進入新市場或評估某業務線是否值得投入時,逐一評分五力。若多數力量偏高(低進入障礙、買方易轉換、替代品多),就須要嘛找到結構性優勢、要嘛別進場。也用來找出『需要靠哪股力量建立防禦』。
- **問對問題**:客戶轉換到競品有多容易(買方議價力)?有沒有低成本替代方案(如商家自架開源電商)在侵蝕我們?新進入者(無頭電商、AI 建站工具)的進入障礙有多低?我們對關鍵供應商(雲、金流、物流)有多依賴?
- **軟體工程**:間接但有用:把『供應商議價力』映射到關鍵第三方依賴(單一金流、單一雲、單一搜尋供應商),提示工程上應做抽象層/多供應商容錯以降低被鎖定的風險。
- **產品開發**:評估是否要做某整合或開放 API:開放生態(AppStoreSDK)會降低買方轉換成本嗎?會不會反而引入替代品威脅?幫產品決定『開放 vs 封閉』的結構性後果。
- **營運分析**:用 churn 與轉換數據量化『買方議價力/替代品威脅』:高 churn + 競品比價搜尋上升,就是五力惡化的訊號。供應商成本占比上升則反映供應商議價力。
- **策略**:電商 SaaS 產業結構診斷的起手式:辨識整個賽道是否正在被『無頭/AI 建站/平台型電商』壓低獲利,進而決定是要往垂直深耕(focus)或建立生態系黏著度來對抗五力。
- **2026**:2025 多篇研究指出五力在 AI/平台生態時代有侷限:它低估了『策略聯盟、資料驅動協作、生態系』與『產業邊界模糊化』。實務上常需搭配 7 Powers 或生態系觀點補強,而非單獨使用。
- 來源:https://www.mtlc.co/revising-porters-five-forces-analysis-in-the-age-of-ai/, https://www.aijbm.com/wp-content/uploads/2025/02/L82114118.pdf, https://www.bobstanke.com/blog/porters-five-forces-vs-porters-generic-strategies

### Porter 通用競爭策略 (Generic Strategies) · fit 4
*aka / 出處:* 成本領導 / 差異化 / 集中化;Generic Strategies;by Michael Porter (1980)
- **是什麼**:Porter 主張企業基本上只有三種一致的競爭定位:成本領導 (cost leadership)、差異化 (differentiation)、集中/聚焦 (focus,可再分成成本聚焦與差異化聚焦)。Porter 警告同時追兩種會『卡在中間 (stuck in the middle)』而失去優勢。
- **用在決策流程**:重大投資/定價/功能取捨時,先確認你選的是哪條:若走差異化(最佳體驗、生態系),就別在價格戰上自殘;若走聚焦(垂直電商),就別什麼客群都接。用它檢查公司行為是否與定位一致。
- **問對問題**:我們到底靠什麼贏——更便宜、更獨特、還是更專注於某客群?我們是不是『卡在中間』:既不是最便宜也不夠獨特?某個降價/加功能的決定,會不會破壞我們的定位一致性?
- **軟體工程**:若公司走成本領導,工程目標應是降低每租戶單位成本(共用基礎設施、多租戶資源效率、自動化維運);若走差異化,工程投資則在難以複製的體驗品質與功能深度。定位決定了你最佳化哪個目標函數。
- **產品開發**:功能取捨的定位檢查:差異化定位下,該投資少數深而獨特的功能;成本/聚焦定位下,則做剛好夠用、可規模化的功能集。避免兩頭燒。
- **營運分析**:成本領導定位要緊盯單位經濟(每租戶 COGS、毛利率);差異化定位則緊盯願付溢價、留存與 NPS。指標體系應隨選定的 generic strategy 而不同。
- **策略**:幫 SaaS 釐清整體競爭姿態:是當『最划算的全功能平台』『最頂的品牌體驗』還是『某垂直(美妝/生鮮)最懂你的系統』。2025 研究指出差異化與聚焦對績效顯著正向,純成本領導在 SMB SaaS 常導致不可持續的低毛利。
- **2026**:近年實證(2017、2025)顯示:差異化與聚焦策略對企業績效有顯著正向影響,而單純成本領導在許多情境下無法提升組織績效——對只靠低價競爭的 SaaS 是個警訊。
- 來源:https://www.goodfellowpublishers.com/free_files/Chapter%209-c8b5a75f8385aa2809aeb26fcc39d9ba.pdf, https://www.researchgate.net/publication/316219649_Five_Competitive_Forces_Model_and_the_Implementation_of_Porter's_Generic_Strategies_to_Gain_Firm_Performances, https://www.bobstanke.com/blog/porters-five-forces-vs-porters-generic-strategies

### 藍海策略與 ERRC 四方格 (Blue Ocean / ERRC) · fit 4
*aka / 出處:* Blue Ocean Strategy;Four Actions Framework;Eliminate-Reduce-Raise-Create Grid;by W. Chan Kim & Renée Mauborgne (2005)
- **是什麼**:Kim 與 Mauborgne 主張別在血腥紅海競爭,而要靠『價值創新 (value innovation)』開創無人競爭的藍海——同時提升買方價值並降低成本。ERRC 四方格透過四個問題達成:消除 (Eliminate) 產業長期競爭但其實多餘的因素、減少 (Reduce) 過度供給的因素、提升 (Raise) 遠高於業界標準的因素、創造 (Create) 業界從未提供的因素。消除與減少降成本,提升與創造升價值。
- **用在決策流程**:做產品/商業模式重新定位時,把產業『大家都在比』的競爭因素列出,逐項套 ERRC。重點是同時往兩個方向走(降成本+升價值),而非只『創造/提升』導致過度工程化、墊高成本結構。
- **問對問題**:整個產業習以為常、客戶其實不在乎的因素有哪些可以『消除』?哪些是我們投入過頭、可以『減少』的?有沒有業界從沒提供、卻能改變遊戲規則的因素可以『創造』?我們是不是只顧加功能(只 Raise/Create),把成本越墊越高?
- **軟體工程**:ERRC 直接可用於產品架構精簡:Eliminate 那些沒人用卻拖慢開發與維運的 legacy 功能/設定項;Reduce 過度可配置造成複雜度的選項;把工程資源 Raise/Create 到真正差異化的體驗,降低認知與維運成本。
- **產品開發**:重新設計某模組或定價方案的利器:對既有龐雜功能做 Eliminate/Reduce(回應 admin 規則中『避免過度可配置』的精神),把省下的力氣 Create 出競品沒有的整合或自動化,做到『更簡單同時更有價值』。
- **營運分析**:用功能使用率數據驅動 ERRC:低使用率高維護成本 → 候選 Eliminate;高配置複雜度但少人調整 → 候選 Reduce。用客戶訪談找出『該 Create』的未被滿足需求。
- **策略**:幫電商 SaaS 跳出『跟競品比功能清單』的紅海:例如針對某垂直客群重新組合價值曲線,消除大平台的臃腫、創造該垂直獨有的工作流,開出小而獨佔的藍海。
- **2026**:ERRC 在 2024–2025 常被用於 AI 重塑產品線:用 AI『創造』全新自動化價值的同時,『消除/減少』人力密集或冗餘的舊功能,正好對齊『同時升價值降成本』的價值創新精神。
- 來源:https://www.blueoceanstrategy.com/tools/errc-grid/, https://www.blueoceanstrategy.com/blog/errc-grid-template-examples/, https://medium.com/@pranavbhatblog/errc-grid-for-blue-ocean-strategy-explained-with-case-studies-7dabf70b1a44

### 情境規劃 (Scenario Planning) · fit 4
*aka / 出處:* Scenario Planning;Shell Method;2x2 Scenario Matrix;源於 Royal Dutch Shell(1970s)
- **是什麼**:源於 Royal Dutch Shell(Pierre Wack/de Geus 等人於 1970 年代發展)的方法:不預測單一未來,而是探索多個『可信的未來 (plausible futures)』。常用做法是找出兩個『最重要且最不確定』的驅動力,組成 2×2 矩陣,四個象限各自寫成一個有名字的未來敘事,再把現行策略丟進每個世界壓力測試。
- **用在決策流程**:面對高度不確定的重大決策(押注 AI、進軍跨境、平台開放程度)時,別只做一份『base case』。建構 3–4 個情境,找出在『所有情境都成立』的無悔之舉 (no-regret moves) 先做,並為各情境設好早期預警指標與應變策略。
- **問對問題**:對我們未來最關鍵、又最無法掌握的兩個變數是什麼?如果監管/AI/通膨走向極端,我們現在的策略還站得住嗎?哪些行動在所有未來裡都值得做(無悔)?哪些是只在特定未來才該下的賭注?
- **軟體工程**:架構決策的壓力測試:把『未來規模成長 10×』『主要雲漲價/斷供』『AI 流量暴增』當情境,檢驗現行架構在各情境下會不會崩。無悔之舉(如可移植性、容量水平擴展)優先做,情境專屬的留作可觸發的選項。
- **產品開發**:roadmap 抗脆弱化:針對『AI 助理成為主要購物入口』『商家自建潮』等情境各想一套產品應對,辨識跨情境都該做的基礎能力先排程,避免把全部資源押在單一未來。
- **營運分析**:把情境轉成可監測的『早期預警指標 (early-warning indicators)』儀表板:例如某情境的觸發訊號是『AI 導流占比 > X%』,數據一旦逼近就啟動對應策略。
- **策略**:電商 SaaS 長期策略的標配:對『AI、跨境法規、平台生態演化』等不確定性建構情境,讓董事會討論從『預測誰對』轉為『不論哪個未來我們都不會死,並在好情境裡贏更多』。
- **2026**:2025 世界經濟論壇 (WEF) 等推廣更敏捷、遊戲化的情境演練;在 AI 不確定性極高的當下,scenario planning 與 real options 常被合併使用——情境界定可能世界,real options 決定如何分階段下注。
- 來源:https://www.weforum.org/stories/2025/02/scenario-game-navigate-uncertainty-and-develop-foresight/, https://www.managementcentre.co.uk/blog/strategy-for-an-uncertain-future-scenario-planning/, https://oboe.com/learn/strategic-foresight-methods-rv4ijq/scenario-planning-techniques-2

### 實質選擇權思維 (Real Options Thinking) · fit 4
*aka / 出處:* Real Options;Real Options Valuation (ROV);staged investment;源於 Stewart Myers (1977) 與 Trigeorgis 等
- **是什麼**:把金融選擇權概念套用到實體投資:在不確定下,管理彈性本身有價值。可把策略選擇看成選擇權——延後 (defer)、分階段/複合 (stage/compound,每階段是下一階段的選擇權)、擴張 (expand)、收縮/放棄 (contract/abandon)、轉換 (switch)。傳統 DCF 無法捕捉這種彈性價值。
- **用在決策流程**:面對大投資時別問『現在全押還是不押』,而是設計成『先花小錢買一個選擇權,等不確定性釐清再決定要不要 exercise』。明確區分:延後的價值 vs 早期承諾帶來的學習與卡位價值。設好放棄條件,讓失敗投資能便宜退出。
- **問對問題**:我們能不能花一小筆錢先買到『未來再決定』的權利,而不是現在就全額承諾?這個專案有沒有內建『若成功就放大、若失敗就喊停』的選擇權?我們設好放棄門檻了嗎,還是會因沉沒成本硬撐?
- **軟體工程**:完美對應 spike / PoC / feature flag / 漸進式 rollout:先做一個便宜的技術驗證(買選擇權),數據好再全面投入(expand),不好就丟掉(abandon)。可逆的架構決策值得快做,不可逆的(資料庫選型、對外 API 契約)值得多付錢保留延後與轉換的選擇權。
- **產品開發**:MVP 與分階段發布就是 real options:用最小投入驗證需求假設,把後續開發當成可放大/可中止的選擇權。避免一次性押注一個大功能,改為一系列『階段門』投資。
- **營運分析**:為每個階段門設定可衡量的『exercise/abandon』判準(留存、轉換、單位經濟達標才進下一階段),把『學習』量化成決定是否行使選擇權的數據訊號。
- **策略**:進入新市場/新產品線的下注紀律:先用小成本試水(地區試點、單一垂直),保留『成功則擴張、失敗則收縮』的彈性。研究(含 2025 中國實證)指出採用實質選擇權式分階段投資的公司,長期績效較佳。
- **2026**:在 AI 高度不確定的 2025–2026,real options 思維(便宜試、保留彈性、設放棄門檻)被視為比一次性大賭注更穩健的 AI 投資紀律;常與 scenario planning 搭配——情境界定不確定性,選擇權決定下注節奏。
- 來源:https://en.wikipedia.org/wiki/Real_options_valuation, https://thedecisionlab.com/reference-guide/economics/real-options-analysis, https://www.sciencedirect.com/science/article/abs/pii/S0927538X25003543, https://giesbusiness.illinois.edu/josephm/BA549_Fall%202018/Session%207/Trigeorgis%20and%20Reuer%20(2017).pdf

### 安索夫矩陣 (Ansoff Matrix) · fit 4
*aka / 出處:* Ansoff Matrix;Product-Market Growth Matrix;by Igor Ansoff (1957)
- **是什麼**:Igor Ansoff(1957)提出的 2×2 成長方向矩陣,依『產品(既有/新)×市場(既有/新)』分四格:市場滲透 (existing product, existing market,風險最低)、市場開發 (既有產品進新市場)、產品開發 (新產品進既有市場)、多角化 (新產品+新市場,風險最高)。
- **用在決策流程**:規劃下一步成長時,先把候選 initiative 對到四格,並按風險排序資源:通常先做市場滲透(優化獲取/留存)、再市場開發或產品開發,只有核心穩定、有餘裕時才碰多角化。
- **問對問題**:這個成長機會本質是『更深耕現有客群』『進新市場』『出新產品給現有客群』還是『全新領域』?我們是不是在核心還沒站穩時就跳去高風險的多角化?風險與我們的承受度匹配嗎?
- **軟體工程**:幫工程理解需求背後的成長意圖,進而判斷複用程度:市場滲透/產品開發多半能沿用既有多租戶架構;市場開發(如跨境、新語系)需要 i18n、合規、金物流在地化的工程投資;多角化可能需要全新系統。
- **產品開發**:新功能/新模組的定位與優先序工具:升級既有客群的進階功能(產品開發)vs 拓展新客群(市場開發),據此決定投入與風險。
- **營運分析**:市場滲透格直接對應你最熟的數據工作:降 churn、提升轉換與 ARPU、優化 onboarding。新市場/新產品則需建立新的成功指標基準。
- **策略**:電商 SaaS 成長路徑的清晰框架:典型軌跡是滲透(優化現有商家獲取與留存)→ 市場開發(國際化/新客群)→ 產品開發(POS、結帳、SDK 等新模組)→ 現金流穩定後才多角化。
- **2026**:2026 多篇指南仍把 Ansoff 當 SaaS GTM 與成長規劃的實用骨架;常見搭配是用 Ansoff 決定『方向』、用 real options/Three Horizons 決定『下注節奏與風險分層』。
- 來源:https://www.kalungi.com/blog/how-to-use-ansoffs-growth-matrix-go-to-market-strategy-guide, https://albato.com/blog/publications/embedded-ansoff-matrix-business-growth, https://www.clearpointstrategy.com/blog/ansoff-matrix-guide

### 三層視野 (Three Horizons of Growth) · fit 3
*aka / 出處:* McKinsey Three Horizons;3 Horizons;by Baghai, Coley & White《The Alchemy of Growth》(2000)
- **是什麼**:麥肯錫合夥人 Baghai、Coley、White 於 2000 年《The Alchemy of Growth》提出的成長組合模型,依成熟度與見效時間分三層:Horizon 1(延伸與防禦核心業務)、Horizon 2(建立新興成長引擎)、Horizon 3(為未來創造可行的選項)。三層需要不同的文化與 KPI,且應同時並行經營而非依序接力。
- **用在決策流程**:做資源/投資組合配置時,標出每個 initiative 屬於哪一層,確保三層都有投入而非全押 H1。關鍵紀律:別用 H1 的季度獲利標準去評 H3 的探索性賭注,否則會在搖籃裡扼殺創新。
- **問對問題**:我們的投資是不是全擠在 H1(只顧現有業務),H2/H3 餓死?每一層該用什麼不同的成功指標來評?哪些 H3 賭注因為被用 H1 的 ROI 標準檢視而被誤殺?
- **軟體工程**:對應工程資源配置:H1 = 維護與漸進優化既有系統;H2 = 新平台能力/重構;H3 = 探索性技術(新 AI 能力、新架構 PoC)。提醒團隊保留一定比例給 H2/H3,而非 100% 救火與小修。
- **產品開發**:產品組合平衡:H1 是核心電商功能的打磨,H2 是新模組(如 POS、跨境),H3 是實驗性押注(如 AI 購物代理)。確保 roadmap 不是只有 H1 的增量。
- **營運分析**:為不同 horizon 設不同指標:H1 看效率與獲利,H2 看採用率與成長曲線,H3 看學習里程碑與假設驗證而非營收。避免用單一營收儀表板評估全部。
- **策略**:幫 SaaS 領導層做成長敘事與資源分配的共同語言,平衡『守成 vs 探索』。
- **2026**:2025 重要批評(如 Steve Blank 的觀點):數位/AI 時代『時間軸坍縮』——一個 H3 的破壞(如生成式 AI)可能數月內就變成 H1 的核心威脅,而非數十年。因此三層應並行且快速重評,別當成固定的時間序列。
- 來源:https://www.mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/enduring-ideas-the-three-horizons-of-growth, https://medium.com/@steve_mullen/three-horizons-model-introducing-the-messy-middle-of-innovation-56834b610042, https://strategicmanagementinsight.com/tools/three-horizons-growth-model/
