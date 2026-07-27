# 抖音书本/书单带货工作流

这个模块和穿戴甲模块分开运行，不会影响原来的 `daily:top10`、`daily:brief`、`brand:model-prompt` 等任务。

带货模块默认输出目录：

```text
C:\Users\10385\Projects\wo\outputs\ecommerce
```

穿戴甲模块仍然输出到：

```text
C:\Users\10385\Projects\wo\outputs\collect\daily-top10
```

## 一、为什么先做书本/书单

你目前不一定购买了实物，所以第一阶段不建议做食品、护肤、家电这类强依赖实拍/试用证明的商品。

书本、书单、教辅、工具书更适合先做，因为可以围绕：

- 适合谁
- 解决什么问题
- 目录/关键词
- 观点拆解
- 阅读场景
- 书单选择建议

但要注意：如果没有买、没有读完，不要说“我亲测”“我读完”“我用了一个月”“真的有效”。

安全说法是：

```text
从目录/商品信息看，它更适合……
这本书主打解决……
如果你正在遇到这个问题，可以先了解这本。
别急着买，先看目录是不是你需要的。
```

## 二、每日采集书本带货 TOP5

```powershell
cd C:\Users\10385\Projects\wo\douyin-collect
npm run ecommerce:top10
```

命令名保留 `ecommerce:top10`，但默认实际只筛选 TOP5。筛选完成后会自动删除未入选的数字内容目录，避免下载的视频/音频长期占用空间。

如果临时需要 TOP10：

```powershell
npm run ecommerce:top10 -- --limit 10
```

默认关键词：

```text
书单推荐,图书带货,好书推荐,童书推荐,教辅推荐,女性成长书单,自我提升书籍
```

指定关键词：

```powershell
npm run ecommerce:top10 -- --keyword "育儿书推荐,童书带货,亲子阅读" --duration 30
```

生成结果：

```text
outputs/ecommerce/daily-top10/YYYY-MM-DD
├─ manifest.csv
├─ ecommerce-content-plan.md
├─ 入选内容的视频/图文/音频/关键帧
└─ 入选内容的 video-info.txt / analysis.txt
```

## 三、生成某个商品的 10 秒分段提示词

豆包视频只能生成 10 秒，所以长视频按 10 秒分段：

```powershell
npm run ecommerce:segments -- --product "某本书名" --audience "想自我提升但不知道从哪开始的人" --duration 30
```

60 秒：

```powershell
npm run ecommerce:segments -- --product "某本书名" --audience "新手爸妈" --duration 60
```

输出：

```text
outputs/ecommerce/content-jobs/YYYY-MM-DD-商品名
├─ segments
│  ├─ segment-01-doubao-prompt.txt
│  ├─ segment-02-doubao-prompt.txt
│  └─ segment-03-doubao-prompt.txt
├─ stitching-guide.md
├─ publish-script.md
├─ compliance-check.md
└─ job.json
```

## 四、分段视频如何接上

核心原则：

1. 第 1 段生成完，截取最后 1 帧。
2. 第 2 段生成时，把第 1 段最后 1 帧作为参考图。
3. 第 2 段生成完，再截取最后 1 帧给第 3 段。
4. 所有段保持同一本书、同一书桌、同一灯光、同一人物局部、同一镜头风格。

每段提示词都会写清楚：

```text
本段必须接续上一段最后一帧。
保持同一本书、同一书桌、同一灯光、同一人物手部/肩颈局部、同一镜头焦段和色调。
不要突变场景，不要突然换人、换衣服、换房间。
```

## 五、合规检查

检查一段文案：

```powershell
npm run compliance:check -- --text "我亲测这本书100%有效，看完必逆袭"
```

检查某个文件：

```powershell
npm run compliance:check -- --file "C:\path\to\script.md"
```

重点避免：

- 虚假个人体验：我亲测、我读完、我用了一个月
- 绝对化效果：100%有效、必逆袭、一定改变人生
- 虚假稀缺/价格：全网最低、最后一天、只剩几单
- 伪造背书：专家推荐、销量第一、好评率100%
- 教育/成长夸大：孩子立刻变自律、成绩马上提升、包过

## 六、推荐日常流程

每天：

```powershell
npm run ecommerce:top10 -- --keyword "书单推荐,好书推荐,图书带货"
```

然后打开：

```text
outputs/ecommerce/daily-top10/YYYY-MM-DD/ecommerce-content-plan.md
```

默认只保留 TOP5 入选目录；未入选下载会被清理，`candidates.json`、`details.json`、`manifest.csv` 和方案文档会保留。

确定今天要带的书之后：

```powershell
npm run ecommerce:segments -- --product "书名" --audience "目标人群" --duration 30
```

最后按 `segments` 目录里的提示词，去豆包分 3 次生成 10 秒视频，再按 `stitching-guide.md` 拼接。
