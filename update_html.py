#!/usr/bin/env python3
# -*- coding: utf-8 -*-
with open("MVP-Demo-技术与开发方案.html", "r", encoding="utf-8") as f:
    content = f.read()

old_text = """    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">02</span>
        <h3>语音/自然语言生成格式化单据</h3>"""

new_text = """    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">01a</span>
        <h3>核心指标选择标准与分类</h3>
      </div>
      <div class="feature-body">
        <div class="feature-col">
          <h4>指标选择标准</h4>
          <ul>
            <li><strong>业务相关性</strong>：直接反映企业经营健康状况，与核心目标强相关</li>
            <li><strong>数据可得性</strong>：数据可稳定获取，采集成本低，历史数据完整</li>
            <li><strong>灵敏度</strong>：对业务变化敏感，能及时反映异常情况</li>
            <li><strong>可解释性</strong>：指标含义清晰，异常原因易追溯</li>
            <li><strong>无强因果重叠</strong>：避免选取具有直接因果关系的重复指标</li>
          </ul>
        </div>
        <div class="feature-col">
          <h4>指标分类体系</h4>
          <ul>
            <li><strong>销售类</strong>：日销售额、日订单量、平均客单价、复购率</li>
            <li><strong>库存类</strong>：库存周转率、滞销库存占比、安全库存达标率</li>
            <li><strong>财务类</strong>：毛利率、应收账款回款周期、费用率</li>
            <li><strong>运营类</strong>：客户下单频次、客诉率、履约准时率</li>
          </ul>
        </div>
      </div>

      <div class="table-wrapper" style="margin-top: 24px;">
        <table class="spec-table">
          <thead>
            <tr>
              <th>行业类型</th>
              <th>推荐核心指标</th>
              <th>业务约束</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>批发零售</td>
              <td>日销售额、订单量、客单价、库存周转率</td>
              <td>销售额≥0、周转率&gt;0</td>
            </tr>
            <tr>
              <td>制造生产</td>
              <td>日产量、良品率、设备稼动率、交货准时率</td>
              <td>良品率∈[0,1]、稼动率∈[0,1]</td>
            </tr>
            <tr>
              <td>服务行业</td>
              <td>日客流量、客单价、复购率、客诉率</td>
              <td>客诉率∈[0,1]、复购率∈[0,1]</td>
            </tr>
            <tr>
              <td>电商行业</td>
              <td>日GMV、转化率、客单价、退货率</td>
              <td>转化率∈[0,1]、退货率∈[0,1]</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">01b</span>
        <h3>算法实现与变体方案</h3>
      </div>
      <div class="feature-body">
        <div class="feature-col">
          <h4>核心算法：IQR四分位距法</h4>
          <ul>
            <li>将历史数据按升序排序</li>
            <li>计算Q1（第25百分位数）和Q3（第75百分位数）</li>
            <li>计算IQR = Q3 - Q1（四分位距）</li>
            <li>正常区间下界 = Q1 - 1.5 × IQR</li>
            <li>正常区间上界 = Q3 + 1.5 × IQR</li>
            <li>应用业务约束裁剪区间（如非负限制）</li>
          </ul>
        </div>
        <div class="feature-col">
          <h4>备选算法方案</h4>
          <ul>
            <li><strong>MAD中位数绝对偏差法</strong>：适用于偏态分布数据，更稳健</li>
            <li><strong>移动平均标准差法</strong>：均值±k×标准差，适用于正态分布</li>
            <li><strong>百分位直接法</strong>：直接取[5%, 95%]分位数作为区间</li>
            <li><strong>指数平滑法</strong>：考虑时间趋势，近期数据权重更高</li>
          </ul>
        </div>
      </div>

      <div class="code-block" style="margin-top: 24px;">
import numpy as np
from scipy import stats

def calc_interval_iqr(data, lower_bound=None, upper_bound=None, k=1.5):
    \"\"\"IQR四分位距法计算区间\"\"\"
    data_clean = data[~np.isnan(data)]
    q1 = np.percentile(data_clean, 25)
    q3 = np.percentile(data_clean, 75)
    iqr = q3 - q1
    lower = q1 - k * iqr
    upper = q3 + k * iqr
    if lower_bound is not None:
        lower = max(lower, lower_bound)
    if upper_bound is not None:
        upper = min(upper, upper_bound)
    return {"lower": round(lower, 2), "upper": round(upper, 2), "q1": q1, "q3": q3}

def calc_interval_mad(data, lower_bound=None, upper_bound=None, k=3):
    \"\"\"MAD中位数绝对偏差法（对偏态分布更稳健）\"\"\"
    data_clean = data[~np.isnan(data)]
    median = np.median(data_clean)
    mad = stats.median_abs_deviation(data_clean, scale="normal")
    lower = median - k * mad
    upper = median + k * mad
    if lower_bound is not None:
        lower = max(lower, lower_bound)
    if upper_bound is not None:
        upper = min(upper, upper_bound)
    return {"lower": round(lower, 2), "upper": round(upper, 2), "median": median}

def check_status(value, interval):
    \"\"\"判断指标状态：正常/偏低/偏高\"\"\"
    if value < interval["lower"]:
        return "low"
    elif value > interval["upper"]:
        return "high"
    else:
        return "normal"
      </div>
    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">01c</span>
        <h3>异常等级划分与预警策略</h3>
      </div>
      <div class="feature-body">
        <div class="feature-col">
          <h4>异常等级定义</h4>
          <ul>
            <li><strong>正常（绿色）</strong>：值 ∈ [lower, upper]，无需关注</li>
            <li><strong>轻度异常（黄色）</strong>：偏离区间但在2×IQR内，需观察</li>
            <li><strong>中度异常（橙色）</strong>：偏离区间在2-3×IQR之间，需关注</li>
            <li><strong>重度异常（红色）</strong>：偏离区间超过3×IQR，需立即处理</li>
          </ul>
        </div>
        <div class="feature-col">
          <h4>预警策略配置</h4>
          <ul>
            <li><strong>推送频率</strong>：实时/每日定时/按异常等级</li>
            <li><strong>推送对象</strong>：按指标重要性配置不同接收人</li>
            <li><strong>收敛规则</strong>：连续N天正常后自动解除预警</li>
            <li><strong>静默期</strong>：同一指标异常在X小时内不重复推送</li>
          </ul>
        </div>
      </div>

      <div class="table-wrapper" style="margin-top: 24px;">
        <table class="spec-table">
          <thead>
            <tr>
              <th>异常等级</th>
              <th>偏离程度</th>
              <th>响应要求</th>
              <th>推送方式</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="tag tag-success">正常</span></td>
              <td>值 ∈ [lower, upper]</td>
              <td>无需响应</td>
              <td>不推送</td>
            </tr>
            <tr>
              <td><span class="tag tag-warning">轻度异常</span></td>
              <td>1.5×IQR ~ 2×IQR</td>
              <td>记录观察，24小时内确认</td>
              <td>每日汇总推送</td>
            </tr>
            <tr>
              <td><span class="tag" style="background: rgba(255,165,0,0.15); color: #ffa500;">中度异常</span></td>
              <td>2×IQR ~ 3×IQR</td>
              <td>4小时内响应，分析原因</td>
              <td>实时推送 + 邮件</td>
            </tr>
            <tr>
              <td><span class="tag tag-danger">重度异常</span></td>
              <td>&gt; 3×IQR</td>
              <td>立即响应，1小时内介入</td>
              <td>实时推送 + 电话通知</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">01d</span>
        <h3>多场景完整示例</h3>
      </div>
      <div class="feature-body">
        <div class="feature-col">
          <h4>场景一：批发零售业-日销售额</h4>
          <ul>
            <li>历史数据：近90天日销售额，中位数¥25,000</li>
            <li>Q1=¥18,000，Q3=¥35,000，IQR=¥17,000</li>
            <li>原始区间：[¥-7,500, ¥60,500]</li>
            <li>业务约束裁剪：[¥0, ¥60,500]</li>
            <li>当日值¥8,000 → 轻度偏低预警</li>
          </ul>
        </div>
        <div class="feature-col">
          <h4>场景二：制造业-良品率</h4>
          <ul>
            <li>历史数据：近90天良品率，中位数98.5%</li>
            <li>Q1=97.8%，Q3=99.2%，IQR=1.4%</li>
            <li>原始区间：[95.7%, 101.3%]</li>
            <li>业务约束裁剪：[95.7%, 100%]</li>
            <li>当日值94.5% → 中度异常预警</li>
          </ul>
        </div>
      </div>

      <div class="card-grid card-grid-2" style="margin-top: 24px;">
        <div class="card">
          <h3>场景三：电商-转化率</h3>
          <div class="data-sample" style="margin-top: 12px;">
            <div class="data-row"><span class="data-key">Q1</span><span class="data-val">2.8%</span></div>
            <div class="data-row"><span class="data-key">Q3</span><span class="data-val">4.2%</span></div>
            <div class="data-row"><span class="data-key">正常区间</span><span class="data-val">[0.7%, 6.3%]</span></div>
            <div class="data-row"><span class="data-key">当日值</span><span class="data-val">0.5%</span></div>
            <div class="data-row"><span class="data-key">状态</span><span class="data-val" style="color: var(--danger);">重度异常偏低</span></div>
          </div>
        </div>
        <div class="card">
          <h3>场景四：服务业-客单价</h3>
          <div class="data-sample" style="margin-top: 12px;">
            <div class="data-row"><span class="data-key">Q1</span><span class="data-val">¥120</span></div>
            <div class="data-row"><span class="data-key">Q3</span><span class="data-val">¥280</span></div>
            <div class="data-row"><span class="data-key">正常区间</span><span class="data-val">[¥0, ¥520]</span></div>
            <div class="data-row"><span class="data-key">当日值</span><span class="data-val">¥650</span></div>
            <div class="data-row"><span class="data-key">状态</span><span class="data-val" style="color: var(--warning);">轻度异常偏高</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">01e</span>
        <h3>数据质量验证与滚动更新</h3>
      </div>
      <div class="feature-body">
        <div class="feature-col">
          <h4>数据质量检查</h4>
          <ul>
            <li><strong>完整性检查</strong>：有效数据量≥30天，否则提示数据不足</li>
            <li><strong>一致性检查</strong>：与业务约束冲突的异常点标记</li>
            <li><strong>连续性检查</strong>：时间序列断点检测</li>
            <li><strong>单值校验</strong>：非负性、范围限制等业务规则验证</li>
          </ul>
        </div>
        <div class="feature-col">
          <h4>区间滚动更新策略</h4>
          <ul>
            <li><strong>更新频率</strong>：每日凌晨自动重算区间</li>
            <li><strong>窗口策略</strong>：滑动窗口（最近90天）</li>
            <li><strong>平滑过渡</strong>：新旧区间加权平滑，避免跳变</li>
            <li><strong>季节性处理</strong>：保留同比环比数据供参考</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">01f</span>
        <h3>可视化展示建议</h3>
      </div>
      <div class="feature-body">
        <div class="feature-col">
          <h4>推荐图表类型</h4>
          <ul>
            <li><strong>时序折线图</strong>：展示指标趋势 + 区间带</li>
            <li><strong>区间分布图</strong>：直方图 + 区间标记</li>
            <li><strong>热力矩阵</strong>：多指标多时段异常概览</li>
            <li><strong>仪表盘</strong>：当前值 + 区间位置直观展示</li>
          </ul>
        </div>
        <div class="feature-col">
          <h4>预警消息内容模板</h4>
          <ul>
            <li>指标名称、当前值、正常区间</li>
            <li>偏离程度（百分比、IQR倍数）</li>
            <li>异常等级、建议响应时间</li>
            <li>近7日趋势、历史对比</li>
            <li>可能原因提示（基于历史数据）</li>
          </ul>
        </div>
      </div>

      <div class="data-sample" style="margin-top: 24px;">
        <div class="data-title">预警消息示例</div>
        <div class="interval-viz" style="margin-top: 12px;">
          <span class="interval-label">重度异常</span>
          <div class="interval-bar">
            <div class="fill danger" style="left:0;width:15%"></div>
            <div class="fill normal" style="left:15%;width:55%"></div>
            <div class="fill danger" style="left:70%;width:30%"></div>
            <div style="position:absolute;left:8%;top:-8px;">▼当前值</div>
          </div>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: var(--danger-dim); border-radius: 8px; border: 1px solid var(--danger);">
          <div style="font-weight: 700; color: var(--danger); margin-bottom: 8px;">🚨 重度异常预警：日销售额</div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.8;">
            <strong>当前值：</strong>¥5,200<br>
            <strong>正常区间：</strong>[¥0, ¥60,500]<br>
            <strong>偏离程度：</strong>低于正常区间下限91.4%（2.3×IQR）<br>
            <strong>近7日趋势：</strong>连续3天下降，今日跌幅扩大<br>
            <strong>建议响应：</strong>1小时内介入，排查原因
          </div>
        </div>
      </div>
    </div>

    <div class="feature-detail animate-in">
      <div class="feature-header">
        <span class="feature-num">02</span>
        <h3>语音/自然语言生成格式化单据</h3>"""

if old_text in content:
    content = content.replace(old_text, new_text)
    with open("MVP-Demo-技术与开发方案.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("Success! File updated.")
else:
    print("Error: old_text not found in file")
    # Show the exact content around that area
    lines = content.split("\n")
    print("\nLines around 1485-1505:")
    for i in range(1483, 1510):
        if i < len(lines):
            print(f"{i+1}: {repr(lines[i])}")
