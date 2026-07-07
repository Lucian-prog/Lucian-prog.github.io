---
title: 数字抽象与二进制表示
date: 2026-07-07 15:50:00
categories:
  - Reading Notes
  - Digital Design
tags:
  - digital-design
  - computer-architecture
  - binary
  - risc-v
excerpt: 数字电路为什么可以用 0 和 1 表示信息？在硬件中，位宽、补码和溢出分别意味着什么？
---

## 本节问题

数字电路为什么可以用 0 和 1 表示信息？在硬件中，位宽、补码和溢出分别意味着什么？

## 核心概念

数字系统用离散的逻辑电平表示信息。一个 bit 只有 0 和 1 两种状态，多个 bit 组合后可以表示无符号数、有符号数、编码、地址或控制信号。

位宽决定了一个信号能表达的状态数量。对于 `N` 位无符号数，范围是 `0` 到 `2^N - 1`。对于 `N` 位补码有符号数，范围是 `-2^(N-1)` 到 `2^(N-1)-1`。

## 硬件结构 / 信号流

在 RTL 中，位宽不是注释，而是硬件连线数量。一个 `logic [7:0] data` 会综合为 8 根并行信号线；如果它被寄存，则对应 8 个触发器。

加法器并不知道操作数是有符号还是无符号。补码的价值在于让有符号加减法可以复用同一套二进制加法硬件。

## 关键推导 / 时序关系

补码取负可以理解为：

```text
-x = ~x + 1
```

有符号加法溢出判断：

```text
两个正数相加得到负数：溢出
两个负数相加得到正数：溢出
一正一负相加：不会发生有符号溢出
```

## RTL 实验 / 例程

```systemverilog
module signed_overflow_detect #(
  parameter int WIDTH = 8
) (
  input  logic signed [WIDTH-1:0] a_i,
  input  logic signed [WIDTH-1:0] b_i,
  output logic signed [WIDTH-1:0] sum_o,
  output logic                  overflow_o
);

  assign sum_o = a_i + b_i;

  assign overflow_o = ( a_i[WIDTH-1] &  b_i[WIDTH-1] & ~sum_o[WIDTH-1]) |
                      (~a_i[WIDTH-1] & ~b_i[WIDTH-1] &  sum_o[WIDTH-1]);

endmodule
```

## 易错点

- 忽略位宽会导致截断。
- 混用 signed 和 unsigned 时，表达式类型可能不符合预期。
- 溢出不是进位本身；无符号溢出和有符号溢出判断方式不同。
