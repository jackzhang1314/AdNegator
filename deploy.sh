#!/bin/bash

# AdNegator Pro - 快速部署脚本

echo "🚀 AdNegator Pro - 准备部署到 Vercel"
echo "=================================="

# 检查是否是git仓库
if [[ ! -d ".git" ]]; then
    echo "📁 初始化 Git 仓库..."
    git init
    echo "✅ Git 仓库已初始化"
fi

# 检查是否有未提交的更改
if [[ -n $(git status -s) ]]; then
    echo "📝 发现未提交的更改，正在提交..."
    git add .
    
    # 获取提交信息
    echo "请输入提交信息 (按Enter使用默认信息):"
    read commit_message
    
    if [[ -z "$commit_message" ]]; then
        commit_message="Update: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    
    git commit -m "$commit_message"
    echo "✅ 代码已提交"
else
    echo "✅ 没有未提交的更改"
fi

# 检查是否配置了远程仓库
if [[ -z $(git remote -v) ]]; then
    echo "⚠️  未配置远程仓库"
    echo "请先在GitHub创建仓库，然后运行："
    echo "git remote add origin https://github.com/你的用户名/AdNegator.git"
    echo ""
    echo "或者手动配置远程仓库后再运行此脚本"
    exit 1
fi

# 推送到GitHub
echo "📤 推送到 GitHub..."
git push origin main

if [[ $? -eq 0 ]]; then
    echo "✅ 代码已推送到 GitHub"
    echo ""
    echo "🎉 部署完成！"
    echo "=================================="
    echo "📋 接下来的步骤："
    echo "1. 访问 https://vercel.com"
    echo "2. 导入你的 GitHub 仓库"
    echo "3. 配置环境变量（参考 .env.vercel.example）"
    echo "4. 等待部署完成"
    echo ""
    echo "📖 详细部署指南请查看 DEPLOYMENT.md"
else
    echo "❌ 推送失败，请检查网络连接和仓库权限"
    exit 1
fi
