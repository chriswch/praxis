> 「決策科學方法目錄」系列 · E. 認知偏誤與去偏誤 · 共 17 個方法。圖例:工程/產品/營運/策略=四軸應用;fit=與軟體/SaaS 契合度(3–5)。

### 雙系統思維 (System 1 / System 2) · fit 5
*aka / 出處:* Dual-process theory；Thinking, Fast and Slow (Kahneman 2011)；原概念由 Stanovich & West 提出，Kahneman 推廣
- **是什麼**:Kahneman 在《快思慢想》中區分兩種心智運作：System 1 快速、自動、情緒化、無意識(直覺反應)；System 2 緩慢、費力、邏輯、需刻意調用(深思分析)。多數偏誤源自 System 1 用捷思走捷徑、而 System 2 沒被啟動去檢查。
- **用在決策流程**:把決策分類:低風險、可逆、高頻的事讓 System 1 / 直覺快速處理(別過度分析);高風險、不可逆、昂貴的事刻意切換到 System 2(寫下假設、找反證、跑數據)。建立『觸發器』:當決策符合某些條件(影響多租戶、改 schema、動金流)時強制進入 slow path(設計審查、RFC)。
- **問對問題**:『這是直覺還是分析得出的結論?』『這個決策值得我啟動 System 2 嗎,還是我在過度思考一個 two-way door?』『我現在的判斷有沒有可能只是熟悉感/流暢感造成的錯覺?』
- **軟體工程**:code review 時,熟悉的 pattern 會讓 System 1 直接放行(『看起來對』);對安全敏感(SQL、權限、tenant 隔離)的 diff 要刻意切 System 2 逐行驗證,而非靠直覺掃過。對 LLM 產生的程式碼尤其要警覺——流暢的程式碼最容易觸發 System 1 放行。
- **產品開發**:需求評估時,『這功能聽起來很合理』是 System 1;真正該做的是 System 2:這解決誰的什麼 JTBD、有多少租戶會用、機會成本是什麼。把直覺當假設,而非結論。
- **營運分析**:看 dashboard 時,一個尖峰立刻被腦補成因果(System 1);要刻意停下來問是不是季節性、是不是某大租戶單一事件、樣本量夠不夠(System 2)。
- **策略**:策略會議中『大家都覺得 X 是對的』通常是 System 1 的群體流暢感;重大押注要強制 System 2 流程(pre-mortem、outside view)。
- **2026**:2025–2026 研究(arXiv 2403.00811、2601.08045)發現 LLM 也表現出類 System 1 的偏誤(錨定、確認),且開發者對 AI 流暢輸出的信任會抑制自己的 System 2 查核。可把『要求 LLM 給出 step-by-step reasoning 與多個替代方案』當成強制 System 2 介入的手段。
- 來源:https://en.wikipedia.org/wiki/Thinking,_Fast_and_Slow, https://thedecisionlab.com/reference-guide/philosophy/system-1-and-system-2-thinking, https://arxiv.org/abs/2403.00811

### 沉沒成本謬誤 (Sunk Cost Fallacy) · fit 5
*aka / 出處:* Escalation of commitment；Concorde fallacy
- **是什麼**:已投入且無法回收的成本(時間、人力、金錢)不理性地影響當下決策——『都做這麼久了,放棄就白費了』。理性決策只應比較『從現在起』各選項的未來效益與成本,沉沒成本應被忽略。
- **用在決策流程**:決策時把已花的成本從討論中『刪掉』,只問:如果今天從零開始、知道現在所有資訊,我還會選這條路嗎?設定預先承諾的 kill criteria 與 checkpoint,讓『停損』成為制度而非個人認賠。
- **問對問題**:『如果這個專案是別人留下來的、我沒有任何情感投入,我會繼續嗎?』『我們是因為它會成功而繼續,還是因為已經投太多而繼續?』『繼續的機會成本是什麼?』
- **軟體工程**:花兩年自建 CMS / 框架,已知它 bug 多、拖慢團隊,卻因『投了兩年』而不願換成熟方案——典型沉沒成本。對待自寫的複雜抽象層、半成品的微服務遷移也一樣:用 version control 讓『砍掉重練』成本可控,降低不捨。
- **產品開發**:一個低使用率功能投入大量工程才上線,後續持續加碼維護而非下架;應像 Google 定期關閉產品(Google Graveyard)般,建立功能 sunset 機制。
- **營運分析**:一個營運活動/行銷渠道已投廣告預算但 ROI 為負,卻因『已經花了』繼續投——應只看 marginal ROI。用 cohort 數據設停損線。
- **策略**:對一條已投入大量資源的產品線(例如自建 POS 硬體整合),策略檢討要明確把累積投資排除在『要不要繼續』的判斷之外。
- **2026**:LLM 時代出現新形態:開發者已花時間調教某個 prompt/agent pipeline,即使效果不佳仍不願換方法(suggester preference + sunk cost)。建議用便宜的 A/B 比較多種方案,降低換掉的心理門檻。
- 來源:https://thedecisionlab.com/biases/the-sunk-cost-fallacy, https://www.equalexperts.com/blog/our-thinking/how-to-avoid-sunk-cost-fallacy-in-software-projects/, https://lawsofsoftwareengineering.com/laws/sunk-cost-fallacy/

### 錨定效應 (Anchoring) · fit 5
*aka / 出處:* Anchoring-and-adjustment heuristic (Tversky & Kahneman 1974)
- **是什麼**:先看到的數字會成為『錨』,後續判斷不自覺向它靠攏並調整不足,即使該數字無關或隨機。Lovallo & Kahneman 的 HBR『Delusions of Success』指出錨定是高估專案效益的主因之一。
- **用在決策流程**:在群體估計/談判前,避免任何人先丟出數字。讓每個人獨立、同時揭露估計值;先收斂多元意見再討論。對外部給的『目標數字』(主管期望、客戶報價)保持警覺,問它的依據。
- **問對問題**:『我的估計是不是被剛才那個數字帶著走?』『如果第一個人講的是另一個數字,我的答案會不同嗎?』『這個基準數字是怎麼來的、可信嗎?』
- **軟體工程**:Planning Poker 的設計就是反錨定:成員獨立選卡、同時翻牌,PO 只說需求不丟點數,避免資深工程師一開口就定錨全隊估點。需求單上預填的工時、JIRA 上前一張類似 ticket 的估點也是隱性錨。
- **產品開發**:定價或 roadmap 容量規劃時,第一版草案的數字會錨住整個討論;先讓利害關係人各自寫下再彙整。
- **營運分析**:設 KPI 目標時,去年數字會錨住今年目標,忽略市場結構變化;報表預設的時間區間/比較基期也會錨定解讀。
- **策略**:併購/投資估值、競品定價比較時,對方丟出的第一個數字會錨定整場談判,要事先用 outside view 算出自己的獨立區間。
- **2026**:2026 研究發現 LLM 也有強烈錨定:給無關數字會顯著影響其輸出(如建議的『刑期』、估點)。用 AI 估算時,不要在 prompt 裡先塞自己的預期數字,並『調換選項順序比較結果』以偵測錨定。
- 來源:https://hbr.org/2003/07/delusions-of-success-how-optimism-undermines-executives-decisions, https://www.eficode.com/blog/make-effort-estimates-you-can-actually-trust-by-removing-anchoring-bias, https://arxiv.org/pdf/2507.10124

### 規劃謬誤 (Planning Fallacy) · fit 5
*aka / 出處:* Optimism bias in planning；Kahneman & Tversky 1979 提出
- **是什麼**:系統性低估完成時間、成本與風險,並高估效益。根源是採取『內部視角』(inside view)——只看眼前這個案子的細節,而非同類案子的歷史結果分布。
- **用在決策流程**:對任何排程/估算,強制要求一個 outside-view 對照:過去同類工作實際花多久?把『理想路徑估計』乘上歷史超支係數。對外承諾交期時加上以資料為基礎的 buffer,而非拍腦袋。
- **問對問題**:『過去類似的 migration / feature 實際花了多久,而不是我希望它花多久?』『我是不是只想著順利路徑,忽略了整合、code review、上線回滾的時間?』
- **軟體工程**:Sprint 估點長期低估是教科書級的規劃謬誤;用團隊歷史 velocity 與『類似 epic 實際耗時』做 outside view,而非每張卡重新樂觀估計。大型重構/DB migration 尤其受害。
- **產品開發**:新功能『兩週可上』常變兩個月;用過去 feature 的 lead time 分布(reference class)來校正 roadmap 承諾。
- **營運分析**:資料遷移、報表系統重建專案的時程預估,應建立內部專案耗時資料庫供 reference-class forecasting。
- **策略**:進入新市場/上新產品線的時間與成本預估,Lovallo & Kahneman 指出大多數重大商業案最終達不到預期;策略規劃要內建 outside view。
- **2026**:『AI 會加速開發』本身正在製造新一輪規劃謬誤——團隊以為有 Copilot 就能砍時程,卻忽略查核 AI 程式碼、修正幻覺的隱藏成本(arXiv 2601.08045 指 48.8% 開發動作含偏誤)。仍需用實際 lead time 數據校正。
- 來源:https://whennotesfly.com/concepts/psychology-behavior/planning-fallacy-explained, https://www.pmi.org/learning/library/nobel-project-management-reference-class-forecasting-8068, https://corporate.jasoncollins.blog/outside-view

### 確認偏誤 (Confirmation Bias) · fit 5
*aka / 出處:* Myside bias；確認傾向
- **是什麼**:傾向尋找、解讀、記住能支持既有信念的資訊,並忽略或淡化反證。在資料分析上常表現為『挑數據』(cherry-picking)與『偷看 A/B 結果就喊停』。
- **用在決策流程**:決策前先寫下假設與『什麼證據會推翻它』(falsification 條件)。主動指派人找反證(見 red team)。預先註冊 A/B 測試的假設、樣本量、成功標準與測試期長,結束前不偷看不喊停。
- **問對問題**:『什麼資料會證明我錯?我有去找嗎?』『我是在驗證假設,還是在找理由支持我已經想做的事?』『我有看不支持我的 segment / metric 嗎?』
- **軟體工程**:debug 時鎖定『我認為的』成因,只找支持它的 log,忽略矛盾證據(arXiv 2601.08045 的 CB1 Belief Confirmation);用二分法/最小重現,而非只驗證偏好假設。LLM 也會迎合你 prompt 裡的假設,放大確認偏誤。
- **產品開發**:做了想做的功能後,只訪談喜歡它的用戶、只看正向回饋;應刻意找流失用戶、看反向指標。Amplitude 指確認偏誤是 PM 常見陷阱。
- **營運分析**:A/B 測試『偷看』:結果一變正就喊停宣布勝利,是統計上無效的確認偏誤。應固定測試期、用預設的顯著性門檻。也別只報支持結論的 segment。
- **策略**:對既定策略方向,只蒐集利多市場訊號;用 red team 或外部觀點強迫面對利空。
- **2026**:LLM 的諂媚傾向(sycophancy)會強化使用者的確認偏誤——你怎麼問,它就附和你想聽的。2025 研究建議用 metacognitive prompt(『我可能哪裡錯了?』)讓 AI 主動列反方論點。
- 來源:https://amplitude.com/blog/confirmation-bias, https://www.ezbot.ai/post/five-cognitive-biases-that-can-skew-your-a-b-testing-decisions-and-how-to-avoid-them, https://arxiv.org/html/2601.08045v1

### 過度自信 (Overconfidence Bias) · fit 5
*aka / 出處:* Overprecision / overestimation / overplacement(三種型態)
- **是什麼**:高估自己的知識、能力與預測準確度,並低估世界的不確定性。專家與一般人皆有;在估算上表現為信心區間過窄(overprecision)。由 hindsight bias 與確定性錯覺餵養。
- **用在決策流程**:用區間估計而非點估計,並刻意拉寬區間(問:90% 信心區間是多少?通常還是太窄)。記錄預測準確度做校準訓練。重大決策要求『信心校準』:你下注多少?
- **問對問題**:『我有多確定?如果要我下注呢?』『我的信心區間是不是太窄?最糟與最好情況差多少?』『我憑什麼覺得自己比歷史基率更準?』
- **軟體工程**:工程師給單點工時估計(『大概 3 天』)而非區間,且區間過窄;『這個改動很安全不用大測』是過度自信的高發語句。要求三點估計(樂觀/最可能/悲觀)。
- **產品開發**:PM 過度確信『用戶一定會愛這功能』,跳過驗證直接全量上;應先小流量驗證假設。
- **營運分析**:對預測模型/forecast 過度信任點估計,忽略預測區間;報 forecast 一定要附不確定性帶。
- **策略**:Lovallo & Kahneman 指出過度樂觀+過度自信讓多數重大商業案達不到預期;策略賭注要用 outside view 與 pre-mortem 校準。
- **2026**:AI 輔助開發放大過度自信:LLM 以高度自信的口吻給出可能有幻覺的答案,而開發者的 automation bias 讓他不再查核(arXiv 2601.08045 的 suggester preference)。對 AI 輸出強制『verification warning / productive friction』。
- 來源:https://www.scribbr.com/research-bias/overconfidence-bias/, https://arxiv.org/pdf/2202.00125, https://www.masterclass.com/articles/overconfidence-bias

### 權威偏誤 / HiPPO · fit 5
*aka / 出處:* Highest Paid Person's Opinion(Kaushik & Kohavi 2006 命名);Authority bias
- **是什麼**:決策被房間裡最資深/薪水最高的人的直覺主導,壓過數據與一線專家的判斷。HiPPO 由 Avinash Kaushik 與 Ronny Kohavi 於 2006 提出,核心問題是『憑直覺而非證據』且該人常離客戶最遠。
- **用在決策流程**:讓數據與實驗成為仲裁者:用 A/B 測試把『誰說了算』轉成『數據說了算』。會議中先讓資淺者發言、主管最後表態(避免錨定)。把『這是誰的意見 vs 這是什麼證據』分開記錄。
- **問對問題**:『這個決定的依據是數據還是某人的直覺?』『如果提出這意見的不是老闆,我們還會這樣做嗎?』『我們能用實驗來解決這個分歧嗎?』
- **軟體工程**:架構/技術選型被資深 staff 的偏好主導,缺乏 spike / benchmark 數據;用 RFC + 原型量測讓論證基於證據,而非職級。
- **產品開發**:CEO 一句『我覺得用戶想要 X』就插隊 roadmap;UserVoice/Fivetran 都建議用 A/B 與用戶數據對抗 HiPPO。多租戶 SaaS 要看跨租戶數據而非單一大客戶老闆的喜好。
- **營運分析**:解讀數據時主管的既定結論主導歸因;分析師應先預註冊指標定義與假設,讓結論可被數據否證。
- **策略**:重大策略由創辦人直覺拍板而忽略市場數據;Bezos 的『disagree and commit』反而是健康的 HiPPO 管理——主管可推進但要明說這是賭注。
- **2026**:2025–2026 出現『AI 版 HiPPO』:把 LLM 的輸出當權威(automation bias),停止質疑。權威偏誤的對象從『老闆』擴大到『AI』。對抗法相同:要求證據、跑實驗、保留人類查核責任。
- 來源:https://exp-platform.com/hippo/, https://www.fivetran.com/blog/taming-the-hippo-with-data-driven-decision-making, https://uservoice.com/blog/highest-paid-persons-opinion

### Reference-Class Forecasting / 外部視角 (Outside View) · fit 5
*aka / 出處:* RCF；Outside view(Kahneman & Tversky;Lovallo & Kahneman 2003;Flyvbjerg 推廣到基建)
- **是什麼**:對抗規劃謬誤與過度樂觀的核心方法:不從專案內部細節推估(inside view),而是找一組同類已完成專案(reference class)建立結果分布,再把本案定位在分布中。英國、丹麥已將其法定化用於公共投資。
- **用在決策流程**:三步:(1) 找同類專案的參照組;(2) 取得該組實際結果分布(耗時/成本/成功率);(3) 用分布校正本案的內部估計(通常往上修)。把每個專案實績歸檔,長期累積參照資料。
- **問對問題**:『過去 N 個同類專案實際結果分布長怎樣?』『我們憑什麼認為自己會落在分布的好端而非中位數?』『我有 inside view 與 outside view 兩個估計嗎,差多少?』
- **軟體工程**:估 migration/重構工時:不重新樂觀估計,而是查團隊過去類似規模工作的實際 lead time 分布。建立工程實績資料庫(epic 預估 vs 實際)供後續校正。
- **產品開發**:新功能上線時程/採用率,參照過去同類功能的實際 adoption 曲線,而非每次都當『這次不一樣』。
- **營運分析**:做成長/營收 forecast 時,用同類商家/同類活動的歷史分布(reference class)當 baseline,arXiv 上已有用 reference-class 做企業營收成長預測的研究。
- **策略**:進新市場/上新產品線,先看業界同類舉措的成功率基率(多數達不到預期),用以校準商業計畫的樂觀假設。
- **2026**:RCF 與 AI 高度互補:LLM/ML 可從大量歷史專案快速建立 reference class 並產生分布。2024–2025 已有 distributional reference-class forecasting 研究結合多參照變數做更精準預測。
- 來源:https://www.pmi.org/learning/library/nobel-project-management-reference-class-forecasting-8068, https://hbr.org/2003/07/delusions-of-success-how-optimism-undermines-executives-decisions, https://arxiv.org/pdf/2405.03402

### 事前驗屍 (Pre-mortem) · fit 5
*aka / 出處:* Prospective hindsight(Mitchell, Russo & Pennington 1989);Gary Klein 2007 HBR 提出實作法
- **是什麼**:在專案啟動前,假設『一年後它已徹底失敗』,要團隊回頭寫出失敗原因。利用 prospective hindsight——研究指『想像事件已發生』能提升正確找出未來結果原因的能力約 30%。對抗過度自信、群體迷思、確認偏誤。
- **用在決策流程**:Kick-off 時:領導者宣告『假設專案已死,寫下死因』;每人獨立寫(避免錨定與從眾),再彙整排序,把高機率/高衝擊的死因轉成緩解計畫。Kahneman 個人版:做重大決策前想像一年後它是個錯誤。
- **問對問題**:『假設這個專案明年慘敗了,最可能是因為什麼?』『有哪些我們現在不敢說出口的風險?』『哪個假設一旦錯了會讓整件事崩盤?』
- **軟體工程**:大型上線/migration/重要架構變更前開 pre-mortem:想像上線後資料毀損/全站當機,逆推可能路徑(回滾失敗、依賴服務超時、tenant 隔離破洞),提前補強與演練回滾。
- **產品開發**:新功能 GA 前 pre-mortem:假設三個月後它使用率為零或造成大量客訴,找出可能原因(沒解決真需求、onboarding 太複雜、性能拖垮),據此調整。
- **營運分析**:重大數據遷移/指標重構前,設想『報表全錯導致誤決策』的死因,預先設對帳與監控。
- **策略**:重大策略賭注前做 pre-mortem,讓不敢挑戰共識的聲音有安全管道說出風險,直接對抗 groupthink 與 HiPPO。
- **2026**:2025 起常用 LLM 當『便宜的 pre-mortem 夥伴』:讓 AI 扮演挑剔的紅隊列出失敗情境。但需注意 AI 諂媚,應明確 prompt『扮演最悲觀的批評者,找出 10 個會失敗的理由』。
- 來源:https://nesslabs.com/pre-mortem-anticipate-failure-with-prospective-hindsight, https://www.oreilly.com/library/view/hbr-guide-to/9781422143339/OEBPS/Text/07.html, https://en.wikipedia.org/wiki/Pre-mortem

### 紅隊 / 魔鬼代言人 (Red Team / Devil's Advocate) · fit 5
*aka / 出處:* Red Team–Blue Team;魔鬼代言人源自梵蒂岡 Office of the Devil's Advocate
- **是什麼**:刻意制度化地引入對立觀點,以根除群體迷思與確認偏誤。魔鬼代言人指派專人挑戰共識;紅隊—藍隊則由兩組獨立人馬分別為『支持/反對』辯護。關鍵是把『挑戰』變成正式、被認可的角色,而非個人找碴。
- **用在決策流程**:重大決策指派(輪值)一位魔鬼代言人,職責就是攻擊提案。或分成兩隊各自準備支持/反對論證再對辯。讓反對意見『有制度授權』,降低提出者的社交成本。
- **問對問題**:『如果我要說服別人這個決定是錯的,最強的論證是什麼?』『反方會怎麼攻擊我們最得意的假設?』『我們是不是因為氣氛和諧而沒人敢反對?』
- **軟體工程**:設計審查/RFC 指派一位 reviewer 專責找架構的致命弱點(安全、擴展性、多租戶資料隔離);security review 本質就是紅隊。對 AI 產的程式碼,讓另一個 agent/人當紅隊查核,而非單向採信。
- **產品開發**:roadmap 評審時指派魔鬼代言人質疑最受寵的功能假設,對抗 PM 的確認偏誤與 HiPPO。
- **營運分析**:重要分析結論交付前,請另一位分析師專門挑戰其資料切法、歸因與替代解釋(對抗 cherry-picking)。
- **策略**:重大策略/併購前做 red team–blue team 對辯,McKinsey、軍方均用此法避免群體迷思;研究(Schwenk 等)顯示魔鬼代言人/辯證式探詢優於單純求共識。
- **2026**:LLM 是極低成本的紅隊:可即時生成反方論證、攻擊向量、邊界案例。2025 的 BiasBuster 等框架甚至讓 LLM 互相去偏誤。但 AI 紅隊需明確角色設定以克服其附和傾向。
- 來源:https://www.cfr.org/books/red-team, https://lsaglobal.com/how-teams-avoid-groupthink/, https://www.mckinsey.com/industries/financial-services/our-insights/an-analytics-approach-to-debiasing-asset-management-decisions

### 可逆性決策框架 + Disagree and Commit (Bezos) · fit 5
*aka / 出處:* Type 1 / Type 2 decisions;one-way / two-way doors;high-velocity decision making(Amazon 2015–2016 股東信)
- **是什麼**:Bezos 在 2015–2016 股東信提出:Type 1 決策不可逆(單向門),須謹慎深思;Type 2 決策可逆(雙向門),應由高判斷力的個人或小組快速做。他主張用約 70% 想要的資訊就決策(等到 90% 通常太慢),並擅長快速糾錯。『Disagree and commit』則讓有信念者在無共識時仍能推進:『我知道我們有分歧,但你願意陪我賭一把嗎?』
- **用在決策流程**:決策前先分類:可逆?可逆就快做、別開三場會;不可逆才上重量級流程(深思、諮詢、pre-mortem)。對抗決策癱瘓(過度套用 System 2 在 two-way door)與沉沒成本(可逆就大膽嘗試、錯了就回頭)。分歧無解時用 disagree-and-commit 明確下注並全力執行,避免無止境共識消耗。
- **問對問題**:『這是單向門還是雙向門?如果是雙向門,我為什麼還在猶豫?』『我是不是在等 100% 的資訊?70% 夠了嗎?』『我們是真的需要共識,還是可以 disagree and commit?』『如果錯了,糾錯成本多高?』
- **軟體工程**:feature flag / 可灰度回滾的部署 = 把決策變成 two-way door,於是可快速試;改 DB schema、公開 API 合約、刪資料 = one-way door,需重量級審查。架構上刻意投資『可逆性』(flag、藍綠、可回滾 migration)來換取決策速度。
- **產品開發**:可逆的功能(易下架、灰度)就快速實驗;不可逆的(計費邏輯、資料模型、對外承諾)才慢做。用 disagree-and-commit 打破 PM/工程對某功能的僵局。
- **營運分析**:可逆的營運實驗(文案、推播)快速多跑;不可逆的(資料刪除、指標定義變更影響歷史對比)要謹慎。用 70% 資訊原則避免分析癱瘓。
- **策略**:把策略賭注按可逆性分級配置資源與審查強度;Amazon Studios 那個『我不同意但全力支持』的例子,展示領導者如何在無共識下健康地下注。
- **2026**:在 AI 加速產出的環境,『70% 資訊就決策 + 快速糾錯』更具優勢,因為迭代與回滾成本降低;但要搭配良好可逆性工程(flag、版本控制)。需警惕:AI 讓產出變快,不代表把 one-way door 當 two-way door 來草率對待。
- 來源:https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders, https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF, https://www.realtimeperformance.com/what-we-can-learn-from-jeff-bezos-about-decision-making/

### 倖存者偏誤 (Survivorship Bias) · fit 4
*aka / 出處:* Abraham Wald 二戰轟炸機彈孔分析的經典案例
- **是什麼**:只分析『存活/成功者』而忽略看不見的『陣亡/失敗者』,導致對成因的系統性誤判。經典:Wald 指出該補強的是返航轟炸機『沒有』彈孔的部位(被打到那裡的都沒回來)。
- **用在決策流程**:刻意去找『不在你樣本裡的人』:流失客戶、放棄註冊的人、失敗的測試。分析成功案例時,問同樣做法但失敗的有多少。蒐集失敗/退出資料,而不只看留下來的。
- **問對問題**:『我看不到誰?誰已經離開、沒進來、沒回應?』『成功者的做法,失敗者是不是也這樣做了?』『這個結論是建立在倖存樣本上嗎?』
- **軟體工程**:看『現在還在跑的服務都很穩定』而推論架構好,忽略已被淘汰的服務為何掛掉;看 error tracking 只看有回報的錯誤,沉默失敗(client crash、超時未送出)看不到。
- **產品開發**:只研究活躍重度用戶(survivors)設計功能,忽略 onboarding 第一天就流失的人——而後者才代表市場多數。
- **營運分析**:A/B 只慶祝勝出的測試、不分析失敗測試的學習;留存分析只看留下的 cohort,忽略已流失者的特徵(造成『我們用戶都很滿意』錯覺)。多租戶分析時,只看活躍商家會高估產品健康度。
- **策略**:拿成功獨角獸的策略當範本('他們都這樣做'),忽略用同策略倒掉的大量公司;competitor 分析也只看活著的競品。
- **2026**:資料管線中倖存者偏誤常被自動化放大:只對『完成事件』的用戶建模(訓練資料天然排除了中途離開者),AI 模型於是學到偏誤結論。需主動納入 censored / 流失樣本。
- 來源:https://medium.com/@falkgottlob/how-to-avoid-survivorship-bias-in-product-management-lessons-from-the-british-bomber-study-25edb8ab4ab7, https://www.analytics-toolkit.com/glossary/survivorship-bias/, https://www.causalityengine.ai/glossary/survivorship-bias

### 基率忽略 (Base-Rate Neglect) · fit 4
*aka / 出處:* Base-rate fallacy；常因 representativeness heuristic 而生
- **是什麼**:忽略整體統計基率,過度依賴具體、生動的個案資訊。Kahneman & Tversky 用『律師 vs 工程師』實驗證明:給了人格描述後,受試者就忽略母體中兩種職業的真實比例。與貝氏推論直接相關。
- **用在決策流程**:任何『這個案子很特別』的判斷前,先問該類事件的基率是多少。把個案資訊當成對基率的『調整』,而非取代基率。對稀有事件(罕見 bug、罕見詐騙)特別注意:即使偵測器很準,低基率仍會讓誤報多於真陽性。
- **問對問題**:『這類事情整體發生率是多少?』『我是不是被一個生動的個案帶著走,忘了它其實很罕見?』『偵測準確率高,但在這個低基率下,陽性裡有多少是真的?』
- **軟體工程**:告警/異常偵測:模型 99% 準確,但若真實異常率只有 0.1%,大量告警仍是誤報(alert fatigue 的數學根源)。安全掃描、詐騙偵測的閾值設計都需要貝氏地考慮基率。
- **產品開發**:一個大客戶大聲要求某功能(生動個案),不代表多數租戶需要;要看請求在整體用戶基數中的真實比例再排優先。
- **營運分析**:看到某 segment 轉換率高就 all-in,卻忽略該 segment 只佔 2% 流量(低基率);解讀漏斗時要結合絕對量級,而非只看率。
- **策略**:『某競品靠 X 功能爆紅』是個案;該類賭注整體成功率(基率)才是策略該權衡的。
- **2026**:LLM 在機率推理上常重演基率忽略,被生動描述帶偏;高風險判斷(風控、信用)不要把 LLM 的直覺機率當數字,需用實際基率做貝氏校正。
- 來源:https://thedecisionlab.com/biases/base-rate-fallacy, https://www.simplypsychology.org/base-rate-fallacy.html, https://www.cogn-iq.org/learn/theory/base-rate-neglect/

### 可得性捷思 (Availability Heuristic) · fit 4
*aka / 出處:* Availability bias (Tversky & Kahneman 1973)
- **是什麼**:用『例子有多容易想起來』來判斷事件發生機率。最近發生的、情緒強烈的、報導多的事件被高估機率,而沉默的常態被低估。
- **用在決策流程**:重大判斷靠資料頻率,而非腦中最鮮明的事件。問自己:這件事是真的常發生,還是只是最近剛發生過/印象深刻?用 incident/事件統計取代『我記得上次...』。
- **問對問題**:『我認為這很常見,是因為數據支持,還是因為它剛發生在我身上?』『有沒有更頻繁但不顯眼的問題被我忽略?』
- **軟體工程**:上週剛被一個 race condition 燒到,於是這週 review 過度執著於 concurrency,卻忽略統計上更常見的 N+1 query / 輸入驗證。事故後過度針對『上次那種』情境加防護(打最後一場仗)。
- **產品開發**:最近一個客訴在 Slack 被瘋傳,於是團隊優先修它,但它可能只影響少數人;應回到工單頻率/影響面數據排序。
- **營運分析**:解讀指標時被『最近的大新聞事件』主導歸因,忽略長期趨勢。Dashboard 上最顯眼的圖會被過度解讀(salience = availability)。
- **策略**:因為某個近期事件(競品融資、一次大流失)而過度反應調整策略;要拉長時間窗、看 base rate。
- **2026**:AI 生成內容讓某些議題『顯得到處都是』,放大可得性偏誤——LLM 輸出的常見答案會讓你以為那是主流做法。用實際採用率/搜尋量數據查核。
- 來源:https://www.suebehaviouraldesign.com/en/blog/kahneman-thinking-fast-and-slow/, https://en.wikipedia.org/wiki/Thinking,_Fast_and_Slow, https://thedecisionlab.com/reference-guide/philosophy/system-1-and-system-2-thinking

### 事後諸葛偏誤 (Hindsight Bias) · fit 4
*aka / 出處:* I-knew-it-all-along effect；creeping determinism
- **是什麼**:事件發生後,認為它本來就『可預測/顯而易見』,扭曲了我們對當初判斷品質的記憶。它會餵養過度自信,並讓 postmortem 失真(『早該知道』)。
- **用在決策流程**:做決策時就把當下的假設、機率、已知資訊寫下來(decision journal),日後檢討用當初的紀錄而非事後記憶評斷。Postmortem 聚焦『當時能取得什麼資訊』而非『結果論』。
- **問對問題**:『在我們知道結果之前,這真的那麼明顯嗎?』『我是在評估當時的決策品質,還是被結果污染了?』
- **軟體工程**:Incident postmortem 最大敵人:事後覺得『這 bug 這麼明顯怎麼會漏』,導致 blame 文化而非系統性改進。Blameless postmortem 與保存當時的 context(arXiv 1707.03869 指缺乏歷史紀錄會加重 hindsight bias)是解方。
- **產品開發**:功能失敗後團隊集體『早就覺得不會成功』,埋沒真正的學習;用上線前寫下的預測對照實際結果。
- **營運分析**:回看一個成長/下滑,事後編出一個乾淨的因果故事,過度自信於歸因;要承認當時的不確定性。
- **策略**:復盤一個失敗的策略賭注時,用 decision journal 區分『壞決策』與『壞運氣』(好流程也可能壞結果)。
- **2026**:研究(CogSci 2020)指 hindsight bias 直接餵養 overconfidence。Decision journal 的概念在 2025 被整合進 AI 工具:用 LLM 在決策當下結構化記錄假設,事後自動對照,降低記憶污染。
- 來源:https://cognitivesciencesociety.org/cogsci20/papers/0145/0145.pdf, https://www.scribbr.com/research-bias/overconfidence-bias/, https://arxiv.org/pdf/1707.03869

### 檢核表 (Checklists) · fit 4
*aka / 出處:* The Checklist Manifesto(Atul Gawande 2009);WHO 手術安全檢核表
- **是什麼**:用簡單清單對抗記憶與注意力的不可靠。Gawande 區分『無知之錯』(不知道)與『無能之錯』(知道卻沒做到);檢核表針對後者,在複雜情境下確保關鍵但平凡的步驟不被遺漏,並強制溝通與責任歸屬。
- **用在決策流程**:把重複性高、漏掉代價大的決策步驟做成 checklist(DO-CONFIRM 或 READ-DO)。保持精簡(只放關鍵殺手項),在自然停頓點執行。把『需要溝通協調』的項目也列入(誰負責、誰確認)。
- **問對問題**:『有哪些關鍵但無聊的步驟容易在壓力下被跳過?』『這個清單夠短到真的會被用嗎?』『漏掉哪一項的後果最嚴重?』
- **軟體工程**:Deploy / release checklist、PR review checklist、incident response runbook、安全上線檢核(migration 是否可回滾、feature flag 是否就緒、多租戶資料是否驗證)。是把資深經驗制度化、抗過度自信『這次不用查』的最有效工具之一。
- **產品開發**:新功能 GA checklist:埋點是否就緒、權限/方案 gating 是否正確、i18n 文案、降級方案、客服通知。Launch readiness review 本質是 checklist。
- **營運分析**:分析交付前 checklist:資料來源/時區/去重、樣本量、是否控制 confounder、是否檢查倖存者偏誤、是否預註冊假設。
- **策略**:重大決策 checklist(如 Kahneman《Thinking Fast and Slow》談的決策前查核)——是否做了 outside view?是否做了 pre-mortem?反方意見聽過了嗎?
- **2026**:AI 時代 checklist 新增『AI 查核項』:AI 產出的程式碼/分析是否經人類驗證、是否查過幻覺與來源。arXiv 2601.08045 明確建議用 TDD、CI/CD、code review 等『工具化 checklist』對抗 AI 輔助下的偏誤。
- 來源:https://fs.blog/the-checklist-manifesto/, https://www.nateliason.com/notes/checklist-manifesto-atul-gawande, https://arxiv.org/html/2601.08045v1

### 推力 / 選擇架構 (Nudge / Choice Architecture) · fit 4
*aka / 出處:* Nudge(Thaler & Sunstein 2008);libertarian paternalism;預設值效應
- **是什麼**:透過設計選項的呈現脈絡(選擇架構)來引導決策,而不限制選項或改變誘因。核心手法:預設值(defaults)、框架(framing)、社會認同(social proof)、顯著性(salience)、承諾裝置。人傾向接受預設,因此預設設計極具影響力。
- **用在決策流程**:兩個面向:(a) 對外——設計產品/流程的選擇架構引導用戶做出對其與業務都好的選擇;(b) 對內——設計團隊的決策環境來去偏誤(例如把『獨立同時揭露估點』做成預設流程、把 pre-mortem 變成 kick-off 預設步驟)。務必合乎倫理,避免 dark pattern。
- **問對問題**:『預設值是什麼?它把人推向哪裡,這對用戶公平嗎?』『我能不能改變脈絡,讓正確選擇變成最省力的選擇?』『這是 nudge 還是操弄(dark pattern)?』
- **軟體工程**:把安全/正確選項設為預設:安全的設定值、預設啟用 2FA、危險操作要二次確認(productive friction)。在內部工具用 nudge 引導好實踐(預設開 PR template、預設要求測試)。
- **產品開發**:Onboarding 用 nudge:預選推薦方案、用進度條(完成度)與 social proof(『多數商家已啟用 X』)提升啟用率;預設值決定多數用戶最終設定。多租戶 SaaS 的預設方案配置影響採用率甚鉅。
- **營運分析**:用實驗量測不同 nudge(預設、文案框架、社會認同)對轉換/留存的因果效果,而非僅相關;注意倫理與長期信任。
- **策略**:定價頁的選擇架構(錨定高階方案、highlight 推薦方案)直接影響 ARPU;但策略上要平衡短期轉換與長期信任,避免 dark pattern 反噬。
- **2026**:2020 年後『digital nudging / 推薦系統即 nudge』成熟,2024–2025 出現『AI nudging』與其倫理審計框架(arXiv 2304.14338);監管(GDPR、暗黑模式規範)趨嚴,選擇架構需可被審計、避免操弄。
- 來源:https://www.alexmurrell.co.uk/summaries/cass-sunstein-and-richard-thaler-nudge, https://yukaichou.com/behavioral-analysis/nudge-theory-thaler-sunstein-choice-architecture/, https://arxiv.org/pdf/2011.03413
