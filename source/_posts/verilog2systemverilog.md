---
title: "从 Verilog 到 SystemVerilog：读《数字设计和计算机体系结构》第 4 章的一点笔记"
date: 2026-07-07
categories:
  - Reading Notes
  - Digital Design
tags:
  - digital-design
  - risc-v
excerpt: "最近在读《数字设计和计算机体系结构（RISC-V 版）》第 4 章“硬件描述语言”。这一章主要讲 SystemVerilog 和 VHDL 如何描述组合逻辑、时序逻辑、结构建模和有限状态机。因为我平时更多使用 Verilog 写 FPGA 练习模块，所以这篇笔记主要记录我从 Verilog 过渡到 SystemVerilog 时最需要关注的几个点。Verilog的具体语法不过多赘述，记录一下它与SystemVerilog的几个不同点"
---

## 从 `reg/wire` 到 `logic`

传统 Verilog 中，`reg` 和 `wire` 很容易让初学者误解。`reg` 并不一定综合成寄存器，它只是表示这个信号可以在 `always` 块中赋值。它到底是组合逻辑输出、锁存器还是触发器，要看具体写法。

SystemVerilog 引入了 `logic`，让大多数单驱动信号都可以统一声明：

```systemverilog
module and2 (
  input  logic a_i,
  input  logic b_i,
  output logic y_o
);

  assign y_o = a_i & b_i;

endmodule
```

这样写的好处是语义更清楚，不需要在 `reg` 和 `wire` 之间反复纠结。不过 `logic` 不是万能的。如果是三态总线或多驱动信号，仍然需要使用 `tri`、`wire` 这类 net 类型。也就是说，`logic` 适合单驱动 RTL 信号，但不能掩盖硬件连接关系本身。

## 用 `always_ff` 和 `always_comb` 表达硬件意图

Verilog 中常见的组合逻辑写法是：

```verilog
always @(*) begin
  y = a & b;
end
```

SystemVerilog 中更推荐：

```systemverilog
always_comb begin
  y_o = a_i & b_i;
end
```

对于时序逻辑，则使用：

```systemverilog
always_ff @(posedge clk_i or negedge rst_n_i) begin
  if (!rst_n_i) begin
    q_o <= '0;
  end else begin
    q_o <= d_i;
  end
end
```

这两个关键字的意义在于，它们把设计者的意图写进了代码：这里应该是组合逻辑，那里应该是触发器。工具也能据此检查一些不合理写法。

对我来说，这是 SystemVerilog 相比 Verilog 很实用的一点。它不是改变了硬件结构，而是让代码和硬件结构之间的对应关系更明确。

## 阻塞赋值和非阻塞赋值仍然是重点

从 Verilog 迁移到 SystemVerilog 后，阻塞赋值和非阻塞赋值的规则并没有消失：

- 组合逻辑中通常使用阻塞赋值 `=`；
- 时序逻辑中通常使用非阻塞赋值 `<=`。

例如两个串联触发器应该写成：

```systemverilog
always_ff @(posedge clk_i or negedge rst_n_i) begin
  if (!rst_n_i) begin
    n1_q <= 1'b0;
    q_o  <= 1'b0;
  end else begin
    n1_q <= d_i;
    q_o  <= n1_q;
  end
end
```

这里 `q_o` 采到的是上一拍的 `n1_q`，硬件上对应两个背靠背的触发器。如果在时序逻辑里随意使用阻塞赋值，仿真结果可能和实际想表达的寄存器级结构不一致。

## FSM 更适合用枚举状态

以前写 Verilog 状态机时，我常用 `localparam` 定义状态：

```verilog
localparam S_IDLE = 2'd0;
localparam S_RUN  = 2'd1;
localparam S_DONE = 2'd2;
```

SystemVerilog 可以用枚举类型：

```systemverilog
typedef enum logic [1:0] {
  S_IDLE,
  S_RUN,
  S_DONE
} state_t;

state_t state_q, state_d;
```

这种写法更接近“状态机”的语义。`state_q` 表示当前状态寄存器，`state_d` 表示下一状态组合逻辑。配合三段式 FSM，代码结构会更清楚：

- 第一段：状态寄存器：

  ```systemverilog
    always_ff @(posedge clk_i or negedge rst_n_i) begin
      if (!rst_n_i) begin
        state_q <= S_IDLE;
      end else begin
        state_q <= state_d;
      end
    end
  ```

- 第二段：下一状态逻辑：

  ```systemverilog
    always_comb begin
      state_d = state_q;
  
      unique case (state_q)
        S_IDLE: begin
          if (start_i) begin
            state_d = S_BUSY;
          end
        end
  
        S_BUSY: begin
          if (done_i) begin
            state_d = S_DONE;
          end
        end
  
        S_DONE: begin
          state_d = S_IDLE;
        end
  
        default: begin
          state_d = S_IDLE;
        end
      endcase
    end
  ```

- 第三段：输出逻辑：

  ```systemverilog
    assign busy_o = (state_q == S_BUSY);
  ```

这对后续调试也有帮助。看波形时，状态名比单纯的二进制编码更直观。

## 我接下来的迁移思路

这章读完后，我不会立刻把所有 Verilog 模块都改成 SystemVerilog。更合理的做法是逐步迁移：

1. 新写的小模块优先使用 `.sv`。
2. 组合逻辑和简单寄存器模块先迁移。
3. FIFO、CDC、总线协议这类模块暂时保持谨慎。
4. 每迁移一个模块，都保留 testbench 验证原有行为。
5. 重点关注综合 warning，尤其是 latch、多驱动、位宽截断和未复位寄存器。

SystemVerilog 的学习不应该停留在语法层面。对 RTL 设计来说，更重要的是它能否帮助我写出结构清晰、时序明确、便于验证的硬件。
