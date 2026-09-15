# OBS Control MCP
Node.js 22+だけで動作する、OBS Studio / obs-websocket v5向けのstdio MCPサーバーです。外部npm依存はありません。
## 主用途
- Media Sourceをローカル動画またはネットワーク入力から作成し、シーンへ配置する
- `mediaId`で再生、一時停止、停止、再開、絶対/相対seekを行う
- `media_play`で通常再生し、任意で開始位置と1〜200%の再生速度を同時指定する
- `media_speed_set`で既存Media Sourceの再生速度を変更する
- `media_info`でソース、再生状態、速度、音声、表示状態、全シーン配置をまとめて取得する
- `media_play_range`で`startMs`から`endMs`までの指定区間だけを再生する
- OBSサウンドミキサーの音量/mute/バランス/同期/モニタリング/トラック割当を取得・変更する
- Windows OBSのGDI+文字ソースを作成し、文字列・フォント・色・背景・アウトライン・位置/大きさをまとめて操作する
- シーン/入力/シーンアイテムを作成・列挙・削除・配置・表示切替する
- OBSのシーンまたは入力をスクリーンショットし、MCPの`image` contentとしてAIへ直接返す
## IDの扱い
独自IDファイルは持ちません。OBS自身のUUIDをそのまま使用します。
- `sceneId` = OBS `sceneUuid`
- `mediaId` / `textId` / `inputId` = OBS `inputUuid`
- `sceneItemId` = OBSのシーン内数値ID
そのためMCPプロセスを再起動しても、OBS側の実体が残っている限り同じUUIDを再利用できます。
## 必要条件
OBS StudioでWebSocketサーバーを有効にしてください。obs-websocket v5の標準ポートは`4455`です。既定では`server.mjs`と同じディレクトリの`config.toml`を読みます。
```toml
[obs]
url = "ws://127.0.0.1:4455"
password = "OBSで設定したパスワード"
connect_timeout_ms = 5000
request_timeout_ms = 10000
```
`config.toml`はパスワードを含められるため`.gitignore`対象です。配布用の雛形は`config.example.toml`です。別ファイルを使う場合は`OBS_MCP_CONFIG`でパスを指定できます。
従来どおり環境変数も利用でき、同じ項目が両方にある場合は環境変数が優先されます。
```text
OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
OBS_WEBSOCKET_PASSWORD=<OBSで設定したパスワード>
```
認証を無効にしている場合、パスワードは空文字のままで構いません。パスワードをコマンドライン引数へ出す必要はありません。
## 起動
```text
node C:\Users\owner\Documents\tunnelworkspace\obs\obs-control\server.mjs
```
MCPクライアント側では、このNodeプロセスをstdioサーバーとして登録してください。サーバーはstdoutをMCP JSON-RPC専用に使い、通常ログは出しません。
## 動画の追加と配置
`media_add`に`sceneId`または`sceneName`と`source`を渡します。`sourceMode=auto`では`scheme://`形式をネットワーク入力、それ以外をローカルファイルとして扱います。
`x`,`y`,`width`,`height`を同時に指定できます。`width`と`height`は必ず対で指定します。
- `fit=contain`: アスペクト比を維持して指定矩形内へ収める
- `fit=cover`: アスペクト比を維持して指定矩形を覆う
- `fit=stretch`: アスペクト比を無視して指定矩形へ伸縮する
座標はOBSの既定と同じ左上基準です。
## 指定区間の再生
`media_play_range`は任意の`speedPercent`を先に適用できます。完全停止中のMedia Sourceは`RESTART`で初期化し、再生中ならいったん`PAUSE`完了を確認してから`startMs`へseekし、seek反映後に再生します。OBS/FFmpegが指定時刻ではなく近傍キーフレームへseekする形式では、安定した着地点が指定値から5秒以内なら正常なseekとして扱い、実際の着地点を`actualStartMs`で返します。OBSが報告する実際の`mediaCursor`を既定50ms間隔で監視し、`endMs`へ到達すると、既定ではその直後に一時停止します。終了後に`endMs`へ再seekしてキーフレーム位置まで巻き戻すことはしません。再生開始直後の一時的な`STOPPED`/`NONE`状態で監視を誤終了しないよう起動猶予も持たせています。
```text
mediaId: <media_addが返したUUID>
startMs: 12000
endMs: 18500
endAction: pause
```
このツール自体は即座に返ります。区間終端の監視はMCPサーバープロセス内で継続します。手動操作へ切り替える場合は`media_range_cancel`を使います。`media_control`と`media_seek`を明示的に呼んだ場合も、そのmediaIdの区間監視は解除されます。
## 通常再生・速度・メディア情報
通常再生には`media_play`を使えます。完全停止中はOBSの`PLAY`では再開できないMedia Sourceがあるため内部で`RESTART`を使用します。`startMs`を指定した場合は、再生可能状態へ移行→一時停止完了→seek反映確認→再生の順で処理し、再生中seekで映像が黒く固まるMedia Sourceを避けます。`speedPercent`を同時指定した場合、開始位置が省略されていれば速度変更前のcursorを復元してから再生します。
`media_speed_set`は1〜200の`speedPercent`を受け付けます。OBS本体のMedia Source実装では速度変更時にメディア再初期化が行われるため、変更前の再生/一時停止状態とcursorを保存し、速度変更後に明示的に再初期化してcursorを復元します。停止中だった入力は停止状態を維持します。
`media_info`は、`mediaId`/`mediaName`、ローカルファイルまたはネットワークURL、Media Source設定、`mediaState`、`mediaDuration`、`mediaCursor`、`speedPercent`、loop/seekable、mute/volume、Program/UI表示状態、配置されている全シーンと各`sceneItemId`/transformをまとめて返します。
## サウンドミキサー
`audio_mixer_list`は、OBSの`inputKindCaps`で音声対応している入力だけを列挙し、各入力について以下をまとめて返します。
- mute、dB/multiplier音量
- 左右バランス（`0.0`=左、`0.5`=中央、`1.0`=右）
- 音声同期オフセット（ms）
- モニタリング種別
- 音声トラック1〜6の出力割当
`audio_mixer_get`は1入力の完全なミキサー状態を取得します。`audio_mixer_set`では必要な項目だけを指定して変更でき、`monitorType`は`none` / `monitor_only` / `monitor_and_output`を受け付けます。`tracks`は`{"1":true,"2":false}`のような部分更新が可能です。`audio_mixer_mute_toggle`はmuteを反転します。
既存の`input_audio_get` / `input_audio_set`はmuteとvolumeだけを素早く扱う簡易APIとして残しています。
## 文字ソース
Windows版OBSのGDI+文字ソースを専用ツールで扱えます。作成時にはOBSに登録されている`text_gdiplus`系入力のうち最新バージョンを自動選択します。

- `text_add`: 文字ソースを作成し、同じ呼び出しでシーンへ配置する
- `text_info`: 文字内容、フォント、色、背景、アウトライン、表示状態、全シーン配置を取得する
- `text_set`: 文字内容/スタイルの変更と、位置/サイズ変更を同時に行う
- `text_remove`: 文字入力そのものを削除し、その入力を使う全scene itemもOBS側で削除する

文字スタイルは`fontName`, `fontStyle`, `fontSize`, `bold`, `italic`, `underline`, `strikeout`を指定できます。`textColor`, `backgroundColor`, `outlineColor`は`#RRGGBB`形式で、Windows GDI+文字ソースが内部設定で使うBGR整数へMCP側で変換します。`textOpacity`, `backgroundOpacity`, `outlineOpacity`は0〜100です。アウトライン幅は`outlineSize`の1〜20、配置は`align=left|center|right`と`verticalAlign=top|center|bottom`を使います。

シーン上の配置は`x`, `y`, `width`, `height`, `fit`, `rotation`を同じ呼び出しで指定できます。`width`と`height`は対で指定し、`fit`は`contain` / `cover` / `stretch`です。`text_set`で配置変更する際、その文字ソースのscene itemが1個だけなら`textId`だけで自動解決します。同じ文字ソースが複数シーンまたは複数scene itemに置かれている場合は`sceneId`/`sceneName`を指定し、同一シーンに複数ある場合はさらに`sceneItemId`を指定します。

例として、背景付きタイトルを作る場合は次の要素を1回の`text_add`へ渡せます。
```text
sceneId: <scene UUID>
text: "Title"
fontName: "Yu Gothic"
fontSize: 52
bold: true
textColor: "#FFFFFF"
backgroundColor: "#202020"
backgroundOpacity: 80
outline: true
outlineSize: 2
outlineColor: "#000000"
x: 100
y: 100
width: 1000
height: 180
fit: contain
```
## スクリーンショット
`screenshot`はOBSの`GetSourceScreenshot`を使います。`sourceId`/`sourceName`を省略すると現在のProgramシーンを撮ります。既定はPNG、最大1280x720です。
返り値にはメタデータ用text contentに加えて、次のMCP image contentが含まれます。
```text
{ type: "image", data: "<base64>", mimeType: "image/png" }
```
したがってAIは別のファイル読み取りMCPを経由せず、そのツール結果の画像を直接視覚入力として扱えます。画像はPNG/JPEG/WebPの実バイトを検査し、既定8 MiBを超える結果は拒否します。
## 実装済みツール
`obs_status`, `scene_list`, `scene_create`, `scene_delete`, `scene_set_current`, `scene_item_list`, `scene_item_remove`, `scene_item_transform_get`, `scene_item_transform_set`, `scene_item_enabled_set`, `scene_item_index_set`, `input_list`, `input_settings_get`, `input_settings_set`, `input_audio_get`, `input_audio_set`, `audio_mixer_list`, `audio_mixer_get`, `audio_mixer_set`, `audio_mixer_mute_toggle`, `text_add`, `text_info`, `text_set`, `text_remove`, `media_list`, `media_add`, `media_remove`, `media_status`, `media_info`, `media_play`, `media_speed_set`, `media_control`, `media_seek`, `media_play_range`, `media_range_cancel`, `screenshot`。
## 構文確認
```text
node --check server.mjs
node --check src/config.mjs
node --check src/obs-websocket-client.mjs
node --check src/range-playback.mjs
node --check src/tools.mjs
```
`scripts/smoke-obs.mjs`はOBSへの接続と`GetVersion`だけを行う読み取り専用の疎通確認用です。
