// 简单的回归测试脚本
const testData = {
  csvContent: `搜索字词报告
2025年7月15日 - 2025年7月15日
数据预览
搜索字词,已添加/排除的关键字,推广计划名称,广告组名称,关键字匹配类型,展示次数,点击次数,费用,转化次数,转化价值,点击率,平均每次点击费用,转化率
pcb services,pcb services,电子制造服务,PCB制造,完全匹配,1250,125,¥1250.00,12,¥15000.00,10.00%,¥10.00,9.60%
电路板制造,电路板制造,电子制造服务,PCB制造,广泛匹配,890,89,¥890.00,8,¥9600.00,10.00%,¥10.00,8.99%`,
  
  expectedColumns: ['搜索字词', '已添加/排除的关键字', '推广计划名称', '广告组名称', '关键字匹配类型', '展示次数', '点击次数', '费用', '转化次数', '转化价值', '点击率', '平均每次点击费用', '转化率']
};

// 模拟浏览器环境
if (typeof window === 'undefined') {
  console.log('测试环境检查：Node.js环境');
  console.log('测试数据加载成功');
  console.log('预期列名:', testData.expectedColumns.slice(0, 3), '...');
} else {
  console.log('测试环境检查：浏览器环境');
}

// 导出给浏览器使用
if (typeof module !== 'undefined') {
  module.exports = testData;
}