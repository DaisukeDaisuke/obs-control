# OBS Control MCP
Node.js 22+だけで動作する、OBS Studio / obs-websocket v5向けのstdio MCPサーバーです。外部npm依存はありません。
## 主用途
- Media Sourceをローカル動画またはネットワーク入力から作成し、シーンへ配置する
- `mediaId`で再生、一時停止、停止、再開、絶対/相対seekを行う
- `media_play`で通常再生し、任意で開始位置と1〜200%の再生速度を同時指定する
- `media_speed_set`で既存Media Sourceの再生速度を変更する
- `media_info`でソース、再生状態、速度、音声、表示状態、全シーン配置をまとめて取得する
- `media_play_range`で`startMs`から`endMs`までの指定区間だけを再生する
- シーン/入力/シーンアイテムを作成・列挙・削除・配置・表示切替する
- OBSのシーンまたは入力をスクリーンショットし、MCPの`image` contentとしてAIへ直接返す
## IDの扱い
独自IDファイルは持ちません。OBS自身のUUIDをそのまま使用します。
- `sceneId` = OBS `sceneUuid`
- `mediaId` / `inputId` = OBS `inputUuid`
- `sceneItemId` = OBSのシーン内数値ID
そのためMCPプロセスを再起動しても、OBS側の実体が残っている限り同じUUIDを再利用できます。
## 必要条件
OBS StudioでWebSocketサーバーを有効にしてください。obs-websocket v5の標準ポートは`4455`です。
```text
OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
OBS_WEBSOCKET_PASSWORD=<OBSで設定したパスワード>
```
認証を無効にしている場合、`OBS_WEBSOCKET_PASSWORD`は不要です。パスワードはコマンドライン引数ではなく環境変数で渡します。
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
`media_play_range`は任意の`speedPercent`を先に適用でき、その後`startMs`へseekして再生し、OBSが報告する実際の`mediaCursor`を既定50ms間隔で監視します。`endMs`へ到達すると、既定では一時停止して正確に`endMs`へseekします。再生開始直後の一時的な`STOPPED`/`NONE`状態で監視を誤終了しないよう起動猶予も持たせています。
```text
mediaId: <media_addが返したUUID>
startMs: 12000
endMs: 18500
endAction: pause
```
このツール自体は即座に返ります。区間終端の監視はMCPサーバープロセス内で継続します。手動操作へ切り替える場合は`media_range_cancel`を使います。`media_control`と`media_seek`を明示的に呼んだ場合も、そのmediaIdの区間監視は解除されます。
## 通常再生・速度・メディア情報
通常再生には`media_play`を使えます。`startMs`を省略すると現在位置から、`speedPercent`を省略すると現在の速度のまま再生します。両方指定した場合はOBSのMedia Sourceへ速度設定を適用し、開始位置へseekしてから再生します。
`media_speed_set`は1〜200の`speedPercent`を受け付けます。OBS本体のMedia Source実装では速度変更時にメディア再初期化が行われるため、区間再生監視は解除してから設定します。
`media_info`は、`mediaId`/`mediaName`、ローカルファイルまたはネットワークURL、Media Source設定、`mediaState`、`mediaDuration`、`mediaCursor`、`speedPercent`、loop/seekable、mute/volume、Program/UI表示状態、配置されている全シーンと各`sceneItemId`/transformをまとめて返します。
## スクリーンショット
`screenshot`はOBSの`GetSourceScreenshot`を使います。`sourceId`/`sourceName`を省略すると現在のProgramシーンを撮ります。既定はPNG、最大1280x720です。
返り値にはメタデータ用text contentに加えて、次のMCP image contentが含まれます。
```text
{ type: "image", data: "<base64>", mimeType: "image/png" }
```
したがってAIは別のファイル読み取りMCPを経由せず、そのツール結果の画像を直接視覚入力として扱えます。画像はPNG/JPEG/WebPの実バイトを検査し、既定8 MiBを超える結果は拒否します。
## 実装済みツール
`obs_status`, `scene_list`, `scene_create`, `scene_delete`, `scene_set_current`, `scene_item_list`, `scene_item_remove`, `scene_item_transform_get`, `scene_item_transform_set`, `scene_item_enabled_set`, `scene_item_index_set`, `input_list`, `input_settings_get`, `input_settings_set`, `input_audio_get`, `input_audio_set`, `media_list`, `media_add`, `media_remove`, `media_status`, `media_info`, `media_play`, `media_speed_set`, `media_control`, `media_seek`, `media_play_range`, `media_range_cancel`, `screenshot`。
## 構文確認
```text
node --check server.mjs
node --check src/obs-websocket-client.mjs
node --check src/range-playback.mjs
node --check src/tools.mjs
```
`scripts/smoke-obs.mjs`はOBSへの接続と`GetVersion`だけを行う読み取り専用の疎通確認用です。
