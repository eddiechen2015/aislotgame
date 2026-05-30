# Asian Tour Slot 引擎架构说明（中文）

## 1. 项目定位

本项目是一个以 TypeScript 实现的生产级老虎机数学引擎与测试平台，目标不是只做“能转起来”的 Demo，而是覆盖以下完整能力：

- 可复现的数学引擎
- 可审计的结算链路
- 可验证的市场上限控制
- 可调优的数学参数系统
- 可自动搜索与验证的 RTP/Profile 工作流
- 生产模式下的 approved profile runtime gate
- 基于 RNG trace 的审计 replay
- 带统计置信信息的 batch verification
- 可对接前端与服务端测试环境

当前系统围绕一个 5x3、243-ways、带 cascade、wild multiplier、free spins 的 slot game 构建。

---

## 2. 总体架构

系统分成 5 层：

1. `engine/`
   纯数学引擎层，负责出盘、ways 计算、cascade、free spins、上限处理前的原始开奖结果。

2. `settlement/`
   结算层，负责把原始引擎结果转换成“真钱口径”结果，包括两位小数 rounding、absolute win cap、audit event 等。

3. `server/`
   测试服务层，提供 `/api/login`、`/api/spin`、`/api/config` 等接口，并维护 session、余额、market、audit log。

4. `simulator/`
   数学验证与搜索层，负责 Monte Carlo 仿真、profile 导出、profile 验证、RTP 搜索。

5. `public/`
   浏览器测试页，用于人工观察 grid、cascade、free spins、原始 JSON 响应。

---

## 3. 目录结构

```text
src/
  engine/
    config.ts
    types.ts
    rng.ts
    reel.ts
    waysEvaluator.ts
    cascade.ts
    freeSpins.ts
    spinEngine.ts
    mathRuntime.ts
    mathProfile.ts
    validateMathConfig.ts

  settlement/
    settleSpin.ts

  server/
    index.ts
    session.ts
    money.ts
    spinResponse.ts
    audit.ts
    auditRng.ts
    configResponse.ts
    roundId.ts

  simulator/
    rtp.ts
    searchRtp.ts
    verifyProfile.ts
    verifyProfileBatch.ts
    promoteProfile.ts
    exportDefaultProfile.ts
    auditVerify.ts
    spinTest.ts

  tests/
    run.ts

public/
  index.html
```

---

## 4. 核心数据流

一次完整 spin 的路径如下：

1. 前端或模拟器调用 `playRound(bet, rng)`  
   入口在 [src/engine/spinEngine.ts](/Users/eddiechen/mycode/slotgametest/testsgbyai/src/engine/spinEngine.ts)

2. `playRound()` 先执行 base spin  
   内部调用 `runSpin()`

3. `runSpin()` 完成：
   - 生成初始 grid
   - 计算 ways win
   - 移除中奖位
   - 执行 cascade refill
   - 统计 scatter
   - 判断 free spins trigger

4. 若触发 free spins，则进入 `runFreeSpins()`  
   由 [src/engine/freeSpins.ts](/Users/eddiechen/mycode/slotgametest/testsgbyai/src/engine/freeSpins.ts) 驱动 multiplier progression 与 retrigger。

5. 引擎返回原始 `SpinResult`

6. 结算层 `settleSpinResultDetailed()` 处理：
   - 原子派奖 rounding
   - per-spin cap
   - market absolute cap
   - audit event

7. 服务端把已结算结果映射成 API response，并更新余额

---

## 5. 引擎层详解

### 5.1 `config.ts`

单一静态配置源，包含：

- bet range
- exposure cap
- scatter payout
- base paytable
- free-spin paytable
- base reel counts / strip order
- free-spin reel counts / strip order

这使得系统支持：

- base reel set 与 FS reel set 分离
- base paytable 与 FS paytable 分离

### 5.2 `rng.ts`

提供两类 RNG：

- `mulberry32(seed)`：可重复仿真
- `defaultRng()`：非种子随机

### 5.3 `reel.ts`

负责 reel strip 构建与窗口抽样：

- 不再是“每格独立 weighted pick”
- 现在是“deterministic strip + random stop + visible window”

同时负责：

- wild multiplier 赋值
- max wilds per spin 限制
- cascade refill 后再次执行 wild cap

### 5.4 `waysEvaluator.ts`

负责 243-ways 结算。

关键点：

- 只计算从 Reel 1 开始的连续 prefix
- wild-only win 禁止
- 只支付最高 match length
- wild multiplier 按 way 单独 cap
- 用 DP 代替暴力枚举 243 条路径

### 5.5 `cascade.ts`

负责：

- 移除中奖符号
- gravity
- refill
- max wild re-check
- scatter 统计
- 20 cascade cap

### 5.6 `freeSpins.ts`

负责：

- 10 初始 spins
- +5 retrigger
- max 5 retriggers
- multiplier steps `[1,2,3,5,10]`
- 使用 `free_spins` reel set

### 5.7 `spinEngine.ts`

顶层 orchestrator，负责：

- bet range 校验
- base spin
- scatter pay
- free spin session
- round total 汇总

---

## 6. Runtime Math Profile 系统

这是当前系统达到“生产可调优”能力的核心。

### 6.1 `mathRuntime.ts`

系统不再只依赖静态 `config.ts`，而是允许在运行时注入一套完整数学 profile：

- `baseSymbols`
- `freeSpinSymbols`
- `baseScatterPayoutXBet`
- `baseReelSymbolCounts`
- `freeSpinReelSymbolCounts`
- `baseReelStripOrders`
- `freeSpinReelStripOrders`

### 6.2 `withRuntimeMathConfig()`

提供作用域式覆盖：

- 设置临时 profile
- 在闭包内运行引擎/仿真
- 自动回滚到旧 profile

这让 RTP 搜索不会污染服务端默认配置。

### 6.3 `validateMathConfig.ts`

在注入 profile 之前做结构校验：

- reel 数量必须正确
- count 必须为非负整数
- strip order 不可为空
- paytable 不可为负数

### 6.4 Approved Profile Runtime Gate

生产模式或类生产启动时，可以强制服务端只加载已经批准并通过验证的 profile：

```bash
REQUIRE_APPROVED_PROFILE=true MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

`NODE_ENV=production` 也会开启同样的 gate。

如果 profile 仍是 `candidate`、`rejected`，或缺少 `verification.passed=true`
的验证元数据，运行时会拒绝加载。

---

## 7. 结算层

### 7.1 `settlement/settleSpin.ts`

结算层将原始 `SpinResult` 转换为真钱口径结果。

包括：

- 原子派奖 rounding
  规则是：只 round 每个独立派奖事件

- per-spin cap
  `10000x * bet`

- market absolute win cap
  `min(10000x * bet, absolute_cap_by_market)`

- audit event 生成

### 7.2 为什么结算层独立

因为“引擎原始数学结果”和“真钱入账结果”不是一回事。

将其拆开后可以同时满足：

- 数学验证
- 钱包一致性
- 市场规则
- 审计要求

---

## 8. 服务端层

### 8.1 `server/index.ts`

Express 测试服务，暴露：

- `POST /api/login`
- `GET /api/me`
- `POST /api/spin`
- `GET /api/config`

### 8.2 `session.ts`

Session 中包含：

- token
- username
- market
- balanceCents

余额全部以整数分存储。

### 8.3 `money.ts`

统一金额处理：

- `amountToCents()`
- `centsToAmount()`
- `parseAmountToCents()`

### 8.4 `audit.ts`

用于记录 round audit 与 absolute cap 命中事件。

### 8.5 Audit RNG Trace

服务端 spin 会通过 audited RNG wrapper 记录每一次随机调用：

- `next`
- `nextInt`
- `pickWeighted`

这些 trace 后续可以由 `audit:verify` 结合对应 math profile 重放，从而验证
记录的 round 是否能被引擎复现。

---

## 9. 模拟与数学工作流

### 9.1 `rtp.ts`

标准 Monte Carlo 仿真器，统计：

- RTP
- base RTP
- FS RTP
- hit frequency
- FS frequency
- max win
- volatility proxy

### 9.2 `searchRtp.ts`

自动搜索 RTP 参数。

当前搜索空间包含：

- 逐符号 base paytable scale
- 逐符号 FS paytable scale
- 3/4/5 scatter payout 独立 scale
- base reel count deltas
- FS reel count deltas

工作流：

1. coarse search
2. refine search
3. 同阶段使用 common random numbers 比较候选
4. adaptive racing：先低成本淘汰，再给 survivor 分配更大 spins budget
5. multi-seed finalist verification
6. 落盘 `artifacts/searchRtp.latest.json`
7. 落盘 `artifacts/searchRtp.bestCandidate.mathProfile.json`

评分使用 profile target 的归一化误差：

```text
abs(actual - target) / tolerance
```

评分维度包括 total RTP、base/FS split、hit frequency、FS frequency、
volatility、max-win exposure，以及跨 seed 稳定性。候选评估可通过
`worker_threads` 并行执行。

### 9.3 `verifyProfile.ts`

对任意导出的 math profile 做独立验证。

### 9.4 `verifyProfileBatch.ts`

使用多个 deterministic seeds 对 profile 做 batch verification。

报告包含：

- aggregate metrics
- per-seed metrics
- sample standard deviation
- standard error
- 95% confidence interval
- normalized target error
- 是否通过 profile targets

### 9.5 `promoteProfile.ts`

将已验证 profile 提升为 `approved`。

如果 profile 没有通过 batch verification metadata，promotion 会失败。

### 9.6 `auditVerify.ts`

验证 round audit event。

不传 profile 时，执行结构与金额一致性检查。

传入 profile 时，会重放 RNG trace，并比对：

- raw engine output
- settled payout output
- cap events
- wallet debit/credit accounting
- RNG trace 是否完整消费

### 9.7 `exportDefaultProfile.ts`

导出当前默认配置为 profile JSON：

- `artifacts/default.mathProfile.json`

---

## 10. 测试体系

`src/tests/run.ts` 当前覆盖：

- per-way multiplier cap
- mixed-way cap correctness
- FS paytable override 生效
- max wild across cascades
- absolute cap by market
- atomic event rounding
- runtime override reset/cache
- invalid math profile rejection
- approved profile runtime gate
- audit RNG trace 记录
- round audit 结构
- audit replay 成功与失败场景

这是保证后续调参不会破坏引擎语义的基础。

---

## 11. 当前系统的成熟度判断

从工程角度看，本项目已经基本达到生产级 slot game 引擎的要求：

- 模块边界清晰
- 结算与引擎分离
- 数学 profile 可替换
- 市场 cap 可审计
- 自动搜索与验证工具齐全
- 统计置信报告
- approved profile runtime gate
- 基于 RNG trace 的 audit replay
- 单元回归测试存在

但需要明确：

- **引擎成熟度**：已接近生产级
- **默认数学 profile**：仍需继续调优，不应直接视为最终上线 math

---

## 12. 推荐工作流

### 开发调试

```bash
npm install
npm run dev
```

### 单元测试

```bash
npm run test:unit
```

### 标准 RTP 仿真

```bash
npm run sim -- 200000 1 42 MGA
```

### 导出默认 profile

```bash
npm run sim:export-profile
```

### 验证某个 profile

```bash
npm run sim:verify -- artifacts/default.mathProfile.json 100000 42 MGA
```

### 多 seed 验证 profile

```bash
npm run sim:verify-batch -- artifacts/default.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/default.verifyBatch 4
```

### 提升已验证 profile

```bash
npm run sim:promote-profile -- artifacts/default.verifyBatch.mathProfile.json artifacts/approved.mathProfile.json
```

### 使用 approved profile gate 启动

```bash
REQUIRE_APPROVED_PROFILE=true MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

### 自动搜索 profile

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

### 验证并 replay round audit

```bash
npm run audit:verify -- artifacts/audit/round-audit.jsonl round_xxx artifacts/approved.mathProfile.json
```

---

## 13. 后续建议

如果继续推进到真正的上线级数学定版，建议做：

- multi-seed 长样本验证
- profile versioning
- timestamped candidate archive
- CI 中接入 math regression baseline
- certified RNG provider integration
- persistent session / wallet storage
- idempotent spin transactions
- scatter spacing / clustering 参数化

---

## 14. 总结

这个系统现在已经不只是一个 slot demo，而是一套完整的：

- **数学引擎**
- **真钱结算层**
- **测试服务**
- **RTP 搜索平台**
- **math profile workflow**
- **approved profile runtime gate**
- **audit replay workflow**

如果你的目标是长期维护并持续优化 slot math，这个结构已经可以支撑正式研发流程。
