# 游戏音效

以下录音样本来自 [Kenney](https://kenney.nl/)，每个音效提供 OGG 和 MP3 两种格式。均为单声道、44.1 kHz，峰值为 -1 dBFS。

| 游戏文件（`.ogg` / `.mp3`） | 来源包 | 原文件名 | 下载页 |
| --- | --- | --- | --- |
| `collide` | Impact Sounds | `impactSoft_medium_004` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `merge` | Interface Sounds | `pluck_002` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `shatter` | Impact Sounds | `impactMining_001` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `alarm` | Interface Sounds | `question_002` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `win` | Music Jingles | `jingles_PIZZI10` | [Music Jingles](https://kenney.nl/assets/music-jingles) |

`alarm` 已补齐为 0.60 秒固定周期，首尾归零，可直接循环播放。

许可：[CC0 1.0 公共领域贡献](https://creativecommons.org/publicdomain/zero/1.0/)。无需署名；感谢 Kenney 提供这些音效素材。

首次解锁音频时加载样本；支持 Vorbis 时选用 OGG，否则选用 MP3。样本尚未就绪或加载失败时，游戏使用原有合成音效作为回退。
