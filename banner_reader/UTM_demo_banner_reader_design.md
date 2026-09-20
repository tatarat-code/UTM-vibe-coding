# Banner Reader 基本設計

文書：UTM CEE 講演デモ（学生・教員共通パート）基本設計
作成：2026-09-20 ／ 改訂：2026-09-20（名称確定・会場参加取りやめ・パス分離・**リポジトリ実状の反映**）
対象講演：2026-09-21（月）UTM ジョホールバル本校 ／ 想定時間：30 分
基盤：Cloudflare Workers（`utm-vibe-coding`）＋ OpenAI API（vision）
リポジトリ：`C:\Users\naoki\Claude\Projects\UTM`（GitHub `tatarat-code/UTM-vibe-coding`）
公開 URL：`https://utm-vibe-coding.naoki-4a5.workers.dev/banner/`
関連文書：`banner_reader/UTM_demo_banner_reader_requirements.md`（要件定義。優先度・受入基準は同書が優先）

> 旧称 Poster Catcher。2026-09-20 に **Banner Reader** へ確定。

---

## 0. 現状（2026-09-20 19:50 時点の実リポジトリ）

**重要：当初の設計は「既存資産を流用する」前提で書かれていたが、実際のリポジトリはまだ骨組みのみである。**

```
UTM/
  .dev.vars              OPENAI_API_KEY（ローカル用・git 管理外）
  .gitignore
  package.json / package-lock.json
  wrangler.jsonc         KV バインディングは未設定
  README.md
  public/
    index.html           トップページ（スタイルは inline <style>。app.css は未作成）
  src/
    index.js             /api/health のみ。openai.js / store.js / rubric.js / grading.js は未作成
  samples/
    syllabus.pdf
    UJT1333_syllabus_demo.pdf
  banner_reader/
    UTM_demo_banner_reader_requirements.md
```

これにより、当初の想定から次の 3 点を修正する。

| # | 当初の想定 | 実際 | 対応 |
|---|---|---|---|
| 1 | `openai.js` / `store.js` / `app.css` を流用する | **いずれも未作成** | Banner Reader の実装時に**新規作成し、教員向けステップがこれを流用する**（依存の向きが逆になる） |
| 2 | KV 名前空間 `DEMO_KV` が使える | 当初は未設定だったが、**2026-09-20 20:24 に作成・バインディング済み**（§4.4） | 対応済み |
| 3 | `/b` → `/banner/capture.html` のリダイレクトを Worker に置く | `run_worker_first` が `/api/*` のみ、かつ `not_found_handling` が `single-page-application` のため、**`/b` は Worker に届かずトップページが返る** | `run_worker_first` に `/b` を追加する（§6.1） |

**講演上の意味**：教員向けステップ 2・3 がまだ空である以上、Banner Reader は「既存の上に足す」のではなく「**最初の本格的な機能**」になる。当日の語りは「動いているサイトに機能を足す」で変わらない（トップページと自動デプロイは既に動いている）。

---

## 1. 何を作るか

**一文：学会・展示会で撮った写真を、そのまま検索できる研究情報の台帳にする。**

学会会場でポスターを撮る行為は誰でもしている。しかしその写真は二度と開かれない。撮る量が多い人ほど、撮りっぱなしの損失が大きい。オートフォーカスを最も必要としたのがプロの写真家だったのと同じ構図で、この道具は教員にこそ効く。

**スタンス：読み取れる情報を素直にデータ化する。** 「この人と話すべき」といった解釈・推薦は入れない。読み取れた事実と、読み取れなかった空欄を、そのまま見せる。解釈は使う人が行う。

**前提：スマートフォンで操作する。** 撮る場所が会場である以上、PC に戻ってからでは意味がない。当日も講演者のスマートフォンから操作し、画面を投影する。

---

## 2. 設計方針

| 方針 | 理由 |
|---|---|
| **既存 Worker に同居させ、パスで分ける** | 同じ URL（`utm-vibe-coding.naoki-4a5.workers.dev`）の `/banner/` 配下に置く。デプロイ経路は実証済み |
| **モバイル第一** | 撮影から記録までを会場で完結させる。PC 版は用意せず、同じ画面がたまたま PC でも開ける、という順序にする |
| **読み取りは素直に、解釈はしない** | 推薦を入れた瞬間に「誰向けか」を決めることになる。学生と教員の両方が対象である以上、決めない |
| **種別を AI が判定し、項目を切り替える** | 会議バナー／研究ポスター／企業展示／名刺で、記録すべき項目がまったく違う |
| **全フィールドに根拠と確信度** | `sourceText`（画像上の該当文字列）と `confidence` を持たせる。人が確かめられない台帳は使えない |
| **推測させない** | 読み取れない項目は `null` のまま。埋めない。ここが「AI が書く」と「人が決める」の境界 |
| **コアは無状態** | `/api/banner/capture` は「画像 → JSON」の純粋関数。保存層がなくてもデモは成立する |
| **共通部品は共通の場所に置く** | `src/openai.js` / `src/store.js` / `public/app.css` は Banner Reader が最初に作るが、教員向けステップ 2・3 からも使えるよう汎用に書く |
| **既存を壊さない** | `/api/health` とトップページの動作を変えない。片方の失敗が両方を止めないようにする |

---

## 3. 撮るもの・読み取るもの

### 3.1 種別

AI が画像から種別を判定する。1 エントリに 1 種別。

| コード | 種別 | 典型 |
|---|---|---|
| `conference` | 国際会議のバナー・告知ポスター | 会場入口のバナー、CFP ポスター |
| `research` | 研究発表ポスター | ポスターセッションの掲示 |
| `exhibition` | 企業展示ポスター・パネル | 展示会ブースのパネル、製品紹介 |
| `card` | 名刺のみ | ポスターなしで名刺だけ撮った場合 |
| `unknown` | 判定不能 | 不鮮明、対象外 |

### 3.2 共通項目（すべての種別）

`type` / `typeConfidence` / `language`（原文の言語）/ `title`（代表名）/ `org`（代表組織）/ `summary`（1〜2 文）/ `tags`（キーワード）/ `urls`（URL・QR の解読結果）/ `capturedAt` / `unreadable`（読み取れなかった領域のメモ）

### 3.3 国際会議バナー・告知ポスター（`conference`）

会議名／略称／回次／会期／開催地（都市・国）／会場名／主催・共催・後援／目的・スコープ／トピック一覧／キーノートスピーカー（氏名・所属・講演題目）／投稿締切・参加登録締切／参加費／併設イベント／公式 URL

### 3.4 研究発表ポスター（`research`）

タイトル／著者（筆頭・共著）／所属／研究の問い／手法／対象・試料／主要な結果（数値は単位ごと）／結論／限界・今後の課題／キーワード／資金・謝辞／連絡先／図表の構成メモ

※ 当日ライブで **使用装置・ソフトウェア（`instruments`）** を追加する。

### 3.5 企業展示ポスター（`exhibition`）

企業名／事業所・国／製品名・型番／何をするものか／目的／効能・性能値／達成できること／新規性／応用可能性／技術要素／導入実績・顧客／認証・規格／価格・入手性／公式 URL

### 3.6 名刺（`contacts[]`、どの種別にも付けられる）

氏名（原語表記／ラテン表記）／役職／部署／組織／住所／電話／携帯／メール／Web／SNS（LinkedIn, X, ResearchGate, ORCID など）／QR の解読結果／名刺の言語

### 3.7 複数枚の扱い

**1 エントリ = 1〜4 枚**。ポスター全体＋部分拡大＋名刺、という組み合わせを想定する。AI は全枚数を **1 回の呼び出しで見て、1 つの JSON を返す**。名刺が含まれれば `contacts[]` に格納し、ポスター側の組織名と突き合わせる。

---

## 4. データ構造

### 4.1 エントリ（`entry:<id>`）

```json
{
  "id": "e_9k3m",
  "type": "exhibition",
  "typeConfidence": 0.93,
  "language": "en",
  "title": "ThermoGuard X200",
  "org": "Nippon Sensor Works Co., Ltd.",
  "summary": "Fiber-optic temperature sensor for use inside high-voltage switchgear.",
  "tags": ["fiber optic", "temperature sensing", "switchgear"],
  "urls": ["https://example.com/x200"],
  "fields": {
    "productName": {
      "value": "ThermoGuard X200",
      "sourceText": "ThermoGuard X200",
      "confidence": 0.97
    },
    "performance": {
      "value": "±0.5 °C, -40 to 250 °C",
      "sourceText": "Accuracy ±0.5degC / Range -40 - 250degC",
      "confidence": 0.88
    },
    "novelty": {
      "value": null,
      "sourceText": null,
      "confidence": 0.0
    }
  },
  "contacts": [
    {
      "nameLatin": { "value": "Taro Yamada", "sourceText": "山田 太郎 / Taro Yamada", "confidence": 0.95 },
      "title":     { "value": "Senior Manager, Sales Div.", "sourceText": "営業部 シニアマネージャー", "confidence": 0.9 },
      "email":     { "value": "t.yamada@example.com", "sourceText": "t.yamada@example.com", "confidence": 0.99 }
    }
  ],
  "unreadable": ["右下の導入実績の表は解像度不足で読み取れず"],
  "capturedAt": "2026-09-21T03:12:00Z",
  "reviewedBy": null
}
```

**フィールドの共通形**：すべての値は `{ value, sourceText, confidence }` の三つ組で持つ。

- `value` — 読み取った値。読めなければ `null`
- `sourceText` — 画像上にあった文字列そのまま。**人が照合するための根拠**
- `confidence` — 0.0〜1.0

人が修正すると `value` を上書きし、`confidence` を `1.0`、エントリの `reviewedBy` を `"human"` にする。`sourceText` は残す（何が書いてあって、人が何に直したかが両方残る）。

### 4.2 索引と KV キー

名前空間は教員向けステップ 2・3 と共用する。接頭辞で分離するため衝突しない。

| 用途 | キー | 備考 |
|---|---|---|
| Banner Reader エントリ | `entry:<id>` | 本システム |
| 種別索引 | `idx:type:<type>` | 本システム |
| 全体索引 | `idx:all` | 本システム |
| ルーブリック | `rubric:<id>` | 教員向け（**未実装。接頭辞のみ予約**） |
| 提出 | `sub:<id>` | 教員向け（**未実装。接頭辞のみ予約**） |

画像本体は KV に置かず、**サーバに保存しない**（送信 → 読み取り → 破棄）。端末側には残る。

### 4.3 保存期間

エントリは KV の `expirationTtl` で **24 時間**。講演者の事前投入分のみ TTL なし。

### 4.4 KV 名前空間（**2026-09-20 作成済み**）

`npx wrangler kv namespace create DEMO_KV` を実行し、wrangler が `wrangler.jsonc` に自動追記した。

```jsonc
"kv_namespaces": [
  { "binding": "DEMO_KV", "id": "bb70c238a50645068dce1099eda948b8", "remote": true }
]
```

Worker コードからは `env.DEMO_KV` で参照する。

**`"remote": true` の意味**：`wrangler dev` によるローカル開発でも、ローカル模擬ストアではなく
**本番の KV 名前空間に直接読み書きする**。今回はこれが好都合で、PC 上のリハーサルで投入した
エントリが、そのままスマートフォンから本番 URL 経由で見える。ただしローカル開発時も
ネットワークと Cloudflare 認証が必要になる点は留意する。デプロイ後の Worker の挙動には影響しない。

**万一 KV が使えなくなった場合**、無状態の `/api/banner/capture` だけでデモは成立する（§5 の注記）。
その場合は一覧をブラウザの `localStorage` に退避する縮退案を取る。

---

## 5. API 設計

`src/index.js` から `/api/banner/*` を `src/banner/` 配下へ振り分ける。既存の `/api/health` には触れない。

| Method | Path | 役割 | 保護 |
|---|---|---|---|
| POST | `/api/banner/capture` | **multipart**：画像 1〜4 枚 → 構造化 JSON（**無状態・KV 不要**） | 公開 |
| POST | `/api/banner/entries` | 保存 → `{id}` | 公開 |
| GET | `/api/banner/entries?type=&q=&limit=` | 一覧 | 公開 |
| GET | `/api/banner/entries/:id` | 1 件取得 | 公開 |
| PATCH | `/api/banner/entries/:id` | 人の修正を反映（`reviewedBy: "human"`） | 公開 |
| DELETE | `/api/banner/entries/:id` | 削除 | 公開 |
| GET | `/api/banner/export?format=csv\|json` | 書き出し | 公開 |

**無状態 1 本（`/api/banner/capture`）だけでデモは成立する。** 実装順序も `capture` を最優先とし、保存系はその後に積む。

---

## 6. 画面設計（モバイル前提）

| 画面 | パス | 内容 |
|---|---|---|
| **撮る** | `/banner/capture.html` | 画面の大半を占める撮影ボタン。タップでカメラ直起動。撮った順にサムネイルが並び、最大 4 枚。「Read this」で送信 |
| **確かめる** | `/banner/entry.html?id=` | 読み取り結果をカードで縦に表示。確信度で色分け（高＝通常、中＝黄の下線、低／空欄＝灰の破線枠）。各欄をタップするとその場で編集、下に `sourceText` を表示 |
| **束ねる** | `/banner/list.html` | 上部に種別タブ（All / Conference / Research / Exhibition / Card）と検索欄。新着順にカード。件数を大きく出す |
| **書き出す** | `/banner/export.html` | CSV / JSON。種別ごとに列構成が変わるため、種別を選んでから書き出す |

### 6.1 短縮パス `/b`（**要 `wrangler.jsonc` 変更**）

現在の `wrangler.jsonc` は `run_worker_first: ["/api/*"]` かつ `not_found_handling: "single-page-application"` である。この状態では `/b` は Worker に届かず、トップページが返る。短縮パスを使うなら次のように変更する。

```jsonc
"run_worker_first": ["/api/*", "/b"]
```

そのうえで `src/index.js` に 302 リダイレクトを 1 行足す。**変更を避けるなら、当日は `/banner/capture.html` をそのまま開く**（QR コードもブックマークも使えるため、実害は小さい）。

### 6.2 トップからの導線

`public/index.html` のカード群に Banner Reader への入口を 1 つ足す。既存のステップ 0〜3 のカードはそのまま残す。

### 6.3 モバイル実装メモ

- 撮影入力は `<input type="file" accept="image/*" capture="environment" multiple>`。ネイティブアプリは不要
- **端末側で縮小**：canvas で長辺 1,600 px・JPEG 品質 0.8 に変換してから送信。転送量削減と、iOS の HEIC 対策を兼ねる
- タップ領域は 44 px 以上、入力欄のフォントは 16 px 以上（iOS の自動ズーム防止）
- 1 画面 1 カラム。横スクロールを作らない
- **待ち時間の見せ方**：15〜30 秒かかるため、進捗文言を段階表示する（`Uploading…` → `Reading the poster…` → `Organising the fields…`）
- 送信結果は受信と同時に `localStorage` に下書き保存。通信が切れても消えない
- 一覧は 20 件ずつ追加読み込み
- 配色は `public/index.html` の `:root`（`--bg: #0f172a` ほか）を `public/app.css` に切り出して共有する

---

## 7. AI 呼び出し

- **モデル**：`gpt-4.1-mini`（vision 対応）。小さい文字の読み取りが不足する場合は `gpt-4.1` に切り替え
- **API**：Responses API、`input_image`（base64）、`text.format = json_schema`（strict）
- **strict の制約**：ルートに `anyOf` を置けないため、**全種別のオブジェクトを 1 つのスキーマに含め、該当しない種別は `null`** にする（`conference` / `research` / `exhibition` を入れ子の nullable オブジェクトにする）
- **temperature = 0.1**
- **キー**：`env.OPENAI_API_KEY`。本番は `npx wrangler secret put OPENAI_API_KEY`、ローカルは `.dev.vars`（設定済み）

### プロンプト要点

1. まず種別を判定し、`type` と `typeConfidence` を出す
2. 該当種別の項目のみを埋め、他の種別のオブジェクトは `null` にする
3. **読み取れない項目は `null`。推測・補完を禁止する**（一般知識から会議名を補う等を明示的に禁じる）
4. すべての値に `sourceText`（画像上の文字列そのまま）を付ける。付けられないなら `value` も `null`
5. 数値は単位ごと写す。丸めない
6. 原文の言語のまま記録する。翻訳は行わない
7. 名刺が写っていれば `contacts[]` に入れる。複数枚に分かれていても 1 人としてまとめる
8. 不鮮明・見切れの領域は `unreadable` に記す

**応答時間の目安**：1 枚 8〜15 秒、4 枚 20〜35 秒。

---

## 8. ディレクトリ構成

リポジトリ：`C:\Users\naoki\Claude\Projects\UTM`（GitHub `tatarat-code/UTM-vibe-coding`）

凡例：**◎ 既存** ／ **★ 今回追加** ／ **▲ 既存を変更** ／ **○ 教員向けに今後追加**

```
UTM/
  public/
    index.html                 ▲ トップ（Banner Reader の入口カードを 1 つ追加）
    app.css                    ★ 共通スタイル（index.html の :root を切り出す）
    banner/                    ★ Banner Reader
      capture.html             撮る
      entry.html               確かめる
      list.html                束ねる
      export.html              書き出す
      mobile.css               モバイル用スタイル（app.css の :root を流用）
      resize.js                端末側の画像縮小（canvas → JPEG）
  src/
    index.js                   ▲ ルーター（/api/banner/* の振り分けを追加。/api/health は維持）
    openai.js                  ★ Responses API 共通（教員向けからも使えるよう汎用に）
    store.js                   ★ KV ラッパ（TTL 対応込み）
    banner/                    ★ Banner Reader
      capture.js               画像 → 構造化 JSON
      entries.js               保存・一覧・取得・修正・削除
      schema.js                種別ごとの JSON Schema 定義
      exporter.js              CSV / JSON 書き出し
    rubric.js                  ○ 教員向けステップ 2（未実装）
    grading.js                 ○ 教員向けステップ 3（未実装）
  samples/
    syllabus.pdf               ◎
    UJT1333_syllabus_demo.pdf  ◎（syllabus.pdf と同一内容。いずれ整理）
    banner/                    ★ サンプル画像
      poster_conference.jpg    国際会議バナー
      poster_research.jpg      研究発表ポスター
      poster_exhibition.jpg    企業展示パネル
      card_sample.jpg          名刺（架空）
  banner_reader/               ◎ 設計・要件文書
    UTM_demo_banner_reader_design.md         ★
    UTM_demo_banner_reader_requirements.md   ◎
  wrangler.jsonc               ▲ KV バインディング追加（＋必要なら run_worker_first に /b）
  package.json                 ◎
  README.md                    ◎
  .dev.vars                    ◎ OPENAI_API_KEY（git 管理外）
  .gitignore                   ◎
```

**既存ファイルへの変更は 3 点のみ**：`src/index.js`（ルーティング追加）、`public/index.html`（入口カード追加・`:root` の切り出し）、`wrangler.jsonc`（KV バインディング）。

---

## 9. 実装順序

当日までの時間が限られるため、この順で積む。途中で止まっても、その時点までで成立する。

| 順 | 内容 | 成立する状態 |
|---|---|---|
| 1 | `src/openai.js`（Responses API ラッパ） | — |
| 2 | `src/banner/schema.js`（種別ごとの JSON Schema） | — |
| 3 | `src/banner/capture.js` ＋ `src/index.js` のルーティング | **API が動く** |
| 4 | `public/banner/capture.html` ＋ `resize.js` ＋ `entry.html` | **撮る → 読む → 確かめる が完結（保存なし）。ここまででデモ成立** |
| 5 | KV 名前空間の作成 ＋ `wrangler.jsonc` ＋ `src/store.js` | — |
| 6 | `src/banner/entries.js` ＋ `public/banner/list.html` | **貯まる・束ねる** |
| 7 | `src/banner/exporter.js` ＋ `public/banner/export.html` | **書き出せる** |
| 8 | `public/app.css` 切り出し ＋ `public/index.html` の入口カード | **導線が整う** |

**4 まで到達すれば当日の中核（撮る・読む・確かめる・ライブで項目を足す）は成立する。**

---

## 10. 当日の進め方（30 分）

会場参加は行わない。投入する画像は、事前に用意したサンプルと、講演者自身がその場で撮影したものに限る。

| 時間 | 内容 | ねらい |
|---|---|---|
| 0–3 分 | **問題提起**。学会でポスターを撮る。その写真は二度と開かない。撮る量が多い人ほど損失が大きい——オートフォーカスを最も必要としたのはプロの写真家だった | 学生と教員の両方を同時に当事者にする |
| 3–8 分 | **完成版の実演**。講演者のスマートフォンで、会議バナー・研究ポスター・企業展示＋名刺を順に読み込む | 掴み。言葉より先に動くものを見せる |
| 8–18 分 | **ライブで機能を足す**。研究ポスターに「使用装置・ソフトウェア」欄を追加 → Claude Code に英語で依頼 → push → 自動デプロイ（1〜2 分）→ **同じ画像を読み直すと新しい項目が現れる** | 記録すべき項目を決めるのは人である、という実演 |
| 18–24 分 | **人が確かめる**。確信度の低い欄を開き、`sourceText` と見比べて修正。空欄が空欄のまま出ることの意味を述べる | 「People examine」。AI の出力は下書きであって確定ではない |
| 24–28 分 | **蓄積の意味**。一覧・種別タブ・書き出し。画像を保存しない／24 時間で失効させるという設計判断に触れる | 読み取れるものをデータ化する設計は、同時に「読み取ってよいか」を決める責任を生む |
| 28–30 分 | 締め。**「AI builds. People decide, and examine.」** | 既存の締め句にそのまま接続 |

**予備**（時間が余った場合）：CSV 書き出しにおける種別ごとの列切り替えを追加する。

---

## 11. リスクと対策

| リスク | 対策 |
|---|---|
| **KV が間に合わない** | 無状態の `/api/banner/capture` だけでデモは成立する。一覧は `localStorage` への退避で縮退させ、24〜28 分の「蓄積」パートを短縮する |
| **会場ネットワークの不調** | 講演者はモバイル回線を使用し、会場 Wi-Fi に依存しない。事前投入済みエントリと完成画面の録画を用意 |
| **デプロイが通らない** | `demo-complete` ブランチに追加機能込みの完成版を用意し、切り替えてデプロイ |
| **既存への波及** | Banner Reader のコードを `src/banner/` と `public/banner/` に閉じ込める。ライブで触るのは `src/banner/schema.js` と `public/banner/entry.html` の 2 ファイルのみ |
| **名刺＝個人情報** | 当日使うのは架空の名刺 1 枚のみ。画像はサーバに保存しない。エントリは 24 時間で失効。削除ボタンを常時表示。この設計判断自体を講演で述べる |
| **文字が小さい・斜めから撮影** | 「全体 1 枚＋読みたい部分を追加で 1 枚」という複数枚の使い方を画面上で案内。`unreadable` に何が読めなかったかを必ず出す |
| **iOS の HEIC 形式** | 端末側 canvas で JPEG に変換してから送信 |
| **読み取り誤り** | 確信度の色分けと `sourceText` の併記。**誤りが見えることを欠点ではなく機能として説明する** |
| **著作権・撮影可否** | 学会ポスターは撮影禁止の場合がある。「撮ってよいかを確認するのは人の判断」と一言添える。サンプルは公開前提の素材に限る |
| **API 費用** | `gpt-4.1-mini` で 1 回あたり数セント程度。上限アラートを事前設定 |

---

## 12. 決定履歴

| 日付 | 決定事項 |
|---|---|
| 2026-09-20 | 学生・教員のどちらにも寄せず、読み取れる情報を素直にデータ化するスタンスを採用 |
| 2026-09-20 | スマートフォンでの操作を前提とする |
| 2026-09-20 | デモ時間は 30 分程度 |
| 2026-09-20 | 会場参加は行わない |
| 2026-09-20 | ライブ追加機能は決め打ち（研究ポスターの「使用装置・ソフトウェア」欄） |
| 2026-09-20 | サンプル画像は公開前提の素材に限る |
| 2026-09-20 | 保存系は事前に `main` へ投入する |
| 2026-09-20 | 名称を **Banner Reader** に確定 |
| 2026-09-20 | 既存リポジトリ `UTM` に統合し、**ブランチではなくパス `/banner/` で分離**する |
| 2026-09-20 | 設計・要件文書は `UTM/banner_reader/` 配下に置く |
| 2026-09-20 | リポジトリ実状の確認により、`openai.js` / `store.js` / `app.css` は**流用ではなく新規作成**と修正 |

---

## 13. 未決事項

| # | 項目 | 状態 |
|---|---|---|
| 1 | KV 名前空間の作成と `wrangler.jsonc` への追記 | **完了**（2026-09-20、§4.4） |
| 2 | サンプル画像 4 点 | **完了**（`samples/banner/`、自作の架空素材。内容は同フォルダの `README.md`） |
| 3 | 架空の名刺画像 | **完了**（`samples/banner/card_sample.jpg`。展示パネルと同一の架空企業） |
| 4 | 当日の英語投入プロンプト（ライブ追加分）の作成 | 保留（準備が整い次第、別途相談） |
| 5 | `/b` 短縮パスを採用するか（`wrangler.jsonc` 変更の要否） | 未決（§6.1。採用しなくても実害は小さい） |
| 6 | 講演者端末での動作確認 | 未実施（実装後） |
| 7 | OpenAI 使用上限アラートの設定 | 未実施 |
| 8 | `samples/` の PDF 重複（`syllabus.pdf` と `UJT1333_syllabus_demo.pdf`）の整理 | 優先度低 |
