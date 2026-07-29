# 评分计算规则

## 四维权重

权重在 `config/profile.json` 中配置，默认值：

| 维度 | Key | 默认权重 | 说明 |
|:---|:---|:---|:---|
| 实操价值 | practical | 0.3 | 最高——普通人能不能上手用 |
| 账号匹配度 | fit | 0.3 | 最高——对非技术背景学习者有没有用 |
| 信息增量 | novelty | 0.25 | 中等 |
| 深度 | depth | 0.15 | 最低——不要硬核技术深扒 |

权重无需加和等于 1，会自动归一化。

## 总分计算

```
total = practical × W_practical + novelty × W_novelty + depth × W_depth + fit × W_fit
weightSum = W_practical + W_novelty + W_depth + W_fit
score = round((total / weightSum) × 10) / 10
```

分数范围：1.0 ~ 5.0

## 分数展示

- `★ ≥ 4.5`：绿色——强烈推荐
- `★ ≥ 3.5`：蓝色——值得一看
- `★ < 3.5`：灰色——一般

## 代码层硬约束

- GitHub 代码仓库（标题含 `/`），`fit` 不超过 2
