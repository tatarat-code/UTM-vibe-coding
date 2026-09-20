# Claude Code 引き渡しプロンプト（Banner Reader 実装）

作成：2026-09-20 ／ 使い方：リポジトリ `C:\Users\naoki\Claude\Projects\UTM` で `claude` を起動し、以下をそのまま貼る。

---

```
このリポジトリで Banner Reader を実装します。明日 2026-09-21 の UTM CEE 講演で使う
デモアプリです。

## 最初に読むもの

1. banner_reader/UTM_demo_banner_reader_requirements.md（要件定義・優先度・受入基準）
2. banner_reader/UTM_demo_banner_reader_design.md（基本設計・データ構造・実装順序）
3. samples/banner/README.md（サンプル画像の内容と、仕込んである仕掛け）

この3つが仕様です。記述が食い違う場合は要件定義書を優先してください。

## 確認済みの前提

- Worker: utm-vibe-coding / 本番 https://utm-vibe-coding.naoki-4a5.workers.dev/
- KV: wrangler.jsonc にバインディング済み。Worker からは env.DEMO_KV で参照
- OPENAI_API_KEY: .dev.vars にあり（git 管理外）。本番側に未投入なら
  npx wrangler secret put OPENAI_API_KEY を実行してください
- 既存コードは src/index.js の /api/health と public/index.html のみ。
  openai.js / store.js / app.css はまだ存在しないので、今回あなたが作ります

## 実装順序

設計書 §9 の 1〜8 の順で進めてください。段階ごとにコミットします。
**4 まで終われば明日のデモは成立します**ので、まず 4 を目指してください。

## 絶対に守ること

1. 読み取れない項目は null のままにする。推測で埋めない（FR-11）。
   これは手抜きではなく、この製品の中心的な機能です。
   一般知識から会議名や企業名を補完することを、プロンプトで明示的に禁止してください。
2. 全フィールドは { value, sourceText, confidence } の三つ組（FR-10）。
   sourceText は画像上にあった文字列そのまま。これが付けられないなら value も null。
3. 数値は単位を含めて記録し、丸めない（FR-12）。原文の言語のまま記録し、翻訳しない（FR-13）
4. 既存の /api/health とトップページの動作を壊さない
5. Banner Reader のコードは src/banner/ と public/banner/ に閉じ込める。
   既存ファイルへの変更は src/index.js のルーティング追加と
   public/index.html の入口カード追加のみ
6. 画像をサーバに保存しない。送信 → 読み取り → 破棄（NFR-06）
7. モバイル前提。1画面1カラム、タップ領域 44px 以上、入力欄フォント 16px 以上（NFR-03）

## 明日ライブで触る2ファイル

src/banner/schema.js と public/banner/entry.html です。
当日、研究発表ポスターに「使用装置・ソフトウェア（instruments）」欄をライブで追加します。
**この2ファイルだけの変更で1項目を追加できる構造**にしておいてください。
項目定義が複数箇所に散らばっていると当日つまずきます。

なお instruments は今の時点では実装しないでください。明日の見せ場です。

## 検証

samples/banner/ の4点を使い、samples/banner/README.md の
「リハーサルでの確認手順」1〜5 を実行して結果を報告してください。

とくに poster_research.jpg の FUNDING AND ACKNOWLEDGEMENTS 欄は
意図的にぼかしてあります。ここが null のまま出れば正常（AC-03）、
助成金番号が埋まったら不具合です。

## git

- まず現在の未コミット分（samples/banner/ の5ファイル、banner_reader/ の2文書、
  wrangler.jsonc の変更）を最初のコミットにしてください
- 以後は実装段階ごとに小さくコミット
- **コミットメッセージは英語**で書いてください。当日スクリーンに履歴を映す可能性があります
- main に push すると自動デプロイされます。各段階の push 後に本番 URL で動作確認してください

## 進め方

- 設計に疑問や矛盾を見つけたら、実装を進める前に質問してください。勝手に仕様を変えないこと
- 各段階の完了時に「何ができるようになったか」を1〜2行で報告してください
- 時間が限られています。凝った実装より、動いて検証できる状態を優先してください
```

---

## 補足（プロンプトには含めない運用メモ）

- **止めどころ**：段階 4（`capture.html` / `entry.html` まで）が最優先。ここで中断しても
  当日の中核（撮る・読む・確かめる・ライブで項目を足す）は成立する。
- **段階 5 以降**（KV 保存・一覧・書き出し）は、時間が残っていれば。
- **`/b` 短縮パス**は未決。採用する場合は `wrangler.jsonc` の `run_worker_first` に
  `/b` を追加する必要がある（設計書 §6.1）。採用しなくても実害は小さい。
- **当日の英語投入プロンプト**は別途作成する。このプロンプトには含まれていない。
