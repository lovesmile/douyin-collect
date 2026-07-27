# 低机位自拍感穿戴甲图生成流程

目标效果：前景是一只真实手部近距离展示甲片，背景是一位虚化女生和室内自拍氛围。甲片必须来自真实上手图，不能让模型重画。

## 正式流程

1. 实拍前景手部。
2. 用豆包生成“虚化模特自拍背景”，但明确禁止生成前景手、指甲、甲片。
3. 下载背景图。
4. 用本地脚本把真实手部叠加到背景上。
5. 质检：甲片不变、背景虚化、透视合理、没有多手/畸形手。

## 生成豆包背景提示词

```powershell
cd C:\Users\10385\Projects\wo\douyin-collect
npm run doubao:selfie-bg-prompt -- --out "C:\Users\10385\Projects\wo\outputs\ai-image-test\selfie-bokeh-prompts"
```

生成后复制：

```text
C:\Users\10385\Projects\wo\outputs\ai-image-test\selfie-bokeh-prompts\doubao-selfie-background-prompt.txt
```

## 本地合成

单张背景：

```powershell
python scripts\compose-selfie-bokeh.py --hand "C:\path\to\real-hand.png" --background "C:\path\to\doubao-bg.png" --out "C:\path\to\out"
```

如果前景手部位置不合适，可以调参数：

```powershell
python scripts\compose-selfie-bokeh.py --hand "C:\path\to\real-hand.png" --background "C:\path\to\doubao-bg.png" --out "C:\path\to\out" --scale 1.15 --x 0.52 --y 0.70
```

## 前景手部怎么拍

- 手机 0.5x 或 1x，竖屏。
- 手离镜头 10-20cm，甲片必须清晰对焦。
- 背景最好是白墙、灰布、纯色板，方便抠图。
- 手指往镜头方向伸，模仿“把甲片怼到镜头前”的透视。
- 每个款式至少拍 5 张：张开手、食指伸出、两指伸出、侧面弧度、甲面微距。

## 质检标准

任意一条失败就不用：

- 甲片颜色、渐变、钻饰、猫眼光泽是否保持真实？
- 前景手部边缘是否干净？有没有白边或硬贴感？
- 背景人物是否足够虚化？有没有清晰手、指甲、甲片？
- 前景手和背景人物的比例、透视、光线是否像同一张手机照片？
- 图上是否出现文字、水印、logo 或 AI 字样？

## 结论

这类图不要让豆包生成整张。豆包只负责“虚化自拍背景”，真实手部和甲片必须用本地合成锁住。
