# Reactive Bible

Front-End for the Bible Research app.

A React JS project bootstrapped with Vite, featuring user
authentication, notes management, and Bible study tools.

## Features

- 📖 **Bible Reading** - Read multiple Bible translations
- 📝 **Notes & Tags** - Create and organize study notes
  (requires authentication)
- 🔐 **User Authentication** - Secure login with token-based auth
- 🎨 **Dark/Light Mode** - Customizable theme
- 🔍 **Search** - Find verses and notes quickly
- 🎵 **Audio Bible** - Listen to Bible chapters
- 📱 **Responsive Design** - Works on all devices

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Access to Bible Research API backend

### Installation

```bash
# Clone the repository
git clone https://github.com/Bible-Research/reactive-bible.git
cd reactive-bible

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

## Authentication

This app uses token-based authentication with the Bible Research API.

### First-Time Setup

1. **Create an account** at `/register` (or login if you already have one)
2. **Login** at `/login` with your credentials
3. **Access protected features** like notes and tags

### Features Requiring Authentication
- Creating, editing, and deleting notes
- Managing tags
- Viewing private notes

### Public Features (No Auth Required)
- Reading Bible passages
- Viewing public notes
- Searching verses

## Android app

A Capacitor-wrapped Android build is distributed via GitHub
Releases (sideloaded — there is no Play Store listing):

- **Latest stable:** download `reactive-bible.apk` from the
  [latest release][latest-rel] (the newest `v*` milestone).
- **Continuous builds:** the rolling `continuous` prerelease on
  the [releases page][releases] tracks every `main` commit.

[latest-rel]: https://github.com/Bible-Research/reactive-bible/releases/latest
[releases]: https://github.com/Bible-Research/reactive-bible/releases

To install, download the APK on the phone and allow "install
unknown apps" for the browser or file manager when Android asks.
Installed builds check for updates automatically (about once per
hour) and prompt to download the newer APK — Android always
requires consent for sideloaded installs. Release-channel
internals are documented in
[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#android-app--release-channels).

## Documentation

- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** - Technical
  details and architecture

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Mantine v6** - UI component library
- **Zustand** - State management
- **React Router v7** - Client-side routing
- **Vitest** - Testing framework

## Available Scripts

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build

# Testing
npm run test         # Run tests
npm run test:ui      # Run tests with UI
npm run coverage     # Generate coverage report

# Code Quality
npm run lint         # Run ESLint
```

## Contributing

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for development guidelines.

## License

MIT
