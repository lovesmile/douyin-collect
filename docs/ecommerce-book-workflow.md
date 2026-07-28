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

## 二、每日采集某本书带货 TOP5

```powershell
cd C:\Users\10385\Projects\wo\douyin-collect
npm run ecommerce:top10 -- --product "允许一切发生"
```

命令名保留 `ecommerce:top10`，但正式做带货时必须指定具体书名。默认实际只筛选 TOP5。筛选完成后会自动删除未入选的内容目录，避免下载的视频/音频长期占用空间。

指定 `--product` 后，入选样本必须围绕这本书本身做推荐、讲解、种草或带货；教学类内容会自动排除，例如：教程、教学、流程、拆解、干货、副业、自媒体、创业、书单号、读书号、卖书达人、怎么做、起号、变现。

不要把“教你怎么做书单号/卖书达人/图书带货副业”的视频混进带货样本。那类内容最多作为运营研究，不进入每日 TOP5 带货对标库。

入选内容目录会自动改成：

```text
书名或商品名-视频ID
```

例如：

```text
允许一切发生-7546753492188040475
三本好书-7496368575796596004
```

这个命名只用于带货模块；穿戴甲模块仍按原来的 `{aweme_id}` 目录保存。

如果临时需要 TOP10：

```powershell
npm run ecommerce:top10 -- --limit 10
```

默认关键词：

```text
图书带货,好书推荐,童书推荐,教辅推荐,女性成长书单,自我提升书籍
```

注意：正式带货优先使用 `--product` 指定具体书名。泛关键词只适合找选题灵感，不建议作为最终带货样本库。

指定关键词时也要围绕具体书名：

```powershell
npm run ecommerce:top10 -- --product "某本具体书名" --keyword "某本具体书名 图书带货,某本具体书名 读书分享" --duration 60
```

生成结果：

```text
outputs/ecommerce/daily-top10/YYYY-MM-DD
├─ manifest.csv
├─ ecommerce-content-plan.md
├─ 书名或商品名-视频ID/
│  ├─ 视频/图文/音频/关键帧
│  ├─ video-info.txt
│  ├─ analysis.txt
│  └─ voiceover.txt
└─ 其他入选内容目录
```

`voiceover.txt` 是该条对标样本的独立解说词，包含推荐主版本、60 秒完整版、30 秒压缩版、逐段画面对应和合规使用提醒。书单/方法类会额外生成 90 秒长版口播。口播区只放可直接配音的书本/选书讲解，不再混入“怎么拍、怎么生成 AI 画面”的制作说明。每日方案里的“每本书/每个对标样本解说词”会汇总展示，方便你直接复制去配音。

注意：如果样本不是具体单本书，而是“书单/卖书方法/图书带货对标”，解说词会明确提示先替换成你实际要挂车的具体书名；没有目录/商品详情证据时，不编造页码、作者背书、亲测经历或书中具体内容。

## 三、生成某个商品的 10 秒分段提示词

豆包视频只能生成 10 秒，所以长视频按 10 秒分段。单本书默认建议做 60 秒；书单/卖书方法类建议 90 秒以上。30 秒只适合讲一个钩子和一个卖点，不适合讲清一本书，更不适合讲清书单。

正式生成前，尽量准备至少一种真实商品锚点：

- 真实书封照片
- 商品详情页截图
- 商品卡截图
- 你自己整理的中文卖点便签

每段画面都必须保留书名/封面/书脊/商品卡截图/中文卖点便签中的至少一种。不要只生成好看的书桌、咖啡、翻书氛围，否则配音一上去就会有“货不对板”的感觉。

不要让 AI 随机生成英文内页、英文书名或外文段落。没有真实内页素材时，用中文目录便签/中文关键词卡替代；如果必须翻书，书页内容要模糊不可读。

```powershell
npm run ecommerce:segments -- --product "某本书名" --audience "想自我提升但不知道从哪开始的人" --duration 60 --sellingPoint "只讲一个具体卖点"
```

如果只做 30 秒：

```powershell
npm run ecommerce:segments -- --product "某本书名" --audience "新手爸妈" --duration 30 --sellingPoint "只讲一个具体卖点"
```

如果做书单/卖书方法类：

```powershell
npm run ecommerce:segments -- --product "某本书名" --audience "想先建立选书标准的人" --duration 90 --sellingPoint "先按问题选书，而不是看到书单就全买"
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

默认只保留 TOP5 入选目录；未入选下载会被清理。清理脚本会识别纯数字 ID 目录，也会识别 `书名-视频ID` 目录；`candidates.json`、`details.json`、`manifest.csv` 和方案文档会保留。

确定今天要带的书之后：

```powershell
npm run ecommerce:segments -- --product "书名" --audience "目标人群" --duration 60 --sellingPoint "只讲一个具体卖点"
```

最后按 `segments` 目录里的提示词，去豆包分 3 次生成 10 秒视频，再按 `stitching-guide.md` 拼接。
