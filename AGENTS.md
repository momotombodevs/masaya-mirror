# Android QA Mirror

Desktop application for Android device management, mirroring, debugging and QA automation.

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- ADB
- scrcpy
- Node.js

## Goals

Provide a professional alternative for Android developers and QA engineers.

Core Features:

- Device discovery
- Device information
- Screen mirroring
- Screenshot capture
- Screen recording
- APK installation
- Logcat viewer
- Application management
- QA shortcuts
- Multi-device support

## Architecture Principles

- SOLID
- Clean Architecture
- Feature-based organization
- Dependency inversion
- Composition over inheritance

## Security

- contextIsolation: true
- nodeIntegration: false
- sandbox: true when possible
- IPC only through preload
- Validate all IPC payloads

## Renderer Rules

Renderer is responsible only for:

- UI
- State management
- User interactions

Renderer must never:

- Execute ADB
- Execute shell commands
- Access filesystem directly
- Access Electron APIs directly

## Main Process Rules

Main process is responsible for:

- ADB communication
- scrcpy integration
- File system access
- Process execution
- IPC handlers

## Testing

Minimum requirements:

- Unit tests for services
- Integration tests for IPC contracts
- Mock external dependencies

## Code Quality

- Strict TypeScript
- No any
- No business logic inside React components
- Small focused services
- Prefer composition

## Project Vision

Become a professional Android desktop toolkit similar to Vysor focused on developers and QA teams.