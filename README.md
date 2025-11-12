# WhatsApp Baileys Device Toolkit

**Enhanced WhatsApp Web API library with advanced device management and silent ping capabilities**

This is a specialized fork of [Baileys](https://github.com/WhiskeySockets/Baileys) that extends the original library with powerful WhatsApp user device tools with a modern web interface for WhatsApp protocol testing and analysis.

> **Current Baileys Version**: v6.7.21 (latest stable)

## 🚀 Key Features

### 📱 Advanced Device Management
- **Device Discovery**: Real-time discovery and enumeration of WhatsApp devices per user
- **Device-Specific Targeting**: Send messages and operations to specific devices using device IDs
- **Silent Ping Operations**: 11 different types of silent ping for comprehensive device testing
- **Device Fingerprinting**: Advanced device identification and analysis capabilities


### 🌐 Modern Web Interface
- **React-based UI**: Clean, responsive interface built with Material-UI
- **Real-time Management**: Live device discovery and management
- **Secure Authentication**: JWT-based authentication with QR code display
- **Developer Tools**: Protocol testing and analysis tools
- **Socket.io Integration**: Real-time updates and communication


## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/talbeerysec/WhatsApp-baileys-device-toolkit.git
cd WhatsApp-baileys-device-toolkit

# Install dependencies
yarn install

# Build the library
yarn build:all
```

## 🎯 Quick Start

### CLI Example with Device Features
Do check out & run [Example/example.ts](Example/example.ts) to see enhanced device management capabilities.
The script includes advanced silent ping functionality and device-specific operations.

```bash
cd path/to/Baileys
yarn
yarn example
```

**Enhanced CLI Commands:**
```bash
# In yarn example interactive mode:
silentping <user> <deviceId>     # Reaction-based ping
silentping2 <user> <deviceId>    # Delete-based ping
silentping3 <user> <deviceId>    # Edit-based ping
silentping4 <user> <deviceId>    # Call-reject ping
# ... and 7 more ping types for comprehensive testing
```

### Web UI Interface 🌐
Launch the modern web interface for easier device management:

```bash
cd web-ui
# Install dependencies for both server and client
npm run install:all
# Or install individually:
# cd server && npm install && cd ../client && npm install

# Start development servers
npm run dev
```

Then open http://localhost:5173 in your browser.

**Web UI Features:**
- 🔐 Secure authentication with QR code display in browser
- 📟 Interactive device discovery and management
- 💬 Send messages with device-specific targeting
- 🎛️ Real-time ping operations with visual feedback
- 🔧 Developer tools for protocol analysis

See [web-ui/README.md](web-ui/README.md) for complete documentation.

## 📋 Requirements

### Core Library
- **Node.js** (v22 or higher)
- **npm** or **yarn**

### Web UI Interface
- **Node.js** (v22 or higher)
- **npm** or **yarn**
- **Modern web browser** with WebSocket support

### Optional Dependencies
Some features require additional packages:
- `sharp` or `jimp` - Image processing for media messages
- `qrcode-terminal` - QR code display in terminal
- `link-preview-js` - Link preview generation
- `ffmpeg` - Video thumbnail generation (system install)

## 📝 Recent Updates

### v6.7.21 (Latest)
- **Upgraded to Baileys v6.7.21**: Merged 185+ commits from upstream with bug fixes
- **Fixed Device Linking**: Resolved 401 timeout issues during QR code authentication
- **ES Module Support**: Updated build system for better compatibility
- **iOS Device Detection Fix**: Fixed race condition in delete ping response handling
- **Improved Stability**: Enhanced error handling and session management

## 🤝 Contributing & License
This project is licensed under **GPLv3** - see the [LICENSE](LICENSE) file for details.

### Usage Disclaimer
⚠️ **Important**: This toolkit is intended for educational and security research purposes. Users are responsible for ensuring compliance with WhatsApp's Terms of Service and applicable laws. The authors are not responsible for any misuse of this software.

## 🙏 Acknowledgments

- **[Baileys](https://github.com/WhiskeySockets/Baileys)** - The original WhatsApp Web API library that this toolkit extends


---

**Built with ❤️ for the security research community**
