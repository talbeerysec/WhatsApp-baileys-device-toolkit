#!/bin/bash

# Baileys Web UI Setup Script
echo "🚀 Setting up Baileys Web UI..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install

# Setup server environment
if [ ! -f ".env" ]; then
    echo "⚙️ Setting up server environment..."
    cp .env.example .env
    echo "✅ Server .env file created from example"
else
    echo "⚙️ Server .env file already exists"
fi

# Install client dependencies
echo "📦 Installing client dependencies..."
cd ../client
npm install

# Return to root directory
cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review and modify server/.env if needed"
echo "2. Run: npm run dev"
echo "3. Open browser to: http://localhost:5173"
echo "4. Login with admin password (default: admin123)"
echo ""
echo "🔧 Commands:"
echo "  npm run dev          - Start both server and client"
echo "  npm run dev:server   - Start server only"
echo "  npm run dev:client   - Start client only"
echo "  npm run build        - Build for production"
echo ""
echo "📖 For more information, see README.md"