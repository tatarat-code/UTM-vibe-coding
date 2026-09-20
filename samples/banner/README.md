# Banner Reader — サンプル画像

作成：2026-09-20 ／ 用途：UTM CEE 講演デモ（2026-09-21）

**4 点すべて架空の内容で自作したもの**です。実在の会議・企業・研究者・人物は含みません。
各画像の最下部に "DEMONSTRATION SAMPLE — fictitious …" の注記を小さく入れてあります
（これ自体が「細かい文字も読めるか」の確認材料になります）。

| ファイル | 種別 | 寸法 | 言語 |
|---|---|---|---|
| `poster_conference.jpg` | `conference` | 1600 × 1000 | 英語 |
| `poster_research.jpg` | `research` | 1200 × 1480 | 英語 |
| `poster_exhibition.jpg` | `exhibition` | 1600 × 1100 | **日英併記** |
| `card_sample.jpg` | `card` | 1500 × 1000 | **日英併記** |

---

## 1. poster_conference.jpg — 国際会議 CFP バナー

架空の会議「ICEEDP 2027」（第 9 回、2027 年 5 月 12–14 日、Johor Bahru）。

読み取れるはずの項目：会議名／略称／回次／会期／会場／開催地／開催形式／主催・共催／
目的・スコープ／トピック 10 件／キーノート 3 名（氏名・所属・講演題目）／
重要日程 6 件／参加費 3 区分（MYR）／併設イベント 3 件／公式 URL。

**見どころ**：日程と料金が表形式で並ぶため、`sourceText` との照合が一目で確認できる。

---

## 2. poster_research.jpg — 研究発表ポスター

架空の研究「パーム油工場の熱交換器における汚れ発生の早期検知」。著者 4 名・所属 3 機関。

読み取れるはずの項目：タイトル／著者／所属／研究の問い／材料・試験装置／手法／
主要結果（表＋数値 KPI）／結論／限界・今後の課題／キーワード／連絡先・ORCID。

**⚠ このポスターには 2 つの仕掛けがあります。**

**(a) 当日ライブ追加する `instruments` 欄の材料**
METHODS の中に装置名とソフトウェア名を明示してあります。

> **Instrumentation.** PCB Piezotronics 352C33 accelerometers; National Instruments
> cDAQ-9174 chassis with NI-9234 input modules; FLIR E8-XT thermal camera;
> Endress+Hauser Promag 10 flow meters; K-type thermocouples (class 1).
>
> **Software.** MATLAB R2024b (Signal Processing Toolbox); Python 3.11 with SciPy 1.13,
> scikit-learn 1.4.2, PyWavelets 1.6; COMSOL Multiphysics 6.2.

→ 「使用装置・ソフトウェア」欄を追加して**同じ画像を読み直すと、新しい項目が埋まる**。
これが 8–18 分パートの山場になります。

**(b) 意図的に読み取れない領域（AC-03 用）**
左下の FUNDING AND ACKNOWLEDGEMENTS ボックスの本文に**ぼかし**をかけてあります。
見出しは読めるが中身は読めない、という状態です。

→ 期待される挙動：`funding` は `null` のまま、`unreadable` に「謝辞欄が読み取れず」が入る。
**推測で助成金番号を埋めたら、それは不具合です。** 18–24 分パートの題材になります。

---

## 3. poster_exhibition.jpg — 企業展示パネル（日英併記）

架空企業「星空センシング株式会社（HOSHIZORA SENSING CO., LTD.）」の新製品
「ThermoGuard X200」（光ファイバ温度センサ）。

読み取れるはずの項目：企業名（日英）／所在地／展示会名・ホール・ブース番号／製品名／
用途／導入効果 4 件／新規性（特許出願番号つき）／仕様 8 項目（**単位つき数値**）／
技術要素／認証・規格 5 件／応用可能性／導入実績／価格・納期・保証／公式 URL。

**見どころ**：
- 日本語と英語が混在 → `language` 判定と「翻訳しない」方針の確認
- 仕様が `±0.5 °C` `−40 – 250 °C` `2,000 m` `24 V DC, 18 W` など**単位つき**
  → FR-12（数値は単位ごと記録、丸めない）の確認に最適

---

## 4. card_sample.jpg — 名刺（架空）

上記「星空センシング株式会社」の担当者。**企業展示パネルと同じ会社**にしてあります。

読み取れるはずの項目：氏名（漢字／ラテン）／役職（日英）／部署／会社名（日英）／
住所（日英）／〒／TEL／携帯／FAX／メール／Web／LinkedIn。

**見どころ（AC-06）**：`poster_exhibition.jpg` と `card_sample.jpg` を**2 枚まとめて投入**すると、
1 エントリの `contacts[]` に山田太郎が入り、`org` が展示パネル側の企業名と一致するはずです。
これが「ポスター＋名刺」という実際の使い方の再現になります。

**注意**：右上の QR 風の図形は**装飾であり、実際には読み取れません**。
`urls` に QR 由来の値が出たら、それは推測です。

---

## 連絡先・ドメインについて

メール・Web は `example.jp` / `example.com` / `example.org` / `example.edu.my`
（RFC 2606 で文書用に予約されたドメイン）を使用しています。実在の宛先には届きません。
電話番号も実在しない番号です。

---

## リハーサルでの確認手順

1. 4 点を 1 枚ずつ投入し、`type` が正しく判定されるか（AC-01）
2. `poster_research.jpg` で謝辞欄が `null` のまま出るか（AC-03）
3. `poster_exhibition.jpg` で単位つき数値が丸められていないか（FR-12）
4. `poster_exhibition.jpg` ＋ `card_sample.jpg` の 2 枚で `contacts[]` が付くか（AC-06）
5. 1 枚 15 秒以内、2 枚 25 秒以内で返るか（AC-09）
