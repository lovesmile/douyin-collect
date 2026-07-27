# Douyin Collect Pipeline

这是一套可复用的抖音穿戴甲素材采集、下载、筛选、拆解和账号运营分析流水线。目标不是单纯存视频，而是把爆款内容拆成你自己的账号可以复拍、复测、复用的内容资产。

## 能力

流水线分成可断点续跑的阶段：

1. 启动带 CDP 调试端口的 Edge，复用本机登录态。
2. 搜索一个或多个关键词，采集候选 `aweme_id`。
3. 进入详情页补全标题、点赞、粉丝、发布时间等信息。
4. 下载视频，或下载图文正文图片和配套音频。
5. 按规则筛选并按点赞数降序排序。
6. 每条内容按视频 ID 分目录，生成 `video-info.txt` 和详细 `analysis.txt`。
7. 视频自动抽首、中、尾 3 张关键帧。
8. 校验样本完整性。
9. 生成穿戴甲账号运营方案。
10. 支持每天采集热门 TOP10，并生成当天可执行的内容制作方案。

默认筛选规则：

- 近 90 天。
- 点赞不少于 1,000。
- 作者粉丝少于 50,000。
- 点赞数降序。
- 图文只保留正文图：图片 URL 必须包含 `biz_tag=aweme_images`，并且页面渲染宽度大于 500 px。
- 图文必须保存 `audio.mp3`。
- 每条有效内容独立保存到 `{aweme_id}` 目录。

## 一次性完整采集

先关闭 Edge，然后启动带调试端口的 Edge：

```powershell
cd C:\Users\10385\Projects\wo\douyin-collect
npm run edge
```

运行完整流水线：

```powershell
npm run pipeline -- --keyword "穿戴甲,显白美甲,猫眼穿戴甲,短甲穿戴甲,新中式穿戴甲" --out "C:\Users\10385\Projects\wo\outputs\collect\2026-07-26-wearable-nail" --target 150 --limit 80
```

## 每日热门 TOP10

```powershell
npm run daily:top10
```

默认输出到：

```text
C:\Users\10385\Projects\wo\outputs\collect\daily-top10\YYYY-MM-DD
```

也可以手动指定：

```powershell
npm run daily:top10 -- --date 2026-07-26 --limit 10 --target 80
```

每天运行后会额外生成：

```text
daily-content-plan.md
```

这份文件会直接给出当天建议拍摄的 3 条视频、1 组图文、每条的镜头脚本、首帧字幕、标题备选、标签、AI 图文提示词和发布顺序。

## 分阶段运行

采候选：

```powershell
npm run collect:search -- --keyword "穿戴甲,显白美甲,猫眼穿戴甲" --out "..\outputs\collect\run-001\candidates.json" --target 150
```

下载详情和媒体：

```powershell
npm run collect:details -- --in "..\outputs\collect\run-001\candidates.json" --out "..\outputs\collect\run-001"
```

生成清单和逐条拆解：

```powershell
npm run manifest -- --out "..\outputs\collect\run-001" --limit 50 --min-likes 1000 --max-followers 50000 --days 90
```

抽关键帧：

```powershell
npm run frames -- --out "..\outputs\collect\run-001"
```

校验：

```powershell
npm run validate -- --out "..\outputs\collect\run-001" --expected 50
```

生成账号运营方案：

```powershell
npm run ops:report -- --out "..\outputs\collect\run-001"
```

只根据已生成的 TOP10 生成当天制作方案：

```powershell
npm run daily:brief -- --out "..\outputs\collect\daily-top10\2026-07-26"
```

## 输出结构

```text
outputs/collect/{run}/
  candidates.json
  details.json
  manifest.csv
  _index.md
  account-ops-plan.md
  daily-content-plan.md
  {aweme_id}/
    {aweme_id}.mp4
    frames/frame-01.jpg
    frames/frame-02.jpg
    frames/frame-03.jpg
    video-info.txt
    analysis.txt
  {aweme_id}/
    images/image-01.webp
    images/image-02.webp
    audio.mp3
    video-info.txt
    analysis.txt
```

## 运营拆解口径

每条 `analysis.txt` 会尽量回答这些问题：

- 它为什么可能爆？
- 首屏和前 3 秒怎么设计？
- 镜头顺序怎么复拍？
- 光线、背景、手势怎么拍？
- 标题和标签怎么改成自己的？
- AI 图文怎么生成？
- 对 1000 播左右的小账号，下一条该复用什么变量？

## 注意

- 所有浏览器操作都走本机 Edge 登录态，账号 Cookie 不离开本机。
- 抖音页面结构经常变化，若下载失败，先重新启动 `npm run edge` 再从失败阶段续跑。
- `details.json` 会每采一条就更新，长任务中断后可以继续。
- 音频转换、抽帧和校验依赖 `ffmpeg` / `ffprobe`。
