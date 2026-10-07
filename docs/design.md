# Praxis 設計

Praxis 是給 agent 用的軟體開發 workflow：用現代軟體工程做法加上你的 taste，把一個 feature 從需求做到可以發布的 stacked PR。

## 流程

```
wf start     從 remote default branch 開 worktree 與 feature branch
             跑 repo 的 setup 指令; 之後每一步都在 worktree 裡做
 |
1 Plan       需求: 目標、規則+關鍵例子、範圍外、Assumed
             問題寫進 §Questions; story 清單 (各自可上線)
2 Design     資料模型與 schema (每欄: 型別、可否為空、理由)
             API、分層; 標出破壞性變更
 |
 +- 每個 story
 |  3 Build   設計增修 -> G/W/T scenarios -> PR 計畫
 |            每支 PR: [行為 PR: 測試 -> wf freeze ->] 實作
 |                     -> wf pr-done (相關測試全綠才 commit)
 |  4 Review  wf review -> 新 reviewer -> 修或駁回
 |            最多 3 輪; gate: 每支 PR 在自己的 commit 上測試全綠
 +- 下一個 story
 |
5 Feature    同 4, 範圍改成整條 branch, reviewer 另拿到需求
結束         寫 repo taste; 最後訊息; 你說 push 才 wf publish
```

## 步驟

### 1 Plan

寫進 `plan.md`：
- **§Requirements**：目標、規則（附關鍵例子）、範圍外、Assumed（agent 自己做的決定）。
- **§Questions**：需要你回答的問題，一次寫完。答案併入對應的區段後，就從 §Questions 移除。
- **§Stories**：
  - 依序排列，每個 story 一個 `###` 標題，用一句可觀察的行為描述。
  - 每個 story 都能單獨上線。
  - 每條規則都要歸到某個 story，或列在範圍外。
  - story 的 `###` 標題不能重複，在它的 Build 開始後也不再改：`wf` 依標題追蹤 story。

完成條件（`wf next` 檢查）：§Questions 是空的。

### 2 Design

寫進 §Design：
- 資料模型與 DB schema：每個新增或變更的欄位，寫型別、可否為空、理由。
- API。
- 分層：新程式碼放在哪一層。
- 標出破壞性 schema 變更或破壞性 API 變更。你核准的原話也記在這裡。
- 重大決定寫理由與來源：taste、專案檔案，或查到的官方文件 URL。

完成條件：模型自評。

### 3 Build（每個 story）

寫在 §Stories 該 story 底下，用粗體標籤分段（`###` 只用在 story 標題）：
- **設計增修**：這個 story 對 §Design 的新增或修改，格式同 §Design。
- **G/W/T scenarios**：每一條都會變成一個 sociable test。要寫哪些 scenario，由規則 2 決定。
- **PR 計畫**：依關注點類型排序——結構整理 → 既有資料表的 schema 變更 → 行為與它的測試 → 之後的清理。

每支 PR：
1. 行為 PR 先寫測試，再跑 `wf freeze`。
2. 實作。
3. 寫 `prs/NN-slug.md`：第一行是 `# <標題>`，其餘是 PR 描述。
4. `wf pr-done`：只跑這支 PR 的相關測試，全綠才 commit。相關測試指的是：
   - 這支 PR 改到或新增的測試；
   - agent 指定、涵蓋到被改程式碼的既有測試。

   完整測試交給 push 後的 CI。

完成條件：模型自評；`wf next` 另外檢查這個 story 至少有一支已登記的 PR。

### 4 Review（每個 story）

1. `wf review`：輪數加一，並印出 reviewer brief。第 4 輪會被拒絕。
2. 開一個新的 subagent，prompt 一字不改就是 brief。
3. 先把每條 finding 寫成 §Findings 的一行，開頭寫範圍與輪次（例如「story 2 第 1 輪：」），再逐條處理，並在同一行記下處置：
   - 修：`git commit --no-verify --fixup <所屬 PR 的 commit>`，再 `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <base commit>`。base commit 由 `wf status` 印出。加 `-i` 是因為 git 2.44 以前，沒有 `-i` 的 autosquash 不會併入 fixup；加 `--no-verify` 是因為 commit hook 可能改寫 `fixup!` 開頭的訊息，autosquash 就認不出它。fixup 的內容由 gate 重跑測試把關。
   - 駁回：寫一行理由。

這一輪沒有修任何東西，或已經跑完第 3 輪，就結束。

完成條件：`wf next` 的 Review 檢查通過。

### 5 Feature review

與 4 相同，但有兩點不同：
- 範圍是整條 branch。
- reviewer 另外拿到 §Requirements。

### 結束

- 把你明說要通用的模式寫進 repo taste（見〈實作決策的優先序〉）。
- 最後一則訊息列出：
  - Assumed
  - 駁回的 finding
  - 各範圍第 3 輪的 finding 與處置：這些修正沒有再經過 review
  - freeze 之後被改的測試（由 `wf` 印出）
  - repo taste 的變更
  - worktree 的路徑，以及提醒：PR 都合併後，用 `git worktree remove` 移除它
- 收尾後你要求修改：當成 finding 處理，用 fixup 併回所屬的 PR，再跑 `wf next` 重新驗證。
- 你說 push 才跑 `wf publish`。永不 merge。

## Worktree 與平行

- **每個 feature 一個 worktree**：路徑是 `.praxis/<feature>/worktree`，branch 從 remote default branch 開出來。
  - 你目前 checkout 的 branch 不受影響。
  - 之後的每一步都在這個 worktree 裡做。
- **新 worktree 建好後，跑 repo 的 setup 指令**（寫在 `.praxis/config.json`）。它只做跑測試前不可少的事：
  - 從主 checkout 複製沒進版控的設定檔，例如 `.env`、`config/database.yml`。
  - 只在 repo 用專案內的相依套件時才安裝，而且用有全域快取的工具，例如 `uv sync`。
  - 全域安裝的相依套件不用動。

  `wf` 執行 setup 指令時會帶入環境變數 `WF_MAIN`，也就是主 checkout 的路徑。
- **測試 DB 和主 checkout 共用。**
- **worktree 放在主 checkout 底下。** 原因：像 `.ruby-version` 這類沒進版控的版本檔，rbenv 會往上層目錄找到主 checkout 的那份，不用另外複製。
- **平行以 feature 為單位**：
  - 要同時做幾個 feature，就開幾個 session，各自用一個 worktree。
  - 同一個 feature 裡的 story 與 PR 依序做，只有一個 writer。
  - 想讓幾個 story 平行，就由你把它們開成不同的 feature。

## 模式與停止

**只在以下時機結束回合：**
1. **需要你**，兩種模式都一樣：
   - 需要你釐清或決定。例如不同解讀會導致實質不同的工作、缺權限或缺環境，或某個測試在 base 上就已經失敗。
   - 出現沒有你核准原話的破壞性 schema 或 API 變更。一提出就停。

   停的方式：把問題寫進 §Questions，結束回合。
2. **每步確認模式的停點**：`wf next` 印出 PAUSE 時。
3. **完成。**

**模式：**
- **Autopilot（`auto`，預設）**：只在需要你時停。
- **每步確認（`step`）**：每一步結束都停；Build 在整個 story 做完後才停。`wf next` 通過檢查、前進之後印出 PAUSE；你的回覆就是確認。
- **切換**：隨時用 `wf mode auto|step`。
- **續跑**：進到該 feature 的 worktree，看 `wf status`、`plan.md`、git log。

## 檔案

整個 `.praxis/` 都寫進 git 的 exclude 檔，不會被 commit。以下路徑都位在主 checkout 裡；`wf` 在 worktree 中執行時，會用 `git rev-parse --git-common-dir` 找到主 checkout。

- **`.praxis/taste.md`**：這個 repo 的 taste：repo 現有規範文件的路徑，以及可以重複套用的模式。跨 run 保留。
- **`.praxis/config.json`**：這個 repo 的測試指令（`{files}` 代入測試檔）、測試 glob、setup 指令（可省略），由 `wf` 直接讀。第一次在這個 repo 跑時，在 `wf start` 之前寫好；之後跨 run 沿用，指令錯了就直接改這個檔。
- **`.praxis/<feature>/worktree/`**：這個 feature 的 worktree。
- **`.praxis/<feature>/plan.md`**：唯一的活文件，步驟之間只靠它交接。區段依序是 §Requirements、§Questions、§Stories、§Design、§Findings。
- **`.praxis/<feature>/state.json`**：只有 `wf` 會寫。記錄模式、目前步驟、base、各 story 是否完成與 review 輪數、PR 清單與 freeze 快照。
- **`.praxis/<feature>/prs/NN-slug.md`**：每支 PR 的描述，可以直接發布。NN 是整個 feature 內的順序。

## Script `wf`

- 只用 Python 標準庫加 git；`publish` 另外用到 `gh`。
- 只做能確定的檢查與紀錄；需要判斷的事交給模型。
- 在 worktree 裡執行，由 worktree 的路徑（`.praxis/<feature>/worktree`）判斷是哪個 feature。這樣 review gate checkout 個別 commit 時也能判斷。
- **設定**：每次要用到時都重讀 `.praxis/config.json`，所以改了測試指令，下一次 `pr-done` 就生效。
- **commit 與 PR 的對應**：依順序，第 i 個 commit 的標題等於第 i 支 PR 的標題。fixup 經過 autosquash 後標題不變，所以對應不會斷。
- **一支 PR 的測試範圍**：它改到、而且還存在的測試檔（依測試 glob 判斷），加上 `pr-done` 時另外列出的測試檔。`pr-done` 看暫存區，review gate 看該 PR 的 commit。範圍是空的就拒絕：很多測試指令遇到空的 `{files}` 會改跑整套測試。

指令：
- **`start <feature> [--mode auto|step]`**
  - mode 預設 `auto`。
  - feature 名稱要是 git 接受的 branch 名稱，不是就在做任何變動之前拒絕。
  - 先讀 `.praxis/config.json`：檔案不存在、缺測試指令或測試 glob，或測試指令裡沒有 `{files}`，就拒絕，並指出檔案路徑。
  - `git fetch` 之後，用 `git worktree add` 在 `.praxis/<feature>/worktree` 從 remote default branch 開出 feature branch。
  - 記下 base（branch 名稱與 commit），寫入 exclude。
  - 有 setup 指令，就在 worktree 裡跑它。setup 失敗時就停下來，算缺環境。
  - setup 跑完後，worktree 多出會被 commit 的檔案就拒絕：`git add -A` 會把它們一起 commit 進第一支 PR。
  - 不跑測試：相信 default branch 上的 CI 已經跑過。
  - feature 已經存在時，不開新 worktree，只重跑 setup。
- **`status`**：印出 mode、步驟、story（n/m）、輪數、base commit、`plan.md`、repo taste 與 `config.json` 的路徑，以及 plugin 裡其他 skill 的 SKILL.md 絕對路徑。
- **`next`**：先跑當前步驟的檢查，通過才前進。
  - 檢查：
    - Plan：§Questions 是空的。
    - Review 與 Feature review：這個範圍至少跑過一輪、工作區乾淨，而且 gate 通過。gate 依序 checkout 範圍內的每個 commit：每個 commit 都要對應到一支已登記的 PR，並在該 commit 上跑它的測試範圍全綠。gate 開始前工作區是乾淨的，所以切換 commit 時直接丟掉測試留下的改動。沒對應或紅燈時，指出是哪一個 commit。不論結果，最後都回到 branch；這個檢查不改寫歷史。
    - Build：這個 story 至少有一支已登記的 PR。
    - 其他步驟：沒有 script 檢查。
  - 前進：Plan → Design → 下一個 story 的 Build → 它的 Review。Review 通過時，這個 story 標為完成；還有沒完成的 story 就回到 Build，否則進 Feature review。Feature review 通過就結束。
  - 下一個 story ＝ §Stories 底下第一個還沒完成的 `###`。
  - step 模式下，前進之後印出 PAUSE；進到結束時不印，直接收尾。
  - 結束時，印出每支 PR 在 freeze 之後被改的測試：比對 freeze 快照與該 PR 自己的 commit。
  - 結束之後再執行，就在整條 branch 上重跑 gate 和 freeze 報告，用來驗證你在收尾後要求的修改。
- **`mode auto|step`**：切換模式。
- **`freeze`**：記下目前有變動的測試檔快照，下一次 `pr-done` 會把它綁到那支 PR。沒有變動的測試檔就拒絕。
- **`pr-done <pr-file> [其他相關測試檔…]`**：
  1. PR 檔不在 `.praxis/<feature>/prs/` 就拒絕：放在 worktree 裡會被一起 commit。
  2. `git add -A`。
  3. 用測試指令跑這支 PR 的測試範圍。
  4. 全綠才用 PR 檔的標題 commit，並把這支 PR 登記進 PR 清單。登記的是 commit 實際的標題，因為 commit hook 可能改寫它，例如加上 ticket 編號。紅燈時改動留在暫存區。
- **`review`**：這個範圍的輪數加一，第 4 輪拒絕。印出 reviewer brief。
- **`publish <branch>…`**：只在你下指令時跑。
  1. 每支 PR 一個 branch 名稱，依 stack 順序給；名稱由 agent 依 repo 的 branch 慣例決定。數量不符、名稱重複或不合法，就在 push 之前拒絕。
  2. 把每支 PR 的 commit push 到它的 branch。
  3. 用 `gh pr create` 開 PR：標題是那支 commit 的標題，內容是標題以外的部分，base 是前一支 PR 的 branch；第一支的 base 是 default branch。

## Review 準則

**Reviewer：** 每一輪都開一個新的 subagent，權限和一般 subagent 相同，不另外限制。Claude Code 派 reviewer 時明確指定 `model: opus`、`effort: xhigh`。懷疑某個情境有問題時，可以實際寫測試或跑指令驗證，驗證過的 finding 證據最充分。驗證時可以暫時新增或修改 worktree 裡的檔案，結束前要還原，讓 `git status` 和開始時一樣，因為 writer 是用 `git add -A` commit。

**提供給 reviewer**（由 `wf review` 印在 brief 裡）：
- worktree 的絕對路徑：所有指令都在這裡跑。
- commit 範圍，用兩個 commit hash 表示：
  - story：這個 story 的 PR，也就是最後 n 個 commit，n 是這個 story 已登記的 PR 數
  - feature：從 base 到 HEAD，也就是整條 branch
- 這些 PR 的描述檔路徑。
- 規則檔清單：只列存在的檔案，只給絕對路徑，不貼內容。依優先序排列，前面的蓋過後面的：
  1. repo taste
  2. repo taste 指向的 repo 規範文件，以及 worktree 根目錄的 AGENTS.md、CLAUDE.md
  3. 全域 taste
  4. plugin 裡各 skill `standards/` 底下的檔案
- feature 範圍另外附上 §Requirements 的內容。

**不提供：** §Design、scenarios、對話、writer 的摘要。原因：reviewer 依實際落地的程式碼與 PR 描述判斷，不被 writer 的意圖帶著走。它仍然可以讀整個 repo。

**只報以下四類，每條都要附位置與證據**（會出錯的具體輸入、具體刪法，或引用的規則）：
- **(a)** 行為和 PR 描述不符。feature 範圍另外包含：某條規則既沒實作，也不在範圍外。
- **(b)** 有實際後果的失敗沒處理，或被掩蓋（金流、資料完整性、安全、靜默損毀）；沒標出的破壞性變更；改動讓 repo 裡其他呼叫端壞掉。
- **(c)** 刪掉也不影響描述行為的東西：欄位、分支、函式、只用一次的抽象、mock 自己的 DB 或程式、沒有對應行為的測試。
- **(d)** 違反規則檔清單裡的某條規則，要引用那一行。

## 實作決策的優先序

範圍越具體的贏；上層只在它明確寫到的那一點蓋過下層。

1. repo taste：`.praxis/taste.md`，只存在本機。
2. repo 已 commit 的團隊慣例：repo 現有的規範文件（例如 `docs/` 底下的 guideline、testing）、AGENTS.md、CLAUDE.md、lint 與 CI 設定。
3. 全域 taste：`~/.praxis/taste.md`。
4. praxis 內建的規範：plugin 裡各 skill `standards/` 底下的檔案。
5. 這個 repo 所用版本的現代官方或主流做法，要查證並附上來源。
6. 既有程式碼：以上都沒有意見時才沿用。

**repo taste 的讀寫：**
- 每一步開始時，讀這一步需要的 taste 與規範檔。原因：compaction 之後，之前讀過的檔案內容可能已經不在 context 裡；在步驟入口重讀，兩個 runtime 都能補回來。
- 第一次在這個 repo 跑時，在 `wf start` 之前就把 repo 現有規範文件的路徑寫進 repo taste，第一次 run 的 reviewer 才讀得到它們；之後的 run 直接沿用。
- run 結束時，只把你明說要通用的模式寫進 repo taste；只適用這次的決定留在 plan.md：
  - 一條一行，寫模式加你的原話。
  - 和舊條目衝突時，直接取代。
  - 已經寫在其他規則檔裡的不重複寫。

**適用範圍：** 只套用在新程式碼，以及 story 本來就要改的地方。要改的舊程式碼，拆成結構整理 PR。

## SKILL.md 規則

1. 依上面的優先序做決定。
2. 測試只寫 happy path，加上有實際後果的失敗。
3. sociable test：
   - 使用真的協作者，包括專案自己的 DB。
   - 只 mock 第三方服務、網路與時鐘。
4. 程式碼、測試、註解、commit 裡不出現流程用語或編號。
5. PR 的切法：
   - 一支 PR 一個 commit、一個關注點；改動小又簡單時可以合併。
   - 依關注點類型切，不按架構分層切。
   - 每支都要綠。
6. 沒有當下用途的東西不寫。
7. 推送與合併：
   - 沒有你的指令不 push，永不 merge。
   - 破壞性變更的核准只認你的原話，一次只涵蓋一個具名的變更。
8. PR 描述：
   - repo 有 PR template 就照它的結構；其餘照 `~/.praxis/voice.md`。
   - 寫明決定與原因。

## 擴充

新內容依序判斷，第一個「是」決定放哪裡：

1. **工具能判定的**（formatter、linter、migration 檢查）→ 交給 repo 自己的工具或 CI，規範只寫要用哪個工具。原因：確定性的事交給程式，不靠模型記得。
2. **某個 repo 團隊共用的慣例** → 那個 repo 現有的規範文件；沒有的話，才放進 AGENTS.md／CLAUDE.md。praxis 讀它，不複製。原因：不用 praxis 的隊友也要遵守，而且團隊已經在維護那些文件。
3. **一行就說得完的個人決定** → taste：只適用一個 repo 的寫進 `.praxis/taste.md`，適用所有 repo 的寫進 `~/.praxis/taste.md`。
4. **改變 workflow 怎麼跑的**（步驟、檢查、停止條件）→ praxis 的 SKILL.md，能確定判斷的就放進 `wf`。
5. **同一個領域的多條程式碼規則**（測試、API 設計、DB migration、分層），只在特定步驟用到 → `skills/praxis/standards/<topic>.md`，並在 SKILL.md 的規範表加一列（檔案｜哪些步驟用｜什麼時候適用）。
   - 原因：官方的漸進揭露做法，用到時才載入。
   - SKILL.md 直接連到每個規範檔，規範檔之間不互相連。
   - 超過 100 行要加目錄。
   - 同一條規則只出現在一個檔案。
   - `wf` 會把 `standards/` 底下的檔案列給 reviewer，所以新增規範不用改 `wf` 或 brief。
6. **在 praxis run 以外也想單獨使用的**（觸發條件：同一件事你已經手動叫 agent 做過兩次）→ 開新 skill `skills/<動名詞>/`，並在 praxis SKILL.md 的規範表加一列，寫這個 skill 的名稱。
   - 程式碼規則放在它自己的 `standards/`，reviewer 照樣拿得到；其他參考資料放 `references/`，不會交給 reviewer。例如 composing-documents 與 clear-writing 的寫作指引放在 `references/`。
   - praxis 從 `wf status` 印出的路徑讀它，規範永遠只有一份。例如寫 PR 描述時，讀 composing-documents 與 clear-writing。
   - 被讀的 skill 必須符合：
     - frontmatter 只有 `name`、`description`。像 `context: fork`、`allowed-tools`、`model` 這類欄位只在被呼叫時生效，用路徑讀會失效。
     - 不用 `${…}` 佔位符、`$ARGUMENTS`、`` !`指令` ``。這些只在被呼叫時展開。
     - 內部引用一律用相對於自己目錄的路徑。
   - 讀路徑、不呼叫的原因：兩個 runtime 都能用一般的讀檔照著 skill 做（已實測），讀到的一定是同一個 plugin 裡的版本；呼叫 skill 的機制則兩邊不同。
   - 門檻的原因：每多一個 skill，就多佔一份 skill 清單的額度。清單上限約是 context 的 1%（Codex 約 2%），超過時描述會被砍掉。

**命名：** 名稱都視為永久不變，因為 plugin 裡的 skill 改名沒有遷移機制。
- skill 用動名詞加受詞，例如 `writing-migrations`。
- 規範檔用 kebab-case 的領域名，例如 `api-design.md`。

**大小上限：** 每個 SKILL.md 少於 5k tokens，因為 compaction 後每個 skill 只會重新附上前 5k tokens。超過時，把最少用的段落移到 `references/`。

**全部放在同一個 plugin。** 原因：plugin 之間的相依（`dependencies`）只有 Claude Code 支援，跨 plugin 讀檔也沒有可攜的做法。

## 實作

### 套件

- **一個 plugin；workflow 是一個 skill `praxis`。** Claude Code 用 `/praxis` 叫用，Codex 用 `$praxis`。
  - 每次 run 都依序跑完每一步，步驟之間只靠 `plan.md` 交接，順序由 `wf` 的 state 決定；拆成多個 skill 得不到任何好處。
  - 每多一個 skill，就多佔一份 skill 清單的額度。
- **workflow 指令全部放在 SKILL.md。** 每次 run 都會用到每一步，拆開省不到東西；Claude Code compaction 之後會為每個 skill 重新附上最多 5k tokens，所以整份都還在。
- **frontmatter 只有 `name`、`description`。** description 寫明這是完整的軟體開發流程。不加 `disable-model-invocation`：description 已經寫明是完整流程，現代模型不會在非預期的情況下呼叫它。
- **repo 本身同時是兩個 marketplace。** `.claude-plugin/marketplace.json` 與 `.agents/plugins/marketplace.json` 都指向 `plugin/`；`plugin/` 底下的兩份 manifest 共用同一個 `skills/`。
- **Claude manifest 不設 `version`。** 依官方文件，設了 `version` 會「keeps users on that version until you change it」。不設的話，版本就是 git commit SHA，每次 push 到 main 都算新版本，開了自動升級的使用者會自動跟上。
- **Codex manifest 固定 `"version": "1.0.0"`，不必每次改。** Codex 依版本號快取 plugin，但 Git marketplace 一有新 commit 就整個重裝，不看版本號；檢查的時機是 Codex 啟動時在背景自動跑，或手動執行 `codex plugin marketplace upgrade`。用本機路徑安裝的 plugin 會被複製進快取，要重新安裝才會更新。
- **CI 必須先擋住壞掉的 `wf.py`**，因為每個 commit 都會直接送到使用者手上。

### `wf.py`

- 放在 `skills/praxis/scripts/wf.py`。單一檔案，只用標準庫，支援 Python 3.9 以上（macOS 內建版本）。
- SKILL.md 定義：`wf` ＝ `python3 <這份 SKILL.md 所在目錄>/scripts/wf.py`。兩個 runtime 都知道這個目錄：Claude Code 載入 skill 時會給出 base directory，Codex 是用路徑開啟 SKILL.md。
  - 不用 `${CLAUDE_PLUGIN_ROOT}`：Codex 不會替換它。
  - 不用 `bin/`：只有 Claude Code 會把它加進 PATH，而且 claude.ai 與 Cowork 會拒裝帶 `bin/` 的 plugin。
  - 一律用 `python3 <絕對路徑>` 呼叫：打包後的 skill 不保證保留執行權限（openai/codex#9226）。
- 輸出採 `key: value` 純文字。結束碼：
  - 0：成功。
  - 1：被拒絕、檢查沒過、測試紅燈、git 或 setup 失敗。stderr 寫明是哪個檔案、commit、指令或檢查。
  - 2：用法錯誤。
- **repo 層級的設定只有一份：`.praxis/config.json`**，欄位是 `test_cmd`（含 `{files}`）、`test_glob`、`setup`（可省略）。
  - 由模型寫，`wf` 每次要用時直接讀，state 不另存。原因：指令原文直接交給 `sh -c`，不必由模型轉成參數；`$WF_MAIN` 這類變數也不會在模型的 shell 裡先被展開成空字串。
  - 用 JSON：Python 3.9 的標準庫就能讀；TOML 要 3.11 才有 `tomllib`。
  - `wf` 不解析 taste 檔。
- **reviewer brief 的樣板只有一份：`assets/reviewer-brief.md`**，由 `wf` 用 `string.Template` 填入。規則檔清單依優先序列出存在的檔案：repo taste、worktree 根目錄的 AGENTS.md 與 CLAUDE.md、全域 taste、`skills/*/standards/*.md`。新增規範不用改樣板，也不用改 `wf`。
- **reviewer 不需要 agent 定義檔：SKILL.md 要求 Claude Code 用 Agent tool 的參數指定 `model: opus`、`effort: xhigh`。** 原因：Agent tool 的 `model` 參數會蓋過 agent 定義檔的設定，而使用者的全域規則可能要求每次派工都指定便宜的模型；在派工的那一步明確寫出參數才可靠。Codex 由 skill 指示委派一個 subagent。prompt 就是 `wf review` 的輸出。

### 測試

- `python3 -m unittest discover -s tests`，不用安裝任何套件。CI 在 Python 3.9 與最新版各跑一次。
- `tests/test_wf.py`：在暫存資料夾建 bare origin 加 clone，用真的 git 跑 `wf.py`；唯一用假的是 `gh`。測試名稱就是規格。
- `tests/test_package.py`：逐一檢查 `skills/*/` 底下每個 skill 的 frontmatter、大小、只在呼叫時展開的寫法與引用路徑，以及 manifest 的名稱與版本。
- 不寫 eval：產出品質由實際使用來評估。同一類品質問題反覆出現時，再加 eval。

### repo

- 只留最終決定和它的原因，不放決策歷史和過程。
