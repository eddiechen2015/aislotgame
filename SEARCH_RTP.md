# searchRtp.ts 工作原理

本文档说明 `src/simulator/searchRtp.ts` 的设计目的、核心流程、候选参数空间、评分逻辑和输出结果。它面向需要继续调 RTP、审查数学模型或把搜索结果接入 profile 验证流程的工程师。

## 1. 目标定位

`searchRtp.ts` 是一个自动搜索 RTP 参数的 Monte Carlo 工具。它不会穷举全部数学空间，也不是最终认证工具；它的职责是快速产生一批更接近目标数学指标的候选 math profile。

它主要解决的问题是：

- 总 RTP 接近 profile target。
- base RTP / free-spin RTP split 接近目标拆分。
- hit frequency 接近目标。
- free-spin frequency 接近目标。
- volatility，也就是 `stdDevX`，接近目标。
- max win 不超过 profile 中定义的 hard upper bound。

搜索完成后，它会输出两个 artifact：

- `artifacts/searchRtp.latest.json`：完整搜索报告，包含输入参数、目标、评分权重、top candidates 和 per-seed metrics。
- `artifacts/searchRtp.bestCandidate.mathProfile.json`：当前最佳候选 profile，可继续用 `sim:verify-batch` 做更大样本验证。

## 2. 运行方式

命令：

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

参数顺序：

1. `coarseSamples`：粗搜候选数量。
2. `refineSamples`：精搜候选数量。
3. `coarseSpins`：每个粗搜候选、每个 seed 的模拟局数。
4. `refineSpins`：每个精搜候选、每个 seed 的模拟局数。
5. `market`：结算市场，例如 `MGA`。
6. `seed`：搜索过程的主随机种子。
7. `verifySpins`：最终入围候选、每个 seed 的验证局数。
8. `workerCount`：可选，候选评估并行 worker 数。未传时使用 `SIM_SEARCH_WORKERS` 或可用 CPU 并行度。

脚本内部固定使用三层 seed 策略：

- coarse 阶段：每个候选 1 个 seed。
- refine 阶段：每个候选 2 个 seeds。
- verify 阶段：每个 finalist 5 个 seeds。

同一个阶段内所有候选使用同一组 deterministic seeds，也就是 common
random numbers。这样候选之间的比较噪声更低，排名更稳定。

这不是最终数学认证样本量，只是为了在搜索阶段降低单 seed 偶然性。

## 3. 输入来源

脚本读取的主要配置来自以下模块：

- `src/engine/config.ts`
- `src/engine/mathProfile.ts`
- `src/engine/mathRuntime.ts`
- `src/engine/spinEngine.ts`
- `src/settlement/settleSpin.ts`

其中 `DEFAULT_MATH_PROFILE_TARGETS` 是评分目标的唯一来源。当前搜索不会再使用脚本内硬编码的 RTP 区间，例如旧版的 `rtp < 0.90` 或 `fsFreq > 0.011` 这类经验阈值。

目标结构包括：

```ts
{
  rtp: { target, tolerance },
  baseRtp: { target, tolerance },
  fsRtp: { target, tolerance },
  hitFreq: { target, tolerance },
  fsFreq: { target, tolerance },
  stdDevX: { target, tolerance },
  maxWinX: { max }
}
```

这意味着搜索器、verify 脚本和 profile metadata 使用同一套数学目标口径。

## 4. 候选参数模型

脚本中的 `Candidate` 表示一个待测试的数学参数候选。它不是完整 runtime config，而是一组相对基准配置的变更参数。

### 4.1 Base Paytable Scales

`basePayScales` 是逐符号 paytable 缩放：

```ts
Record<PayKey, number>
```

覆盖的符号包括：

- `A`
- `K`
- `Q`
- `J`
- `10`
- `NINJA`
- `DRAGON`
- `PHOENIX`
- `SHOGUN`

每个符号的 3/4/5 连赔付都会乘以同一个 scale。这样比旧版的 `lowScale` / `premiumScale` 更细，可以单独调某个低赔或高赔符号对 RTP、hit value、volatility 的影响。

### 4.2 Free-Spin Paytable Scales

`freeSpinPayScales` 与 `basePayScales` 结构相同，但只作用于 free spins 的 paytable。

这让搜索器可以独立调整 base game 和 free-spin feature 的价值分布，从而更容易同时收敛：

- total RTP
- base RTP
- FS RTP
- volatility

### 4.3 Scatter Pay Scales

`scatterScales` 对 3、4、5 个 scatter 的 base-game scatter pay 分别缩放：

```ts
{
  3: number,
  4: number,
  5: number
}
```

拆分 3/4/5 scatter scale 的原因是：

- 3 scatter 主要影响触发附近的常见 scatter pay。
- 4 scatter 和 5 scatter 更偏向尾部收益。
- 单一 scatter scale 会把常见事件和稀有事件绑死，调参自由度不够。

### 4.4 Base Reel Count Deltas

base game reel 使用以下 delta：

- `scatterOuterDelta`
- `scatterInnerDelta`
- `scatterCenterDelta`
- `wildDelta`
- `premiumDelta`

scatter delta 按 reel 位置分组：

- reel 1 和 reel 5 使用 `scatterOuterDelta`
- reel 2 和 reel 4 使用 `scatterInnerDelta`
- reel 3 使用 `scatterCenterDelta`

这种分组比逐 reel 全量搜索更小，但仍能控制 scatter 组合概率。由于 scatter trigger 需要跨 5 reel 分布，中心 reel 和两侧 reel 的 scatter 权重对 FS frequency 有不同影响。

`wildDelta` 影响 base game 的 wild 数量，主要影响：

- hit frequency
- ways expansion
- wild multiplier exposure
- volatility

`premiumDelta` 同时调整高赔符号数量，主要影响：

- premium hit contribution
- tail win
- RTP split

### 4.5 Free-Spin Reel Count Deltas

free spins 有独立的一组 reel delta：

- `freeSpinScatterOuterDelta`
- `freeSpinScatterInnerDelta`
- `freeSpinScatterCenterDelta`
- `freeSpinWildDelta`
- `freeSpinPremiumDelta`

这些参数从 `FREE_SPIN_REEL_SYMBOL_COUNTS` 出发，而不是从 base reel counts 出发。也就是说，搜索器正式支持 FS 专属 reel set。

这点很重要：如果搜索时仍复用 base reel 作为 FS 基线，搜索得到的 profile 会与运行时实际数学模型不一致。

## 5. 从 Candidate 到 RuntimeMathConfig

核心函数是：

```ts
buildCandidateConfig(candidate: Candidate): RuntimeMathConfig
```

它把相对参数转换成引擎可直接运行的完整 `RuntimeMathConfig`。

执行步骤：

1. clone base symbols。
2. 对 base paytable 应用 `basePayScales`。
3. 对 scatter pay 应用 `scatterScales`。
4. clone free-spin symbols。
5. 对 free-spin paytable 应用 `freeSpinPayScales`。
6. 从 `REEL_SYMBOL_COUNTS` 生成 base reel counts。
7. 从 `FREE_SPIN_REEL_SYMBOL_COUNTS` 生成 free-spin reel counts。
8. 应用 scatter/wild/premium deltas。
9. 对低赔符号做 rebalance，保持每个 reel 的 total count 不变。
10. 返回完整 runtime math config。

保持 reel total count 不变的原因是：如果只增减某些符号但不回填，reel 长度会变化，很多概率变化会混在一起，难以判断是符号分布变化还是 reel length 变化导致的。

## 6. 低赔符号 Rebalance

当脚本增加 scatter、wild 或 premium symbol 后，reel 总数可能超过基准总数。反过来，如果减少这些符号，reel 总数可能低于基准总数。

`rebalanceLowCounts` 会用低赔符号吸收这个差额：

- 如果当前 reel count 超过目标总数，就从数量最多且大于 1 的低赔符号中扣减。
- 如果当前 reel count 低于目标总数，就按照基准低赔权重排序补回低赔符号。

这样做的含义是：搜索器把 low symbols 当成概率缓冲区，让关键调参集中在 scatter、wild、premium 和 paytable 上。

## 7. 候选生成策略

搜索分为两个候选生成模式。

### 7.1 粗搜

当 `sampleCandidate(rng)` 没有传入 anchor 时，它会生成全新的随机候选。

粗搜负责覆盖较大的参数空间：

- base low pay scale 范围较低。
- base premium pay scale 范围较宽。
- FS pay scale 范围更宽。
- scatter scale 分别随机。
- base/FS reel deltas 在指定整数区间中随机。

粗搜目标不是精确命中，而是找到相对有潜力的区域。

### 7.2 精搜

当 `sampleCandidate(rng, anchor)` 传入 anchor 时，它会围绕已有优秀候选做局部扰动。

精搜会：

- 对 pay scales 做小半径浮动。
- 对 scatter scales 做小半径浮动。
- 对 reel deltas 做 `-1/0/+1` 的整数扰动。

这样可以在粗搜找到的区域附近继续逼近目标。

## 8. 三阶段搜索流程

`main()` 中的流程是：

1. coarse search
2. refine search
3. verify finalists
4. 写报告和候选 profile

coarse 和 refine 阶段都使用 adaptive racing。每一阶段先用较小 spins
budget 评估全部候选，淘汰明显落后的候选，再用更大 spins budget 重新
评估 survivor。这样可以把计算量集中在更有希望的候选上。

### 8.1 Coarse Search

粗搜循环：

```ts
candidates = sample coarseSamples candidates
race candidates through coarseBudgets with shared coarseSeeds
```

然后按 `score` 从低到高排序，取 top 10。`coarseBudgets` 默认由
`coarseSpins` 的 25%、50%、100% 构成。

### 8.2 Refine Search

精搜取 coarse top 5 作为 anchors。

```ts
anchors = coarseTop.slice(0, 5)
generate refine candidates around anchors
race candidates through refineBudgets with shared refineSeeds
```

然后按 `score` 排序，取 top 10。`refineBudgets` 默认由 `refineSpins`
的 40%、100% 构成。

### 8.3 Verify Finalists

最终验证 refine top 5：

```ts
for candidate in refineTop.slice(0, 5):
  result = evaluateCandidate(candidate, verifySpins, 5 seeds)
```

这里的 verify 仍然是搜索器内部的 finalist recheck，不等同于正式 profile verification。正式验证仍应使用：

```bash
npm run sim:verify-batch -- artifacts/searchRtp.bestCandidate.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/candidate.verifyBatch
```

## 9. Seed 策略

脚本用 `stageSeedSet` 为不同阶段生成 deterministic seeds：

```ts
first = baseSeed + stageOffset
seed[index] = first + index * 101
```

设计目的：

- 同一个命令参数可以复现同一轮搜索。
- 同阶段候选共享 seed 集，形成 common random numbers，降低候选比较噪声。
- refine 和 verify 阶段通过 `stageOffset` 避免与 coarse 阶段重叠。
- 多 seed 可以暴露候选对随机波动的敏感性。

注意：搜索阶段的多 seed 不是为了消灭 Monte Carlo noise，而是为了降低明显的单 seed 偶然排名。

## 10. 并行执行

`sim:search` 可以用 `worker_threads` 并行评估候选：

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

最后一个参数 `4` 表示最多 4 个 worker。也可以通过环境变量设置：

```bash
SIM_SEARCH_WORKERS=4 npm run sim:search -- 120 80 5000 20000 MGA 42 50000
```

在小样本 smoke test 中，worker 启动开销可能比计算本身更大；在真实
search 或大样本 verification 中，并行收益会更明显。

## 11. 候选评估过程

核心函数：

```ts
evaluateCandidate(candidate, spins, seeds, market)
```

执行逻辑：

1. 用 `buildCandidateConfig(candidate)` 生成 runtime math config。
2. 用 `withRuntimeMathConfig` 临时安装这套 config。
3. 对每个 seed 调用 `evaluateCandidateSeed`。
4. 聚合 per-seed metrics。
5. 计算 score。

`withRuntimeMathConfig` 的作用是把候选 config 安装到引擎运行时，让 `playRound`、reel generator、ways evaluator 和 settlement 都在同一套候选数学参数下运行。

每个 seed 的模拟逻辑：

```ts
rng = mulberry32(seed)
for spin in spins:
  raw = playRound(1, rng)
  result = settleSpinResult(raw, market)
  accumulate metrics
```

固定 bet 为 `1`，所以 total win 直接等价于 win x bet。

## 12. 指标计算

每个 seed 会得到一组 `CandidateStats`：

```ts
{
  seed,
  rtp,
  baseRtp,
  fsRtp,
  hitFreq,
  fsFreq,
  maxWinX,
  stdDevX
}
```

### 11.1 RTP

```ts
rtp = totalWin / spins
```

因为每局 bet 固定为 1，所以这里等价于：

```ts
totalWin / totalBet
```

### 11.2 Base RTP

```ts
baseRtp = baseWin / spins
```

其中：

```ts
baseWin += result.base.cascadeWin + result.base.scatterPay
```

也就是说，base RTP 包含 base cascade wins 和 base scatter pay。

### 11.3 Free-Spin RTP

```ts
fsRtp = fsWin / spins
```

`fsWin` 只统计 free-spin feature 内的 total win。

### 11.4 Hit Frequency

```ts
hitFreq = hits / spins
```

只要整局 `totalWin > 0`，就算一个 hit。

### 11.5 Free-Spin Frequency

```ts
fsFreq = fsTriggers / spins
```

这里统计 base spin 触发 free spins 的频率，而不是 free-spin 内部 retrigger 次数。

### 11.6 Max Win X

```ts
winX = result.totalWin / result.bet
maxWinX = max(maxWinX, winX)
```

候选聚合时，`maxWinX` 取所有 seeds 中观测到的最大值。

### 11.7 Standard Deviation

每个 seed 内部计算 per-round winX 的标准差：

```ts
meanWinX = sumWinX / spins
variance = sumWinXSquared / spins - meanWinX ** 2
stdDevX = sqrt(max(0, variance))
```

候选聚合时，`stdDevX` 取 per-seed `stdDevX` 的平均值。

## 13. 多 Seed 聚合

`aggregateStats(perSeed)` 负责把多个 seed 的结果合成一个候选结果：

- `rtp`：平均值。
- `baseRtp`：平均值。
- `fsRtp`：平均值。
- `hitFreq`：平均值。
- `fsFreq`：平均值。
- `stdDevX`：平均值。
- `maxWinX`：最大值。

`maxWinX` 不取平均值，因为 exposure 风险应以观测到的最大值评估，而不是被其他 seed 稀释。

## 14. 评分函数

评分函数是：

```ts
scoreCandidate(stats, perSeed)
```

评分越低越好。

### 13.1 归一化目标误差

普通指标使用：

```ts
abs(actual - target.target) / target.tolerance
```

例如：

```ts
normalizedMetricError(stats.rtp, TARGETS.rtp)
```

这样做的好处是：不同指标的单位和自然波动范围不同，直接相加会导致某些指标天然支配评分。归一化以后，偏离 1 个 tolerance 的意义在所有指标上基本一致。

### 13.2 Max Win 上界误差

`maxWinX` 是 hard upper bound，不是中心目标，所以使用：

```ts
if actual <= max:
  error = 0
else:
  error = (actual - max) / max
```

只要没有超过上限，就不因为 max win 低而惩罚。超过上限才加罚。

### 13.3 Stability Penalty

多 seed 之间的波动也会被惩罚：

```ts
sampleStdDev(seedMetricValues) / metricTolerance
```

目前 stability penalty 覆盖：

- RTP
- base RTP
- FS RTP
- hit frequency
- FS frequency

作用是降低“某一个 seed 表现很好但跨 seed 很不稳定”的候选排名。

### 13.4 当前权重

当前权重：

```ts
{
  rtp: 3.0,
  baseRtp: 1.4,
  fsRtp: 1.4,
  hitFreq: 1.2,
  fsFreq: 1.5,
  stdDevX: 0.8,
  maxWinX: 25,
  stability: 0.2
}
```

解释：

- total RTP 权重最高，因为它是最核心目标。
- base/FS split 权重次之，避免总 RTP 对了但结构错了。
- FS frequency 权重较高，因为它强烈影响玩家体验和 feature pacing。
- hit frequency 权重用于控制普通局体感。
- stdDevX 权重较低，因为短样本下 volatility 估计噪声较大。
- maxWinX 是上界惩罚，只有超过上限才明显影响评分。
- stability 权重较低，用于辅助排序，而不是压倒均值表现。

## 15. 输出报告结构

`artifacts/searchRtp.latest.json` 主要包含：

```json
{
  "generatedAt": "...",
  "inputs": {
    "coarseSamples": 120,
    "refineSamples": 80,
    "coarseSpins": 5000,
    "refineSpins": 20000,
    "verifySpins": 50000,
    "market": "MGA",
    "seed": 42,
    "coarseSeedCount": 1,
    "refineSeedCount": 2,
    "verifySeedCount": 5
  },
  "targets": {},
  "scoreWeights": {},
  "commonRandomSeeds": {},
  "racing": {},
  "coarseTop": [],
  "refineTop": [],
  "verifyTop": [],
  "bestCandidate": {}
}
```

每个 candidate result 包含：

- `candidate`：候选参数。
- `rtp`
- `baseRtp`
- `fsRtp`
- `hitFreq`
- `fsFreq`
- `maxWinX`
- `stdDevX`
- `score`
- `seedCount`
- `stabilityPenalty`
- `perSeed`

`perSeed` 是诊断候选稳定性最重要的数据。如果 aggregate 看起来很好，但 per-seed 差异非常大，这个候选不能直接晋级。

## 16. 候选 Profile 输出

如果存在 winner，脚本会写：

```text
artifacts/searchRtp.bestCandidate.mathProfile.json
```

它通过：

```ts
buildMathProfileDocument(buildCandidateConfig(winner.candidate), metadata)
```

生成完整 `MathProfileDocument`。

metadata 中会记录：

- profile id
- profile version
- status: `candidate`
- source report path
- score
- seed count
- stability penalty
- aggregate metrics

这个文件可以作为后续验证流程的输入。

## 17. 推荐工作流

### 16.1 快速检查搜索器是否能跑

```bash
npm run sim:search -- 1 1 20 20 MGA 42 20 1
```

这个命令只用于 smoke test。不要把结果用于数学判断。

### 16.2 本地初筛

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

适合快速寻找候选区域。

### 16.3 更严格搜索

```bash
npm run sim:search -- 300 200 20000 80000 MGA 42 150000 4
```

样本更大，耗时更长，结果更稳定。

### 16.4 批量验证候选

```bash
npm run sim:verify-batch -- artifacts/searchRtp.bestCandidate.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/candidate.verifyBatch
```

如果通过，再考虑 promote。

### 16.5 Promote

```bash
npm run sim:promote-profile -- artifacts/candidate.verifyBatch.mathProfile.json artifacts/approved.mathProfile.json
```

## 18. 重要限制

### 17.1 Monte Carlo Noise

搜索器依赖模拟抽样。短样本下，特别是 FS RTP、max win、stdDevX 会有明显噪声。

因此：

- search top 1 不一定是真正最优。
- verify top 结果仍需大样本验证。
- 不应根据一次短样本搜索直接发布 profile。

### 17.2 参数空间不是完整穷举

搜索器目前只覆盖：

- paytable scale
- scatter pay scale
- scatter/wild/premium reel count delta

它不搜索：

- wild multiplier distribution
- FS multiplier ladder
- retrigger limit
- cascade cap
- absolute win cap
- reel strip order permutation
- symbol spacing rules

这些属于更高风险参数，应单独建模和验证。

### 17.3 Reel Rebalance 是一种设计选择

当前 reel count delta 会通过低赔符号 rebalance 保持 reel total count 不变。这让搜索更稳定，但也意味着低赔符号承担了补偿项。

如果未来需要更精细控制 hit frequency，可以把 low symbols 从统一 rebalance 扩展为逐 low symbol delta。

### 17.4 Score 不是合规证明

score 只是排序函数，不是合规结论。

最终仍需要：

- 大样本 batch verification。
- profile metadata 记录。
- 运行时接入 approved profile。
- 审计日志和 replay 验证。
- 必要时引入独立数学认证。

## 19. 如何解读搜索结果

查看 `searchRtp.latest.json` 时，建议按以下顺序：

1. 先看 `verifyTop`，不要只看 `coarseTop` 或 `refineTop`。
2. 看 `score`，确认综合排名。
3. 看 `rtp` 是否接近目标。
4. 看 `baseRtp` 和 `fsRtp` 是否同时接近目标。
5. 看 `hitFreq` 和 `fsFreq`，确认体验节奏。
6. 看 `stdDevX`，判断 volatility 是否偏离。
7. 看 `maxWinX` 是否有异常 exposure。
8. 看 `perSeed`，确认不是单 seed 运气。
9. 对前几个候选分别运行 `sim:verify-batch`。

如果总 RTP 接近但 split 错误，通常优先调整 base/FS paytable scales。

如果 FS frequency 偏离，通常优先调整 scatter reel deltas，而不是 scatter pay。

如果 hit frequency 偏离，通常优先调整 wild delta、premium delta 和低赔分布。

如果 volatility 偏离，通常优先调整 premium pay scales、scatter 4/5 pays、wild exposure 和 FS paytable。

## 20. 代码入口速查

- `Candidate`：定义搜索参数空间。
- `buildCandidateConfig`：把 Candidate 转换为 RuntimeMathConfig。
- `sampleCandidate`：生成粗搜候选或基于 anchor 的精搜候选。
- `evaluateCandidateSeed`：单 seed 仿真并计算指标。
- `evaluateCandidate`：安装候选 config，多 seed 评估并聚合。
- `evaluateCandidates`：串行或 worker 并行评估一批候选。
- `raceCandidates`：adaptive racing，按 budget 分轮淘汰候选。
- `scoreCandidate`：归一化评分。
- `stageSeedSet`：生成每个阶段的 common random seed 列表。
- `main`：三阶段搜索和 artifact 输出。

## 21. 总结

`searchRtp.ts` 的本质是一个受控随机搜索器：

1. 在有限但高价值的数学参数空间中采样。
2. 把每个候选转换为完整 runtime math config。
3. 使用真实 spin engine 和 settlement 进行 Monte Carlo 评估。
4. 用 profile metadata 中的目标和容差计算归一化 score。
5. 用 common random numbers 降低候选比较噪声。
6. 用 adaptive racing 把计算量集中在 survivor candidates 上。
7. 用多 seed 聚合和 stability penalty 降低偶然性。
8. 可选用 worker_threads 并行加速。
9. 输出完整搜索报告和可验证的 candidate math profile。

它的价值不在于“一次搜索直接得到最终 RTP”，而在于把数学调参从手工猜测推进到可复现、可比较、可审计的候选生成流程。
