# 豆包 4.5 穿戴甲图文工作流

这条流程用于把真实穿戴甲上手图做成更高级的图文封面和场景图。

当前测试结论：

- 豆包「图片生成」模式 + 默认模型 4.5 有时能基本保留甲片。
- 但如果背景生成了人物、模特、脸、身体或第二只手，即使甲片没变，也判定失败。
- 正式稳定流程优先使用「豆包生成空静物背景 + 本地抠图合成」，因为甲片像素不会被重绘。

## 路线 A：豆包 4.5 直出保真图

适合快速测试，不作为唯一正式流程。

1. 准备真实上手图，优先白底、灰底、浅色桌面或干净背景。
2. 打开豆包，进入「图片生成」模式。
3. 模型选择默认模型 4.5。
4. 把真实上手图直接粘贴到输入框。
5. 使用 `npm run doubao:45-prompt` 生成的 `doubao-45-direct-preserve-prompt.txt`。
6. 生成后逐张质检。

生成提示词：

```powershell
cd C:\Users\10385\Projects\wo\douyin-collect
npm run doubao:45-prompt -- --out "C:\Users\10385\Projects\wo\outputs\ai-image-test\doubao-45-prompts" --style "温柔显白穿戴甲" --scene "浅米色丝绸、珍珠、小包局部、杂志纸、咖啡杯、柔和自然窗光、浅景深"
```

## 路线 B：空静物背景 + 本地合成

这是正式稳定路线。

1. 用 `fallback-empty-background-prompt.txt` 让豆包只生成空背景。
2. 背景只能有丝绸、珍珠、小包、杂志、咖啡杯、桌面等静物。
3. 背景中不能有手、指甲、人物、模特、脸、身体、手臂、人体轮廓。
4. 下载豆包背景图。
5. 用本地脚本把真实手部主体叠加到背景上。

单张背景合成：

```powershell
python scripts\compose-ai-scene.py --subject "C:\path\to\real-hand.png" --background "C:\path\to\doubao-empty-bg.png" --out "C:\path\to\image-pack" --title "这套真的显白到发光"
```

多张背景批量合成：

```powershell
python scripts\compose-ai-scene.py --subject "C:\path\to\real-hand.png" --background-dir "C:\path\to\doubao-backgrounds" --out "C:\path\to\image-pack" --title "这套真的显白到发光"
```

没有豆包背景时，用内置背景先出测试图：

```powershell
python scripts\compose-ai-scene.py --subject "C:\path\to\real-hand.png" --out "C:\path\to\image-pack" --title "这套真的显白到发光"
```

## 质检标准

任意一项不通过，就不要使用直出图：

- 手指数量是否与原图一致？
- 每个甲片的甲型、长度、弧度是否一致？
- 甲面颜色、渐变、猫眼、钻饰、蝴蝶结、金属件是否一致？
- 钻饰位置、数量、大小是否明显变化？
- 是否出现畸形手、粘连手指、皮肤塑料感？
- 背景里是否出现人物、模特、脸、身体、手臂、第二只手或虚幻人像？
- 手部和背景透视、光线、比例是否匹配？是否像硬贴上去的？
- 图片上是否出现文字、logo、水印或 AI 字样？

## 发布结构

- 第 1 张：通过质检的氛围封面。
- 第 2 张：原始真实上手图，增强信任感。
- 第 3 张：甲面微距，展示钻饰、猫眼、边缘、厚薄。
- 第 4 张：生活静物场景，拿杯子、小包、书、衣服。
- 第 5 张：选款理由，写 3 个点：显白、好搭、适合谁。

注意：对外图片和发布文案不要出现 AI 字样。内部流程可以记录模型和生成方法，但成图不要暴露。
