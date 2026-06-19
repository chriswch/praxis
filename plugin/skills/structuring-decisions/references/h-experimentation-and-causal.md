> 「決策科學方法目錄」系列 · H. 實驗與因果(用資料決策) · 共 16 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 線上受控實驗 / A/B 測試 (Online Controlled Experiment, A/B Test) · fit 5
*aka / 出處:* A/B test, randomized controlled experiment, split test;Kohavi 等人稱 OCE
- **是什麼**:把使用者隨機分流到 Control (現狀) 與 Treatment (新版),因為隨機化讓兩組在統計上等價,組間指標差異就能被歸因為改動本身的因果效果。是「黃金標準」的因果推論工具。
- **用在決策流程**:把每個產品/工程決策框成一個可量測的假設:先寫下 OEC 與 guardrail、用 power 分析估所需樣本與天數、跑滿至少一到兩個完整商業週期、再依預先定義的決策規則 ship/no-ship,而不是看『感覺有沒有變好』。
- **問對問題**:我的反事實是什麼 (沒做這個改動會發生什麼)?隨機化單位是 user、session 還是 shop?這個效果是真的還是分流本身造成的 (先看 SRM)?多大的提升才值得我上線並維護這段程式碼?
- **軟體工程**:用 feature flag (如 LaunchDarkly/自建 flag) 做一致性分流:同一 user_id 雜湊到固定 bucket,確保跨 request/裝置看到同一版本;灰度發布 (新版結帳 API、搜尋演算法) 時把『5% 流量試水』同時當成效能與正確性的受控實驗,監控 error rate 與 latency 當 guardrail。
- **產品開發**:新功能 (例如商家後台的新版商品上架流程、購物車推薦模組) 預設以 A/B 上線:用實驗證明它真的提升轉換,而非靠 PM 直覺;在多租戶下可用『商家層級』或『買家層級』分流,視功能影響面決定。
- **營運分析**:把『版本 A vs B 的轉換率/客單價/加購率』做成標準看板,並標注信賴區間與顯著性,避免營運用單日波動下結論;建立實驗結果的事後追蹤,檢查上線後效果是否如實驗預測。
- **策略**:建立『實驗文化』作為組織級護城河:讓 ship 決策有證據鏈,降低 HiPPO (最高薪者意見) 主導;Kohavi 指出多數想法在實驗中是中性或負面的,A/B 制度化能避免把資源壓在無效改動上。
- **2026**:2025–2026 實驗平台 (Statsig/Eppo/GrowthBook/Optimizely) 已把 CUPED、sequential testing、SRM 檢查內建為預設;對小流量商家,業界開始用 LLM agent 模擬使用者 (如 arXiv 的 AgentA/B) 來在沒有足夠真實流量時做前期篩選,但仍須真實實驗驗證。
- 來源:https://www.cambridge.org/core/books/abs/trustworthy-online-controlled-experiments/metrics-for-experimentation-and-the-overall-evaluation-criterion/4EA73D169EC43B58991D6824717E8FD3, https://experimentguide.com/, https://www.amazon.com/Trustworthy-Online-Controlled-Experiments-Practical/dp/1108724264

### OEC 整體評估準則 (Overall Evaluation Criterion) · fit 5
*aka / 出處:* primary metric, success metric, decision metric;常等同 North Star 的可量測代理
- **是什麼**:實驗成功與否的單一 (或加權組合) 量化判準,必須在實驗短期內可量測,且被相信與長期策略目標有因果連結。它解決『一個實驗到底看哪個數字下結論』的問題。
- **用在決策流程**:每個實驗只能有一個 OEC,事前在 PRD/實驗計畫裡寫死;若改動讓 OEC 顯著上升、guardrail 未被違反,就 ship。用 OEC 取代『同時盯十個指標挑對自己有利的看』的壞習慣。
- **問對問題**:這個短期指標真的代表長期價值嗎 (例如『點擊』vs『完成下單後 30 天未退貨』)?它會不會被 gaming (例如把按鈕做煩人來衝點擊)?OEC 該用買家行為還是商家留存?
- **軟體工程**:把 OEC 定義成可由埋點精準計算的事件 (例如 checkout_success 而非模糊的『活躍』),並在 instrumentation 層保證事件不重複、不漏送,否則 OEC 本身不可信。
- **產品開發**:結帳流程改版的 OEC 用『完成付款的 session 比例』而非『進入結帳頁的人數』;搜尋改版用『搜尋後成功加入購物車率』,避免被中間虛榮指標誤導。
- **營運分析**:為公司/團隊建立分層指標體系:公司級 North Star (如 net GMV、商家留存)、團隊級 OEC (leading indicator)、實驗級 OEC,確保每層 OEC 是上層的可信前導指標。
- **策略**:OEC 是把策略翻譯成可實驗語言的關鍵;選錯 OEC 會讓整個實驗體系系統性地往錯方向優化 (例如只追 GMV 而犧牲商家健康度),策略上等於把方向盤交給錯的數字。
- **2026**:業界 (Eppo、ABsmartly) 趨勢是把 OEC 與 guardrail/counter metrics 明確分層管理,並用『指標是否可被 gaming』作為設計檢查項;OEC 加權組合的權重也開始用歷史實驗資料校準。
- 來源:https://www.cambridge.org/core/books/abs/trustworthy-online-controlled-experiments/metrics-for-experimentation-and-the-overall-evaluation-criterion/4EA73D169EC43B58991D6824717E8FD3, https://absmartly.framer.website/blog/what-are-the-overall-evaluation-criteria, https://siftfeed.com/guides/north-star-guardrail-metrics

### 護欄指標 (Guardrail Metrics) · fit 5
*aka / 出處:* counter metrics, counter metric, non-inferiority metrics, 防呆指標
- **是什麼**:與 OEC 並列的次要指標,用來確保『贏的實驗』沒有在別處造成不可接受的傷害 (例如 OEC 漲但頁面延遲變慢、客訴上升、退貨率上升)。本質是 non-inferiority 檢查。
- **用在決策流程**:把 ship 規則寫成『OEC 顯著上升 AND 所有 guardrail 未顯著惡化超過容忍門檻』;guardrail 被違反時,即使 OEC 漂亮也不上線,或退回重做。
- **問對問題**:我為了衝這個指標,最可能犧牲掉什麼?哪些指標是『絕不能變壞』的底線 (延遲、崩潰率、退款率、商家投訴)?guardrail 的容忍區間設多少?
- **軟體工程**:把 p95/p99 latency、error rate、crash rate、API 逾時率 設為每個實驗的標準 guardrail,接進實驗平台自動監控;前端 bundle 體積、首屏時間也適合當 guardrail,避免新功能拖慢全站。
- **產品開發**:結帳優化實驗中,把『付款失敗率』『退貨率』『客服工單量』設為 guardrail,防止為了轉換率而引入誤導性 UI;推薦模組實驗把『商品多樣性/長尾曝光』設 guardrail,避免只推爆款傷害生態。
- **營運分析**:建立跨實驗的共用 guardrail 套組 (organization-level guardrails),讓每個團隊的實驗都自動套用公司級健康度底線,營運能一眼看出哪些實驗踩線。
- **策略**:guardrail 是把『長期/跨團隊外部性』內化進單一實驗決策的機制,防止局部最佳化傷害整體 (例如某團隊衝 GMV 卻推高物流成本與退貨),是平衡成長與健康度的策略工具。
- **2026**:現代平台把 guardrail 分為『trust guardrails (如 SRM、樣本量)』與『business/quality guardrails』;2025 起常結合 non-inferiority 統計檢定 (而非只看是否顯著) 來判定『沒有變更差』。
- 來源:https://www.geteppo.com/blog/counter-metrics, https://siftfeed.com/guides/north-star-guardrail-metrics, https://absmartly.framer.website/blog/what-are-the-overall-evaluation-criteria

### 樣本數 / 檢定力 / 最小可偵測效果 (Sample Size, Power & MDE) · fit 5
*aka / 出處:* power analysis, statistical power, minimum detectable effect, 事前功效分析
- **是什麼**:實驗開跑前的數學規劃:由 baseline 轉換率、MDE (你想偵測的最小提升)、顯著水準 α (常 0.05)、檢定力 (常 0.8) 反推每組所需樣本與天數。Power=0.8 代表若真有效果,有 80% 機率偵測到 (20% 漏掉=Type II error)。
- **用在決策流程**:開實驗前先算:以現有流量,要偵測『有商業意義的最小提升』需跑幾天?若需 6 個月才有 power,代表這個改動不值得用 A/B 驗 (流量不夠),該改用其他方法或先做更大膽的改動。
- **問對問題**:多小的提升對我才有商業意義 (這就是 MDE,不是越小越好)?我有足夠流量在合理時間內偵測它嗎?我是不是在用一個 underpowered 實驗追求注定看不到的微小效果?
- **軟體工程**:在實驗平台或用 statsmodels/自寫腳本把 power 計算自動化進實驗建立流程;對低流量商家自動提示『此實驗 underpowered』,避免工程師浪費時間做永遠不顯著的測試。
- **產品開發**:新功能立項時就用 power 分析決定『這個功能能不能用 A/B 驗』:高流量的買家端功能可以;低頻的商家後台功能 (樣本天生少) 可能要靠 CUPED、qualitative 或 geo 方法。
- **營運分析**:建立各 surface 的 baseline 轉換率與流量基準表,讓任何人估算實驗工期時有可靠輸入;事後檢查實際 power 是否符合預期 (避免 baseline 估錯導致 underpowered)。
- **策略**:Power 規劃決定組織的『實驗吞吐量』:流量是稀缺資源,理解 MDE 讓策略上能把有限流量分配給最值得驗證、效果夠大的賭注,而非攤平在一堆微調上。
- **2026**:公式 n ≈ (Z_α/2 + Z_β)² × (p1(1−p1)+p2(1−p2)) / (p1−p2)²,其中 95% 對應 1.96、80% power 對應 0.84;CUPED 等變異數縮減技術可實質降低所需 n(等效於增加流量),已成為對抗低流量的標準手段。
- 來源:https://cxl.com/blog/statistical-power/, https://www.statsig.com/calculator, https://www.abtasty.com/blog/sample-size-calculation/

### CUPED 變異數縮減 (CUPED Variance Reduction) · fit 5
*aka / 出處:* Controlled-experiment Using Pre-Experiment Data;相關:CUPAC、regression adjustment、stratification
- **是什麼**:用實驗前 (pre-experiment) 資料當共變數,移除指標中可被既有行為線性預測的『可預測噪音』,在不引入偏誤下縮小變異數、提高靈敏度。數學上等同對結果回歸共變數取殘差;變異數縮為 Var×(1−R²)。
- **用在決策流程**:對高變異指標 (revenue、客單價) 套 CUPED,等效於增加流量、縮短達到顯著所需天數;這讓原本 underpowered 的實驗變得可行,或讓既有實驗更快下結論。
- **問對問題**:我有沒有每位 user 的實驗前行為資料當共變數?這個共變數對結果的解釋力 (R²) 高嗎?我用的共變數是否絕對在實驗前、不受 treatment 影響 (否則會引入偏誤)?
- **軟體工程**:在實驗分析管線中加一步:join 每位 user 的『前期同名指標』(如前 4 週消費額) 做 CUPED 調整;務必確保共變數來自分流時間點之前,且不被 treatment 污染,否則結論失效。
- **產品開發**:讓低流量的商家後台功能或高變異的營收型實驗也能在合理時間出結論,間接提升產品團隊的實驗吞吐量與迭代速度。
- **營運分析**:把 CUPED 設為營收/客單價類實驗的預設分析法,並回報『等效流量倍數 (effective traffic multiplier)』給營運,讓大家理解縮短了多少工期。
- **策略**:變異數縮減是用『資料工程』換『流量/時間』的策略性槓桿:對流量受限的多租戶電商 (多數商家流量不大),它直接放大整個組織能跑的實驗數量。
- **2026**:由 Deng, Xu, Kohavi, Walker 在 WSDM 2013 提出,原論文報告約 50% 變異數縮減 (等同用一半使用者達同等 power);R²=0.4 的模擬約得 1.66 倍等效流量、22% power 提升。2025 演進為 CUPAC (用 ML 預測值當共變數) 與結合 trimmed mean 提升 robustness,已是大廠標配。
- 來源:https://dl.acm.org/doi/10.1145/2433396.2433413, https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/articles/deep-dive-into-variance-reduction/, https://exp-platform.com/Documents/2013-02-CUPED-ImprovingSensitivityOfControlledExperiments.pdf

### 樣本比例失衡 (Sample Ratio Mismatch, SRM) · fit 5
*aka / 出處:* SRM, sample ratio mismatch, randomization check
- **是什麼**:實驗中觀察到的分組比例與設計比例 (如 50/50) 出現統計上顯著的偏離。Kohavi 把它比喻為『發燒』:不是病本身,而是多種資料品質問題 (分流錯誤、telemetry 遺失、bot、處理階段過濾) 的症狀。
- **用在決策流程**:在看任何 OEC/效果『之前』先跑 SRM 檢定 (常用卡方);若 p 值極小 (如 <0.001) 代表分流被污染,此時所有效果數字都不可信,必須先除錯而非下結論。
- **問對問題**:我的分流比例符合預期嗎?是不是有 bot、爬蟲、或某版本的埋點漏送導致某組『被吃掉』使用者?過濾/去重邏輯是否對兩組不對稱?
- **軟體工程**:把 SRM 檢查做成實驗平台的自動 gate (每天跑):比對曝光事件數與分配比例;常見根因是 redirect 造成 treatment 端遺失、lossy instrumentation、或快取讓部分使用者沒被正確標記。
- **產品開發**:新功能上線發現『treatment 轉換率異常高』時,先懷疑 SRM 而非慶祝——很可能是某類低活躍使用者在 treatment 被漏記,製造假提升。
- **營運分析**:把 SRM 列為實驗報表的第一個紅綠燈;營運看到 SRM 紅燈就知道這份數據不能拿去做決策,避免基於髒資料的錯誤行動。
- **策略**:SRM 是整個實驗體系『可信度』的守門員;一個組織若不查 SRM,所有實驗結論的可信度都打折。把 SRM 制度化是建立可信實驗文化的前提。
- **2026**:業界已將 SRM 自動偵測標準化 (KDD 2019 微軟有專文《Diagnosing Sample Ratio Mismatch》);2025 平台多內建 SRM 檢查與根因分類器,並擴展到偵測 pre-experiment bias 與分流系統錯誤。
- 來源:https://en.wikipedia.org/wiki/Sample_ratio_mismatch, https://dl.acm.org/doi/10.1145/3292500.3330722, https://medium.com/@deepti.agl16/part-i-trustworthy-online-controlled-experiments-a-b-testing-twymans-law-7dc5032073c7

### 統計陷阱套組:peeking、p-hacking、多重比較 (Peeking, P-hacking & Multiple Comparisons) · fit 5
*aka / 出處:* peeking problem, optional stopping, p-hacking, multiple comparisons problem, family-wise error;校正:Bonferroni、Benjamini–Hochberg (FDR)
- **是什麼**:一組會系統性製造假陽性的反模式。Peeking/optional stopping:固定樣本實驗中途反覆看、一顯著就停;p-hacking:調整參數/期間直到 p<0.05;multiple comparisons:同時測很多指標/分群,任一顯著的機率被推高。
- **用在決策流程**:固定樣本實驗就『跑滿再看』,要中途看就改用序列檢定;一次測多個指標/分群時做 Bonferroni 或 FDR 校正;事前登記假設與 OEC,事後別挑對自己有利的切片。
- **問對問題**:我是不是因為『看到顯著就想停』?我同時測了幾個指標/幾個分群 (有沒有校正)?這個顯著結果是預先假設的,還是我事後翻資料翻出來的?
- **軟體工程**:實驗平台預設『未達樣本量不顯示顯著性結論』或改用 always-valid 推論,從工具層防止 naive peeking;對多指標看板自動套 FDR 校正,避免工程師看到隨機顯著就改 code。
- **產品開發**:禁止『實驗跑到第三天看起來贏了就上線』的流程;PM 想看 N 個分群結果時,要求事前宣告主分群,其餘標為探索性 (探索性發現需另開實驗確認)。
- **營運分析**:在自助分析工具中提醒:同時測 20 個指標、各用 α=0.05,出現至少一個假陽性的機率約 64%;報表自動標示哪些結論做了多重比較校正。
- **策略**:這些陷阱是『實驗看似有用、實則製造噪音』的主因;若組織不治理,會累積一堆基於假陽性的『成功案例』,長期侵蝕對資料的信任與資源配置正確性。
- **2026**:2025 主流解法是工具層強制:平台預設序列檢定/貝氏縮放以化解 peeking、自動 FDR 校正多指標;Kohavi 等持續強調 pre-registration 與『一個 OEC』是最有效的制度性防護。
- 來源:https://docs.growthbook.io/using/experimentation-problems, https://www.mida.so/ab-testing-terms/simpsons-paradox, https://nebulab.com/blog/ecommerce-ab-testing-mistakes

### 辛普森悖論、Twyman 定律、新奇/熟悉效應 (Simpson's Paradox, Twyman's Law, Novelty/Primacy Effects) · fit 5
*aka / 出處:* Simpson's paradox (聚合誤導), Twyman's law (太好就是錯), novelty effect, primacy effect, winner's curse
- **是什麼**:三類解讀層面的陷阱。辛普森悖論:聚合趨勢在分群後反轉 (混淆變數在兩組分布不均)。Twyman 定律:『資料越異常有趣,越可能是錯的』。新奇效應:新功能初期被嘗鮮拉高、之後衰退;熟悉/primacy 效應:老用戶不習慣新版,初期反而吃虧。
- **用在決策流程**:看到驚人結果先假設『是 bug 不是突破』(Twyman),回頭查 instrumentation/SRM;聚合與分群結論不一致時找混淆變數;懷疑新奇/primacy 時延長實驗或用長期 holdout 看效果是否持續。
- **問對問題**:這個『+40% 提升』太好了吧——是不是埋點重複計算?整體贏但每個分群都輸 (或反之),我漏了什麼混淆變數?這個提升一個月後還在嗎,還是只是嘗鮮?
- **軟體工程**:Twyman 觸發時優先查資料管線 (重複事件、漏送、時區、去重不對稱);辛普森悖論提醒分流時要對關鍵維度 (裝置、新舊客、商家) 做 stratification 或事後分層分析。
- **產品開發**:對『改變既有習慣』的改版 (導覽列、結帳步驟) 預期 primacy 效應,初期數據偏負屬正常,需跑足夠長;對吸睛新功能 (動畫、徽章) 警惕 novelty,別用第一週數據拍板。
- **營運分析**:報表預設提供分群下鑽以揭露辛普森悖論;對宣稱大幅提升的實驗自動觸發資料品質複查;為重要改動建立『效果隨時間衰減曲線』監控 novelty/primacy。
- **策略**:這些陷阱讓組織容易把短期/虛假效果當策略勝利;Twyman 定律的紀律 (對好消息更謹慎) 與長期 holdout 文化,能避免策略建立在會蒸發的數字上。
- **2026**:Kohavi 等把 Twyman's law 列為實驗信任度的核心心法;2021 起有專門的『長期效應估計』方法 (如 arXiv 2102.12893《Novelty and Primacy》) 與 surrogate/長期 holdout 框架,用短期資料推估長期效果。
- 來源:https://www.getdalton.com/blogs/simpsons-paradox-ab-testing, https://atticusli.com/replication-crisis/ab-testing-twymans-law/, https://arxiv.org/abs/2102.12893

### 頻率學派 vs 貝氏 A/B 測試 (Frequentist vs Bayesian A/B Testing) · fit 4
*aka / 出處:* p-value vs probability-to-be-best;NHST vs Bayesian decision
- **是什麼**:兩種詮釋與決策框架。頻率學派把機率視為長期頻率,輸出 p-value/信賴區間,需固定樣本數;貝氏把機率視為信念,結合先驗與資料得到後驗,輸出『B 比 A 好的機率』『預期損失 (expected loss)』,對非統計背景者更直覺。
- **用在決策流程**:頻率學派:固定樣本數跑完再看 p<0.05 才下結論。貝氏:設定決策門檻 (如『B 勝過 A 的機率 ≥ 95%』或『預期損失 < 容忍值』) 後再 ship,並能直接回答『預期能賺多少』。
- **問對問題**:我要回答的是『有沒有差異』(頻率學派) 還是『B 比 A 好的機率有多大、好多少』(貝氏)?我有可靠的歷史先驗可用嗎?團隊看得懂 p-value 還是『勝率』更好溝通?
- **軟體工程**:選實驗平台/自建引擎時這是架構決策:貝氏引擎較容易暴露『勝率』API 給 PM 自助看板;頻率學派較易與固定樣本 + power 流程整合。注意貝氏並非『可無限 peeking 不付代價』,停止規則仍重要。
- **產品開發**:面向 PM/商家的實驗結果展示用貝氏『B 有 92% 機率更好、預期客單價 +3%』比『p=0.03』更好溝通決策;高風險改動 (金流) 仍建議用嚴謹頻率學派 + 固定樣本避免過度樂觀。
- **營運分析**:貝氏的後驗分布能直接給營運『效果區間 + 機率』,適合做 ROI 估算;但要提醒:貝氏結果對先驗敏感,先驗設太強會把真實效果壓掉 (有文章警告 Bayesian A/B 在某些情境會 fall short)。
- **策略**:框架選擇影響整個組織的決策語言與風險偏好:貝氏鼓勵更快、以期望值為基礎的決策;頻率學派強調控制假陽性。多數成熟平台兩者並存,策略上應依改動風險選用。
- **2026**:2025–2026 多數商用平台 (Eppo、Statsig、ABsmartly) 預設提供貝氏或 sequential 模式以利非專家『安全地隨時看結果』;貝氏被認為能緩和 peeking、winner's curse 與 multiple testing,但業界也有反思文章指出其在小樣本/錯先驗下的侷限。
- 來源:https://www.geteppo.com/blog/comparing-frequentist-vs-bayesian-approaches, https://www.convert.com/blog/a-b-testing/frequentist-vs-bayesian-ab-testing/, https://medium.com/data-science-collective/tldr-bayesian-a-b-testing-falls-short-f8646529a47a

### 序列檢定 / 永遠有效 p-值 (Sequential Testing & Always-Valid p-values) · fit 4
*aka / 出處:* confidence sequences, group sequential testing (GST), SPRT, mSPRT, always-valid inference
- **是什麼**:允許『邊跑邊看、隨時可停』而不膨脹假陽性的方法。透過會隨資料量動態調整的 confidence sequence / 效能界與無效界,讓每次 peeking 都合法。包含預先排定中間分析的 group sequential 與可無限次看的 fully sequential。
- **用在決策流程**:對高風險或想快速止損的改動採序列檢定:效果夠大時可提早 ship 或提早殺掉爛版本。代價是:偵測『小效果』反而比固定樣本需要更多資料,提早停的信賴區間也較寬。
- **問對問題**:我需要『隨時可看、看到大效果就停』的彈性嗎?還是我在追的是小效果 (那固定樣本更省)?團隊會不會誤以為用了序列檢定就能毫無代價地天天看?
- **軟體工程**:若自建實驗系統,序列檢定能讓即時 dashboard『安全地隨時看』,避免工程師/PM 因 naive peeking 製造假陽性;也適合做自動化的『金絲雀提早止損』(latency/error 飆高時自動殺 treatment)。
- **產品開發**:對風險高、想快速迭代的功能 (新結帳、新支付閘道),序列檢定能在出現明顯負面時提早收手,縮短壞改動的曝險時間;對微幅 UI 優化則不划算。
- **營運分析**:把序列檢定的動態界線畫進營運看板,讓營運能在合法前提下做即時決策;需教育團隊『提早停的效果估計會偏大 (winner's curse)』,別把提早停的數字當成最終效果。
- **策略**:序列檢定提升組織的『實驗速度/止損能力』,對快速迭代的成長型 SaaS 是文化加速器;但策略上要認知它對小效果不省、且讓不熟統計的團隊更敢隨時看,需配套規範。
- **2026**:2025–2026 已成多數商用平台 (Statsig、Eppo、Optimizely、A/B Smartly) 預設或可選模式,主因是能讓不具統計背景的團隊『安全 peeking』;Netflix/Optimizely 推廣 always-valid 推論。注意:對小效果其實比固定樣本更慢。
- 來源:https://www.geteppo.com/blog/sequential-testing, https://www.geteppo.com/blog/comparing-frequentist-vs-bayesian-approaches, https://www.abtasty.com/blog/best-statistical-model-for-ab-testing/

### 多臂吃角子老虎機 (Multi-Armed Bandits) · fit 4
*aka / 出處:* MAB, bandit testing;含 ε-greedy、Thompson sampling、UCB-1
- **是什麼**:在探索 (exploration) 與利用 (exploitation) 間動態權衡的演算法:邊學邊把更多流量導向目前表現較好的版本,以最小化實驗期間的後悔 (regret)。ε-greedy 固定比例隨機探索;Thompson sampling 用貝氏後驗抽樣;UCB-1 用信賴上界。
- **用在決策流程**:當『實驗期間的損失』很貴或機會窗短 (檔期促銷、首頁 banner)、且你只想要最佳選項而不需精確效果量時,用 bandit 自動最大化收益;若你需要乾淨的因果效果量與顯著性,仍用固定 A/B。
- **問對問題**:我比較在乎『實驗期間少虧錢』還是『拿到精確可信的效果量』?選項會隨時間漂移嗎 (要不要持續探索)?我的流量與轉換率夠不夠讓 bandit 收斂?
- **軟體工程**:在推薦/排序/banner 服務裡實作 Thompson sampling 線上更新後驗,需處理延遲回饋 (下單可能隔天才發生)、batch 更新與冷啟動;Thompson sampling 雜訊較大、UCB-1 較穩定且抗噪。
- **產品開發**:首頁版位、活動文案、推薦策略 等『有很多候選、想即時把流量導向最佳』的場景用 bandit;新功能的因果驗證仍用 A/B。ε-greedy 因固定探索而有優化上限,適合預算小、轉換率穩定的簡單情境。
- **營運分析**:促銷檔期用 contextual bandit 對不同客群即時分配最佳優惠;營運需監控 regret 與各臂分配,避免演算法過早鎖死在假最佳 (尤其 ε-greedy 被指行為不穩)。
- **策略**:bandit 把『實驗』變成『持續優化引擎』,適合高頻、短壽命決策 (內容/版位/優惠);但會犧牲對因果效果的乾淨度量,策略上應與 A/B 分工:A/B 學知識,bandit 賺收益。
- **2026**:2025 主流是 Thompson sampling 與 contextual/個人化 bandit,並與 LLM 推薦結合;研究指出 ε-greedy 不穩、Thompson sampling 長期較優但雜訊大、UCB-1 精度與抗噪較佳,選型需看預算與目標分布。
- 來源:https://cxl.com/blog/bandit-tests/, https://www.inwt-statistics.com/read-blog/multi-armed-bandits-as-an-a-b-testing-solution.html, https://www.researchgate.net/publication/350357541_Comparison_of_Various_Multi-Armed_Bandit_Algorithms_E_-greedy_Thompson_sampling_and_UCB-1_to_Standard_AB_Testing

### 雙重差分 (Difference-in-Differences, DiD) · fit 4
*aka / 出處:* DiD, diff-in-diff, 雙差分;延伸:event study、staggered DiD、Callaway–Sant'Anna
- **是什麼**:當無法隨機分流、但有處理組與對照組在處理前後的面板資料時,用『(處理組前後差) 減去 (對照組前後差)』估計因果效果,藉對照組的差分抵銷共同時間趨勢。核心前提是平行趨勢 (parallel trends):若沒處理,兩組走勢會平行。
- **用在決策流程**:用於『某改動只能對部分商家/地區/時間上線』的情境:比較受影響與未受影響者的前後變化差,得到比『單純前後對比』更可信的因果估計,支撐是否全量推廣。
- **問對問題**:處理前兩組走勢真的平行嗎 (畫 pre-trend 圖檢查)?有沒有與處理同時發生的其他事件污染對照組?選誰當對照組才合理?
- **軟體工程**:功能因技術限制只能分批 (按 region/shard/版本) rollout 時,DiD 能事後估計效果;需建好『處理時點』與分組的事件資料表,並注意 staggered rollout 會讓傳統 DiD 偏誤 (改用新式估計量)。
- **產品開發**:某功能先給特定 plan 或特定國家的商家、無法買家層級隨機時,用 DiD 估這群商家相對未開通商家的 GMV/留存增量,決定要不要下放給全部 plan。
- **營運分析**:評估『非實驗式上線』(政策調整、費率變更、UI 全量改版但分地區) 的影響;務必用 pre-period 畫平行趨勢圖,否則結論不可信。
- **策略**:DiD 讓策略級、無法 A/B 的決定 (定價政策、市場進入、費率) 也能有準因果證據;是把『回顧式觀察』升級為『可辯護因果主張』的關鍵工具。
- **2026**:2020–2025 計量經濟學對 staggered (錯期) DiD 有大量修正 (Callaway & Sant'Anna、Sun & Abraham、de Chaisemartin),傳統 two-way fixed effects 在異質效果下會偏誤;2025 仍有新論文討論『超越平行趨勢』的識別策略,實務上務必用新式估計量。
- 來源:https://www.statsig.com/perspectives/diff-in-diff-causal-inference, https://mixtape.scunning.com/09-difference_in_differences, https://cals.ncsu.edu/agricultural-and-resource-economics/wp-content/uploads/sites/46/2025/08/Difference-in-Differences_Slides_Callaway_Brant_CR_2025-compressed.pdf

### Switchback 與 Geo/Holdout 實驗 (Switchback & Geo/Holdout Experiments) · fit 4
*aka / 出處:* switchback test, time-split test, geo experiment, geo holdout, cluster-randomized, 對抗網路效應/干擾的設計
- **是什麼**:處理會外溢污染對照組 (網路效應/雙邊市場干擾,如配對、定價、庫存) 時,個體層 A/B 會偏誤。Switchback 改按時間區間整體切換 A/B (同一時段全市場同一版本);geo/cluster 實驗按地區/叢集隨機;long-term holdout 長期保留一小群不接觸改動,量長期累積效果。
- **用在決策流程**:當改動會影響共享資源或彼此互動 (媒合演算法、動態定價、庫存、物流調度) 時,別用個體 A/B;改用 switchback (時間切換) 或 geo (地區切換),否則 SUTVA 被破壞、結論偏誤。長期 holdout 用來驗證效果是否持續。
- **問對問題**:treatment 會不會透過共享資源/網路影響到 control 組 (干擾/外溢)?隨機單位該是 user、時間區間還是地區?carryover (前一時段的效果延續) 多久?holdout 要保留多久才能看到長期效應?
- **軟體工程**:媒合/定價/物流/搜尋排序這類有全域互動的系統,實驗框架要支援『時間區間隨機 (switchback)』與『地區叢集隨機 (geo)』而非只有 user-bucket;需處理 carryover、自相關導致的變異數估計與較弱的統計效能。
- **產品開發**:雙邊市場功能 (撮合買賣家、共享庫存、即時配送) 的改版用 switchback;區域性功能 (本地物流方案、區域促銷) 用 geo holdout;重大改版上線後保留 1–5% 長期 holdout 監控效果衰減。
- **營運分析**:geo holdout 是衡量行銷/物流/定價策略增量的標準工具;營運要理解 switchback 樣本天生少、效能弱,需較長期間,且分析要用對干擾穩健的變異數估計。
- **策略**:對任何含網路效應的平台 (電商市場、配送、媒合),這類設計是『能不能做出可信因果結論』的前提;長期 holdout 則是對抗 novelty 效應、確保策略建立在持久價值上的制度性保險。
- **2026**:Bojinov & Simchi-Levi (HBS) 系統化了 switchback 的設計與分析;DoorDash 公開採用約 30 分鐘的切換窗口,Lyft/Uber 等廣泛使用 time-split。2024–2026 有大量論文討論 switchback 的最適窗口、效能 (《Powerful Switchback Experiments – Or Not?》, arXiv 2606.03012) 與 empirical Bayes 設計。
- 來源:https://www.hbs.edu/ris/Publication%20Files/WP21-034_20160b13-a86c-4a0d-b6e9-bbae288486c5_c93009c0-8003-43fd-bb1a-012c02d33b98.pdf, https://www.statsig.com/blog/switchback-experiments, https://www.linkedin.com/pulse/experimentation-when-you-cant-ab-test-beyond-testing-shaurya-uppal

### 合成控制法 (Synthetic Control Method, SCM) · fit 3
*aka / 出處:* SCM, synthetic control, Abadie 合成控制;延伸:synthetic DiD、augmented SCM
- **是什麼**:當只有少數 (甚至一個) 處理單位 (如一個地區、一個大商家、一個市場) 時,用多個未處理單位的加權組合,建構一個在處理前盡量貼合處理單位走勢的『合成對照』,處理後兩者落差即為因果效果。
- **用在決策流程**:用於『單一/極少數單位』的重大改動評估:例如只在一個國家上線新物流方案,用其他國家加權合成出『若沒上線會如何』,估計增量,決定是否複製到其他市場。
- **問對問題**:我有足夠多、夠相似的未處理單位來合成對照嗎?處理前合成對照貼合得好不好 (pre-fit)?有沒有外溢效應讓對照單位也被影響 (污染合成)?
- **軟體工程**:適合評估『按 region/資料中心/單一大租戶』上線的基礎設施或政策變更效果,當處理單位太少無法做 DiD/隨機化時;需要乾淨的長期面板指標資料。
- **產品開發**:針對單一旗艦商家或單一市場試點的新功能,用合成控制估其真實增量,避免被該市場本身的季節/趨勢誤導。
- **營運分析**:geo 試點 (在一城市/一區開新功能或調整費率) 的標準分析工具:合成出反事實基線,量化試點的淨效果供 go/no-go。
- **策略**:SCM 讓『大而少』的策略級賭注 (進入新市場、單一大客戶政策、區域定價) 也能有量化反事實,是策略決策的因果證據來源,尤其當 RCT 不可行時。
- **2026**:2021 後 Synthetic DiD (Arkhangelsky et al.) 與 augmented synthetic control 改善了 pre-fit 不佳與偏誤問題;業界 (含廣告增量量測、geo 實驗) 廣泛採用,常與 geo holdout 搭配。
- 來源:https://pmc.ncbi.nlm.nih.gov/articles/PMC6204967/, https://academic.oup.com/aje/article/193/7/1050/7624199, https://www.linkedin.com/pulse/experimentation-when-you-cant-ab-test-beyond-testing-shaurya-uppal

### 斷點迴歸 (Regression Discontinuity Design, RDD) · fit 3
*aka / 出處:* RDD, regression discontinuity, sharp/fuzzy RDD, 閾值設計
- **是什麼**:當處理是依某連續分數是否跨過門檻而分配時,比較剛好在門檻兩側 (幾乎等價) 的單位來估因果效果。邏輯是:門檻附近的個體除了有無受處理外幾乎無差異,故差異可歸因於處理。
- **用在決策流程**:凡是『用閾值決定誰享有某待遇』的規則,都能用 RDD 評估該規則的效果:比較剛達標與剛差一點的人,看待遇是否真的造成行為差異,支撐是否調整門檻。
- **問對問題**:處理是不是嚴格由某個門檻決定的?個體能不能精準操控自己落在門檻哪一側 (能的話 RDD 失效)?門檻附近樣本量夠估計嗎?
- **軟體工程**:用於評估『規則型門檻』:例如『訂單滿 NT$1000 免運』『會員點數達 X 升級』『風控分數超過門檻就攔截』——比較門檻兩側的後續轉換/留存/詐欺率。
- **產品開發**:免運門檻、VIP 等級、折扣資格 等閾值規則,用 RDD 估『跨過門檻』對客單價/復購的真實因果效果,決定門檻該升或降。
- **營運分析**:分析既有閾值政策 (免運、分期資格、信用額度) 的邊際效果,量化『把門檻動一格』的可能影響,而不需另跑實驗。
- **策略**:RDD 把公司本來就存在的『閾值規則』變成天然實驗,讓定價/門檻/資格類策略決策有因果證據,且常可用歷史資料回溯分析,成本低。
- **2026**:Cattaneo 等人 (2023 Handbook 章節) 系統化了 RDD 的共變數調整、頻寬選擇與穩健推論;實務上需做 manipulation test (McCrary) 檢查門檻附近有無人為操控,2025 已有成熟套件 (rdrobust)。
- 來源:https://en.wikipedia.org/wiki/Regression_discontinuity_design, https://mdcattaneo.github.io/papers/Cattaneo-Keele-Titiunik_2023_HandbookCh.pdf, https://bookdown.org/mike/data_analysis/sec-regression-discontinuity.html

### 工具變數 (Instrumental Variables, IV) · fit 3
*aka / 出處:* IV, instrumental variable, 2SLS (兩階段最小平方), LATE, encouragement design
- **是什麼**:當處理與結果間有內生性/混淆,直接迴歸會偏誤時,找一個『工具變數』:它影響處理 (相關性) 但只透過處理影響結果 (排除限制),藉此分離出處理的因果效果。常以 2SLS 估計,得到的是順從者的局部效果 (LATE)。
- **用在決策流程**:當你只能『鼓勵』而無法『強制』使用者採用某功能 (intent-to-treat ≠ 實際使用) 時,把『被鼓勵與否 (隨機)』當工具,估計『真正使用該功能』對結果的因果效果。
- **問對問題**:我的工具真的只透過處理影響結果嗎 (排除限制成立嗎,這常無法檢定只能論證)?工具與處理相關性夠強嗎 (弱工具會嚴重偏誤)?我估的是全體效果還是順從者的 LATE?
- **軟體工程**:encouragement design:隨機對部分使用者推播『試用新功能』的提示 (工具),用 IV 從『被推播』推估『實際採用功能』的因果效果,解決『會自己採用的人本來就不同』的自選擇偏誤。
- **產品開發**:新功能無法強制開啟、只能引導採用時 (例如新版 App、選配的 AI 推薦),用 IV 估真正採用者的效果,避免高估 (採用者本來就是高價值用戶)。
- **營運分析**:分析『推播/email 觸達 → 行為改變』時,把隨機觸達當工具,分離出觸達內容本身的因果效果,而非被『會開信的人本就活躍』污染。
- **策略**:IV 讓『無法強制、只能鼓勵』的策略 (採用引導、行為改變類) 也能估因果;但因依賴難驗證的排除限制與弱工具風險,結論的可信度需審慎論證,策略上當作輔助證據。
- **2026**:弱工具 (weak instrument) 與排除限制不可檢定一直是 IV 的主要批評;2020 年代機器學習結合 IV (DeepIV、雙重/去偏機器學習 DML) 興起,但工業界 A/B 場景更常用其特例『encouragement design』而非一般 IV。
- 來源:https://arxiv.org/pdf/1410.0163, https://pmc.ncbi.nlm.nih.gov/articles/PMC6204967/, https://mixtape.scunning.com/09-difference_in_differences
