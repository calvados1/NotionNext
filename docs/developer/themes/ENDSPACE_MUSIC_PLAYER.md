# Endspace 音乐播放器维护

Endspace 在桌面导航和移动菜单中使用 `EndspacePlayer`。播放器通过同源 `/api/meting` 获取歌单；歌单查询成功和浏览器实际播放成功是两个独立的检查项。

## 相关文件

- `themes/endspace/components/EndspacePlayer.js`：播放状态、切歌、音量与播放器界面。
- `themes/endspace/components/music.js`：歌单请求 URL 和音频条目格式转换。
- `pages/api/meting.js`：服务端网易云歌单代理和内存缓存。
- `lib/utils/neteaseMusic.js`：歌曲 ID 提取和歌曲数据转换。
- `conf/widget.config.js`：播放器默认配置及环境变量。

## 配置

以下配置也可在 Notion 网站配置中维护：

| 配置项 | 用途 |
| --- | --- |
| `MUSIC_PLAYER` | 启用播放器 |
| `MUSIC_PLAYER_METING` | 启用平台歌单查询 |
| `MUSIC_PLAYER_METING_API` | 同源接口地址，默认 `/api/meting` |
| `MUSIC_PLAYER_METING_SERVER` | 音乐平台标识；当前内置代理实现使用网易云 |
| `MUSIC_PLAYER_METING_ID` | 歌单 ID |
| `MUSIC_PLAYER_AUDIO_LIST` | 默认音频列表 |
| `MUSIC_PLAYER_ORDER` | 顺序或随机播放 |

环境变量名称见 `conf/widget.config.js`，例如 `NEXT_PUBLIC_MUSIC_PLAYER_METING_ID`。公开环境变量的变更需要重新构建客户端；Notion 配置的刷新走现有站点缓存机制。

## 请求与缓存

客户端请求示例：

```text
/api/meting?server=netease&type=playlist&id=12927716304
```

服务端先查询网易云歌单中的歌曲 ID，再分批查询歌曲详情，并保持歌单顺序。接口返回歌曲名称、歌手、音频地址、封面和歌词字段，播放器将其转换为音频列表。

代理按歌单 ID 使用 30 分钟进程内缓存。容器或进程重启会丢失此缓存，不需要部署数据库。

## 故障定位

1. 检查浏览器是否发起 `/api/meting` 请求，确认接口返回非空歌曲数组。
2. 如果接口失败，检查服务器访问网易云接口的网络情况及应用日志；同时确认歌单 ID 正确、歌单可访问。
3. 如果歌单正常但不能播放，检查浏览器对具体音频 URL 的请求和媒体错误。上游歌曲下架、访问限制或不可用的媒体地址都可能导致播放失败。
4. 检查浏览器自动播放限制，优先通过用户点击播放按钮验证。不要把自动播放被阻止误判为歌单接口故障。
5. 修改播放器实现后，分别验证桌面导航和移动菜单中的播放、暂停、上一首、下一首及歌单展示。

返回 [Endspace 主题文档](./ENDSPACE.md)。
