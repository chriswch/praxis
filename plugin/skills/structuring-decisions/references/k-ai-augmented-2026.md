> 「決策科學方法目錄」系列 · K. 2026 AI 輔助決策 · 共 9 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### Agentic Analytics 與 Text-to-SQL(自然語言查數據 + 自動洞察) · fit 5
*aka / 出處:* agentic analytics;NL-to-SQL;conversational analytics;Snowflake Cortex Analyst/Agents;Databricks AI/BI Genie;dbt Semantic Layer (MetricFlow)
- **是什麼**:讓非分析師用自然語言問數據,由 agent 檢索語意層(semantic layer)、產生並自我修正 SQL、回傳答案甚至主動調查異常。2026 的關鍵是「語意層」:把指標定義固定在 YAML(如 dbt MetricFlow),agent 照定義產 SQL,而非自由發揮。
- **用在決策流程**:把它當「先快速取得事實」的步驟,而非決策本身:用 NL 問題快速拿到數字後,仍由人套用決策準則判斷。對高風險查詢,要求 agent 附上它跑的 SQL 與引用的指標定義以供查核。
- **問對問題**:問「這個指標的精確定義是什麼?agent 用的 SQL 是否符合定義?它有沒有默默改了 join 或過濾條件?這個數字能支撐我要做的決策嗎?」
- **軟體工程**:在多租戶電商後端,把核心指標(GMV、轉換率、退貨率)定義進語意層 YAML 並版控於 Git,讓 text-to-SQL 不會在 tenant 隔離或 timezone 上出錯;對 LLM 生成的 SQL 強制只讀帳號 + row-level tenant filter,防跨租戶資料外洩。
- **產品開發**:在 admin 後台做「問商家數據」功能時,先建語意層再接 agent;不要讓 LLM 直接打 production DB,而是經過受控 query gateway。
- **營運分析**:讓營運/CS 自助查「上週某商家為何訂單下滑」,agent 做多步調查並指出可能成因,人再驗證——把分析師從重複查詢中釋放。
- **策略**:用 dbt 跨倉庫語意層做多市場/多 plan 的一致指標,支撐策略層比較,避免各團隊指標定義打架。
- **2026**:2026 進展明顯但仍須謹慎:Snowflake 宣稱語意層整合後真實案例 SQL 準確率達 90%+,但學術評測指出企業級 text-to-SQL 在髒資料上執行準確率可能僅約 31%(2025/04),LinkedIn 內部 benchmark 約 53% 正確或接近正確——所以語意層、自我修正、人工查核是關鍵。
- 來源:https://arxiv.org/abs/2507.14372, https://www.snowflake.com/en/blog/engineering/agentic-semantic-model-text-to-sql/, https://docs.snowflake.com/en/release-notes/2026/other/2026-04-13-cortex-agents-agentic-analyst, https://datalakehousehub.com/blog/2026-05-semantic-layers-text-to-sql/

### LLM 當評審 (LLM-as-a-Judge) · fit 5
*aka / 出處:* LLM-as-a-judge;model-graded evaluation;pointwise/pairwise/listwise judging;reference-guided grading;meta-judge
- **是什麼**:用 LLM 自動評估其他 LLM(或產品)的輸出品質,取代或補充昂貴的人工審查。輸出含三部分:評分/排名(Y)、推理說明(E,強迫它先解釋再給分以提升一致性)、可行回饋(F)。有 pointwise(單一打分)、pairwise(兩者比較)、listwise(多者排序)三種模式。
- **用在決策流程**:把「主觀品質好不好」變成可大規模、可重複的評估訊號,接進 CI/CD 與 A/B 測試做 gate;但對高風險決策保留 human-in-the-loop。先與領域專家做 error analysis 定義評分維度,再寫明確 rubric,並用人工抽查校準 judge。
- **問對問題**:問「我在評 base model 還是包了 prompt/檢索/工具的整個產品?rubric 是否單一維度、可重現?judge 有沒有位置/長度/自我偏好偏誤?它和人工標註的相關性有多高?」
- **軟體工程**:在 CI 用 LLM-as-a-judge 對 AI 功能(如商品描述生成、客服回覆)做迴歸測試:每次改 prompt 就跑一批固定測例,judge 給分低於門檻就擋 merge;judge 與 generator 用不同供應商的模型以降自我偏好偏誤。
- **產品開發**:做 AI 功能(智能推薦文案、退換貨自動回覆)時,用 pairwise 比較新舊版本輸出,作為上線決策依據,而非只靠人工 eyeballing。
- **營運分析**:對線上 AI 輸出做抽樣評審並追蹤品質分數趨勢,當分數異常下滑時觸發告警(把 judge 當品質 guardrail metric)。
- **策略**:在評估要不要採用某 LLM 供應商時,用統一 judge + 領域 benchmark 比較成本/品質,作為 vendor 決策的客觀依據。
- **2026**:2024–2026 研究指出 judge 有顯著偏誤:位置偏誤(偏好排前者)、冗長偏誤(偏好較長答案)、自我偏好偏誤(偏好自家輸出),有研究稱前沿模型在 50%+ 的偏誤測試上失敗。緩解法:交換 A/B 位置取平均、reference-guided grading、ensemble/meta-judge、跨供應商選 judge,並持續對特定領域做人工 spot-check 校準。
- 來源:https://agenta.ai/blog/llm-as-a-judge-guide-to-llm-evaluation-best-practices, https://www.adaline.ai/blog/llm-as-a-judge-reliability-bias, https://arxiv.org/html/2410.21819v2, https://arxiv.org/pdf/2410.02736

### AI 輔助實驗分析與指標監控(自動 guardrail + 異常偵測) · fit 5
*aka / 出處:* automated experiment analysis;guardrail metrics;pre-registration;anomaly detection;AI-powered metrics monitoring(Datadog 等)
- **是什麼**:用自動化/AI 加速與守護實驗:先選定並 pre-register 一個主指標,其餘當 guardrail 監看;用統計告警框架在不破壞統計完整性的前提下偵測 guardrail 異常,並用 AI 異常偵測自動標出可疑變化。
- **用在決策流程**:上線/全量決策遵循:單一主指標 + 預註冊 + guardrail 監看。AI 負責偵測異常與初步診斷,但 ship/no-ship 由人依預設準則拍板,避免事後挑指標(p-hacking)。
- **問對問題**:問「我的主指標是哪一個、事前定好了嗎?哪些是不能變壞的 guardrail?這個顯著結果是真效果還是多重比較/偏誤實驗造成?樣本與分流有沒有偏?」
- **軟體工程**:把 feature flag、guardrail 指標(錯誤率、延遲、崩潰率)、自動驗證標準化進實驗平台;部署後自動監看 guardrail,異常即自動告警/回滾。
- **產品開發**:每個功能實驗強制填主指標 + guardrail(如轉換率不能掉、退貨率不能升),平台自動算 t-test/卡方並產出可讀結論供 PM 決策。
- **營運分析**:對核心商家指標(GMV、轉換、客訴)設 AI 異常偵測,自動分辨季節性波動與真異常,並嘗試關聯成因,降低誤報。
- **策略**:把實驗紀律制度化為平台能力,讓多租戶上的策略性改動都以受控實驗驗證,形成「先實驗後全量」的決策文化。
- **2026**:2025 強調自動化偵測偏誤實驗(biased experiment)、AI 驅動的 guardrail 監看與異常診斷(如 Datadog 的 AI metrics monitoring),以及在規模化下標準化實驗工作流以減少瓶頸。
- 來源:https://www.datadoghq.com/blog/ai-powered-metrics-monitoring/, https://arxiv.org/pdf/1808.00114, https://www.harness.io/blog/a-b-testing-at-scale-enable-safe-experimentation-for-platform-teams, https://medium.com/@QuarkAndCode/a-b-testing-in-2025-hidden-complexity-costs-mistakes-scaling-experiments-65d17e9f3dcb

### 人機協作決策層級:in-the-loop / on-the-loop / in-command(增強 vs 自動化界線) · fit 5
*aka / 出處:* human-in-the-loop (HITL);human-on-the-loop;human-in-command;EU 可信 AI 指引;augmentation vs automation
- **是什麼**:依風險與可逆性決定人介入的層級:in-the-loop(系統行動前需人核准)、on-the-loop(人可在運行中或事後介入)、in-command(人保留最終權威)。對應『增強 vs 自動化』的界線抉擇:增強讓 AI 提供洞察/建議但人負責決策,自動化讓系統自行行動。
- **用在決策流程**:對每類決策先分級:高風險/不可逆(退款、扣款、刪資料、跨租戶操作)→ in-the-loop;中風險可逆 → on-the-loop + 告警;低風險高頻 → 自動化但留 audit log。把『誰負責、何時人介入』寫進設計而非事後補。
- **問對問題**:問『這個決策可逆嗎?出錯成本多高?AI 錯了誰負責?人有沒有足夠資訊與時間有效介入,還是只是橡皮圖章?』
- **軟體工程**:agent 化的維運/部署動作分級:讀取與診斷可自動;重啟服務、改 production 設定、跨租戶批次操作需人核准(in-the-loop)並留完整 audit trail。
- **產品開發**:設計 AI 功能時明確標示自動 vs 建議:AI 自動套用 vs 給商家『建議,一鍵採用』。預設對影響金流/客戶資料的動作採增強而非全自動。
- **營運分析**:AI 產生的『行動建議』(該對誰促銷、該調哪個價)走 on-the-loop:系統提議、營運審核後執行,並回饋結果供模型學習。
- **策略**:把『增強優先』訂為產品原則:HBR 2026 論點指出長期贏家偏向 augmentation(保留員工投入與機構知識);決定哪些流程自動化、哪些增強,並向團隊清楚溝通意圖以免誤解為裁員。
- **2026**:2026 共識:Gartner 預估到 2027 年半數商業決策將被 AI agent 增強或自動化;Deloitte 2026 報告 57% 領導者認為須教員工『與機器一起思考』。HBR 2026/04 指出存在認知落差——81% 高層認為公司在做增強,僅 53% 一線員工同意。
- 來源:https://hbr.org/2026/04/why-companies-that-choose-ai-augmentation-over-automation-may-win-in-the-long-run, https://www.deloitte.com/us/en/insights/topics/talent/human-capital-trends/2026/decision-making-with-ai.html, https://parseur.com/blog/future-of-hitl-ai, https://www.elementum.ai/blog/human-in-the-loop-agentic-ai

### 對抗自動化偏誤:信任校準與適當依賴 (Trust Calibration / Appropriate Reliance) · fit 5
*aka / 出處:* automation bias;over-reliance/under-reliance;appropriate reliance;trust calibration;XAI 可解釋性;cognitive forcing / nudges
- **是什麼**:自動化偏誤是人傾向採信自動系統建議、即使它錯了也不去質疑;目標是『適當依賴』——AI 對時就依賴、AI 錯時靠自己,避免過度依賴與依賴不足兩種失敗。可解釋性(XAI)、信任校準與認知促發(nudge)是緩解手段。
- **用在決策流程**:在 AI 建議旁強制提供:信心分數、依據(可解釋性)、以及與人判斷不一致時的『摩擦』(要求使用者先給自己的判斷再看 AI)。對高風險決策刻意加 cognitive forcing,讓人不能無腦點同意。
- **問對問題**:問『我是因為 AI 對才採信,還是因為它是 AI 就採信?如果 AI 沒給這個答案,我會怎麼判斷?這個解釋是真的幫我判斷,還是只是讓我更有信心卻沒更準?』
- **軟體工程**:AI 程式建議/自動修復:對高風險變更要求人先讀 diff 再核准,顯示測試證據而非只給綠勾;避免工程師因『AI 寫的』而略過 review(automation bias)。
- **產品開發**:AI 功能 UI 設計避免製造過度信任:標示不確定性、提供來源、對關鍵動作加二次確認;研究顯示時間壓力會放大自動化偏誤,故高風險流程別逼使用者趕。
- **營運分析**:對 AI 自動洞察/異常診斷,要求附上佐證資料與替代解釋,讓營運不會把第一個 AI 結論當定論;追蹤『AI 建議被採納但事後錯誤』的比率。
- **策略**:把『適當依賴』納入 AI 功能驗收標準與風險治理:衡量 human+AI 是否真的比單獨人或單獨 AI 好(互補性),而非只看 AI 單獨準確率。
- **2026**:2024–2026 研究指出:研究發現粗糙地『把人放進迴圈』可能提升採用率卻降低決策準確率;XAI 效果分歧(有人有解釋反而更差),2025/2026 強調解釋要做到價值與情境對齊;有用 nudge / cognitive reflection 緩解 GenAI 引發的自動化偏誤的實證研究。
- 來源:https://thedecisionlab.com/biases/automation-bias, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10857587/, https://www.sciencedirect.com/science/article/pii/S1877050925030042, https://dl.acm.org/doi/10.1145/3581641.3584066

### 因果決策圖 (Causal Decision Diagram, CDD) · fit 4
*aka / 出處:* CDD;Decision Intelligence Handbook(Lorien Pratt & N. E. Malcolm);Quantellia;Pratt 為 transfer learning 共同發明人
- **是什麼**:一種把決策畫成因果鏈的視覺工具:用 Choices(可控的選擇)、Intermediates(中間變數)、Outcomes(最終結果)三種方塊,加上 Dependencies(箭頭)連成圖。它比 decision tree 更強調行動到結果的因果與漣漪效應,讓你看到一個決策的連鎖後果。
- **用在決策流程**:面對複雜決策時,先畫出「我能控制的槓桿(Choices)→ 會被影響的中間量 → 我真正在乎的結果」,標出哪些連結是已知因果、哪些是假設、哪些有不確定性。把爭論從「我覺得」拉到「我們對這條箭頭的假設是什麼,要怎麼驗證」。
- **問對問題**:問「我真正能控制的槓桿是什麼?它透過哪些中間變數影響結果?哪條因果箭頭是我們在賭、卻沒驗證的?」把隱性假設外顯化。
- **軟體工程**:規劃效能優化或架構改動時,畫 CDD:把「加快取(Choice)→ 降 DB 負載(Intermediate)→ p99 下降+成本上升(Outcomes)」連起來,讓 trade-off 與被忽略的副作用(快取一致性)現形。
- **產品開發**:設計新功能時用 CDD 把「功能上線 → 行為改變 → 北極星指標」串起來,標出哪些是假設,直接對應到要做的實驗。
- **營運分析**:把商家流失分析從相關性圖表升級成 CDD:哪些可介入槓桿(客服、促銷、教學)真的會改變留存,而非只是與留存相關。
- **策略**:做平台級策略(如要不要把某 plugin 下放給某 plan)時,用 CDD 攤開「下放 → 採用率/客訴/維運成本 → 營收與 churn」的因果鏈與風險。
- **2026**:2025–2026 CDD 與 process model、behavior enabler、decision-centric dashboard 結合,並被視為解最複雜問題的重要新工具;Pratt 部落格持續更新案例(如 connecting decisions to data 系列)。
- 來源:https://www.lorienpratt.com/why-causal-decision-diagrams-are-the-most-important-new-development-in-solving-the-most-complex-problems-and-what-that-has-to-do-with-dogs/, https://www.lorienpratt.com/a-framework-for-how-data-informs-decisions/, https://aicoach.co.za/the-decision-intelligence-process/

### 因果 AI (Causal AI) · fit 4
*aka / 出處:* causal inference;causal machine learning;DAG/因果圖;do-calculus;干預與反事實
- **是什麼**:用因果圖與因果推論回答「做了介入會發生什麼」與「若當初不做會如何(反事實)」,而非僅相關性預測。它支援實驗設計、介入測試、情境模擬,讓決策建立在因果而非巧合相關上。
- **用在決策流程**:在無法/不便做 A/B 時(或觀察資料)用因果方法估計介入效果:先畫因果圖標出 confounder,選對識別策略(調整、IV、DiD 等),再估計效果並做敏感度分析。用它區分「真效果」與「選擇偏誤」。
- **問對問題**:問「這是相關還是因果?有哪些 confounder?如果我反過來不做這件事,結果會不同嗎?我的識別假設(如無未觀測干擾)成立嗎?」
- **軟體工程**:效能/可靠性歸因:某次部署後錯誤率上升,用因果/準實驗(對照未受影響的 tenant 或時段)區分「部署造成」還是「流量自然波動」,避免誤回滾。
- **產品開發**:新功能無法全量 A/B 時(如只對部分 plan 下放),用 difference-in-differences 估計功能對留存/GMV 的因果影響。
- **營運分析**:把流失/退貨分析從相關性升級為因果:估計「主動客服介入」對留存的真實增量,而非只看有客服的人留存較高(可能是本來就活躍)。
- **策略**:行銷預算與促銷組合決策用 causal/lift analytics 估算各渠道的增量貢獻,把預算配給真正有因果效果的渠道。
- **2026**:2025–2026 causal AI 進入主流:Gartner 類調查指出 7 成組織預計到 2026 年採用因果方法(實際使用約 16%、實驗階段約 33%);市場高速成長;2025/06 DATA POEM 推出號稱首個 Large Causal AI Model(POEM365)。注意:廠商市場規模數字差異極大,需審慎引用。
- 來源:https://kanerika.com/blogs/causal-ai/, https://www.imd.org/ibyimd/artificial-intelligence/how-causal-ai-can-improve-your-decision-making/, https://martech.org/why-causal-ai-is-the-answer-for-smarter-marketing/, https://acalytica.com/blog/causal-ai-disruption-across-industries-2025-2026

### 增益模型 (Uplift Modeling) · fit 4
*aka / 出處:* uplift modeling;heterogeneous treatment effect (HTE/CATE);persuadables;incremental targeting
- **是什麼**:估計「介入」對每個個體/分群的增量因果效果(CATE),用來只對「會被說服才行動」的 persuadable 顧客做介入,避免浪費在本來就會買、或反而被打擾的人身上。是電商個人化與促銷的關鍵技術。
- **用在決策流程**:把「要對誰做促銷/挽回/通知」變成最佳化問題:估計每人 uplift,在預算/成本約束下挑增量最高者(guardrailed uplift targeting),而非對所有人或所有高消費者一律發券。
- **問對問題**:問「這個介入對『誰』有增量?有沒有人會因被打擾而負向(sleeping dogs)?我是在最大化轉換,還是最大化『增量利潤』?」
- **軟體工程**:在推播/通知系統實作 uplift 分數作為發送決策依據,加上頻控與冷卻期處理重複曝光導致的偏誤;確保線上分數計算與離線訓練特徵一致。
- **產品開發**:做「智慧發券/挽回」功能時,以 uplift 取代規則式(如『消費滿 X 就發券』),量化展示給商家「這批券的增量營收」。
- **營運分析**:用 uplift-specific 指標(Qini、uplift curve)而非一般準確率評估挽回活動成效,並做敏感度分析。
- **策略**:把行銷預算配置框成 uplift 最佳化:在 ROI 與品牌曝光約束下,決定整體促銷強度與對象,平台級可作為各商家的可組態策略。
- **2026**:2025 業界證據強調實作難點:行為異質資料的 confounding 會壓垮模型,較同質 cohort 估計更準;重複曝光/冷卻期造成相關曝光偏誤。2025/12 出現 guardrailed uplift targeting(結合因果推論 + 約束最佳化)的 playbook。
- 來源:https://arxiv.org/html/2512.19805v1, https://causal-machine-learning.github.io/kdd2025-workshop/papers/16.pdf, https://arxiv.org/pdf/2308.09066, https://medium.com/@med.hmamouch99/beyond-churn-models-how-causal-inference-and-uplift-modeling-drive-effective-retention-1ddedbac2f12

### AI Copilot 用於產品探索與 PRD(思考夥伴模式) · fit 4
*aka / 出處:* personal AI copilot(Tal Raviv / Lenny's Newsletter);ChatPRD;thinking partner;context-rich prompting
- **是什麼**:把 LLM 養成有持續脈絡的「思考夥伴」而非通用工具:給它角色設定(指令)、上傳基礎知識(策略、競品、客研、流程)、每個專案開獨立 thread、持續用語音『閒聊更新』維持新鮮脈絡。脈絡足夠後,連『下一步最重要的事是什麼』都能得到個人化好答案。
- **用在決策流程**:用 copilot 加速決策的發散與壓力測試:讓它套用你公司特定框架做分析、扮演利害關係人做角色扮演、把分歧當成思考催化劑;但把輸出當『靈感』而非權威,最終判斷在你。
- **問對問題**:讓 copilot 反問你:『要達成這個目標,我還缺哪些脈絡?』用它幫你產生『該問而沒問的問題』清單;對 PRD 讓它挑出未驗證假設與遺漏的邊界情況。
- **軟體工程**:把 repo 慣例、架構決策紀錄(ADR)、CLAUDE.md 之類規則餵給 copilot,讓它在設計討論時對齊既有架構,並協助寫技術 spec 與 RFC 草稿。
- **產品開發**:用 ChatPRD 類工具把 PRD 從數小時縮到數分鐘:先口語講出已知,再讓它結構化成可行 PRD、user story、研究計畫,人再審改。
- **營運分析**:讓 copilot 根據你貼上的數據摘要,協助產生假設與後續分析問題清單,加速從『看到數字』到『知道要查什麼』。
- **策略**:把策略簡報/競品分析當 project knowledge,讓 copilot 做情境推演與利害關係人對話排練,作為策略決策前的思辨夥伴。
- **2026**:2025 此模式在 Lenny's Newsletter 等被系統化(四步:Hire→Onboard→Kick off→Put to work);2026 演進方向是動態知識整合(自動拉 PM 工具/訊息/決策紀錄)、團隊層共享脈絡(新人繼承 80% 既建 copilot)、與主動式 coaching。
- 來源:https://www.lennysnewsletter.com/p/build-your-personal-ai-copilot, https://www.chatprd.ai/lenny, https://podcasts.apple.com/us/podcast/build-your-personal-ai-copilot/id1810314693?i=1000718440249
